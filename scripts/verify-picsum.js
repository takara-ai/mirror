#!/usr/bin/env node

/**
 * Verify Picsum returns different images for different seeds.
 * Usage: node scripts/verify-picsum.js [count]
 * Default: fetch seeds 1..5 and check all have unique content hashes.
 */

import { createHash } from "crypto";

const W = 640;
const H = 480;

async function fetchImageBytes(seed) {
  const url = `https://picsum.photos/seed/${seed}/${W}/${H}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const count = Math.min(parseInt(process.argv[2], 10) || 5, 10_000);
  const hashes = new Map();

  console.log(`Fetching seeds 1..${count}...`);
  for (let seed = 1; seed <= count; seed++) {
    const buf = await fetchImageBytes(seed);
    const hash = createHash("sha256").update(buf).digest("hex");
    hashes.set(seed, hash);
    console.log(`  seed ${seed}: ${buf.length} bytes, sha256 ${hash.slice(0, 16)}...`);
  }

  const unique = new Set(hashes.values());
  if (unique.size === hashes.size) {
    console.log(`\nOK: ${hashes.size} unique images (all hashes different).`);
  } else {
    console.log(`\nDuplicate content: ${hashes.size} seeds but only ${unique.size} unique hashes.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
