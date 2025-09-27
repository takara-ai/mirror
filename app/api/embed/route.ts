// app/api/embed/route.ts
export const runtime = 'nodejs';          // use Node.js, not Edge
export const dynamic = 'force-dynamic';   // ensure server execution

// Optional: cache models in /tmp to reduce cold starts on Vercel
process.env.TRANSFORMERS_CACHE = process.env.TRANSFORMERS_CACHE || '/tmp/transformers';

// Singleton pattern for model caching as recommended by Hugging Face
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedProcessor: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedVisionModel: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedTokenizer: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedTextModel: any = null;

async function getModels() {
  const { AutoProcessor, AutoTokenizer, CLIPVisionModelWithProjection, CLIPTextModelWithProjection } = await import('@xenova/transformers');
  
  if (!cachedProcessor) {
    cachedProcessor = await AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch16');
  }
  if (!cachedVisionModel) {
    cachedVisionModel = await CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch16');
  }
  if (!cachedTokenizer) {
    cachedTokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch16');
  }
  if (!cachedTextModel) {
    cachedTextModel = await CLIPTextModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch16');
  }
  
  return { processor: cachedProcessor, visionModel: cachedVisionModel, tokenizer: cachedTokenizer, textModel: cachedTextModel };
}

type Body = {
  text?: string;
  image_url?: string;      // preferred: public URL
  image_base64?: string;   // alternative: base64 without data URL prefix
};

export async function POST(req: Request) {
  try {
    const { text, image_url, image_base64 } = (await req.json()) as Body;

    const out: { text_embedding?: number[]; image_embedding?: number[] } = {};

    // Get cached models using singleton pattern
    const { processor, visionModel, tokenizer, textModel } = await getModels();

    // Text embedding (optional)
    if (typeof text === 'string') {
      const inputs = tokenizer([text], { padding: true, truncation: true });
      const { text_embeds } = await textModel(inputs);
      out.text_embedding = Array.from(text_embeds.data as Float32Array);
    }

    // Image embedding (optional)
    if (image_url || image_base64) {
      const { RawImage } = await import('@xenova/transformers');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let image: any;
      if (image_url) {
        // RawImage.read can accept a URL and will use image-js backend
        image = await RawImage.read(image_url);
      } else if (image_base64) {
        // Create data URL from base64 for RawImage.read
        const dataUrl = `data:image/jpeg;base64,${image_base64}`;
        image = await RawImage.read(dataUrl);
      }

      const image_inputs = await processor(image);
      const { image_embeds } = await visionModel(image_inputs);
      out.image_embedding = Array.from(image_embeds.data as Float32Array);
    }

    if (!out.text_embedding && !out.image_embedding) {
      return new Response(
        JSON.stringify({ error: 'Provide text, image_url, or image_base64.' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: (err as Error)?.message ?? 'Failed to produce CLIP embeddings' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
