"use client";

import { usePositionCache } from "@/lib/store";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { Group } from "three";
import { Image } from "./image";

// Grid configuration
export const IMAGE_SIZE = 40; // Size of each square image
const GAP = 2; // Gap between images
export const CELL_SIZE = IMAGE_SIZE + GAP; // Total space per cell (image + gap)
const VIEWPORT_MARGIN = 50; // Extra margin around viewport
const BORDER_PADDING = 10; // Extra images beyond viewport to prevent edge transitions
const VERTICAL_OFFSET = 0; // Vertical offset between columns

export function Flat({ doTransition }: { doTransition: boolean }) {
  const { camera } = useThree();
  const [initialized, setInitialized] = useState(false);
  const [gridPositions, setGridPositions] = useState<
    Array<{
      position: [number, number, number];
      id: string;
    }>
  >([]);
  // Calculate grid positions based on camera position
  const calculateGridPositions = (cameraPos: { x: number; y: number }) => {
    // Calculate 16:9 viewport dimensions
    const aspectRatio = 16 / 9;
    const viewportHeight = VIEWPORT_MARGIN * 2;
    const viewportWidth = viewportHeight * aspectRatio;

    // Get top-left position of viewport
    const topLeftX = cameraPos.x - viewportWidth / 2;
    const topLeftY = cameraPos.y + viewportHeight / 2;

    // Snap to grid using modulo (using CELL_SIZE for proper spacing)
    const gridStartX = Math.floor(topLeftX / CELL_SIZE) * CELL_SIZE;
    const gridStartY = Math.floor(topLeftY / CELL_SIZE) * CELL_SIZE;

    // Calculate how many grid cells we need to cover the viewport
    const gridCellsX =
      Math.ceil(viewportWidth / CELL_SIZE) + 1 + BORDER_PADDING * 2;
    const gridCellsY =
      Math.ceil(viewportHeight / CELL_SIZE) + 1 + BORDER_PADDING * 2;

    const positions: Array<{
      position: [number, number, number];
      id: string;
    }> = [];

    // Generate grid positions with border padding
    for (let x = -BORDER_PADDING; x < gridCellsX - BORDER_PADDING; x++) {
      for (let y = -BORDER_PADDING; y < gridCellsY - BORDER_PADDING; y++) {
        const gridX = gridStartX + x * CELL_SIZE;
        const gridY = gridStartY - y * CELL_SIZE; // Negative Y for top-to-bottom

        // Add vertical offset based on world column index
        const actualColumnIndex = Math.floor(gridX / CELL_SIZE);
        const verticalOffset = actualColumnIndex * VERTICAL_OFFSET;
        const offsetY = gridY + verticalOffset;

        // Generate unique ID based on grid position
        const id = `${gridX},${offsetY}`;

        positions.push({
          position: [gridX, offsetY, 0],
          id,
        });
      }
    }

    return positions;
  };

  // Update grid positions on camera movement
  useFrame(() => {
    if (!camera) return;

    const cameraPosition = camera.position;
    const newPositions = calculateGridPositions({
      x: cameraPosition.x,
      y: cameraPosition.y,
    });

    setGridPositions(newPositions);
  });

  useEffect(() => {
    if (initialized) return;
    usePositionCache
      .getState()
      .getResultForPosition({ position: { x: 0, y: 0 } });
    setInitialized(true);
  }, []);

  return (
    <group>
      {gridPositions.map((gridPos) => (
        <Image
          key={gridPos.id}
          position={gridPos.position}
          doTransition={doTransition}
        />
      ))}
    </group>
  );
}
