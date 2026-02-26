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

const MAX_TOP_K = 10_000;
const DRY_RUN = process.env.DRY_RUN === "true";

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

async function fetchAllImages() {
  const client = getClient();
  const ns = client.namespace("Image");
  const all = [];
  let lastId = null;

  while (true) {
    const params = {
      rank_by: ["id", "asc"],
      top_k: MAX_TOP_K,
      include_attributes: ["image_id", "image_url"],
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

function assessImageQuality(imageUrl, filename) {
  if (!(imageUrl && filename)) {
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
      !(
        url.hostname.includes("vercel-storage") || url.hostname.includes("blob")
      )
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
    return { quality: 0, reason: "invalid_url", details: "Malformed URL" };
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
    console.log(
      "Using metadata-based quality assessment (no downloads required)"
    );
    if (DRY_RUN) {
      console.log(
        "DRY RUN MODE: No images will be deleted, only analysis will run"
      );
    } else {
      console.log(
        "LIVE MODE: Poor quality images will be permanently deleted from Turbopuffer"
      );
    }

    console.log("Fetching all images from Turbopuffer...");
    const images = await fetchAllImages();
    console.log(`Found ${images.length} images to analyze`);

    const qualityResults = [];
    const poorQualityIds = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const displayName = image.image_id || `object_${i + 1}`;
      const imageUrl = image.image_url || "";
      const imageId = image.image_id || "";

      const quality = assessImageQuality(imageUrl, imageId);

      qualityResults.push({
        id: image.id,
        image_id: displayName,
        ...quality,
      });

      if (quality.quality < 50) {
        poorQualityIds.push(image.id);
        console.log(
          `  Poor quality: ${quality.reason} - ${quality.details || ""}`
        );
      } else if ((i + 1) % 100 === 0) {
        console.log("  Good quality");
      }
    }

    console.log("\nQuality analysis complete!");
    console.log(`Total images analyzed: ${images.length}`);
    console.log(
      `Good quality images: ${images.length - poorQualityIds.length}`
    );
    console.log(`Poor quality images to remove: ${poorQualityIds.length}`);

    if (poorQualityIds.length === 0) {
      console.log("No poor quality images found!");
      return;
    }

    const reasons = qualityResults.reduce((acc, result) => {
      acc[result.reason] = (acc[result.reason] || 0) + 1;
      return acc;
    }, {});

    console.log("\nQuality issues found:");
    Object.entries(reasons).forEach(([reason, count]) => {
      console.log(`  ${reason}: ${count}`);
    });

    console.log(
      `\nReady to delete ${poorQualityIds.length} poor quality images.`
    );

    const deletePercentage = (poorQualityIds.length / images.length) * 100;
    if (deletePercentage > 50) {
      console.log(
        `WARNING: Would delete ${deletePercentage.toFixed(1)}% of images (${poorQualityIds.length}/${images.length})`
      );
      console.log(
        "This seems excessive. Consider adjusting quality thresholds or running in dry-run mode first."
      );
    }

    if (DRY_RUN) {
      console.log(
        "DRY RUN: Would delete the following images but not actually doing it:"
      );
      poorQualityIds.slice(0, 10).forEach((id) => console.log(`  - ${id}`));
      if (poorQualityIds.length > 10) {
        console.log(`  ... and ${poorQualityIds.length - 10} more`);
      }
      return;
    }

    console.log(
      "Note: This will permanently remove these images from Turbopuffer."
    );
    console.log("The original files in Vercel Blob will remain untouched.");

    const ns = getClient().namespace("Image");
    const deleteBatchSize = 500;
    let deletedCount = 0;

    for (let i = 0; i < poorQualityIds.length; i += deleteBatchSize) {
      const batch = poorQualityIds.slice(i, i + deleteBatchSize);
      const batchNum = Math.floor(i / deleteBatchSize) + 1;
      const totalBatches = Math.ceil(poorQualityIds.length / deleteBatchSize);

      console.log(
        `Deleting batch ${batchNum}/${totalBatches} (${batch.length} items)`
      );

      await ns.write({
        deletes: batch,
        distance_metric: "cosine_distance",
      });
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
    getClient();
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
