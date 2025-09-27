// api/embed.ts
export const runtime = 'nodejs';          // use Node.js, not Edge
export const dynamic = 'force-dynamic';   // ensure server execution

import { NextRequest } from 'next/server';
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPVisionModelWithProjection,
  CLIPTextModelWithProjection,
  RawImage,
} from '@xenova/transformers';

// Force use of image-js instead of sharp for pure JS image processing
// Note: With Sharp removed via pnpm override, image-js will be used automatically

// Optional: cache models in /tmp to reduce cold starts on Vercel
process.env.TRANSFORMERS_CACHE = process.env.TRANSFORMERS_CACHE || '/tmp/transformers';

// Lazy, shared loads (module-scope, reused across invocations)
const processorPromise = AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch16');
const visionModelPromise = CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch16');
const tokenizerPromise = AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch16');
const textModelPromise = CLIPTextModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch16');

type Body = {
  text?: string;
  image_url?: string;      // preferred: public URL
  image_base64?: string;   // alternative: base64 without data URL prefix
};

export async function POST(req: NextRequest) {
  try {
    const { text, image_url, image_base64 } = (await req.json()) as Body;

    const out: { text_embedding?: number[]; image_embedding?: number[] } = {};

    // Text embedding (optional)
    if (typeof text === 'string') {
      const [tok, textModel] = await Promise.all([tokenizerPromise, textModelPromise]);
      const inputs = tok([text], { padding: true, truncation: true });
      const { text_embeds } = await textModel(inputs);
      out.text_embedding = Array.from(text_embeds.data as Float32Array);
    }

    // Image embedding (optional)
    if (image_url || image_base64) {
      const [proc, visionModel] = await Promise.all([processorPromise, visionModelPromise]);

      let image: any;
      if (image_url) {
        // RawImage.read can accept a URL and will use image-js backend
        image = await RawImage.read(image_url);
      } else if (image_base64) {
        // Create data URL from base64 for RawImage.read
        const dataUrl = `data:image/jpeg;base64,${image_base64}`;
        image = await RawImage.read(dataUrl);
      }

      const image_inputs = await proc(image);
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
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Failed to produce CLIP embeddings' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
