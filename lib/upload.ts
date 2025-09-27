
export type UploadResult = {
  url: string;
  pathname: string;
};

import { put } from '@vercel/blob';
import weaviate from 'weaviate-client';

async function getWeaviateClient() {
  const weaviateUrl = process.env.WEAVIATE_HTTP?.replace('https://', '').replace('http://', '');
  
  if (!weaviateUrl || !process.env.WEAVIATE_API_KEY) {
    throw new Error('Missing WEAVIATE_HTTP or WEAVIATE_API_KEY environment variables');
  }

  return await weaviate.connectToWeaviateCloud(
    weaviateUrl,
    {
      authCredentials: new weaviate.ApiKey(process.env.WEAVIATE_API_KEY),
    }
  );
}

async function getImageEmbedding(imageUrl: string): Promise<number[]> {
  const baseUrl = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:3001' 
    : (process.env.NEXTAUTH_URL || 'https://mirror-azure.vercel.app');
  
  const response = await fetch(`${baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get embedding: ${response.statusText}`);
  }

  const result = await response.json();
  return result.image_embedding;
}

export async function uploadImage(
  input: File | Blob | ArrayBuffer | Buffer | Uint8Array,
  opts: { filename?: string; contentType?: string } = {}
): Promise<UploadResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required');
  }

  const filename = opts.filename || ((input as File)?.name ?? `image-${Date.now()}`);
  const id = filename.replace(/\.[^/.]+$/, ''); // Remove extension for ID

  // Upload to Vercel Blob
  const blob = await put(filename, input, {
    access: 'public',
    addRandomSuffix: true,
  });

  // Get embedding
  const vector = await getImageEmbedding(blob.url);

  // Get image metadata
  let width = 0, height = 0;
  if (input instanceof File || input instanceof Blob) {
    try {
      const img = new Image();
      const url = URL.createObjectURL(input instanceof File ? input : input);
      await new Promise((resolve, reject) => {
        img.onload = () => {
          width = img.naturalWidth;
          height = img.naturalHeight;
          URL.revokeObjectURL(url);
          resolve(void 0);
        };
        img.onerror = reject;
        img.src = url;
      });
    } catch {
      // Fallback if image loading fails
    }
  }

  // Store in Weaviate
  const client = await getWeaviateClient();
  const imageCollection = client.collections.get('Image');
  
  await imageCollection.data.insert({
    properties: {
      image_id: id,
      image_url: blob.url,
      width,
      height,
    },
    vectors: vector,
  });

  return { url: blob.url, pathname: blob.pathname };
}


