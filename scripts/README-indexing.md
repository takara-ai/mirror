# Image Indexing Script

This script indexes images from your local `data` folder into Vercel Blob storage, generates CLIP embeddings using your local embedding API, and stores them in Weaviate for vector search.

## Prerequisites

1. **Environment Variables**: Set these in your `.env` file:
   ```bash
   BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
   WEAVIATE_HTTP=https://your-project.weaviate.cloud
   WEAVIATE_API_KEY=your_weaviate_api_key
   ```

2. **Dependencies**: Install required packages:
   ```bash
   npm install
   ```

3. **Local API Running**: Your Next.js app must be running locally for the embedding API to work:
   ```bash
   npm run dev
   ```

4. **Images in Data Folder**: Place images in the `data` folder (supports `.jpg`, `.jpeg`, `.png`, `.webp`)

## Usage

```bash
# Run the indexing script
npm run index-images

# Or run directly
node scripts/index-images.js
```

## What It Does

### 1. **Image Discovery**
- Recursively scans the `data` folder for image files
- Supports JPEG, PNG, and WebP formats
- Extracts image metadata (width, height, format)

### 2. **Vercel Blob Storage**
- Uploads each image to Vercel Blob with `addRandomSuffix: true`
- Generates unguessable, unique URLs for security
- Uses public access for easy retrieval

### 3. **Embedding Generation**
- Calls your local `/api/embed` endpoint for each image
- Generates 512-dimensional CLIP vectors
- Handles errors gracefully if embedding fails

### 4. **Weaviate Indexing**
- Creates the `Image` class in Weaviate if it doesn't exist
- Stores metadata (ID, URL, width, height) and vectors
- Uses HNSW index with cosine distance for efficient similarity search

## Configuration

### Environment Variables
- `BLOB_READ_WRITE_TOKEN`: Your Vercel Blob read/write token
- `WEAVIATE_HTTP`: Your Weaviate cloud instance URL (e.g., `https://your-project.weaviate.cloud`)
- `WEAVIATE_API_KEY`: Your Weaviate API key

### Script Configuration
```javascript
const DATA_DIR = join(process.cwd(), 'data');        // Directory to scan
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']; // File types
const BATCH_SIZE = 10;                             // Process in batches
```

## Output

The script provides detailed progress information:
```
🚀 Starting image indexing process...
✅ Weaviate client initialized
✅ Image class already exists in Weaviate
🔍 Scanning for images in /path/to/project/data...
📸 Found 25 image(s) to process

📦 Processing batch 1/3
📏 Image photo-12345.jpg: 1920x1080 (jpeg)
📤 Uploading photo-12345.jpg to Vercel Blob...
✅ Uploaded: photo-12345-oYnXSVczoLa9yBYMFJOSNdaiiervF5.jpg
🧠 Getting embedding for https://1sxstfwepd7zn41q.public.blob.vercel-storage.com/photo-12345-oYnXSVczoLa9yBYMFJOSNdaiiervF5.jpg...
✅ Got embedding (512 dimensions)
💾 Storing in Weaviate: photo-12345...
✅ Stored in Weaviate: photo-12345

📊 Indexing complete!
✅ Successful: 24
❌ Failed: 1
📸 Total: 25
```

## Error Handling

The script handles various error scenarios:
- Missing environment variables
- Weaviate connection issues
- Blob upload failures
- Embedding API errors
- Image metadata extraction failures

Failed images are logged with specific error messages for debugging.

## Weaviate Schema

The script automatically creates this schema in Weaviate:

```json
{
  "class": "Image",
  "description": "Image class for vector search",
  "properties": [
    {
      "name": "id",
      "dataType": ["string"],
      "description": "Unique identifier for the image"
    },
    {
      "name": "image_url",
      "dataType": ["string"],
      "description": "Public URL to the image in Vercel Blob"
    },
    {
      "name": "width",
      "dataType": ["int"],
      "description": "Image width in pixels"
    },
    {
      "name": "height",
      "dataType": ["int"],
      "description": "Image height in pixels"
    }
  ],
  "vectorIndexType": "hnsw",
  "vectorIndexConfig": {
    "distance": "cosine"
  }
}
```

## Security Notes

- Images are uploaded with `addRandomSuffix: true` to prevent URL guessing
- Blob URLs are publicly accessible but unguessable
- Weaviate stores only metadata and vectors, not the actual images
- The embedding API endpoint should be secured in production

## Performance Considerations

- Processes images in batches to avoid overwhelming services
- Includes delays between batches to respect rate limits
- Uses Sharp for efficient image metadata extraction
- Handles large image sets gracefully

## Troubleshooting

### Common Issues

1. **"Missing environment variable"**
   - Ensure all required env vars are set in `.env`

2. **"Embedding API returned 500"**
   - Make sure your Next.js app is running (`npm run dev`)
   - Check that the embedding API is accessible at `http://localhost:3000/api/embed`

3. **"Weaviate connection failed"**
   - Verify your Weaviate instance URL and API key
   - Check network connectivity to your Weaviate cloud instance

4. **"No image files found"**
   - Ensure images are in the `data` folder
   - Check file extensions (only .jpg, .jpeg, .png, .webp supported)

### Debug Mode

For more verbose output, you can modify the script to enable debug logging by adding console logs in the functions.
