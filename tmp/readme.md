## Request Schema

**Method:** `POST`

**Content-Type:** `application/json`

**Body Structure:**
```typescript
{
  text?: string;           // Optional text input for text embeddings
  image_url?: string;      // Optional public URL to an image for image embeddings
  image_base64?: string;   // Optional base64 encoded image (without data URL prefix) for image embeddings
}
```

**Notes:**
- At least one of `text`, `image_url`, or `image_base64` must be provided
- If none are provided, the API returns a 400 error
- For `image_base64`, provide just the base64 string without the `data:image/jpeg;base64,` prefix

## Response Schema

**Success Response (200):**
```typescript
{
  text_embedding?: number[];    // Array of 512 float numbers (if text was provided)
  image_embedding?: number[];   // Array of 512 float numbers (if image was provided)
}
```

**Error Responses:**

**400 Bad Request:**
```typescript
{
  error: "Provide text, image_url, or image_base64."
}
```

**500 Internal Server Error:**
```typescript
{
  error: string  // Error message from the embedding process
}
```

## Example Usage

**Text embedding request:**
```json
{
  "text": "A beautiful sunset over the ocean"
}
```

**Image embedding request:**
```json
{
  "image_url": "https://example.com/image.jpg"
}
```

**Combined text and image:**
```json
{
  "text": "A cat sitting on a windowsill",
  "image_url": "https://example.com/cat.jpg"
}
```

The API uses the CLIP model (`Xenova/clip-vit-base-patch16`) to generate embeddings, which typically produce 512-dimensional vectors for both text and images.