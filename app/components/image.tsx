"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { Mesh, TextureLoader, Texture } from "three";
import { geometry } from "maath";
import {
  SpringOptions,
  useMotionValue,
  useSpring,
  animate,
} from "motion/react";
import { useFrame } from "@react-three/fiber";
import data from "../assets/data.json";
import { IMAGE_SIZE } from "./flat";

// Global texture cache to avoid reloading the same images
const textureCache = new Map<string, Texture>();
const textureLoader = new TextureLoader();
const HOVER_OFFSET = 0;
const POSITION_ANIMATION_DURATION = 0.3;

export function Image({
  position,
  doTransition,
}: {
  position: [number, number, number];
  doTransition: boolean;
}) {
  const meshRef = useRef<Mesh>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Motion values for smooth z-offset animation
  const zOffsetMotionValue = useMotionValue(0);
  const zOffsetSpring = useSpring(zOffsetMotionValue, {
    stiffness: 700,
    damping: 20,
    mass: 0.8,
  });

  // Motion values for smooth scale animation
  const scaleMotionValue = useMotionValue(1);
  const scaleSpring = useSpring(scaleMotionValue, {
    stiffness: 700,
    damping: 20,
    mass: 0.8,
  });

  // Motion values for smooth position animation with bezier easing
  const xPositionMotionValue = useMotionValue(position[0]);
  const yPositionMotionValue = useMotionValue(position[1]);
  const zPositionMotionValue = useMotionValue(position[2]);

  // Update motion values when hover state changes
  useEffect(() => {
    zOffsetMotionValue.set(isHovered ? HOVER_OFFSET : 0);
    scaleMotionValue.set(isHovered ? 1.1 : 1);
  }, [isHovered, zOffsetMotionValue, scaleMotionValue]);

  // Handle doTransition animation to (0, 0, 0)
  useEffect(() => {
    if (doTransition) {
      animate(xPositionMotionValue, 0, {
        duration: POSITION_ANIMATION_DURATION,
        ease: [0.25, 0.1, 0.25, 1],
      });
      animate(yPositionMotionValue, 0, {
        duration: POSITION_ANIMATION_DURATION,
        ease: [0.25, 0.1, 0.25, 1],
      });
      animate(zPositionMotionValue, 0, {
        duration: POSITION_ANIMATION_DURATION,
        ease: [0.25, 0.1, 0.25, 1],
      });
      // scale to 0.1
      scaleMotionValue.set(0.1);
    } else {
      animate(xPositionMotionValue, position[0], {
        duration: POSITION_ANIMATION_DURATION,
        ease: [0.25, 0.1, 0.25, 1],
      });
      animate(yPositionMotionValue, position[1], {
        duration: POSITION_ANIMATION_DURATION,
        ease: [0.25, 0.1, 0.25, 1],
      });
      animate(zPositionMotionValue, position[2], {
        duration: POSITION_ANIMATION_DURATION,
        ease: [0.25, 0.1, 0.25, 1],
      });
      scaleMotionValue.set(1);
    }
  }, [
    doTransition,
    position,
    xPositionMotionValue,
    yPositionMotionValue,
    zPositionMotionValue,
  ]);

  // Update mesh position and scale based on motion values
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.x = xPositionMotionValue.get();
      meshRef.current.position.y = yPositionMotionValue.get();
      meshRef.current.position.z =
        zPositionMotionValue.get() + zOffsetSpring.get();
      const scale = scaleSpring.get();
      meshRef.current.scale.setScalar(scale);
    }
  });

  // Generate deterministic random image based on position
  const getImageForPosition = (x: number, y: number): string => {
    // Use position as seed for deterministic randomness
    const seed =
      Math.floor(x / IMAGE_SIZE) * 10000 + Math.floor(y / IMAGE_SIZE);

    // Simple hash function to get a pseudo-random number from seed
    let hash = seed;
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = (hash >> 16) ^ hash;

    // Use hash to select image from data
    const imageIndex = Math.abs(hash) % data.items.length;
    return data.items[imageIndex].imageUrl;
  };

  // Get image URL based on position
  const imageUrl = useMemo(() => {
    return getImageForPosition(position[0], position[1]);
  }, [position]);

  // Memoize texture with cache to avoid reloading the same images
  const texture = useMemo(() => {
    // Check if texture is already cached
    if (textureCache.has(imageUrl)) {
      return textureCache.get(imageUrl)!;
    }

    // Load new texture and cache it
    const newTexture = textureLoader.load(imageUrl);
    textureCache.set(imageUrl, newTexture);
    return newTexture;
  }, [imageUrl]);

  // Create rounded plane geometry
  const roundedGeometry = useMemo(() => {
    const radius = doTransition ? IMAGE_SIZE / 2 : 10;
    return new geometry.RoundedPlaneGeometry(IMAGE_SIZE, IMAGE_SIZE, radius, 5);
  }, [doTransition]);

  return (
    <mesh
      ref={meshRef}
      position={position}
      geometry={roundedGeometry}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      <meshBasicMaterial
        map={texture}
        transparent={true}
        opacity={1}
        depthTest={!isHovered}
      />
    </mesh>
  );
}
