// api/embed.ts
export const runtime = "nodejs"; // use Node.js, not Edge
export const dynamic = "force-dynamic"; // ensure server execution

// Writable cache dir for serverless (Vercel: only /tmp is writable)
const CACHE_DIR =
  process.env.TRANSFORMERS_CACHE || process.env.HF_HOME || "/tmp/transformers";

// Lazy import and initialization to handle ESM compatibility
let transformersPromise: Promise<any> | null = null;

async function getTransformers() {
  if (!transformersPromise) {
    transformersPromise = import("@xenova/transformers").then((mod) => {
      // @xenova/transformers defaults cacheDir to node_modules/.../\.cache (read-only on Vercel)
      if (mod.env) {
        mod.env.cacheDir = CACHE_DIR;
      }
      return mod;
    });
  }
  return transformersPromise;
}

// Lazy, shared loads (module-scope, reused across invocations)
let processorPromise: Promise<any> | null = null;
let visionModelPromise: Promise<any> | null = null;
let tokenizerPromise: Promise<any> | null = null;
let textModelPromise: Promise<any> | null = null;

async function initializeModels() {
  const {
    AutoProcessor,
    AutoTokenizer,
    CLIPVisionModelWithProjection,
    CLIPTextModelWithProjection,
  } = await getTransformers();

  if (!processorPromise) {
    processorPromise = AutoProcessor.from_pretrained(
      "Xenova/clip-vit-base-patch16"
    );
  }
  if (!visionModelPromise) {
    visionModelPromise = CLIPVisionModelWithProjection.from_pretrained(
      "Xenova/clip-vit-base-patch16"
    );
  }
  if (!tokenizerPromise) {
    tokenizerPromise = AutoTokenizer.from_pretrained(
      "Xenova/clip-vit-base-patch16"
    );
  }
  if (!textModelPromise) {
    textModelPromise = CLIPTextModelWithProjection.from_pretrained(
      "Xenova/clip-vit-base-patch16"
    );
  }

  return {
    processorPromise,
    visionModelPromise,
    tokenizerPromise,
    textModelPromise,
  };
}

/** Get text embedding vector (in-process, no network). */
export async function embedText(text: string): Promise<number[]> {
  const { tokenizerPromise, textModelPromise } = await initializeModels();
  const [tok, textModel] = await Promise.all([
    tokenizerPromise,
    textModelPromise,
  ]);
  const inputs = tok([text], { padding: true, truncation: true });
  const { text_embeds } = await textModel(inputs);
  return Array.from(text_embeds.data as Float32Array);
}

/** Get image embedding vector from URL or base64 (in-process, no network). */
export async function embedImage(
  imageUrl: string,
  opts?: { base64?: string }
): Promise<number[]> {
  const { RawImage } = await getTransformers();
  const { processorPromise, visionModelPromise } = await initializeModels();
  const [proc, visionModel] = await Promise.all([
    processorPromise,
    visionModelPromise,
  ]);

  let image: any;
  if (opts?.base64) {
    image = await RawImage.read(`data:image/jpeg;base64,${opts.base64}`);
  } else {
    image = await RawImage.read(imageUrl);
  }
  const image_inputs = await proc(image);
  const { image_embeds } = await visionModel(image_inputs);
  return Array.from(image_embeds.data as Float32Array);
}

type Body = {
  text?: string;
  image_url?: string;
  image_base64?: string;
};

export async function POST(req: Request) {
  try {
    const { text, image_url, image_base64 } = (await req.json()) as Body;

    const out: { text_embedding?: number[]; image_embedding?: number[] } = {};

    if (typeof text === "string") {
      out.text_embedding = await embedText(text);
    }
    if (image_url || image_base64) {
      out.image_embedding = await embedImage(image_url ?? "", {
        base64: image_base64,
      });
    }

    if (!(out.text_embedding || out.image_embedding)) {
      return new Response(
        JSON.stringify({ error: "Provide text, image_url, or image_base64." }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: err?.message ?? "Failed to produce CLIP embeddings",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
