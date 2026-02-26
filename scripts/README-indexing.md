# Image Indexing Script

This script indexes images from your local `data` folder into Vercel Blob storage, generates CLIP embeddings using your local embedding API, and stores them in Turbopuffer for vector search.

## Prerequisites

1. **Environment Variables**: Set these in your `.env.local` file:
   ```bash
   BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
   TURBOPUFFER_API_KEY=your_turbopuffer_api_key
   TURBOPUFFER_REGION=gcp-us-central1   # optional
   ```

2. **Dependencies**: Install required packages:
   ```bash
   pnpm i
   ```

3. **Local API Running**: Your Next.js app must be running locally for the embedding API to work:
   ```bash
   pnpm dev
   ```

4. **Images in Data Folder**: Place images in the `data` folder (supports `.jpg`, `.jpeg`, `.png`, `.webp`)

## Usage

```bash
# Run the indexing script
pnpm run index

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

### 4. **Turbopuffer Indexing**
- Writes to the `Image` namespace in Turbopuffer
- Stores metadata (image_id, image_url, width, height) and vectors
- Uses cosine distance for similarity search

## Configuration

### Environment Variables
- `BLOB_READ_WRITE_TOKEN`: Your Vercel Blob read/write token
- `TURBOPUFFER_API_KEY`: Your Turbopuffer API key (create at https://turbopuffer.com/dashboard)
- `TURBOPUFFER_REGION`: Optional region (e.g. `gcp-us-central1`), see https://turbopuffer.com/docs/regions

### Script Configuration
```javascript
const DATA_DIR = join(process.cwd(), 'data');
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const BATCH_SIZE = 50;
```

## Turbopuffer Schema

The script writes documents with this shape:

- **id**: UUID string
- **vector**: 512-dimensional CLIP embedding
- **image_id**: Original filename
- **image_url**: Public Blob URL
- **width**, **height**: Image dimensions (int)

Distance metric: `cosine_distance`.

## Error Handling

The script handles various error scenarios:
- Missing environment variables
- Turbopuffer connection issues
- Blob upload failures
- Embedding API errors
- Image metadata extraction failures

## Troubleshooting

1. **"Missing environment variable"**
   - Ensure all required env vars are set in `.env.local`

2. **"Embedding API returned 500"**
   - Make sure your Next.js app is running (`pnpm dev`)
   - Check that the embedding API is accessible at `http://localhost:3000/api/embed`

3. **"Turbopuffer connection failed"**
   - Verify your API key and region at https://turbopuffer.com/dashboard

4. **"No image files found"**
   - Ensure images are in the `data` folder
   - Check file extensions (only .jpg, .jpeg, .png, .webp supported)
