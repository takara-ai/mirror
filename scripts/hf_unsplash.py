import os
import sys
from datasets import load_dataset

# Configuration
START_INDEX = int(sys.argv[1]) if len(sys.argv) > 1 else 0
NUM_IMAGES = int(sys.argv[2]) if len(sys.argv) > 2 else 1000

# Load the Unsplash dataset
ds = load_dataset("wtcherr/unsplash_20k")

# Create data directory if it doesn't exist
data_dir = "data"
os.makedirs(data_dir, exist_ok=True)

# Get the training split
train_split = ds['train']

# Check if we have enough images
total_available = len(train_split)
end_index = min(START_INDEX + NUM_IMAGES, total_available)

if START_INDEX >= total_available:
    print(f"Error: Start index {START_INDEX} is beyond the dataset size ({total_available})")
    sys.exit(1)

print(f"Downloading {NUM_IMAGES} images starting from index {START_INDEX} (images {START_INDEX} to {end_index - 1})...")

# Download and save images starting from START_INDEX
downloaded = 0
for i in range(START_INDEX, end_index):
    sample = train_split[i]
    
    # Get the PIL image
    image = sample['image']
    
    # Create filename with zero-padded index (using original dataset index)
    filename = f"unsplash_{i:04d}.jpg"
    filepath = os.path.join(data_dir, filename)
    
    # Save the image
    image.save(filepath, 'JPEG')
    downloaded += 1
    
    # Print progress every 50 images
    if downloaded % 50 == 0:
        print(f"Saved {downloaded} images...")

print(f"Successfully saved {downloaded} images to the {data_dir} directory")
print(f"Images numbered from unsplash_{START_INDEX:04d}.jpg to unsplash_{end_index - 1:04d}.jpg")
