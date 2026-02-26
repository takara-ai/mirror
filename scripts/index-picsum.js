#!/usr/bin/env node

/**
 * Index Picsum Photos directly into Vercel Blob + Turbopuffer (no local files).
 * Uses Picsum Photos (https://picsum.photos) - no API key required.
 *
 * Usage:
 *   bun run index-picsum [count]
 *   bun run index-picsum --dry-run [count]
 *   DRY_RUN=1 bun run index-picsum 20
 *   bun run index-picsum --concurrency 8 50
 *
 * Env: BLOB_READ_WRITE_TOKEN, TURBOPUFFER_API_KEY; optional TURBOPUFFER_REGION, CONCURRENCY.
 * Embeddings use the embed lib in-process (no network). Run with bun from repo root.
 * Default count: 10. Max 10000 per run. Default concurrency: 5.
 */

import { Turbopuffer } from "@turbopuffer/turbopuffer";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { config } from "dotenv";
import { join } from "path";

config({ path: join(process.cwd(), ".env.local") });

const DEFAULT_COUNT = 10;
const MAX_COUNT = 10_000;
const PICSUM_WIDTH = 640;
const PICSUM_HEIGHT = 480;
const PICSUM_ID_PREFIX = "picsum-";
const MAX_TOP_K = 10_000;
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

const argvFiltered = argv.filter(
  (a, i) =>
    a !== "--dry-run" &&
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

/** Returns a Set of image_id values already in Turbopuffer that look like picsum-N.jpg */
async function getExistingPicsumImageIds() {
  const client = getTurbopufferClient();
  const ns = client.namespace("Image");
  const existing = new Set();
  let lastId = null;

  while (true) {
    const params = {
      rank_by: ["id", "asc"],
      top_k: MAX_TOP_K,
      include_attributes: ["image_id"],
    };
    if (lastId != null) {
      params.filters = ["id", "Gt", lastId];
    }

    const result = await ns.query(params);
    const rows = result.rows || [];
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const id = row.image_id;
      if (
        typeof id === "string" &&
        id.startsWith(PICSUM_ID_PREFIX) &&
        id.endsWith(".jpg")
      ) {
        existing.add(id);
      }
      lastId = row.id;
    }
    if (rows.length < MAX_TOP_K) {
      break;
    }
  }

  return existing;
}

async function fetchImageBytes(index) {
  const seed = index;
  const url = `https://picsum.photos/seed/${seed}/${PICSUM_WIDTH}/${PICSUM_HEIGHT}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function uploadToBlob(buffer, filename) {
  const blob = await put(filename, buffer, {
    access: "public",
    addRandomSuffix: true,
  });
  return blob;
}

/** Uses embed lib in-process (no network). Run with bun from repo root. */
async function getImageEmbedding(imageUrl) {
  const { embedImage } = await import("../app/api/embed/embed.ts");
  return embedImage(imageUrl);
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

async function processOne(index) {
  const filename = `picsum-${index}.jpg`;
  const id = randomUUID();

  const buffer = await fetchImageBytes(index);
  const blob = await uploadToBlob(buffer, filename);
  const vector = await getImageEmbedding(blob.url);
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
  console.log("Checking for already-indexed Picsum images...");
  const existingIds = await getExistingPicsumImageIds();
  if (existingIds.size > 0) {
    console.log(`  Found ${existingIds.size} existing (will skip).`);
  }

  const toProcess = [];
  for (let i = 1; i <= count; i++) {
    const filename = `picsum-${i}.jpg`;
    if (!existingIds.has(filename)) {
      toProcess.push({ i, filename });
    }
  }

  const skipped = count - toProcess.length;

  if (!dryRun && toProcess.length > 0) {
    console.log(`Concurrency: ${concurrency}`);
  }
  console.log(
    dryRun
      ? `Would process up to ${count} Picsum images...`
      : `Indexing ${toProcess.length} images (${skipped} skipped)...`
  );

  if (toProcess.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let ok = 0;
  let fail = 0;

  if (dryRun) {
    for (const { i, filename } of toProcess) {
      console.log(`  ${i}/${count} ${filename} (would index)`);
      ok++;
    }
    console.log(
      `\nDry run complete. Would index: ${ok}, Would skip: ${skipped}.`
    );
    return;
  }

  for (let start = 0; start < toProcess.length; start += concurrency) {
    const batch = toProcess.slice(start, start + concurrency);
    const results = await Promise.allSettled(
      batch.map(({ i }) => processOne(i))
    );
    for (let j = 0; j < batch.length; j++) {
      const { i, filename } = batch[j];
      const r = results[j];
      if (r.status === "fulfilled") {
        ok++;
        console.log(`  ${i}/${count} ${filename} (${r.value.id})`);
      } else {
        fail++;
        console.error(
          `  ${i}/${count} ${filename} failed:`,
          r.reason?.message ?? r.reason
        );
      }
    }
  }

  console.log(`Done. Indexed: ${ok}, Skipped: ${skipped}, Failed: ${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
