#!/usr/bin/env python3
"""
Download 20k random images from the takara-ai/image_captions dataset.
Uses HF Datasets Server API for memory-efficient random sampling.
"""

import random
import requests
from pathlib import Path
from tqdm import tqdm
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

def get_dataset_info():
    """Get basic information about the dataset."""
    url = "https://datasets-server.huggingface.co/size?dataset=takara-ai/image_captions"
    response = requests.get(url)
    response.raise_for_status()
    data = response.json()
    return data['size']['dataset']['num_rows']

def fetch_rows_batch(offset, length=100):
    """Fetch a batch of rows from the dataset using the HF API."""
    url = f"https://datasets-server.huggingface.co/rows?dataset=takara-ai%2Fimage_captions&config=default&split=train&offset={offset}&length={length}"
    response = requests.get(url)
    response.raise_for_status()
    return response.json()

def download_image_from_url(image_url, save_path):
    """Download an image from a URL and save it to the specified path."""
    try:
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()

        # Save the image
        with open(save_path, 'wb') as f:
            f.write(response.content)
        return True
    except Exception as e:
        print(f"Error downloading image from {image_url}: {e}")
        return False

def download_random_images(num_images=20000, output_dir="takara_images_random_20k", seed=42, batch_size=100, max_workers=10):
    """
    Download random images from the takara-ai/image_captions dataset using HF Datasets Server API.

    Args:
        num_images: Number of images to download (default: 20,000)
        output_dir: Directory to save images (default: "takara_images_random_20k")
        seed: Random seed for reproducibility (default: 42)
        batch_size: Number of rows to fetch per API call (max 100, default: 100)
        max_workers: Maximum number of parallel download threads (default: 10)
    """

    # Set random seed for reproducibility
    random.seed(seed)

    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)

    print("Getting dataset information...")
    try:
        total_rows = get_dataset_info()
        print(f"Dataset has {total_rows:,} total rows")
    except Exception as e:
        print(f"Could not get dataset size: {e}")
        print("Proceeding with estimated size...")
        total_rows = 1074164  # From our earlier check

    print(f"Target: {num_images:,} random images")
    print(f"Using batch size: {batch_size} rows per API call")
    print(f"Using {max_workers} parallel download threads")

    # Generate random offsets
    # We need to generate enough random offsets to get our target number of images
    # Since each batch gives us up to batch_size images, we need roughly num_images/batch_size batches
    # But we'll generate more to account for potential failures
    num_batches_needed = int(num_images / batch_size) + 10  # +10 for safety margin
    random_offsets = []
    for _ in range(num_batches_needed):
        offset = random.randint(0, total_rows - batch_size)
        random_offsets.append(offset)

    print(f"Will fetch approximately {len(random_offsets)} batches from random offsets")

    # First, collect all image URLs from the batches
    image_urls = []
    processed_batches = 0

    print("Collecting image URLs from random batches...")
    for offset in tqdm(random_offsets, desc="Fetching batches"):
        if len(image_urls) >= num_images:
            break

        try:
            # Fetch batch of rows
            batch_data = fetch_rows_batch(offset, batch_size)
            processed_batches += 1

            # Extract image URLs from this batch
            for row in batch_data['rows']:
                if len(image_urls) >= num_images:
                    break

                try:
                    image_info = row['row']['image']
                    if 'src' in image_info:
                        image_urls.append(image_info['src'])
                except Exception:
                    continue

        except Exception as e:
            print(f"Error fetching batch at offset {offset}: {e}")
            continue

        # Small delay to be respectful to the API
        time.sleep(0.05)

    # Trim to exact number needed
    image_urls = image_urls[:num_images]
    print(f"Collected {len(image_urls)} image URLs")

    # Now download images in parallel
    downloaded_count = 0
    failed_count = 0

    def download_single_image(args):
        """Download a single image - returns (success, index)"""
        image_url, index = args
        image_filename = f"image_{index:05d}.jpg"
        image_path = output_path / image_filename

        success = download_image_from_url(image_url, image_path)
        return success, index

    print("Downloading images in parallel...")

    # Prepare arguments for parallel execution
    download_tasks = [(url, i) for i, url in enumerate(image_urls)]

    # Use ThreadPoolExecutor for parallel downloads
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all download tasks
        future_to_task = {executor.submit(download_single_image, task): task for task in download_tasks}

        # Process completed downloads with progress bar
        with tqdm(total=len(image_urls), desc="Downloading images") as pbar:
            for future in as_completed(future_to_task):
                success, index = future.result()
                if success:
                    downloaded_count += 1
                else:
                    failed_count += 1
                pbar.update(1)

                # Add small delay between downloads to be respectful
                time.sleep(0.01)

    print("\nDownload complete!")
    print(f"Successfully downloaded: {downloaded_count:,} images")
    print(f"Failed: {failed_count:,} images")
    print(f"Batches processed: {processed_batches}")
    print(f"Images saved to: {output_path.absolute()}")

    return downloaded_count, failed_count

if __name__ == "__main__":
    # Run the full download
    downloaded, failed = download_random_images(
        num_images=20000,
        output_dir="takara_images_random_20k",
        seed=42,
        batch_size=100,
        max_workers=20  # High parallelization for speed
    )

    print(f"\nSummary: Downloaded {downloaded:,} images, {failed:,} failed.")
