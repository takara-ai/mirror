import { Texture } from "three";
import * as THREE from "three";

/**
 * Configures a texture to maintain its aspect ratio (similar to CSS object-cover)
 * to fill the entire geometry while preventing stretching.
 *
 * This function ensures that:
 * - The texture maintains its original aspect ratio
 * - The texture completely fills the geometry bounds (no empty space)
 * - Parts of the texture may be cropped if aspect ratios don't match
 * - The texture is centered on the geometry
 *
 * @param texture - The Three.js texture to configure
 * @param geometryWidth - Width of the target geometry
 * @param geometryHeight - Height of the target geometry
 */
function configureTextureAspectRatio(
  texture: Texture,
  geometryWidth: number,
  geometryHeight: number
): void {
  // Validate inputs
  if (!texture.image) {
    console.warn("Texture image not loaded yet, cannot configure aspect ratio");
    return;
  }

  if (geometryWidth <= 0 || geometryHeight <= 0) {
    console.warn("Invalid geometry dimensions provided");
    return;
  }

  // Set texture to clamp mode for object-cover behavior
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  // Get aspect ratios
  const textureAspect = texture.image.width / texture.image.height;
  const geometryAspect = geometryWidth / geometryHeight;

  // Calculate repeat values for object-cover behavior
  let repeatX = 1;
  let repeatY = 1;

  if (geometryAspect > textureAspect) {
    // Geometry is wider than texture, scale up vertical repeat to fill
    repeatY = textureAspect / geometryAspect;
  } else {
    // Geometry is taller than texture, scale up horizontal repeat to fill
    repeatX = geometryAspect / textureAspect;
  }

  // Apply repeat values
  texture.repeat.set(repeatX, repeatY);

  // Center the texture by adjusting offset
  texture.offset.set((1 - repeatX) / 2, (1 - repeatY) / 2);

  // Mark texture for update
  texture.needsUpdate = true;
}

/**
 * Configures a texture to maintain its aspect ratio (similar to CSS object-contain)
 * to fit within the geometry bounds without cropping.
 *
 * This function ensures that:
 * - The texture maintains its original aspect ratio
 * - The entire texture is visible within the geometry bounds
 * - Empty space may be visible if aspect ratios don't match
 * - The texture is centered on the geometry
 *
 * @param texture - The Three.js texture to configure
 * @param geometryWidth - Width of the target geometry
 * @param geometryHeight - Height of the target geometry
 */
function configureTextureContain(
  texture: Texture,
  geometryWidth: number,
  geometryHeight: number
): void {
  // Validate inputs
  if (!texture.image) {
    console.warn("Texture image not loaded yet, cannot configure aspect ratio");
    return;
  }

  if (geometryWidth <= 0 || geometryHeight <= 0) {
    console.warn("Invalid geometry dimensions provided");
    return;
  }

  // Set texture to repeat mode for object-contain behavior
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  // Get aspect ratios
  const textureAspect = texture.image.width / texture.image.height;
  const geometryAspect = geometryWidth / geometryHeight;

  // Calculate repeat values for object-contain behavior
  let repeatX = 1;
  let repeatY = 1;

  if (geometryAspect > textureAspect) {
    // Geometry is wider than texture, scale down horizontal repeat
    repeatX = geometryAspect / textureAspect;
  } else {
    // Geometry is taller than texture, scale down vertical repeat
    repeatY = textureAspect / geometryAspect;
  }

  // Apply repeat values
  texture.repeat.set(repeatX, repeatY);

  // Center the texture by adjusting offset
  texture.offset.set((1 - repeatX) / 2, (1 - repeatY) / 2);

  // Mark texture for update
  texture.needsUpdate = true;
}

/**
 * Loads a texture using TextureLoader and applies object-cover aspect ratio correction
 * to fill the entire geometry while preventing stretching.
 *
 * @param textureLoader - The Three.js TextureLoader instance
 * @param imageUrl - URL of the image to load as texture
 * @param geometryWidth - Width of the target geometry
 * @param geometryHeight - Height of the target geometry
 * @returns Promise that resolves to the configured texture with object-cover behavior
 */
export function loadTextureWithAspectRatio(
  textureLoader: THREE.TextureLoader,
  imageUrl: string,
  geometryWidth: number,
  geometryHeight: number
): Promise<Texture> {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      imageUrl,
      (texture) => {
        // Configure texture to prevent stretching
        configureTextureAspectRatio(texture, geometryWidth, geometryHeight);
        resolve(texture);
      },
      undefined, // onProgress callback
      (error) => {
        console.error(`Failed to load texture from ${imageUrl}:`, error);
        reject(error);
      }
    );
  });
}
