# API Routes

## `/api/embed` (POST)

Generates CLIP embeddings for text and/or images.

**Request Body:**
```json
{
  "text": "string (optional)",
  "image_url": "string (optional)",
  "image_base64": "string (optional)"
}
```

**Response:**
```json
{
  "text_embedding": [number[]],
  "image_embedding": [number[]]
}
```

## `/api/caption` (POST)

Generates a caption for an uploaded image.

**Request:** FormData with `image` field containing File object.

**Response:**
```json
{
  "caption": "string"
}
```

## `/api/describe` (POST)

Generates a description for an uploaded image.

**Request:** FormData with `image` field containing File object.

**Response:**
```json
{
  "caption": "string"
}
```

## `/api/search` (POST)

Performs vector similarity search using Turbopuffer.

**Request Body:**
```json
{
  "vector": [number[]] (optional),
  "image_url": "string (optional)",
  "text": "string (optional)",
  "top_k": number (optional, default: 50),
  "threshold": number (optional)
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "string",
      "image_id": "string",
      "image_url": "string",
      "width": number,
      "height": number,
      "score": number
    }
  ],
  "count": number,
  "query_vector_used": boolean,
  "query_image_url_used": boolean,
  "query_text_used": boolean
}
```

## `/api/search` (GET)

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "vector_store_connected": boolean,
  "message": "string"
}
```
