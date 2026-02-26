export type UploadResult = {
  url: string;
  pathname: string;
};

import { Turbopuffer } from "@turbopuffer/turbopuffer";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { embedImage } from "@/app/api/embed/embed";

function getTurbopufferClient() {
  if (!process.env.TURBOPUFFER_API_KEY) {
    throw new Error("Missing TURBOPUFFER_API_KEY environment variable");
  }
  return new Turbopuffer({
    apiKey: process.env.TURBOPUFFER_API_KEY,
    region:
      (process.env.TURBOPUFFER_REGION as "gcp-us-central1") ||
      "gcp-us-central1",
  });
}

const IMAGE_SCHEMA = {
  image_id: { type: "string" as const },
  image_url: { type: "string" as const },
  width: { type: "int" as const },
  height: { type: "int" as const },
};

export async function uploadImage(
  input: File | Blob,
  opts: { filename?: string; contentType?: string } = {}
): Promise<UploadResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required");
  }

  const filename =
    opts.filename || ((input as File)?.name ?? `image-${Date.now()}`);

  // Upload to Vercel Blob
  const blob = await put(filename, input, {
    access: "public",
    addRandomSuffix: true,
  });

  // Get embedding (in-process, no network)
  const vector = await embedImage(blob.url);

  // Get image metadata
  let width = 0,
    height = 0;
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

  const tpuf = getTurbopufferClient();
  const ns = tpuf.namespace("Image");

  const id = randomUUID();
  await ns.write({
    upsert_rows: [
      {
        id,
        vector,
        image_id: filename,
        image_url: blob.url,
        width,
        height,
      },
    ],
    distance_metric: "cosine_distance",
    schema: IMAGE_SCHEMA,
  });

  return { url: blob.url, pathname: blob.pathname };
}
