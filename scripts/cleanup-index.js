#!/usr/bin/env node

/**
 * Delete the Turbopuffer Image namespace and all blobs in the Vercel Blob store.
 *
 * Usage:
 *   node scripts/cleanup-index.js              # dry run (no changes)
 *   node scripts/cleanup-index.js --yes         # perform deletion
 *
 * Env: BLOB_READ_WRITE_TOKEN, TURBOPUFFER_API_KEY; optional TURBOPUFFER_REGION.
 */

import { config } from "dotenv";
import { join } from "path";
import { Turbopuffer } from "@turbopuffer/turbopuffer";
import { list, del } from "@vercel/blob";

config({ path: join(process.cwd(), ".env.local") });

const NAMESPACE = "Image";
const BLOB_BATCH_SIZE = 100;

const argv = process.argv.slice(2);
const confirm = argv.includes("--yes") || argv.includes("-y");

const requiredEnvVars = ["BLOB_READ_WRITE_TOKEN", "TURBOPUFFER_API_KEY"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

async function deleteTurbopufferNamespace(dryRun) {
  const client = new Turbopuffer({
    apiKey: process.env.TURBOPUFFER_API_KEY,
    region: process.env.TURBOPUFFER_REGION || "gcp-us-central1",
  });
  const ns = client.namespace(NAMESPACE);

  if (dryRun) {
    console.log(`[DRY RUN] Would delete Turbopuffer namespace "${NAMESPACE}".`);
    return;
  }

  await ns.deleteAll();
  console.log(`Deleted Turbopuffer namespace "${NAMESPACE}".`);
}

async function deleteAllBlobs(dryRun) {
  let cursor;
  let totalDeleted = 0;

  if (dryRun) {
    let total = 0;
    do {
      const result = await list({ cursor, limit: BLOB_BATCH_SIZE });
      total += (result.blobs || []).length;
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);
    console.log(`[DRY RUN] Would delete ${total} blob(s) from store.`);
    return;
  }

  do {
    const result = await list({ cursor, limit: BLOB_BATCH_SIZE });
    const blobs = result.blobs || [];
    if (blobs.length > 0) {
      const urls = blobs.map((b) => b.url);
      await del(urls);
      totalDeleted += urls.length;
      console.log(`  Deleted ${urls.length} blob(s) (total: ${totalDeleted}).`);
    }
    cursor = result.cursor;
  } while (cursor);

  if (totalDeleted > 0) {
    console.log(`Deleted ${totalDeleted} blob(s) from store.`);
  } else {
    console.log("No blobs in store.");
  }
}

async function main() {
  const dryRun = !confirm;

  if (dryRun) {
    console.log("DRY RUN: no data will be deleted. Run with --yes to perform deletion.\n");
  } else {
    console.log("Deleting namespace and all blobs...\n");
  }

  console.log("1. Turbopuffer namespace");
  await deleteTurbopufferNamespace(dryRun);

  console.log("\n2. Vercel Blob store");
  await deleteAllBlobs(dryRun);

  if (dryRun) {
    console.log("\nRe-run with --yes to apply changes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
