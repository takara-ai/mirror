// app/api/search/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Weaviate client setup
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let weaviateClientPromise: Promise<any> | null = null;

async function getWeaviateClient() {
  if (!weaviateClientPromise) {
    const weaviateModule = await import('weaviate-client');
    const weaviate = weaviateModule.default;
    const { ApiKey } = weaviateModule;

    // Connect to Weaviate Cloud
    const weaviateUrl = process.env.WEAVIATE_HTTP?.replace('https://', '').replace('http://', '');
    
    if (!weaviateUrl || !process.env.WEAVIATE_API_KEY) {
      throw new Error('Missing WEAVIATE_HTTP or WEAVIATE_API_KEY environment variables');
    }

    weaviateClientPromise = weaviate.connectToWeaviateCloud(
      weaviateUrl,
      {
        authCredentials: new ApiKey(process.env.WEAVIATE_API_KEY),
      }
    );
  }
  return weaviateClientPromise;
}

// Get embedding for image URL using the existing embedding endpoint
async function getImageEmbedding(imageUrl: string): Promise<number[]> {
  const embedResponse = await fetch(`${process.env.NEXTAUTH_URL || 'https://mirror-azure.vercel.app'}/api/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image_url: imageUrl }),
  });

  if (!embedResponse.ok) {
    throw new Error(`Failed to get image embedding: ${embedResponse.statusText}`);
  }

  const embedResult = await embedResponse.json();
  return embedResult.image_embedding;
}

// Get embedding for text using the existing embedding endpoint
async function getTextEmbedding(text: string): Promise<number[]> {
  const embedResponse = await fetch(`${process.env.NEXTAUTH_URL || 'https://mirror-azure.vercel.app'}/api/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: text }),
  });

  if (!embedResponse.ok) {
    throw new Error(`Failed to get text embedding: ${embedResponse.statusText}`);
  }

  const embedResult = await embedResponse.json();
  return embedResult.text_embedding;
}

type SearchBody = {
  vector?: number[];        // Direct vector for search
  image_url?: string;       // Image URL to get embedding and search
  text?: string;           // Text query to get embedding and search
  top_k?: number;          // Number of results to return (default: 50)
  threshold?: number;      // Minimum similarity threshold (optional)
};

type SearchResult = {
  id: string;
  image_id: string;
  image_url: string;
  width: number;
  height: number;
  score: number;
};

export async function POST(req: Request) {
  try {
    const { vector, image_url, text, top_k = 50, threshold } = (await req.json()) as SearchBody;

    // Validate input
    if (!vector && !image_url && !text) {
      return new Response(
        JSON.stringify({ error: 'Provide either vector, image_url, or text for search.' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    let searchVector = vector;

    // If image_url provided, get its embedding
    if (image_url && !vector) {
      try {
        searchVector = await getImageEmbedding(image_url);
      } catch {
        return new Response(
          JSON.stringify({ error: 'Failed to process image URL for embedding.' }),
          { status: 400, headers: { 'content-type': 'application/json' } }
        );
      }
    }

    // If text provided, get its embedding
    if (text && !vector && !image_url) {
      try {
        searchVector = await getTextEmbedding(text);
      } catch {
        return new Response(
          JSON.stringify({ error: 'Failed to process text for embedding.' }),
          { status: 400, headers: { 'content-type': 'application/json' } }
        );
      }
    }

    if (!searchVector) {
      return new Response(
        JSON.stringify({ error: 'No valid vector available for search.' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    // Initialize Weaviate client
    const client = await getWeaviateClient();

    // Get the Image collection
    const imageCollection = client.collections.get('Image');

    // Perform vector search using the v4 API
    const searchOptions: Record<string, unknown> = {
      limit: top_k,
      returnMetadata: ['distance'],
    };

    // Add distance threshold if provided
    if (threshold !== undefined) {
      searchOptions.where = {
        path: ['_additional', 'distance'],
        operator: 'LessThan',
        valueNumber: 1 - threshold, // Convert similarity threshold to distance
      };
    }

    const response = await imageCollection.query.nearVector(
      searchVector,
      searchOptions
    );

    // Parse and format results
    const results: SearchResult[] = [];

    if (response.objects) {
      for (const item of response.objects) {
        const distance = item.metadata?.distance || 0;
        results.push({
          id: item.uuid,
          image_id: item.properties.image_id,
          image_url: item.properties.image_url,
          width: item.properties.width,
          height: item.properties.height,
          score: 1 - distance, // Convert distance to similarity score
        });
      }
    }

    return new Response(JSON.stringify({
      results,
      count: results.length,
      query_vector_used: !!vector,
      query_image_url_used: !!image_url,
      query_text_used: !!text,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  } catch (err: unknown) {
    console.error('Search error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error)?.message ?? 'Failed to perform vector search' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}

// Optional: GET endpoint for health check
export async function GET() {
  try {
    const client = await getWeaviateClient();

    // Simple connectivity check - try to get the Image collection
    const imageCollection = client.collections.get('Image');
    await imageCollection.query.fetchObjects({ limit: 1 });

    return new Response(JSON.stringify({
      status: 'ok',
      weaviate_connected: true,
      message: 'Vector search API is ready'
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({
      status: 'error',
      weaviate_connected: false,
      error: (err as Error)?.message ?? 'Weaviate connection failed'
    }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
