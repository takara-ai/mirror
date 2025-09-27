import { NextRequest, NextResponse } from 'next/server';
import { generateImageCaption } from '@/app/lib/services/openai';
import { convertFileToBase64 } from '@/app/lib/utils/image';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    const { base64, mimeType } = await convertFileToBase64(file);
    const caption = await generateImageCaption(base64, mimeType);

    return NextResponse.json({ caption });
  } catch (error) {
    console.error('Error generating caption:', error);
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 }
    );
  }
}