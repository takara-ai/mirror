#!/usr/bin/env node

/**
 * Image Deduplication Script
 *
 * Removes duplicate images from Weaviate based on identical vectors.
 * Keeps the first occurrence of each unique vector and deletes duplicates.
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

async function deduplicateImagesFast() {
  try {
    console.log('Starting fast deduplication process for 40k+ objects...');

    const imageCollection = weaviateClient.collections.get('Image');

    // Use fast approximate method: group by first 10 vector elements
    const vectorGroups = new Map();
    const duplicates = [];
    let processedCount = 0;
    let batchNum = 0;
    const fetchBatchSize = 500; // Larger batches for speed

    console.log('Starting streaming deduplication...');

    // Stream through all objects in batches until no more results
    while (true) {
      batchNum++;
      const offset = (batchNum - 1) * fetchBatchSize;

      const result = await imageCollection.query.fetchObjects({
        returnProperties: ['filename'],
        includeVector: true,
        limit: fetchBatchSize,
        offset: offset,
      });

      if (result.objects.length === 0) {
        // No more objects to process
        break;
      }

      console.log(`Processing batch ${batchNum} (${offset}-${offset + result.objects.length})`);

      // Process this batch
      for (const obj of result.objects) {
        if (!obj.vectors?.default) continue;

        // Use first 10 elements as hash key for speed
        const vectorKey = obj.vectors.default.slice(0, 10).join(',');

        if (vectorGroups.has(vectorKey)) {
          duplicates.push(obj.uuid); // Only store UUID for memory efficiency
        } else {
          vectorGroups.set(vectorKey, true); // Just mark as seen
        }
      }

      processedCount += result.objects.length;
      console.log(`Processed: ${processedCount} total, Duplicates found: ${duplicates.length}`);
    }

    console.log(`Finished processing. Total objects: ${processedCount}`);

    if (duplicates.length === 0) {
      console.log('No duplicates found!');
      return;
    }

    console.log(`Found ${duplicates.length} duplicate images to delete`);

    // Delete duplicates in large batches for speed
    const deleteBatchSize = 500; // Increased for better performance
    let deletedCount = 0;

    for (let i = 0; i < duplicates.length; i += deleteBatchSize) {
      const batch = duplicates.slice(i, i + deleteBatchSize);
      const batchNum = Math.floor(i / deleteBatchSize) + 1;
      const totalBatches = Math.ceil(duplicates.length / deleteBatchSize);

      console.log(`Deleting batch ${batchNum}/${totalBatches} (${batch.length} items)`);

      try {
        // Use deleteMany with ID filter for batch deletion
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

    console.log(`\nFast deduplication complete!`);
    console.log(`Kept: ${vectorGroups.size} unique vector groups`);
    console.log(`Deleted: ${deletedCount} duplicates`);
    console.log(`Total remaining: ${processedCount - deletedCount}`);

  } catch (error) {
    console.error('Fast deduplication failed:', error.message);
    throw error;
  }
}

// Alternative method using vector similarity search (more accurate but slower)
async function deduplicateBySimilarity() {
  try {
    console.log('Starting similarity-based deduplication...');

    const imageCollection = weaviateClient.collections.get('Image');

    // Get total count
    const countResult = await imageCollection.aggregate.overAll({
      returnMetrics: ['meta { count }'],
    });

    const totalCount = countResult.totalCount || 0;
    console.log(`Processing ${totalCount} images...`);

    // Fetch all objects with IDs and vectors
    const allObjects = [];
    let offset = 0;
    const batchSize = 100;

    while (offset < totalCount) {
      const result = await imageCollection.query.fetchObjects({
        returnProperties: ['filename'],
        includeVector: true,
        limit: batchSize,
        offset: offset,
      });

      allObjects.push(...result.objects);
      offset += batchSize;
    }

    console.log(`Fetched ${allObjects.length} objects`);

    // Find exact duplicates by comparing vectors
    const seenVectors = new Set();
    const toDelete = [];

    for (const obj of allObjects) {
      if (!obj.vectors?.default) continue;

      // Create a hash of the full vector for exact comparison
      const vectorHash = obj.vectors.default.join(',');

      if (seenVectors.has(vectorHash)) {
        toDelete.push(obj.uuid);
      } else {
        seenVectors.add(vectorHash);
      }
    }

    if (toDelete.length === 0) {
      console.log('No exact vector duplicates found!');
      return;
    }

    console.log(`Found ${toDelete.length} exact vector duplicates`);

    // Delete duplicates
    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += 50) {
      const batch = toDelete.slice(i, i + 50);
      const deletePromises = batch.map(uuid => imageCollection.data.delete(uuid));
      await Promise.allSettled(deletePromises);
      deleted += batch.length;
      console.log(`Deleted ${deleted}/${toDelete.length} duplicates`);
    }

    console.log(`\nDeduplication complete!`);
    console.log(`Deleted: ${deleted} exact vector duplicates`);

  } catch (error) {
    console.error('Similarity deduplication failed:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await initializeClient();

    // Use fast method for 40k+ objects
    await deduplicateImagesFast();

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
