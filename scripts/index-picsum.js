#!/usr/bin/env node

/**
 * Index Picsum Photos directly into Vercel Blob + Turbopuffer (no local files).
 * Uses Picsum Photos (https://picsum.photos) - no API key required.
 *
 * Usage:
 *   bun run index-picsum [count]              # by list (unique images; default)
 *   bun run index-picsum --seed [count]       # by seed 1..N (more duplicates)
 *   bun run index-picsum --dry-run [count]
 *   bun run index-picsum --concurrency 8 50
 *
 * By default uses Picsum list API (v2/list) and fetches by image ID so each image
 * is unique. Use --seed to use seed-based URLs (same as before; more dupes).
 * Env: BLOB_READ_WRITE_TOKEN, TURBOPUFFER_API_KEY; optional TURBOPUFFER_REGION, CONCURRENCY.
 */

import { createHash } from "crypto";
import { Turbopuffer, NotFoundError } from "@turbopuffer/turbopuffer";
import { put } from "@vercel/blob";
import { config } from "dotenv";
import { join } from "path";

config({ path: join(process.cwd(), ".env.local") });

const DEFAULT_COUNT = 10;
const MAX_COUNT = 10_000;
const PICSUM_WIDTH = 640;
const PICSUM_HEIGHT = 480;
const PICSUM_ID_PREFIX = "picsum-";
const PICSUM_LIST_URL = "https://picsum.photos/v2/list";
const LIST_PAGE_SIZE = 100;
const MAX_TOP_K = 10_000;
const FETCH_EXISTING_BATCH_SIZE = 2000;
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 20;

const argv = process.argv.slice(2);
const dryRun =
  process.env.DRY_RUN === "1" ||
  process.env.DRY_RUN === "true" ||
  argv.includes("--dry-run");

const concurrencyIdx = argv.findIndex((a) => a === "--concurrency");
let concurrency = DEFAULT_CONCURRENCY;
if (concurrencyIdx !== -1 && argv[concurrencyIdx + 1]) {
  concurrency = Math.min(
    Math.max(
      1,
      Number.parseInt(argv[concurrencyIdx + 1], 10) || DEFAULT_CONCURRENCY
    ),
    MAX_CONCURRENCY
  );
} else if (process.env.CONCURRENCY) {
  concurrency = Math.min(
    Math.max(
      1,
      Number.parseInt(process.env.CONCURRENCY, 10) || DEFAULT_CONCURRENCY
    ),
    MAX_CONCURRENCY
  );
}

const useSeed = argv.includes("--seed");
const argvFiltered = argv.filter(
  (a, i) =>
    a !== "--" &&
    a !== "--dry-run" &&
    a !== "--seed" &&
    (concurrencyIdx === -1 ||
      (i !== concurrencyIdx && i !== concurrencyIdx + 1))
);

const requiredEnvVars = ["BLOB_READ_WRITE_TOKEN", "TURBOPUFFER_API_KEY"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

let tpuf;

function getTurbopufferClient() {
  if (!tpuf) {
    tpuf = new Turbopuffer({
      apiKey: process.env.TURBOPUFFER_API_KEY,
      region: process.env.TURBOPUFFER_REGION || "gcp-us-central1",
    });
  }
  return tpuf;
}

/** Stable key for vector identity. Use float32 (Math.fround) so Turbopuffer round-trip matches in-memory embed. */
function vectorKey(vec) {
  if (!vec || typeof vec.length !== "number") return null;
  const arr = Array.isArray(vec) ? vec : Array.from(vec);
  const normalized = arr.map((x) => Math.fround(Number(x))).join(",");
  return createHash("sha256").update(normalized).digest("hex");
}

/** Avoid logging raw base64/data URLs. */
function sanitizeErrorMessage(msg) {
  if (typeof msg !== "string") return String(msg);
  const dataUrlMatch = msg.match(/data:[^;]+;base64,[^\s"]+/);
  if (dataUrlMatch) {
    return msg.replace(dataUrlMatch[0], "[data URL redacted]");
  }
  if (msg.length > 200) return msg.slice(0, 200) + "...";
  return msg;
}

/**
 * Stream all rows once; return existing Picsum image_ids and all embedding keys.
 * Ensures we never write a duplicate embedding (same vector => skip).
 */
async function getExistingIdsAndEmbeddingKeys() {
  const client = getTurbopufferClient();
  const ns = client.namespace("Image");
  const existingPicsumIds = new Set();
  const existingEmbeddingKeys = new Set();
  let lastId = null;

  try {
    while (true) {
      const params = {
        rank_by: ["id", "asc"],
        top_k: FETCH_EXISTING_BATCH_SIZE,
        include_attributes: true,
        vector_encoding: "float",
      };
      if (lastId != null) {
        params.filters = ["id", "Gt", lastId];
      }

      const result = await ns.query(params);
      const rows = result.rows || [];
      if (rows.length === 0) break;

      for (const row of rows) {
        lastId = row.id;
        const id = row.image_id;
        if (
          typeof id === "string" &&
          id.startsWith(PICSUM_ID_PREFIX) &&
          id.endsWith(".jpg")
        ) {
          existingPicsumIds.add(id);
        }
        const key = vectorKey(row.vector);
        if (key != null) existingEmbeddingKeys.add(key);
      }
      if (rows.length < FETCH_EXISTING_BATCH_SIZE) break;
    }
  } catch (err) {
    if (err instanceof NotFoundError) {
      return { existingPicsumIds, existingEmbeddingKeys };
    }
    throw err;
  }

  return { existingPicsumIds, existingEmbeddingKeys };
}

/** Fetch image by Picsum seed (1..N). Same seed can return same image as another seed. */
async function fetchImageBytesBySeed(seed) {
  const url = `https://picsum.photos/seed/${seed}/${PICSUM_WIDTH}/${PICSUM_HEIGHT}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Fetch image by Picsum list API id. Each id is a unique image in their catalog. */
async function fetchImageBytesById(picsumId) {
  const url = `https://picsum.photos/id/${picsumId}/${PICSUM_WIDTH}/${PICSUM_HEIGHT}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Fetch unique image IDs from Picsum v2/list (paginated). Returns up to `limit` ids. */
async function fetchPicsumImageIdsFromList(limit) {
  const ids = [];
  let page = 1;
  while (ids.length < limit) {
    const res = await fetch(
      `${PICSUM_LIST_URL}?page=${page}&limit=${LIST_PAGE_SIZE}`,
      { redirect: "follow" }
    );
    if (!res.ok) throw new Error(`List API HTTP ${res.status}`);
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) break;
    for (const item of list) {
      if (item.id != null) ids.push(String(item.id));
      if (ids.length >= limit) break;
    }
    if (list.length < LIST_PAGE_SIZE) break;
    page += 1;
  }
  return ids;
}

async function uploadToBlob(buffer, filename) {
  const blob = await put(filename, buffer, {
    access: "public",
    addRandomSuffix: true,
  });
  return blob;
}

/** Uses api/embed in-process. Run from repo root. */
async function getImageEmbedding(imageUrl) {
  const { embedImage } = await import("../api/embed.ts");
  return embedImage(imageUrl);
}

/** Embed from image bytes (Blob). No URL fetch - passes bytes straight to the model. */
async function getImageEmbeddingFromBuffer(buffer) {
  const { embedImage } = await import("../api/embed.ts");
  const blob = new Blob([buffer], { type: "image/jpeg" });
  return embedImage("", { blob });
}

const IMAGE_SCHEMA = {
  image_id: { type: "string" },
  image_url: { type: "string" },
  width: { type: "int" },
  height: { type: "int" },
};

async function storeInTurbopuffer(payload) {
  const client = getTurbopufferClient();
  const ns = client.namespace("Image");
  await ns.write({
    upsert_rows: [
      {
        id: payload.id,
        vector: payload.vector,
        image_id: payload.image_id,
        image_url: payload.image_url,
        width: payload.width,
        height: payload.height,
      },
    ],
    distance_metric: "cosine_distance",
    schema: IMAGE_SCHEMA,
  });
}

/**
 * Process one Picsum image (by seed or by list id). Dedupes by content hash and embedding.
 */
async function processOneWithBuffer(
  buffer,
  filename,
  id,
  contentHashesSeen,
  existingEmbeddingKeys
) {
  const hash = createHash("sha256").update(buffer).digest("hex");
  if (contentHashesSeen.has(hash)) {
    return { filename, skippedDuplicate: true };
  }
  contentHashesSeen.add(hash);

  const vector = await getImageEmbeddingFromBuffer(buffer);
  const key = vectorKey(vector);
  if (key != null && existingEmbeddingKeys.has(key)) {
    return { filename, skippedEmbeddingDuplicate: true };
  }
  if (key != null) existingEmbeddingKeys.add(key);

  const blob = await uploadToBlob(buffer, filename);
  await storeInTurbopuffer({
    id,
    vector,
    image_id: filename,
    image_url: blob.url,
    width: PICSUM_WIDTH,
    height: PICSUM_HEIGHT,
  });

  return { id, filename };
}

async function processOneBySeed(index, contentHashesSeen, existingEmbeddingKeys) {
  const filename = `picsum-${index}.jpg`;
  const buffer = await fetchImageBytesBySeed(index);
  return processOneWithBuffer(
    buffer,
    filename,
    filename,
    contentHashesSeen,
    existingEmbeddingKeys
  );
}

async function processOneById(picsumId, contentHashesSeen, existingEmbeddingKeys) {
  const filename = `picsum-id-${picsumId}.jpg`;
  const id = filename;
  const buffer = await fetchImageBytesById(picsumId);
  return processOneWithBuffer(
    buffer,
    filename,
    id,
    contentHashesSeen,
    existingEmbeddingKeys
  );
}

async function main() {
  const count = Math.min(
    Number.parseInt(
      argvFiltered[0] || process.env.DOWNLOAD_COUNT || String(DEFAULT_COUNT),
      10
    ) || DEFAULT_COUNT,
    MAX_COUNT
  );

  if (dryRun) {
    console.log("DRY RUN: no Blob uploads or Turbopuffer writes.\n");
  }

  getTurbopufferClient();
  console.log("Streaming existing rows (ids + embedding keys)...");
  const { existingPicsumIds, existingEmbeddingKeys } =
    await getExistingIdsAndEmbeddingKeys();
  console.log(
    `  Existing Picsum ids: ${existingPicsumIds.size}, existing embedding keys: ${existingEmbeddingKeys.size}`
  );

  let toProcess;
  let skipped;
  const total = count;

  if (useSeed) {
    toProcess = [];
    for (let i = 1; i <= count; i++) {
      const filename = `picsum-${i}.jpg`;
      if (!existingPicsumIds.has(filename)) {
        toProcess.push({ mode: "seed", index: i, filename });
      }
    }
    skipped = count - toProcess.length;
    if (!dryRun && toProcess.length > 0) {
      console.log("Mode: seed (1..N; may have duplicate images)");
    }
  } else {
    console.log("Fetching image IDs from Picsum list API...");
    const ids = await fetchPicsumImageIdsFromList(count);
    toProcess = ids
      .filter((picsumId) => !existingPicsumIds.has(`picsum-id-${picsumId}.jpg`))
      .map((picsumId) => ({
        mode: "id",
        picsumId,
        filename: `picsum-id-${picsumId}.jpg`,
      }));
    skipped = ids.length - toProcess.length;
    if (!dryRun && toProcess.length > 0) {
      console.log(`Mode: list (unique images by ID); ${ids.length} IDs from list`);
    }
  }

  if (!dryRun && toProcess.length > 0) {
    console.log(`Concurrency: ${concurrency}`);
  }
  console.log(
    dryRun
      ? `Would process up to ${total} Picsum images...`
      : `Indexing ${toProcess.length} images (${skipped} skipped)...`
  );

  if (toProcess.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let ok = 0;
  let fail = 0;

  if (dryRun) {
    for (let i = 0; i < toProcess.length; i++) {
      const { filename } = toProcess[i];
      console.log(`  ${i + 1}/${toProcess.length} ${filename} (would index)`);
      ok++;
    }
    console.log(
      `\nDry run complete. Would index: ${ok}, Would skip: ${skipped}.`
    );
    return;
  }

  const contentHashesSeen = new Set();
  let dupes = 0;
  let embeddingDupes = 0;

  for (let start = 0; start < toProcess.length; start += concurrency) {
    const batch = toProcess.slice(start, start + concurrency);
    const results = await Promise.allSettled(
      batch.map((item) =>
        item.mode === "seed"
          ? processOneBySeed(item.index, contentHashesSeen, existingEmbeddingKeys)
          : processOneById(
              item.picsumId,
              contentHashesSeen,
              existingEmbeddingKeys
            )
      )
    );
    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const n = start + j + 1;
      const { filename } = item;
      const r = results[j];
      if (r.status === "fulfilled") {
        if (r.value.skippedDuplicate) {
          dupes++;
          console.log(`  ${n}/${toProcess.length} ${filename} (content dupe, skipped)`);
        } else if (r.value.skippedEmbeddingDuplicate) {
          embeddingDupes++;
          console.log(`  ${n}/${toProcess.length} ${filename} (embedding dupe, skipped)`);
        } else {
          ok++;
          console.log(`  ${n}/${toProcess.length} ${filename} (${r.value.id})`);
        }
      } else {
        fail++;
        console.error(
          `  ${n}/${toProcess.length} ${filename} failed:`,
          sanitizeErrorMessage(r.reason?.message ?? r.reason)
        );
      }
    }
  }

  console.log(
    `Done. Indexed: ${ok}, Skipped: ${skipped}, Content dupes: ${dupes}, Embedding dupes: ${embeddingDupes}, Failed: ${fail}`
  );
}

main().catch((err) => {
  console.error(
    err?.message ? sanitizeErrorMessage(err.message) : err
  );
  process.exit(1);
});
