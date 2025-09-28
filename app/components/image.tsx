"use client";

import { worldPositionToGridPosition } from "@/lib/position";
import { usePositionCache } from "@/lib/store";
import { geometry } from "maath";
import { useMemo } from "react";
import { Texture } from "three";
import { roundedGeometry } from "./flat";

export function Image({ position }: { position: [number, number, number] }) {
  const gridPos = useMemo(() => {
    return worldPositionToGridPosition(position[0], position[1]);
  }, [position]);

  const data = usePositionCache((state) => state.getPositionData(gridPos));

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
