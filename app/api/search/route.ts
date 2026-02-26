// app/api/search/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { Turbopuffer } from "@turbopuffer/turbopuffer";
import { POST as embedPost } from "@/api/embed";

let tpufClient: Turbopuffer | null = null;

function getTurbopufferClient(): Turbopuffer {
  if (!tpufClient) {
    if (!process.env.TURBOPUFFER_API_KEY) {
      throw new Error("Missing TURBOPUFFER_API_KEY environment variable");
    }
    tpufClient = new Turbopuffer({
      apiKey: process.env.TURBOPUFFER_API_KEY,
      region:
        (process.env.TURBOPUFFER_REGION as "gcp-us-central1") ||
        "gcp-us-central1",
    });
  }
  return tpufClient;
}

// Call embed handler in-process to avoid internal fetch (Vercel can return wrong handler for same-host /api/embed)
async function getImageEmbedding(imageUrl: string): Promise<number[]> {
  const req = new Request("http://localhost/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl }),
  });
  const res = await embedPost(req);
  if (!res.ok) {
    throw new Error(`Failed to get image embedding: ${res.statusText}`);
  }
  const data = (await res.json()) as { image_embedding?: number[] };
  if (!data.image_embedding) {
    throw new Error("No image_embedding in response");
  }
  return data.image_embedding;
}

async function getTextEmbedding(text: string): Promise<number[]> {
  const req = new Request("http://localhost/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const res = await embedPost(req);
  if (!res.ok) {
    throw new Error(`Failed to get text embedding: ${res.statusText}`);
  }
  const data = (await res.json()) as { text_embedding?: number[] };
  if (!data.text_embedding) {
    throw new Error("No text_embedding in response");
  }
  return data.text_embedding;
}

type SearchBody = {
  vector?: number[];
  image_url?: string;
  text?: string;
  top_k?: number;
  threshold?: number;
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
    const {
      vector,
      image_url,
      text,
      top_k = 50,
      threshold,
    } = (await req.json()) as SearchBody;

    if (!(vector || image_url || text)) {
      return new Response(
        JSON.stringify({
          error: "Provide either vector, image_url, or text for search.",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    let searchVector = vector;

    if (image_url && !vector) {
      try {
        searchVector = await getImageEmbedding(image_url);
      } catch {
        return new Response(
          JSON.stringify({
            error: "Failed to process image URL for embedding.",
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
    }

    if (text && !vector && !image_url) {
      try {
        searchVector = await getTextEmbedding(text);
      } catch {
        return new Response(
          JSON.stringify({ error: "Failed to process text for embedding." }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
    }

    if (!searchVector) {
      return new Response(
        JSON.stringify({ error: "No valid vector available for search." }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const tpuf = getTurbopufferClient();
    const ns = tpuf.namespace("Image");

    const result = await ns.query({
      rank_by: ["vector", "ANN", searchVector],
      top_k: Math.min(top_k, 10_000),
      include_attributes: ["image_id", "image_url", "width", "height"],
    });

    let rows = (result.rows ?? []) as Array<{
      id: string;
      $dist?: number;
      image_id?: string;
      image_url?: string;
      width?: number;
      height?: number;
    }>;

    if (threshold !== undefined) {
      const maxDist = 1 - threshold;
      rows = rows.filter((r) => (r.$dist ?? 0) <= maxDist);
    }

    const results: SearchResult[] = rows.map((r) => ({
      id: String(r.id),
      image_id: r.image_id ?? "",
      image_url: r.image_url ?? "",
      width: r.width ?? 0,
      height: r.height ?? 0,
      score: 1 - (r.$dist ?? 0),
    }));

    return new Response(
      JSON.stringify({
        results,
        count: results.length,
        query_vector_used: !!vector,
        query_image_url_used: !!image_url,
        query_text_used: !!text,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (err: unknown) {
    console.error("Search error:", err);
    return new Response(
      JSON.stringify({
        error: (err as Error)?.message ?? "Failed to perform vector search",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

export async function GET() {
  try {
    const tpuf = getTurbopufferClient();
    const ns = tpuf.namespace("Image");
    await ns.query({
      rank_by: ["id", "asc"],
      top_k: 1,
      include_attributes: [],
    });

    return new Response(
      JSON.stringify({
        status: "ok",
        vector_store_connected: true,
        message: "Vector search API is ready",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({
        status: "error",
        vector_store_connected: false,
        error: (err as Error)?.message ?? "Vector store connection failed",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}
