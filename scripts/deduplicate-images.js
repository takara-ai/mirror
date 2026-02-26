#!/usr/bin/env node

/**
 * Image Deduplication Script
 *
 * Removes duplicate images from Turbopuffer based on identical vectors.
 * Keeps the first occurrence of each unique vector and deletes duplicates.
 *
 * Environment variables required:
 * - TURBOPUFFER_API_KEY: Turbopuffer API key
 * - TURBOPUFFER_REGION: (optional) e.g. gcp-us-central1
 */

import { Turbopuffer } from "@turbopuffer/turbopuffer";
import { config } from "dotenv";

config({ path: ".env.local" });

const requiredEnvVars = ["TURBOPUFFER_API_KEY"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable: ${envVar}`);
    console.error("Please set this in your .env.local file.");
    process.exit(1);
  }
}

const PAGE_SIZE = 5000;
const MAX_TOP_K = 10_000;

let tpuf;

function getClient() {
  if (!tpuf) {
    tpuf = new Turbopuffer({
      apiKey: process.env.TURBOPUFFER_API_KEY,
      region: process.env.TURBOPUFFER_REGION || "gcp-us-central1",
    });
  }
  return tpuf;
}

async function fetchAllObjects(options = {}) {
  const client = getClient();
  const ns = client.namespace("Image");
  const all = [];
  let lastId = null;

  while (true) {
    const params = {
      rank_by: ["id", "asc"],
      top_k: MAX_TOP_K,
      include_attributes: options.includeVector
        ? ["image_id", "vector"]
        : ["image_id"],
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
      all.push(row);
      lastId = row.id;
    }
    if (rows.length < MAX_TOP_K) {
      break;
    }
  }
  return all;
}

async function deduplicateImagesFast() {
  try {
    console.log("Starting fast deduplication process...");

    const allObjects = await fetchAllObjects({ includeVector: true });
    console.log(`Fetched ${allObjects.length} objects`);

    const vectorGroups = new Map();
    const duplicates = [];

    for (const obj of allObjects) {
      const vec = obj.vector;
      if (!(vec && Array.isArray(vec))) {
        continue;
      }
      const vectorKey = vec.slice(0, 10).join(",");

      if (vectorGroups.has(vectorKey)) {
        duplicates.push(obj.id);
      } else {
        vectorGroups.set(vectorKey, true);
      }
    }

    console.log(
      `Processed: ${allObjects.length} total, Duplicates found: ${duplicates.length}`
    );

    if (duplicates.length === 0) {
      console.log("No duplicates found!");
      return;
    }

    console.log(`Found ${duplicates.length} duplicate images to delete`);

    const client = getClient();
    const ns = client.namespace("Image");
    const deleteBatchSize = 500;
    let deletedCount = 0;

    for (let i = 0; i < duplicates.length; i += deleteBatchSize) {
      const batch = duplicates.slice(i, i + deleteBatchSize);
      const batchNum = Math.floor(i / deleteBatchSize) + 1;
      const totalBatches = Math.ceil(duplicates.length / deleteBatchSize);

      console.log(
        `Deleting batch ${batchNum}/${totalBatches} (${batch.length} items)`
      );

      await ns.write({
        deletes: batch,
        distance_metric: "cosine_distance",
      });
      deletedCount += batch.length;
    }

    console.log("\nFast deduplication complete!");
    console.log(`Kept: ${vectorGroups.size} unique vector groups`);
    console.log(`Deleted: ${deletedCount} duplicates`);
    console.log(`Total remaining: ${allObjects.length - deletedCount}`);
  } catch (error) {
    console.error("Fast deduplication failed:", error.message);
    throw error;
  }
}

async function main() {
  try {
    getClient();
    console.log("Turbopuffer client initialized");
    await deduplicateImagesFast();
  } catch (error) {
    console.error("Fatal error:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
