import { type NextRequest, NextResponse } from "next/server";
import { convertFileToBase64 } from "@/lib/image";
import { generateImageDescription } from "@/lib/openai";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No image file provided" },
        { status: 400 }
      );
    }

    const { base64, mimeType } = await convertFileToBase64(file);
    const caption = await generateImageDescription(base64, mimeType);

    return NextResponse.json({ caption });
  } catch (error) {
    console.error("Error generating caption:", error);
    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    );
  }
}
