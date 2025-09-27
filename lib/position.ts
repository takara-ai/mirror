import { CELL_SIZE } from "@/app/components/flat";

export function worldPositionToGridPosition(x: number, y: number) {
  const gridX = Math.floor(x / CELL_SIZE);
  const gridY = Math.floor(y / CELL_SIZE);
  return { x: gridX, y: gridY };
}

export function gridPositionToWorldPosition(x: number, y: number) {
  return { x: x * CELL_SIZE, y: y * CELL_SIZE };
}
