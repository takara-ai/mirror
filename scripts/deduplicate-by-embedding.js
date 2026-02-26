#!/usr/bin/env node

/**
 * Deduplicate Turbopuffer rows by exact embedding (vector) identity.
 * Same image => same vector => keep first occurrence, delete the rest.
 * Also deletes each duplicate's corresponding blob from Vercel Blob store.
 *
 * Usage:
 *   bun run scripts/deduplicate-by-embedding.js              # dry run
 *   bun run scripts/deduplicate-by-embedding.js --yes       # perform dedupe + blob delete
 *
 * Env: TURBOPUFFER_API_KEY, BLOB_READ_WRITE_TOKEN; optional TURBOPUFFER_REGION.
 *
 * Ref: https://turbopuffer.com/docs (Write API deletes, Query with vector).
 */

import { createHash } from "crypto";
import { config } from "dotenv";
import { join } from "path";
import { Turbopuffer } from "@turbopuffer/turbopuffer";
import { del } from "@vercel/blob";

config({ path: join(process.cwd(), ".env.local") });

const NAMESPACE = "Image";
const FETCH_BATCH_SIZE = 2000;
const DELETE_TPUF_BATCH_SIZE = 500;
const DELETE_BLOB_BATCH_SIZE = 100;

const argv = process.argv.slice(2);
const confirm = argv.includes("--yes") || argv.includes("-y");
const dryRun = !confirm;

const requiredEnvVars = ["TURBOPUFFER_API_KEY", "BLOB_READ_WRITE_TOKEN"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

function getTurbopufferClient() {
  return new Turbopuffer({
    apiKey: process.env.TURBOPUFFER_API_KEY,
    region: process.env.TURBOPUFFER_REGION || "gcp-us-central1",
  });
}

/** Stable key for vector identity. Use float32 (Math.fround) so keys match index script. */
function vectorKey(vec) {
  if (!vec || typeof vec.length !== "number") return null;
  const arr = Array.isArray(vec) ? vec : Array.from(vec);
  const normalized = arr.map((x) => Math.fround(Number(x))).join(",");
  return createHash("sha256").update(normalized).digest("hex");
}

/** True if URL is from our Vercel Blob store (safe to delete). */
function isOurBlobUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return (
      u.hostname.includes("vercel-storage.com") ||
      u.hostname.includes("blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

async function main() {
  if (dryRun) {
    console.log("DRY RUN: no Turbopuffer or Blob deletions. Use --yes to apply.\n");
  }

  const client = getTurbopufferClient();
  const ns = client.namespace(NAMESPACE);

  const seenVectorKeys = new Set();
  const duplicates = [];

  let lastId = null;
  let processedCount = 0;

  console.log("Streaming rows (id asc) with vectors and image_url...");

  while (true) {
    const result = await ns.query({
      rank_by: ["id", "asc"],
      top_k: FETCH_BATCH_SIZE,
      include_attributes: true,
      vector_encoding: "float",
      ...(lastId != null && { filters: ["id", "Gt", lastId] }),
    });

    const rows = result.rows ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      processedCount++;
      lastId = row.id;
      const vec = row.vector;
      const key = vectorKey(vec);
      if (key == null) continue;

      if (seenVectorKeys.has(key)) {
        duplicates.push({
          id: row.id,
          image_url: row.image_url ?? "",
        });
      } else {
        seenVectorKeys.add(key);
      }
    }

    console.log(`  Processed ${processedCount} rows, duplicates so far: ${duplicates.length}`);
    if (rows.length < FETCH_BATCH_SIZE) break;
  }

  console.log(`\nTotal rows: ${processedCount}`);
  console.log(`Unique vectors: ${seenVectorKeys.size}`);
  console.log(`Duplicates to remove: ${duplicates.length}`);

  if (duplicates.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  const duplicateIds = duplicates.map((d) => d.id);
  const blobUrls = duplicates
    .map((d) => d.image_url)
    .filter(isOurBlobUrl);

  const externalUrls = duplicates.length - blobUrls.length;
  if (externalUrls > 0) {
    console.log(`  (${externalUrls} duplicate(s) have non-Vercel URLs; only Turbopuffer rows will be removed)`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Would delete from Turbopuffer:", duplicateIds.length, "rows");
    console.log("[DRY RUN] Would delete from Blob store:", blobUrls.length, "blob(s)");
    if (duplicateIds.length > 0) {
      console.log("[DRY RUN] Example IDs:", duplicateIds.slice(0, 5));
    }
    return;
  }

  console.log("\nDeleting duplicate rows from Turbopuffer...");
  let deletedTpuf = 0;
  for (let i = 0; i < duplicateIds.length; i += DELETE_TPUF_BATCH_SIZE) {
    const batch = duplicateIds.slice(i, i + DELETE_TPUF_BATCH_SIZE);
    await ns.write({ deletes: batch });
    deletedTpuf += batch.length;
    console.log(`  Turbopuffer: ${deletedTpuf}/${duplicateIds.length}`);
  }

  if (blobUrls.length > 0) {
    console.log("\nDeleting corresponding blobs from Vercel Blob store...");
    let deletedBlobs = 0;
    for (let i = 0; i < blobUrls.length; i += DELETE_BLOB_BATCH_SIZE) {
      const batch = blobUrls.slice(i, i + DELETE_BLOB_BATCH_SIZE);
      await del(batch);
      deletedBlobs += batch.length;
      console.log(`  Blobs: ${deletedBlobs}/${blobUrls.length}`);
    }
    console.log(`Deleted ${deletedBlobs} blob(s).`);
  }

  console.log("\nDone.");
  console.log(`Turbopuffer: removed ${deletedTpuf} duplicate rows.`);
  console.log(`Remaining rows: ~${processedCount - deletedTpuf}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
