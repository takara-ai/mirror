// Embed lib: CLIP text/image embeddings (in-process). Used by route and by search/upload/scripts.
// Same approach as main: @xenova/transformers with onnxruntime-node externalized in next.config.

process.env.TRANSFORMERS_CACHE =
  process.env.TRANSFORMERS_CACHE || process.env.HF_HOME || "/tmp/transformers";

let transformersPromise: Promise<{
  AutoProcessor: { from_pretrained: (model: string) => Promise<unknown> };
  AutoTokenizer: { from_pretrained: (model: string) => Promise<unknown> };
  CLIPVisionModelWithProjection: {
    from_pretrained: (model: string) => Promise<unknown>;
  };
  CLIPTextModelWithProjection: {
    from_pretrained: (model: string) => Promise<unknown>;
  };
  RawImage: { read: (url: string) => Promise<unknown> };
}> | null = null;

async function getTransformers() {
  if (!transformersPromise) {
    transformersPromise = import("@xenova/transformers");
  }
  return transformersPromise;
}

let processorPromise: Promise<unknown> | null = null;
let visionModelPromise: Promise<unknown> | null = null;
let tokenizerPromise: Promise<unknown> | null = null;
let textModelPromise: Promise<unknown> | null = null;

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
  const inputs = (tok as (text: string[], opts: object) => unknown)([text], {
    padding: true,
    truncation: true,
  });
  const { text_embeds } = await (
    textModel as (inputs: unknown) => Promise<{
      text_embeds: { data: Float32Array };
    }>
  )(inputs);
  return Array.from(text_embeds.data);
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

  let image: unknown;
  if (opts?.base64) {
    image = await RawImage.read(`data:image/jpeg;base64,${opts.base64}`);
  } else {
    image = await RawImage.read(imageUrl);
  }
  const image_inputs = await (proc as (image: unknown) => Promise<unknown>)(
    image
  );
  const { image_embeds } = await (
    visionModel as (inputs: unknown) => Promise<{
      image_embeds: { data: Float32Array };
    }>
  )(image_inputs);
  return Array.from(image_embeds.data);
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
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({
        error:
          err instanceof Error
            ? err.message
            : "Failed to produce CLIP embeddings",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
