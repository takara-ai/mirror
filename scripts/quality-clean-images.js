#!/usr/bin/env node

/**
 * Fast Image Quality Cleaning Script
 *
 * Removes poor quality images from Turbopuffer using metadata and URL patterns.
 * Fast, reliable approach that doesn't require downloading images.
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

const QUALITY_PATTERNS = {
  suspiciousUrls: [
    /\/unsplash_.*-undefined$/,
    /\/undefined/,
    /\/null/,
    /\/error/,
    /\/404/,
    /\/broken/,
    /\/missing/,
  ],
  suspiciousFilenames: [
    /^undefined$/,
    /^null$/,
    /^error$/,
    /^404$/,
    /^broken$/,
    /^missing$/,
    /^.{1,3}$/,
    /^.{50,}$/,
    /\.(exe|bat|com|scr|cmd)$/i,
    /^[^.]+$/,
  ],
};

const BATCH_SIZE = 5000;
const DRY_RUN = process.env.DRY_RUN === "true";

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

function assessImageQuality(imageUrl, filename) {
  if (!imageUrl || !filename) {
    return {
      quality: 0,
      reason: "missing_data",
      details: "undefined URL or filename",
    };
  }

  for (const pattern of QUALITY_PATTERNS.suspiciousUrls) {
    if (pattern.test(imageUrl)) {
      return {
        quality: 0,
        reason: "suspicious_url",
        details: `URL matches pattern: ${pattern}`,
      };
    }
  }

  for (const pattern of QUALITY_PATTERNS.suspiciousFilenames) {
    if (pattern.test(filename)) {
      return {
        quality: 0,
        reason: "suspicious_filename",
        details: `Filename matches pattern: ${pattern}`,
      };
    }
  }

  try {
    const url = new URL(imageUrl);
    if (
      !url.hostname.includes("vercel-storage") &&
      !url.hostname.includes("blob")
    ) {
      return {
        quality: 0,
        reason: "invalid_host",
        details: "Not from expected image host",
      };
    }
    if (imageUrl.length > 500) {
      return {
        quality: 0,
        reason: "url_too_long",
        details: "URL suspiciously long",
      };
    }
  } catch (error) {
    return {
      quality: 0,
      reason: "invalid_url",
      details: "Malformed URL",
    };
  }

  if (filename.length === 0) {
    return {
      quality: 0,
      reason: "empty_filename",
      details: "Filename is empty",
    };
  }

  const validExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];
  const hasValidExtension = validExtensions.some((ext) =>
    filename.toLowerCase().endsWith(ext)
  );
  if (!hasValidExtension) {
    return {
      quality: 0,
      reason: "invalid_extension",
      details: "Unsupported or missing file extension",
    };
  }

  return {
    quality: 100,
    reason: "good_quality",
    details: "All quality checks passed",
  };
}

async function qualityCleanImages() {
  try {
    console.log("Starting fast image quality cleaning process...");
    if (DRY_RUN) {
      console.log("DRY RUN MODE: No images will be deleted");
    } else {
      console.log(
        "LIVE MODE: Poor quality images will be permanently deleted from Turbopuffer"
      );
    }

    const client = getTurbopufferClient();
    const ns = client.namespace("Image");

    console.log("Fetching all images from Turbopuffer...");
    let lastId = null;
    const images = [];

    while (true) {
      const result = await ns.query({
        rank_by: ["id", "asc"],
        top_k: 40000,
        include_attributes: ["image_id", "image_url"],
        ...(lastId != null && { filters: ["id", "Gt", lastId] }),
      });

      const rows = result.rows ?? [];
      if (rows.length === 0) break;
      images.push(...rows);
      if (rows.length < 40000) break;
      lastId = rows[rows.length - 1]?.id;
    }

    console.log(`Found ${images.length} images to analyze`);

    const qualityResults = [];
    const poorQualityIds = [];
    let processedCount = 0;

    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      const batch = images.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(images.length / BATCH_SIZE);

      console.log(`\nProcessing batch ${batchNum}/${totalBatches} (${batch.length} images)`);

      for (const image of batch) {
        processedCount++;
        const filename = image.image_id ?? `object_${processedCount}`;
        const quality = assessImageQuality(image.image_url, filename);

        qualityResults.push({
          id: image.id,
          filename,
          ...quality,
        });

        if (quality.quality < 50) {
          poorQualityIds.push(image.id);
          console.log(`  Poor quality: ${quality.reason} - ${quality.details || ""}`);
        } else if (processedCount % 100 === 0) {
          console.log("  Good quality");
        }
      }

      console.log(
        `Progress: ${processedCount}/${images.length} analyzed, ${poorQualityIds.length} poor quality`
      );
    }

    console.log(`\nQuality analysis complete!`);
    console.log(`Good quality: ${processedCount - poorQualityIds.length}`);
    console.log(`Poor quality to remove: ${poorQualityIds.length}`);

    if (poorQualityIds.length === 0) {
      console.log("No poor quality images found!");
      return;
    }

    const reasons = qualityResults.reduce((acc, r) => {
      acc[r.reason] = (acc[r.reason] || 0) + 1;
      return acc;
    }, {});
    console.log("\nQuality issues found:");
    Object.entries(reasons).forEach(([reason, count]) => {
      console.log(`  ${reason}: ${count}`);
    });

    const deletePercentage = (poorQualityIds.length / images.length) * 100;
    if (deletePercentage > 50) {
      console.log(
        `WARNING: Would delete ${deletePercentage.toFixed(1)}% of images (${poorQualityIds.length}/${images.length})`
      );
    }

    if (DRY_RUN) {
      console.log("DRY RUN: Would delete (first 10):", poorQualityIds.slice(0, 10));
      if (poorQualityIds.length > 10) {
        console.log(`... and ${poorQualityIds.length - 10} more`);
      }
      return;
    }

    console.log(
      "Note: This will permanently remove these images from Turbopuffer. Blob files remain."
    );

    const deleteBatchSize = 500;
    let deletedCount = 0;

    for (let i = 0; i < poorQualityIds.length; i += deleteBatchSize) {
      const batch = poorQualityIds.slice(i, i + deleteBatchSize);
      const batchNum = Math.floor(i / deleteBatchSize) + 1;
      const totalBatches = Math.ceil(poorQualityIds.length / deleteBatchSize);

      console.log(`Deleting batch ${batchNum}/${totalBatches} (${batch.length} items)`);
      await ns.write({ deletes: batch });
      deletedCount += batch.length;
    }

    console.log("\nQuality cleaning complete!");
    console.log(`Images removed: ${deletedCount}`);
    console.log(`Images remaining: ${images.length - deletedCount}`);
  } catch (error) {
    console.error("Quality cleaning failed:", error.message);
    throw error;
  }
}

async function main() {
  try {
    getTurbopufferClient();
    console.log("Turbopuffer client initialized");
    await qualityCleanImages();
  } catch (error) {
    console.error("Fatal error:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
