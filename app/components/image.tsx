"use client";

import { worldPositionToGridPosition } from "@/lib/position";
import { usePositionCache } from "@/lib/store";
import { geometry } from "maath";
import { useEffect, useMemo, useState } from "react";
import { Texture } from "three";
import { roundedGeometry } from "./flat";
import { useSpring } from "motion/react";

const Z_DISTANCE_HOVERED = 10;

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

const HOVER_DELAY = 1000;
function ImageMesh({
  position,
  roundedGeometry,
  texture,
}: {
  position: [number, number, number];
  roundedGeometry: geometry.RoundedPlaneGeometry;
  texture: Texture;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [hoverTimer, setHoverTimer] = useState<NodeJS.Timeout | null>(null);

  const zPosition = useSpring(position[2], {
    stiffness: 300,
    damping: 30,
    mass: 0.8,
  });

  // Update z position based on hover state
  useEffect(() => {
    zPosition.set(isHovered ? position[2] + Z_DISTANCE_HOVERED : position[2]);
  }, [isHovered, position, zPosition]);

  const handlePointerEnter = () => {
    setIsHovered(true);

    // Start the timer for selection after 2 seconds
    const timer = setTimeout(() => {
      const state = usePositionCache.getState();
      state.setSelectedItem(
        state.getPositionData(
          worldPositionToGridPosition(position[0], position[1])
        )
      );
    }, HOVER_DELAY);

    setHoverTimer(timer);
  };

  const handlePointerLeave = () => {
    setIsHovered(false);

    // Clear the timer if pointer leaves before 2 seconds
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      setHoverTimer(null);
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
      }
    };
  }, [hoverTimer]);

  return (
    <mesh
      position={[position[0], position[1], zPosition.get()]}
      geometry={roundedGeometry}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}
