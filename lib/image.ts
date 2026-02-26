export async function convertFileToBase64(
  file: File
): Promise<{ base64: string; mimeType: string }> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const base64 = buffer.toString("base64");
  const mimeType = file.type || "image/jpeg";

  return { base64, mimeType };
}
