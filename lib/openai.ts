import OpenAI from "openai";

const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
};

export async function generateImageCaption(
  base64Image: string,
  mimeType: string
): Promise<string> {
  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Your goal is to generate short, descriptive captions for images. Provided with an image provide a caption for the image that captures the most important information.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
  });

  const caption = response.choices[0]?.message?.content;

  if (!caption) {
    throw new Error("Failed to generate caption");
  }

  return caption;
}

export async function generateImageDescription(
  base64Image: string,
  mimeType: string
): Promise<string> {
  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "You create descriptions of images. Provided with an image describe the image. You can describe unambiguously the image",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
  });

  const caption = response.choices[0]?.message?.content;

  if (!caption) {
    throw new Error("Failed to generate caption");
  }

  return caption;
}
