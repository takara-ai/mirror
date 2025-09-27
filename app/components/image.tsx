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
import { CELL_SIZE, IMAGE_SIZE } from "./flat";
import { SearchResult } from "../page";
import { TextGeometry } from "three/examples/jsm/Addons";
import { Text3D } from "@react-three/drei";
import { worldPositionToGridPosition } from "@/lib/position";
import { usePositionCache } from "@/lib/store";
import { useMutation } from "@tanstack/react-query";

// Global texture cache to avoid reloading the same images
const textureCache = new Map<string, Texture>();
const textureLoader = new TextureLoader();
const HOVER_OFFSET = 100;

export function Image({
  position,
  doTransition,
}: {
  position: [number, number, number];
  doTransition: boolean;
}) {
  const meshRef = useRef<Mesh>(null);
  const [isHovered, setIsHovered] = useState(false);

  const gridPos = useMemo(() => {
    return worldPositionToGridPosition(position[0], position[1]);
  }, [position]);

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

  // Update motion values when hover state changes
  useEffect(() => {
    zOffsetMotionValue.set(isHovered ? HOVER_OFFSET : 0);
    scaleMotionValue.set(isHovered ? 1.1 : 1);
  }, [isHovered, zOffsetMotionValue, scaleMotionValue]);

  // Handle doTransition animation to (0, 0, 0)
  useEffect(() => {
    if (doTransition) {
      // scale to 0.1
      scaleMotionValue.set(0);
    } else {
      scaleMotionValue.set(1);
    }
  }, [doTransition, position]);

  // Update mesh position and scale based on motion values
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.x = position[0];
      meshRef.current.position.y = position[1];
      meshRef.current.position.z = position[2] + zOffsetSpring.get();
      const scale = scaleSpring.get();
      meshRef.current.scale.setScalar(scale);
    }
  });
  const data = usePositionCache((state) => state.getPositionData(gridPos));

  // Memoize texture with cache to avoid reloading the same images
  const texture = useMemo(() => {
    // Check if texture is already cached
    if (!data) {
      return null;
    }
    if (textureCache.has(data.image_url)) {
      return textureCache.get(data.image_url)!;
    }

    const newTexture = textureLoader.load(data.image_url);
    textureCache.set(data.image_url, newTexture);
    return newTexture;
  }, [data]);

  // Create rounded plane geometry
  const roundedGeometry = useMemo(() => {
    const radius = doTransition ? IMAGE_SIZE / 2 : 10;
    return new geometry.RoundedPlaneGeometry(IMAGE_SIZE, IMAGE_SIZE, radius, 5);
  }, [doTransition]);

  if (!texture) {
    return (
      <mesh
        ref={meshRef}
        position={position}
        geometry={roundedGeometry}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
      >
        <meshBasicMaterial
          color="#888888"
          transparent={true}
          opacity={0.1}
          depthTest={!isHovered}
        />
      </mesh>
    );
  }

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
