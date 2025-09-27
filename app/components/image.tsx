"use client";

import { worldPositionToGridPosition } from "@/lib/position";
import { usePositionCache } from "@/lib/store";
import { useTexture } from "@react-three/drei";
import { geometry } from "maath";
import { useMemo } from "react";
import { IMAGE_SIZE } from "./flat";
import { Texture } from "three";

export function Image({
  position,
  doTransition,
}: {
  position: [number, number, number];
  doTransition: boolean;
}) {
  const gridPos = useMemo(() => {
    return worldPositionToGridPosition(position[0], position[1]);
  }, [position]);

  const data = usePositionCache((state) => state.getPositionData(gridPos));

  // Create rounded plane geometry
  const roundedGeometry = useMemo(() => {
    const radius = doTransition ? IMAGE_SIZE / 2 : 6;
    return new geometry.RoundedPlaneGeometry(IMAGE_SIZE, IMAGE_SIZE, radius, 5);
  }, [doTransition]);

  if (!data?.texture) {
    return (
      <mesh position={position} geometry={roundedGeometry}>
        <meshBasicMaterial color="#888888" transparent={true} opacity={0.1} />
      </mesh>
    );
  }
  return (
    <ImageMesh
      position={position}
      roundedGeometry={roundedGeometry}
      texture={data.texture}
    />
  );
}

function ImageMesh({
  position,
  roundedGeometry,
  texture,
}: {
  position: [number, number, number];
  roundedGeometry: geometry.RoundedPlaneGeometry;
  texture: Texture;
}) {
  return (
    <mesh position={position} geometry={roundedGeometry}>
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}
