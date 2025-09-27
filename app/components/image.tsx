"use client";

import { worldPositionToGridPosition } from "@/lib/position";
import { usePositionCache } from "@/lib/store";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { geometry } from "maath";
import { useMotionValue, useSpring } from "motion/react";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Mesh } from "three";
import { IMAGE_SIZE } from "./flat";

const HOVER_OFFSET = 0;

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

  // Create rounded plane geometry
  const roundedGeometry = useMemo(() => {
    const radius = doTransition ? IMAGE_SIZE / 2 : 10;
    return new geometry.RoundedPlaneGeometry(IMAGE_SIZE, IMAGE_SIZE, radius, 5);
  }, [doTransition]);

  if (!data?.image_url) {
    return (
      <mesh
        ref={meshRef}
        position={position}
        geometry={roundedGeometry}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
      >
        <meshBasicMaterial color="#888888" transparent={true} opacity={0.1} />
      </mesh>
    );
  }
  return (
    <ImageMesh
      ref={meshRef}
      position={position}
      roundedGeometry={roundedGeometry}
      url={data?.image_url}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    />
  );
}

const ImageMesh = forwardRef<
  Mesh,
  {
    position: [number, number, number];
    roundedGeometry: geometry.RoundedPlaneGeometry;
    url?: string;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
  }
>(({ position, roundedGeometry, url, onPointerEnter, onPointerLeave }, ref) => {
  const texture = url ? useTexture(url) : null;

  return (
    <mesh
      ref={ref}
      position={position}
      geometry={roundedGeometry}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <meshBasicMaterial map={texture} />
    </mesh>
  );
});
