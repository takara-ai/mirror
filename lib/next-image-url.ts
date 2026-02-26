/**
 * Builds the Next.js Image Optimization API URL for an external image.
 * Use this when loading images via fetch/texture so the server can resize and
 * serve WebP/AVIF, reducing bandwidth and decode cost.
 */
export function getOptimizedImageUrl(
  imageUrl: string,
  width: number,
  quality = 75
): string {
  const params = new URLSearchParams({
    url: imageUrl,
    w: String(width),
    q: String(quality),
  });
  return `/_next/image?${params.toString()}`;
}
