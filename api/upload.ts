export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { uploadImage } from "../lib/upload.js";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("image");

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "No image file provided" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const result = await uploadImage(file, {
      filename: file.name,
      contentType: file.type,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: (err as Error)?.message ?? "Upload failed" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
