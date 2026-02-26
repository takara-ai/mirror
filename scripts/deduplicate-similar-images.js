#!/usr/bin/env node

/**
 * Image Similarity Deduplication Script
 *
 * Removes images with very similar vectors from Turbopuffer.
 * Uses vector similarity search to find objects within a cosine similarity threshold.
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

const SIMILARITY_THRESHOLD = 0.995;
const SEARCH_LIMIT = 5;
const BATCH_SIZE = 200;
const CONCURRENT_SEARCHES = 10;

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

async function findSimilarImagesFast() {
  try {
    console.log(
      `Starting similarity deduplication (threshold ${SIMILARITY_THRESHOLD})...`
    );

    const client = getTurbopufferClient();
    const ns = client.namespace("Image");

    let lastId = null;
    const allObjects = [];

    while (true) {
      const result = await ns.query({
        rank_by: ["id", "asc"],
        top_k: 40000,
        include_attributes: true,
        vector_encoding: "float",
        ...(lastId != null && { filters: ["id", "Gt", lastId] }),
      });

      const rows = result.rows ?? [];
      if (rows.length === 0) break;

      const withVectors = rows.filter(
        (obj) => obj.vector && Array.isArray(obj.vector)
      );
      allObjects.push(...withVectors);
      if (rows.length < 40000) break;
      lastId = rows[rows.length - 1]?.id;
    }

    console.log(`Fetched ${allObjects.length} objects with vectors`);

    const processedIds = new Set();
    const similarGroups = new Map();
    let nextGroupId = 0;

    for (let i = 0; i < allObjects.length; i += CONCURRENT_SEARCHES) {
      const batch = allObjects.slice(i, i + CONCURRENT_SEARCHES);
      const batchNum = Math.floor(i / CONCURRENT_SEARCHES) + 1;
      const totalBatches = Math.ceil(allObjects.length / CONCURRENT_SEARCHES);

      console.log(`Processing batch ${batchNum}/${totalBatches}`);

      const searchPromises = batch.map(async (obj) => {
        if (processedIds.has(obj.id)) return null;

        try {
          const similarResult = await ns.query({
            rank_by: ["vector", "ANN", obj.vector],
            top_k: SEARCH_LIMIT + 1,
            include_attributes: ["image_id"],
          });

          const maxDist = 1 - SIMILARITY_THRESHOLD;
          const rows = (similarResult.rows ?? []).filter(
            (r) =>
              r.id !== obj.id &&
              !processedIds.has(r.id) &&
              (r.$dist ?? 1) <= maxDist
          );

          if (rows.length > 0) {
            return { sourceObj: obj, similarObjects: rows };
          }
        } catch (err) {
          console.warn(`Search failed for ${obj.id}:`, err.message);
        }
        return null;
      });

      const results = await Promise.allSettled(searchPromises);

      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value) continue;
        const { sourceObj, similarObjects } = result.value;

        let existingGroupId = null;
        for (const [groupId, objectIds] of similarGroups) {
          if (
            objectIds.includes(sourceObj.id) ||
            similarObjects.some((s) => objectIds.includes(s.id))
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
          similarGroups.set(nextGroupId++, [
            sourceObj.id,
            ...similarObjects.map((s) => s.id),
          ]);
        }

        processedIds.add(sourceObj.id);
        similarObjects.forEach((s) => processedIds.add(s.id));
      }

      console.log(
        `Progress: ${processedIds.size} processed, ${similarGroups.size} similarity groups`
      );
    }

    console.log(`\nSimilarity analysis complete. Groups found: ${similarGroups.size}`);

    if (similarGroups.size === 0) {
      console.log("No similar images above threshold.");
      return;
    }

    const toDelete = [];
    for (const [, objectIds] of similarGroups) {
      toDelete.push(...objectIds.slice(1));
    }

    console.log(`\nTotal objects to delete: ${toDelete.length}`);

    const deleteBatchSize = 500;
    let deletedCount = 0;

    for (let i = 0; i < toDelete.length; i += deleteBatchSize) {
      const batch = toDelete.slice(i, i + deleteBatchSize);
      await ns.write({ deletes: batch });
      deletedCount += batch.length;
    }

    console.log(`Deleted ${deletedCount} similar objects.`);
  } catch (error) {
    console.error("Similarity deduplication failed:", error.message);
    throw error;
  }
}

async function main() {
  try {
    getTurbopufferClient();
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
