#!/usr/bin/env node

/**
 * Image Similarity Deduplication Script
 *
 * Removes images with very similar vectors (close matches) from Turbopuffer.
 * Uses vector similarity search to find objects within a cosine similarity threshold.
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

const SIMILARITY_THRESHOLD = 0.995;
const SEARCH_LIMIT = 5;
const CONCURRENT_SEARCHES = 10;
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

async function fetchAllObjectsWithVectors() {
  const client = getClient();
  const ns = client.namespace("Image");
  const all = [];
  let lastId = null;

  while (true) {
    const params = {
      rank_by: ["id", "asc"],
      top_k: MAX_TOP_K,
      include_attributes: true,
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

async function findSimilarImagesFast() {
  try {
    console.log("Starting thorough similarity deduplication...");

    const allObjects = await fetchAllObjectsWithVectors();
    const withVectors = allObjects.filter(
      (obj) => obj.vector && Array.isArray(obj.vector)
    );
    console.log(`Fetched ${withVectors.length} objects with vectors`);

    const processedIds = new Set();
    const similarGroups = new Map();
    let nextGroupId = 0;

    const client = getClient();
    const ns = client.namespace("Image");

    for (let i = 0; i < withVectors.length; i += CONCURRENT_SEARCHES) {
      const batch = withVectors.slice(i, i + CONCURRENT_SEARCHES);
      const batchNum = Math.floor(i / CONCURRENT_SEARCHES) + 1;
      const totalBatches = Math.ceil(withVectors.length / CONCURRENT_SEARCHES);

      console.log(
        `Processing batch ${batchNum}/${totalBatches} (${batch.length} objects)`
      );

      const searchPromises = batch.map(async (obj) => {
        if (processedIds.has(obj.id)) {
          return null;
        }

        try {
          const similarResult = await ns.query({
            rank_by: ["vector", "ANN", obj.vector],
            top_k: SEARCH_LIMIT + 1,
            include_attributes: ["image_id"],
          });

          const rows = (similarResult.rows || []).filter(
            (r) => r.id !== obj.id && !processedIds.has(r.id)
          );

          if (rows.length > 0) {
            const withinThreshold = rows.filter(
              (r) => (r.$dist ?? 1) <= 1 - SIMILARITY_THRESHOLD
            );
            if (withinThreshold.length > 0) {
              return {
                sourceObj: obj,
                similarObjects: withinThreshold,
              };
            }
          }
        } catch (error) {
          console.warn(`Search failed for ${obj.id}:`, error.message);
        }
        return null;
      });

      const results = await Promise.allSettled(searchPromises);

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          const { sourceObj, similarObjects } = result.value;

          let existingGroupId = null;
          for (const [groupId, objectIds] of similarGroups) {
            if (
              objectIds.includes(sourceObj.id) ||
              objectIds.some((id) => similarObjects.some((s) => s.id === id))
            ) {
              existingGroupId = groupId;
              break;
            }
          }

          if (existingGroupId !== null) {
            const existingIds = similarGroups.get(existingGroupId);
            const newIds = [
              sourceObj.id,
              ...similarObjects.map((s) => s.id),
            ].filter((id) => !existingIds.includes(id));
            existingIds.push(...newIds);
          } else {
            const groupId = nextGroupId++;
            similarGroups.set(groupId, [
              sourceObj.id,
              ...similarObjects.map((s) => s.id),
            ]);
          }

          processedIds.add(sourceObj.id);
          similarObjects.forEach((s) => processedIds.add(s.id));
        }
      }

      console.log(
        `Progress: ${processedIds.size} objects processed, ${similarGroups.size} similarity groups found`
      );
    }

    console.log("\nSimilarity analysis complete!");
    console.log(`Total objects processed: ${withVectors.length}`);
    console.log(`Similarity groups found: ${similarGroups.size}`);

    if (similarGroups.size === 0) {
      console.log("No similar images found above the threshold.");
      return;
    }

    const toDelete = [];
    for (const [, objectIds] of similarGroups) {
      toDelete.push(...objectIds.slice(1));
    }

    console.log(`\nTotal objects to delete: ${toDelete.length}`);

    if (toDelete.length === 0) {
      console.log("No duplicates to remove.");
      return;
    }

    const deleteBatchSize = 500;
    let deletedCount = 0;

    for (let i = 0; i < toDelete.length; i += deleteBatchSize) {
      const batch = toDelete.slice(i, i + deleteBatchSize);
      const batchNum = Math.floor(i / deleteBatchSize) + 1;
      const totalBatches = Math.ceil(toDelete.length / deleteBatchSize);

      console.log(
        `Deleting batch ${batchNum}/${totalBatches} (${batch.length} items)`
      );

      await ns.write({
        deletes: batch,
        distance_metric: "cosine_distance",
      });
      deletedCount += batch.length;
    }

    console.log("\nFast similarity deduplication complete!");
    console.log(`Similarity groups processed: ${similarGroups.size}`);
    console.log(`Deleted: ${deletedCount} similar objects`);
  } catch (error) {
    console.error("Fast similarity deduplication failed:", error.message);
    throw error;
  }
}

async function main() {
  try {
    getClient();
    console.log("Turbopuffer client initialized");
    await findSimilarImagesFast();
  } catch (error) {
    console.error("Fatal error:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
