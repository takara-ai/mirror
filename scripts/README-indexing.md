# Image Indexing Script

This script indexes images from your local `data` folder into Vercel Blob storage, generates CLIP embeddings using the in-process embed lib, and stores them in Turbopuffer for vector search.

## Prerequisites

1. **Environment Variables**: Set these in your `.env.local` file:
   ```bash
   BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
   TURBOPUFFER_API_KEY=your_turbopuffer_api_key
   TURBOPUFFER_REGION=gcp-us-central1   # optional
   ```

2. **Dependencies**: Install required packages:
   ```bash
   bun install
   ```

3. **Images in Data Folder**: Place images in the `data` folder (supports `.jpg`, `.jpeg`, `.png`, `.webp`)

## Usage

```bash
# Run the indexing script
bun run index

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
- Uses the embed lib in-process (no network; run with `bun` from repo root)
- Generates 512-dimensional CLIP vectors
- Handles errors gracefully if embedding fails

### 4. **Turbopuffer Indexing**
- Uses the `Image` namespace in Turbopuffer
- Stores metadata (id, image_id, image_url, width, height, filename) and vectors
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

## Output

The script provides detailed progress information. On success you will see counts of successful and failed images.

## Error Handling

The script handles various error scenarios:
- Missing environment variables
- Turbopuffer connection issues
- Blob upload failures
- Embedding API errors
- Image metadata extraction failures

Failed images are logged with specific error messages for debugging.

## Turbopuffer Schema

The script writes documents to the `Image` namespace with:
- `id`: document ID (UUID)
- `vector`: CLIP embedding
- `image_id`: original filename (e.g. `photo.jpg`)
- `image_url`, `width`, `height`: metadata
- `distance_metric`: cosine_distance

## Security Notes

- Images are uploaded with `addRandomSuffix: true` to prevent URL guessing
- Blob URLs are publicly accessible but unguessable
- Turbopuffer stores only metadata and vectors, not the actual images
- The embedding API endpoint should be secured in production

## Troubleshooting

1. **"Missing environment variable"**
   - Ensure all required env vars are set in `.env.local`

2. **Embedding errors**
   - Run with `bun` from the repo root so the embed lib resolves (`app/api/embed/embed.ts`)
   - Ensure dependencies are installed (`bun install`)

3. **"Turbopuffer connection failed"**
   - Verify your API key and region at https://turbopuffer.com/dashboard

4. **"No image files found"**
   - Ensure images are in the `data` folder
   - Check file extensions (only .jpg, .jpeg, .png, .webp supported)
