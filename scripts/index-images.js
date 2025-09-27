#!/usr/bin/env node

/**
 * Image Indexing Script
 *
 * This script indexes images from the data folder by:
 * 1. Finding all image files in the data directory
 * 2. Uploading them to Vercel Blob storage
 * 3. Generating embeddings using the local /api/embed endpoint
 * 4. Storing metadata and vectors in Weaviate
 *
 * Environment variables required:
 * - BLOB_READ_WRITE_TOKEN: Vercel Blob token
 * - WEAVIATE_HTTP: Weaviate host URL (e.g., https://your-project.weaviate.cloud)
 * - WEAVIATE_API_KEY: Weaviate API key
 */

import { put } from '@vercel/blob';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { config } from 'dotenv';
import weaviate, { ApiKey } from 'weaviate-client';
import sharp from 'sharp';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Configuration
const DATA_DIR = join(process.cwd(), 'data');
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const BATCH_SIZE = 10; // Process images in batches

// Validate environment variables
const requiredEnvVars = ['BLOB_READ_WRITE_TOKEN', 'WEAVIATE_HTTP', 'WEAVIATE_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable: ${envVar}`);
    console.error('Please set this in your .env.local file.');
    console.error('Current environment variables found:');
    Object.keys(process.env).filter(key => key.includes('BLOB') || key.includes('WEAVIATE')).forEach(key => {
      console.error(`  ${key}: ${process.env[key] ? '***' : 'undefined'}`);
    });
    process.exit(1);
  }
}

// Initialize clients
let weaviateClient;
let blobToken = process.env.BLOB_READ_WRITE_TOKEN;

async function initializeClients() {
  try {
    // Initialize Weaviate client using connectToWeaviateCloud
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

function getImageFiles(dir) {
  const files = [];

  function scanDirectory(currentDir) {
    const items = readdirSync(currentDir);

    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (stat.isFile() && SUPPORTED_EXTENSIONS.includes(extname(item).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  scanDirectory(dir);
  return files;
}

async function getImageMetadata(imagePath) {
  try {
    const metadata = await sharp(imagePath).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  } catch (error) {
    console.warn(`⚠️  Could not read metadata for ${imagePath}:`, error.message);
    return { width: 0, height: 0, format: 'unknown' };
  }
}

async function uploadToBlob(imagePath) {
  try {
    const filename = basename(imagePath);
    const fileBuffer = readFileSync(imagePath);

    console.log(`Uploading ${filename} to Vercel Blob...`);

    const blob = await put(filename, fileBuffer, {
      access: 'public',
      addRandomSuffix: true, // Prevent overwrites and make URLs unguessable
    });

    console.log(`✅ Uploaded: ${blob.pathname}`);
    return blob;
  } catch (error) {
    console.error(`❌ Failed to upload ${imagePath}:`, error.message);
    throw error;
  }
}

async function getImageEmbedding(imageUrl) {
  try {
    console.log(`🧠 Getting embedding for ${imageUrl}...`);

    const response = await fetch('http://localhost:3000/api/embed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageUrl,
      }),
    });

    if (!response.ok) {
      let errorMessage = `Embedding API returned ${response.status}: ${response.statusText}`;
      try {
        const errorBody = await response.text();
        errorMessage += ` - ${errorBody}`;
      } catch (e) {
        // Ignore error reading response body
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();

    if (!result.image_embedding) {
      throw new Error('No image embedding in response');
    }

    console.log(`✅ Got embedding (${result.image_embedding.length} dimensions)`);
    return result.image_embedding;
  } catch (error) {
    console.error(`❌ Failed to get embedding for ${imageUrl}:`, error.message);
    throw error;
  }
}

async function storeInWeaviate(imageData) {
  try {
    const { id, blobUrl, width, height, vector } = imageData;

    console.log(`Storing in Weaviate: ${id}...`);

    const imageCollection = weaviateClient.collections.get('Image');
    const result = await imageCollection.data.insert({
      properties: {
        image_id: id,
        image_url: blobUrl,
        width: width,
        height: height,
      },
      vectors: vector,
    });

    console.log(`✅ Stored in Weaviate: ${id}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to store in Weaviate:`, error.message);
    throw error;
  }
}

async function processImage(imagePath) {
  const filename = basename(imagePath);
  const id = filename.replace(extname(filename), ''); // Remove extension for ID

  try {
    // Get image metadata
    const metadata = await getImageMetadata(imagePath);
    console.log(`Image ${filename}: ${metadata.width}x${metadata.height} (${metadata.format})`);

    // Upload to Vercel Blob
    const blob = await uploadToBlob(imagePath);
    const blobUrl = blob.url; // Use the full URL returned by Vercel Blob

    // Get embedding
    const vector = await getImageEmbedding(blobUrl);

    // Store in Weaviate
    await storeInWeaviate({
      id,
      blobUrl,
      width: metadata.width,
      height: metadata.height,
      vector,
    });

    return { success: true, id, filename };
  } catch (error) {
    console.error(`❌ Failed to process ${filename}:`, error.message);
    return { success: false, id, filename, error: error.message };
  }
}

async function ensureWeaviateSchema() {
  try {
    console.log('Creating Image collection in Weaviate...');

    // Try to create the collection - modern Weaviate API uses collections instead of classes
    try {
      const collection = await weaviateClient.collections.create({
        name: 'Image',
        description: 'Image collection for vector search',
        properties: [
          {
            name: 'image_id',
            dataType: 'text',
            description: 'Unique identifier for the image',
          },
          {
            name: 'image_url',
            dataType: 'text',
            description: 'Public URL to the image in Vercel Blob',
          },
          {
            name: 'width',
            dataType: 'int',
            description: 'Image width in pixels',
          },
          {
            name: 'height',
            dataType: 'int',
            description: 'Image height in pixels',
          },
        ],
        vectorizers: weaviate.configure.vectorizer.none(), // We'll provide our own vectors
      });

      console.log('✅ Created Image collection in Weaviate');
    } catch (schemaError) {
      if (schemaError.message.includes('already exists') || schemaError.message.includes('duplicate')) {
        console.log('✅ Image collection already exists in Weaviate');
      } else {
        throw schemaError;
      }
    }
  } catch (error) {
    console.error('❌ Failed to ensure Weaviate schema:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('Starting image indexing process...');

    // Initialize clients
    await initializeClients();

    // Ensure Weaviate schema
    await ensureWeaviateSchema();

    // Find all image files
    console.log(`Scanning for images in ${DATA_DIR}...`);
    const imageFiles = getImageFiles(DATA_DIR);

    if (imageFiles.length === 0) {
      console.log('No image files found in data directory');
      return;
    }

    console.log(`Found ${imageFiles.length} image(s) to process`);

    // Process images in batches
    const results = { successful: 0, failed: 0, errors: [] };

    for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
      const batch = imageFiles.slice(i, i + BATCH_SIZE);
      console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(imageFiles.length / BATCH_SIZE)}`);

      const batchPromises = batch.map(processImage);
      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.successful++;
            console.log(`✅ ${result.value.filename} (${result.value.id})`);
          } else {
            results.failed++;
            results.errors.push(result.value);
            console.log(`❌ ${result.value.filename}: ${result.value.error}`);
          }
        } else {
          results.failed++;
          console.log(`❌ Batch processing failed: ${result.reason}`);
        }
      }

      // Small delay between batches to avoid overwhelming services
      if (i + BATCH_SIZE < imageFiles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Final summary
    console.log('\nIndexing complete!');
    console.log(`Successful: ${results.successful}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Total: ${results.successful + results.failed}`);

    if (results.errors.length > 0) {
      console.log('\nErrors encountered:');
      results.errors.forEach(error => {
        console.log(`  • ${error.filename}: ${error.error}`);
      });
    }

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
