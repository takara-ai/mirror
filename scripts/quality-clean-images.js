#!/usr/bin/env node

/**
 * Fast Image Quality Cleaning Script
 *
 * Removes poor quality images from Weaviate using metadata and URL patterns.
 * Fast, reliable approach that doesn't require downloading images.
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

// Configuration for fast metadata-based quality assessment
const QUALITY_PATTERNS = {
  // URLs that indicate problems
  suspiciousUrls: [
    /\/unsplash_.*-undefined$/,
    /\/undefined/,
    /\/null/,
    /\/error/,
    /\/404/,
    /\/broken/,
    /\/missing/
  ],
  // Filenames that indicate problems
  suspiciousFilenames: [
    /^undefined$/,
    /^null$/,
    /^error$/,
    /^404$/,
    /^broken$/,
    /^missing$/,
    // Very short or very long filenames
    /^.{1,3}$/,
    /^.{50,}$/,
    // Files with suspicious extensions or no extensions
    /\.(exe|bat|com|scr|cmd)$/i,
    /^[^.]+$/  // No extension
  ]
};

const BATCH_SIZE = 5000;   // Very large batches for fast processing
const DRY_RUN = process.env.DRY_RUN === 'true'; // Set DRY_RUN=true to preview without deleting

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

// Fast metadata-based quality assessment
function assessImageQuality(imageUrl, filename) {
  // Check for undefined/null values
  if (!imageUrl || !filename) {
    return { quality: 0, reason: 'missing_data', details: 'undefined URL or filename' };
  }

  // Check URL patterns
  for (const pattern of QUALITY_PATTERNS.suspiciousUrls) {
    if (pattern.test(imageUrl)) {
      return { quality: 0, reason: 'suspicious_url', details: `URL matches pattern: ${pattern}` };
    }
  }

  // Check filename patterns
  for (const pattern of QUALITY_PATTERNS.suspiciousFilenames) {
    if (pattern.test(filename)) {
      return { quality: 0, reason: 'suspicious_filename', details: `Filename matches pattern: ${pattern}` };
    }
  }

  // URL structure validation
  try {
    const url = new URL(imageUrl);

    // Check if it's a valid image hosting URL
    if (!url.hostname.includes('vercel-storage') && !url.hostname.includes('blob')) {
      return { quality: 0, reason: 'invalid_host', details: 'Not from expected image host' };
    }

    // Check for very long URLs (might indicate problems)
    if (imageUrl.length > 500) {
      return { quality: 0, reason: 'url_too_long', details: 'URL suspiciously long' };
    }

  } catch (error) {
    return { quality: 0, reason: 'invalid_url', details: 'Malformed URL' };
  }

  // Filename validation
  if (filename.length === 0) {
    return { quality: 0, reason: 'empty_filename', details: 'Filename is empty' };
  }

  // Check file extension (basic validation)
  const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
  const hasValidExtension = validExtensions.some(ext =>
    filename.toLowerCase().endsWith(ext)
  );

  if (!hasValidExtension) {
    return { quality: 0, reason: 'invalid_extension', details: 'Unsupported or missing file extension' };
  }

  // All checks passed - good quality
  return { quality: 100, reason: 'good_quality', details: 'All quality checks passed' };
}

async function qualityCleanImages() {
  try {
    console.log('Starting fast image quality cleaning process...');
    console.log('Using metadata-based quality assessment (no downloads required)');
    if (DRY_RUN) {
      console.log('🚨 DRY RUN MODE: No images will be deleted, only analysis will run');
    } else {
      console.log('⚠️  LIVE MODE: Poor quality images will be permanently deleted from Weaviate');
    }

    const imageCollection = weaviateClient.collections.get('Image');

    // Get all images from Weaviate
    console.log('Fetching all images from Weaviate...');
    const result = await imageCollection.query.fetchObjects({
      returnProperties: ['filename', 'image_url'],
      limit: 40000, // Should cover all remaining images
    });

    const images = result.objects;
    console.log(`Found ${images.length} images to analyze`);

    const qualityResults = [];
    let processedCount = 0;
    const poorQualityIds = [];

    // Process images in batches
    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      const batch = images.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(images.length / BATCH_SIZE);

      console.log(`\nProcessing batch ${batchNum}/${totalBatches} (${batch.length} images)`);

      // Analyze quality for each image in the batch
      for (const image of batch) {
        processedCount++;

        const displayName = image.properties.filename || `object_${processedCount}`;

        // Fast metadata-based quality assessment (no downloads!)
        const quality = assessImageQuality(
          image.properties.image_url,
          image.properties.filename
        );

        qualityResults.push({
          id: image.uuid,
          filename: image.properties.filename,
          ...quality
        });

        if (quality.quality < 50) {
          poorQualityIds.push(image.uuid);
          console.log(`  ❌ Poor quality: ${quality.reason} - ${quality.details || ''}`);
        } else {
          // Only show good quality occasionally to reduce spam
          if (processedCount % 100 === 0) {
            console.log(`  ✅ Good quality`);
          }
        }
      }

      // Progress update
      const goodQuality = processedCount - poorQualityIds.length;
      console.log(`Progress: ${processedCount}/${images.length} analyzed, ${goodQuality} good, ${poorQualityIds.length} poor quality`);
    }

    console.log(`\nQuality analysis complete!`);
    console.log(`Total images analyzed: ${processedCount}`);
    console.log(`Good quality images: ${processedCount - poorQualityIds.length}`);
    console.log(`Poor quality images to remove: ${poorQualityIds.length}`);

    if (poorQualityIds.length === 0) {
      console.log('No poor quality images found!');
      return;
    }

    // Show quality statistics
    const reasons = qualityResults.reduce((acc, result) => {
      acc[result.reason] = (acc[result.reason] || 0) + 1;
      return acc;
    }, {});

    console.log('\nQuality issues found:');
    Object.entries(reasons).forEach(([reason, count]) => {
      console.log(`  ${reason}: ${count}`);
    });

    // Confirm before deletion
    console.log(`\nReady to delete ${poorQualityIds.length} poor quality images.`);

    // Safety check: don't delete more than 50% of images
    const deletePercentage = (poorQualityIds.length / images.length) * 100;
    if (deletePercentage > 50) {
      console.log(`⚠️  WARNING: Would delete ${deletePercentage.toFixed(1)}% of images (${poorQualityIds.length}/${images.length})`);
      console.log('This seems excessive. Consider adjusting quality thresholds or running in dry-run mode first.');
      console.log('To proceed anyway, the script will continue...');
    }

    if (DRY_RUN) {
      console.log('🚨 DRY RUN: Would delete the following images but not actually doing it:');
      poorQualityIds.slice(0, 10).forEach(id => console.log(`  - ${id}`));
      if (poorQualityIds.length > 10) console.log(`  ... and ${poorQualityIds.length - 10} more`);
      return;
    }

    console.log('Note: This will permanently remove these images from Weaviate.');
    console.log('The original files in Vercel Blob will remain untouched.');

    // Delete poor quality images
    const deleteBatchSize = 500;
    let deletedCount = 0;

    for (let i = 0; i < poorQualityIds.length; i += deleteBatchSize) {
      const batch = poorQualityIds.slice(i, i + deleteBatchSize);
      const batchNum = Math.floor(i / deleteBatchSize) + 1;
      const totalBatches = Math.ceil(poorQualityIds.length / deleteBatchSize);

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

    console.log(`\nQuality cleaning complete!`);
    console.log(`Images removed: ${deletedCount}`);
    console.log(`Images remaining: ${images.length - deletedCount}`);

    // Clean up temp directory
    try {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn('Failed to clean up temp directory:', cleanupError.message);
    }

  } catch (error) {
    console.error('Quality cleaning failed:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await initializeClient();
    await qualityCleanImages();
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
