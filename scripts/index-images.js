#!/usr/bin/env node

/**
 * Image Indexing Script
 *
 * Indexes images from the data folder by:
 * 1. Finding all image files in the data directory
 * 2. Uploading them to Vercel Blob storage
 * 3. Generating embeddings using the local /api/embed endpoint
 * 4. Storing metadata and vectors in Turbopuffer
 *
 * Environment variables required:
 * - BLOB_READ_WRITE_TOKEN: Vercel Blob token
 * - TURBOPUFFER_API_KEY: Turbopuffer API key (create at https://turbopuffer.com/dashboard)
 * - TURBOPUFFER_REGION: (optional) e.g. gcp-us-central1
 */

import { Turbopuffer } from "@turbopuffer/turbopuffer";
import { put } from "@vercel/blob";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";
import { config } from "dotenv";
import sharp from "sharp";
import { randomUUID } from "crypto";

config({ path: ".env.local" });

const DATA_DIR = join(process.cwd(), "data");
const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const BATCH_SIZE = 50;

const requiredEnvVars = ["BLOB_READ_WRITE_TOKEN", "TURBOPUFFER_API_KEY"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable: ${envVar}`);
    console.error("Please set this in your .env.local file.");
    console.error("Current environment variables found:");
    Object.keys(process.env)
      .filter(
        (key) => key.includes("BLOB") || key.includes("TURBOPUFFER")
      )
      .forEach((key) => {
        console.error(`  ${key}: ${process.env[key] ? "***" : "undefined"}`);
      });
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

function getImageFiles(dir) {
  const files = [];

  function scanDirectory(currentDir) {
    const items = readdirSync(currentDir);

    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (
        stat.isFile() &&
        SUPPORTED_EXTENSIONS.includes(extname(item).toLowerCase())
      ) {
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
    console.warn(`Could not read metadata for ${imagePath}:`, error.message);
    return { width: 0, height: 0, format: "unknown" };
  }
}

async function uploadToBlob(imagePath) {
  try {
    const filename = basename(imagePath);
    const fileBuffer = readFileSync(imagePath);

    console.log(`Uploading ${filename} to Vercel Blob...`);

    const blob = await put(filename, fileBuffer, {
      access: "public",
      addRandomSuffix: true,
    });

    console.log(`Uploaded: ${blob.pathname}`);
    return blob;
  } catch (error) {
    console.error(`Failed to upload ${imagePath}:`, error.message);
    throw error;
  }
}

async function getImageEmbedding(imageUrl) {
  try {
    console.log(`Getting embedding for ${imageUrl}...`);

    const baseUrl =
      process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "https://mirror-azure.vercel.app";

    const response = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl }),
    });

    if (!response.ok) {
      let errorMessage = `Embedding API returned ${response.status}: ${response.statusText}`;
      try {
        const errorBody = await response.text();
        errorMessage += ` - ${errorBody}`;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();

    if (!result.image_embedding) {
      throw new Error("No image embedding in response");
    }

    console.log(`Got embedding (${result.image_embedding.length} dimensions)`);
    return result.image_embedding;
  } catch (error) {
    console.error(`Failed to get embedding for ${imageUrl}:`, error.message);
    throw error;
  }
}

const IMAGE_SCHEMA = {
  image_id: { type: "string" },
  image_url: { type: "string" },
  width: { type: "int" },
  height: { type: "int" },
};

async function storeInTurbopuffer(imageData) {
  try {
    const { id, blobUrl, width, height, vector, filename } = imageData;

    console.log(`Storing in Turbopuffer: ${id}...`);

    const client = getTurbopufferClient();
    const ns = client.namespace("Image");

    await ns.write({
      upsert_rows: [
        {
          id,
          vector,
          image_id: filename,
          image_url: blobUrl,
          width: width ?? 0,
          height: height ?? 0,
        },
      ],
      distance_metric: "cosine_distance",
      schema: IMAGE_SCHEMA,
    });

    console.log(`Stored in Turbopuffer: ${id}`);
    return { id };
  } catch (error) {
    console.error(`Failed to store in Turbopuffer:`, error.message);
    throw error;
  }
}

async function processImage(imagePath) {
  const filename = basename(imagePath);
  const id = randomUUID();

  try {
    const metadata = await getImageMetadata(imagePath);
    console.log(
      `Image ${filename}: ${metadata.width}x${metadata.height} (${metadata.format})`
    );

    const blob = await uploadToBlob(imagePath);
    const blobUrl = blob.url;

    const vector = await getImageEmbedding(blobUrl);

    await storeInTurbopuffer({
      id,
      filename,
      blobUrl,
      width: metadata.width,
      height: metadata.height,
      vector,
    });

    return { success: true, id, filename };
  } catch (error) {
    console.error(`Failed to process ${filename}:`, error.message);
    return { success: false, id, filename, error: error.message };
  }
}

async function main() {
  try {
    console.log("Starting image indexing process...");

    getTurbopufferClient();
    console.log("Turbopuffer client initialized");

    console.log(`Scanning for images in ${DATA_DIR}...`);
    const imageFiles = getImageFiles(DATA_DIR);

    if (imageFiles.length === 0) {
      console.log("No image files found in data directory");
      return;
    }

    console.log(`Found ${imageFiles.length} image(s) to process`);

    const results = { successful: 0, failed: 0, errors: [] };

    for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
      const batch = imageFiles.slice(i, i + BATCH_SIZE);
      console.log(
        `\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(imageFiles.length / BATCH_SIZE)}`
      );

      const batchPromises = batch.map(processImage);
      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          if (result.value.success) {
            results.successful++;
            console.log(`${result.value.filename} (${result.value.id})`);
          } else {
            results.failed++;
            results.errors.push(result.value);
            console.log(`${result.value.filename}: ${result.value.error}`);
          }
        } else {
          results.failed++;
          console.log(`Batch processing failed: ${result.reason}`);
        }
      }
    }

    console.log("\nIndexing complete!");
    console.log(`Successful: ${results.successful}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Total: ${results.successful + results.failed}`);

    if (results.errors.length > 0) {
      console.log("\nErrors encountered:");
      results.errors.forEach((error) => {
        console.log(`  - ${error.filename}: ${error.error}`);
      });
    }
  } catch (error) {
    console.error("Fatal error:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
