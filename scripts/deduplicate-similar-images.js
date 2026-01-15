#!/usr/bin/env node

/**
 * Image Similarity Deduplication Script
 *
 * Removes images with very similar vectors (close matches) from Weaviate.
 * Uses vector similarity search to find objects within a cosine similarity threshold.
 *
 * Environment variables required:
 * - WEAVIATE_HTTP: Weaviate host URL (e.g., https://your-project.weaviate.cloud)
 * - WEAVIATE_API_KEY: Weaviate API key
 */

import { config } from 'dotenv';
import weaviate from 'weaviate-client';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Validate environment variables
const requiredEnvVars = ['WEAVIATE_HTTP', 'WEAVIATE_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable: ${envVar}`);
    console.error('Please set this in your .env.local file.');
    process.exit(1);
  }
}

// Configuration
const SIMILARITY_THRESHOLD = 0.995; // Cosine similarity threshold (very close matches)
const SAMPLE_RATIO = 1.0; // Process 100% of objects for thorough similarity search
const SEARCH_LIMIT = 5; // How many similar objects to check per sampled image
const BATCH_SIZE = 200; // Process images in batches
const CONCURRENT_SEARCHES = 10; // Run multiple searches concurrently

// Initialize Weaviate client
let weaviateClient;

async function initializeClient() {
  try {
    const weaviateUrl = process.env.WEAVIATE_HTTP.replace('https://', '').replace('http://', '');

    weaviateClient = await weaviate.connectToWeaviateCloud(
      weaviateUrl,
      {
        authCredentials: new weaviate.ApiKey(process.env.WEAVIATE_API_KEY),
      }
    );

    console.log('Weaviate client initialized');
  } catch (error) {
    console.error('Failed to initialize Weaviate client:', error.message);
    throw error;
  }
}

async function findSimilarImagesFast() {
  try {
    console.log(`Starting thorough similarity deduplication (processing ${SAMPLE_RATIO * 100}% of objects)...`);

    const imageCollection = weaviateClient.collections.get('Image');

    // Get all objects for thorough similarity search
    console.log('Fetching all objects for thorough similarity analysis...');
    const sampleResult = await imageCollection.query.fetchObjects({
      returnProperties: ['filename'],
      includeVector: true,
      limit: Math.floor(36340 * SAMPLE_RATIO), // Sample based on remaining objects after exact dedupe
    });

    const allObjects = sampleResult.objects.filter(obj => obj.vectors?.default);
    console.log(`Fetched ${allObjects.length} objects for thorough similarity search`);

    // Track processed objects and similarity groups
    const processedIds = new Set();
    const similarGroups = new Map(); // groupId -> [objectIds]
    let nextGroupId = 0;

    // Process all objects in concurrent batches
    console.log(`Running ${CONCURRENT_SEARCHES} concurrent similarity searches...`);

    for (let i = 0; i < allObjects.length; i += CONCURRENT_SEARCHES) {
      const batch = allObjects.slice(i, i + CONCURRENT_SEARCHES);
      const batchNum = Math.floor(i / CONCURRENT_SEARCHES) + 1;
      const totalBatches = Math.ceil(allObjects.length / CONCURRENT_SEARCHES);

      console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} objects)`);

      // Run concurrent similarity searches
      const searchPromises = batch.map(async (obj) => {
        if (processedIds.has(obj.uuid)) return null;

        try {
          const similarResult = await imageCollection.query.nearVector(obj.vectors.default, {
            certainty: SIMILARITY_THRESHOLD,
            limit: SEARCH_LIMIT + 1, // +1 because we'll find ourselves
            returnProperties: ['filename'],
          });

          // Filter out the object itself and already processed objects
          const similarObjects = similarResult.objects.filter(similarObj =>
            similarObj.uuid !== obj.uuid && !processedIds.has(similarObj.uuid)
          );

          if (similarObjects.length > 0) {
            return {
              sourceObj: obj,
              similarObjects: similarObjects
            };
          }
        } catch (error) {
          console.warn(`Search failed for ${obj.uuid}:`, error.message);
        }
        return null;
      });

      const results = await Promise.allSettled(searchPromises);

      // Process results and build similarity groups
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const { sourceObj, similarObjects } = result.value;

          // Check if any of these objects are already in groups
          let existingGroupId = null;
          for (const [groupId, objectIds] of similarGroups) {
            if (objectIds.includes(sourceObj.uuid) ||
                objectIds.some(id => similarObjects.some(s => s.uuid === id))) {
              existingGroupId = groupId;
              break;
            }
          }

          if (existingGroupId !== null) {
            // Add to existing group
            const existingIds = similarGroups.get(existingGroupId);
            const newIds = [sourceObj.uuid, ...similarObjects.map(s => s.uuid)]
              .filter(id => !existingIds.includes(id));
            existingIds.push(...newIds);
          } else {
            // Create new group
            const groupId = nextGroupId++;
            similarGroups.set(groupId, [sourceObj.uuid, ...similarObjects.map(s => s.uuid)]);
          }

          // Mark all these objects as processed
          processedIds.add(sourceObj.uuid);
          similarObjects.forEach(s => processedIds.add(s.uuid));
        }
      }

      console.log(`Progress: ${processedIds.size} objects processed, ${similarGroups.size} similarity groups found`);
    }

    console.log(`\nSimilarity analysis complete!`);
    console.log(`Total objects processed: ${allObjects.length}`);
    console.log(`Similarity groups found: ${similarGroups.size}`);

    if (similarGroups.size === 0) {
      console.log('No similar images found above the threshold.');
      return;
    }

    // For each similarity group, keep one object and mark others for deletion
    const toDelete = [];
    for (const [groupId, objectIds] of similarGroups) {
      // Keep the first object, delete the rest
      const objectsToDelete = objectIds.slice(1);
      toDelete.push(...objectsToDelete);

      console.log(`Group ${groupId}: keeping 1, deleting ${objectsToDelete.length}`);
    }

    console.log(`\nTotal objects to delete: ${toDelete.length}`);

    if (toDelete.length === 0) {
      console.log('No duplicates to remove.');
      return;
    }

    // Delete similar duplicates in batches
    const deleteBatchSize = 500;
    let deletedCount = 0;

    for (let i = 0; i < toDelete.length; i += deleteBatchSize) {
      const batch = toDelete.slice(i, i + deleteBatchSize);
      const batchNum = Math.floor(i / deleteBatchSize) + 1;
      const totalBatches = Math.ceil(toDelete.length / deleteBatchSize);

      console.log(`Deleting batch ${batchNum}/${totalBatches} (${batch.length} items)`);

      try {
        const response = await imageCollection.data.deleteMany(
          imageCollection.filter.byId().containsAny(batch)
        );
        console.log(`Batch ${batchNum} deleted ${response.results?.successes || batch.length} objects`);
      } catch (deleteError) {
        console.warn(`Batch ${batchNum} failed:`, deleteError.message);
        // Fallback to individual deletions
        for (const uuid of batch) {
          try {
            await imageCollection.data.deleteById(uuid);
          } catch (singleError) {
            console.warn(`Failed to delete ${uuid}:`, singleError.message);
          }
        }
      }

      deletedCount += batch.length;
    }

    console.log(`\nFast similarity deduplication complete!`);
    console.log(`Similarity groups processed: ${similarGroups.size}`);
    console.log(`Deleted: ${deletedCount} similar objects`);
    console.log(`Estimated remaining: ~${36340 - deletedCount}`);

  } catch (error) {
    console.error('Fast similarity deduplication failed:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await initializeClient();
    await findSimilarImagesFast();
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
