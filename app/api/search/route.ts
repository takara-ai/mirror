// app/api/search/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { Turbopuffer } from "@turbopuffer/turbopuffer";

let tpufClient: Turbopuffer | null = null;

const PRODUCTION_APP_URL = "https://mirror-azure.vercel.app";

// Use embed API over HTTP so the search serverless function never loads transformers (no libonnxruntime in this bundle)
function getEmbedBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_APP_URL;
  }
  return "http://localhost:3000";
}

function buildEmbedHeaders(incomingReq: Request): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const cookie = incomingReq.headers.get("cookie");
  if (cookie) {
    headers["cookie"] = cookie;
  }
  const auth = incomingReq.headers.get("authorization");
  if (auth) {
    headers["authorization"] = auth;
  }
  return headers;
}

async function getImageEmbedding(
  imageUrl: string,
  incomingReq: Request
): Promise<number[]> {
  const res = await fetch(`${getEmbedBaseUrl()}/api/embed`, {
    method: "POST",
    headers: buildEmbedHeaders(incomingReq),
    body: JSON.stringify({ image_url: imageUrl }),
  });
  if (!res.ok) {
    throw new Error(`Embed failed: ${res.statusText}`);
  }
  const data = (await res.json()) as { image_embedding?: number[] };
  if (!data.image_embedding) {
    throw new Error("No image_embedding in response");
  }
  return data.image_embedding;
}

async function getTextEmbedding(
  text: string,
  incomingReq: Request
): Promise<number[]> {
  const res = await fetch(`${getEmbedBaseUrl()}/api/embed`, {
    method: "POST",
    headers: buildEmbedHeaders(incomingReq),
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`Embed failed: ${res.statusText}`);
  }
  const data = (await res.json()) as { text_embedding?: number[] };
  if (!data.text_embedding) {
    throw new Error("No text_embedding in response");
  }
  return data.text_embedding;
}

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
        searchVector = await getImageEmbedding(image_url, req);
      } catch (err) {
        console.error("[search] getImageEmbedding failed:", err);
        return new Response(
          JSON.stringify({
            error: "Failed to process image URL for embedding.",
            ...(process.env.NODE_ENV === "development" && {
              detail: err instanceof Error ? err.message : String(err),
            }),
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
    }

    if (text && !vector && !image_url) {
      try {
        searchVector = await getTextEmbedding(text, req);
      } catch (err) {
        console.error("[search] getTextEmbedding failed:", err);
        return new Response(
          JSON.stringify({
            error: "Failed to process text for embedding.",
            ...(process.env.NODE_ENV === "development" && {
              detail: err instanceof Error ? err.message : String(err),
            }),
          }),
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
