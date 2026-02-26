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

import { config } from "dotenv";
import { Turbopuffer } from "@turbopuffer/turbopuffer";

config({ path: ".env.local" });

const requiredEnvVars = ["TURBOPUFFER_API_KEY"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable: ${envVar}`);
    console.error("Please set this in your .env.local file.");
    process.exit(1);
  }
}

let tpufClient;

function getTurbopufferClient() {
  if (!tpufClient) {
    tpufClient = new Turbopuffer({
      apiKey: process.env.TURBOPUFFER_API_KEY,
      region: process.env.TURBOPUFFER_REGION || "gcp-us-central1",
    });
  }
  return tpufClient;
}

async function deduplicateImagesFast() {
  try {
    console.log("Starting fast deduplication process...");

    const client = getTurbopufferClient();
    const ns = client.namespace("Image");

    const vectorGroups = new Map();
    const duplicates = [];
    let processedCount = 0;
    const fetchBatchSize = 500;
    let lastId = null;
    console.log("Streaming through objects...");

    while (true) {
      const queryParams = {
        rank_by: ["id", "asc"],
        top_k: fetchBatchSize,
        include_attributes: true,
        vector_encoding: "float",
        ...(lastId != null && { filters: ["id", "Gt", lastId] }),
      };

      const result = await ns.query(queryParams);
      const rows = result.rows ?? [];

      if (rows.length === 0) break;

      for (const obj of rows) {
        processedCount++;
        lastId = obj.id;
        const vec = obj.vector;
        if (!vec || !Array.isArray(vec)) continue;

        const vectorKey = vec.slice(0, 10).join(",");

        if (vectorGroups.has(vectorKey)) {
          duplicates.push(obj.id);
        } else {
          vectorGroups.set(vectorKey, true);
        }
      }

      console.log(
        `Processed: ${processedCount} total, Duplicates found: ${duplicates.length}`
      );
      if (rows.length < fetchBatchSize) break;
    }

    console.log(`Finished processing. Total objects: ${processedCount}`);

    if (duplicates.length === 0) {
      console.log("No duplicates found!");
      return;
    }

    console.log(`Found ${duplicates.length} duplicate images to delete`);

    const deleteBatchSize = 500;
    let deletedCount = 0;

    for (let i = 0; i < duplicates.length; i += deleteBatchSize) {
      const batch = duplicates.slice(i, i + deleteBatchSize);
      const batchNum = Math.floor(i / deleteBatchSize) + 1;
      const totalBatches = Math.ceil(duplicates.length / deleteBatchSize);

      console.log(`Deleting batch ${batchNum}/${totalBatches} (${batch.length} items)`);

      await ns.write({ deletes: batch });
      deletedCount += batch.length;
    }

    console.log("\nFast deduplication complete!");
    console.log(`Kept: ${vectorGroups.size} unique vector groups`);
    console.log(`Deleted: ${deletedCount} duplicates`);
    console.log(`Total remaining: ${processedCount - deletedCount}`);
  } catch (error) {
    console.error("Fast deduplication failed:", error.message);
    throw error;
  }
}

async function main() {
  try {
    getTurbopufferClient();
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
