import { create } from "zustand";
import { gridPositionToWorldPosition } from "./position";
import { Texture, TextureLoader } from "three";

const textureLoader = new TextureLoader();
const LIMIT = 100;

export type SearchResult = {
  id: string;
  image_id: string;
  image_url: string;
  width: number;
  height: number;
  score: number;
} & {
  texture?: Texture;
};

type Position2D = {
  x: number;
  y: number;
};

type PositionCacheState = {
  positionCache: Map<string, SearchResult>;
  idToPositionMap: Map<string, Position2D>;
  cameraPosition: Position2D;
  setPositionData: (position: Position2D, data: SearchResult) => void;
  getPositionData: (position: Position2D) => SearchResult | undefined;
  getPositionFromId: (id: string) => Position2D | undefined;
  clearCache: () => void;
  setCameraPosition: (position: Position2D) => void;
  getNClosestEmptyPositionsAt: (
    position: Position2D,
    n: number
  ) => Position2D[];
  getNearestAvailablePosition: (
    position: Position2D
  ) => SearchResult | undefined;
  getResultForPosition: ({
    position,
    text,
  }: {
    position?: Position2D;
    text?: string;
  }) => Promise<Position2D | undefined>;
};

const positionToKey = (position: Position2D): string => {
  return `${position.x},${position.y}`;
};

export const usePositionCache = create<PositionCacheState>((set, get) => ({
  positionCache: new Map<string, SearchResult>(),
  idToPositionMap: new Map<string, Position2D>(),
  cameraPosition: { x: 0, y: 0 },
  setCameraPosition: (position: Position2D) => {
    set({ cameraPosition: position });
  },

  getCameraPosition: () => {
    return get().cameraPosition;
  },

  setPositionData: (position: Position2D, data: SearchResult) => {
    const key = positionToKey(position);
    set((state) => {
      const newCache = new Map(state.positionCache);
      const newIdMap = new Map(state.idToPositionMap);
      newCache.set(key, data);
      newIdMap.set(data.id, position);
      return { positionCache: newCache, idToPositionMap: newIdMap };
    });
  },

  getPositionData: (position: Position2D) => {
    const key = positionToKey(position);
    return get().positionCache.get(key);
  },

  getPositionFromId: (id: string) => {
    return get().idToPositionMap.get(id);
  },

  clearCache: () => {
    set({
      positionCache: new Map<string, SearchResult>(),
      idToPositionMap: new Map<string, Position2D>(),
    });
  },
  getNClosestEmptyPositionsAt: (position: Position2D, n: number) => {
    if (n === 0) {
      return [];
    }
    const cache = get().positionCache;
    const emptyPositions: Position2D[] = [];

    // Search in expanding circles around the given position
    let radius = 0;

    while (emptyPositions.length < n && radius < 100) {
      // Limit search radius to prevent infinite loops
      // Check positions in a square pattern around the center
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          // Only check positions on the edge of the current radius
          if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
            const checkPosition = roundPosition({
              x: position.x + dx,
              y: position.y + dy,
            });
            const key = positionToKey(checkPosition);

            if (!cache.has(key)) {
              emptyPositions.push(checkPosition);

              if (emptyPositions.length >= n) {
                return emptyPositions;
              }
            }
          }
        }
      }
      radius++;
    }

    return emptyPositions;
  },
  getNearestAvailablePosition: (position: Position2D) => {
    const cache = get().positionCache;
    let radius = 0;
    const maxRadius = 100; // Limit search radius to prevent infinite loops

    while (radius < maxRadius) {
      // Check positions in a square pattern around the center
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          // Only check positions on the edge of the current radius (or center for radius 0)
          if (
            radius === 0 ||
            Math.abs(dx) === radius ||
            Math.abs(dy) === radius
          ) {
            const checkPosition = roundPosition({
              x: position.x + dx,
              y: position.y + dy,
            });
            const key = positionToKey(checkPosition);

            if (cache.has(key)) {
              return cache.get(key)!;
            }
          }
        }
      }
      radius++;
    }

    // If no available position found within the search radius, return the original position
    return undefined;
  },
  getResultForPosition: async ({
    position,
    text,
  }: {
    position?: Position2D;
    text?: string;
  }) => {
    const state = get();
    if (!position) {
      position = { ...state.cameraPosition };
      // Generate random direction in one of 8 directions (N, NE, E, SE, S, SW, W, NW)
      const directions = [
        [0, 1], // N
        [1, 1], // NE
        [1, 0], // E
        [1, -1], // SE
        [0, -1], // S
        [-1, -1], // SW
        [-1, 0], // W
        [-1, 1], // NW
      ];
      const direction = directions[Math.floor(Math.random() * 8)];
      const distance = Math.random() * 10 + 10; // Random distance between 10 and 20
      position = roundPosition({
        x: position.x + direction[0] * distance,
        y: position.y + direction[1] * distance,
      });
    }
    const existingData = state.getPositionData(position);
    const nearestData = state.getNearestAvailablePosition(position);

    // If no data found, fetch from API
    try {
      // Use existing image URL if position has data, otherwise use random string
      let response;
      if (existingData) {
        response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_url: existingData.image_url,
            top_k: LIMIT,
          }),
        });
      } else if (text) {
        response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: text, top_k: 50 }),
        });
      } else if (nearestData) {
        response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_url: nearestData.image_url,
            top_k: LIMIT,
          }),
        });
      } else {
        response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: Math.random().toString(36).substring(2, 15),
            top_k: LIMIT,
          }),
        });
      }
      if (!response) {
        alert("No response from API");
        return undefined;
      }

      const data = (await response.json()) as {
        results: {
          id: string;
          image_id: string;
          image_url: string;
          width: number;
          height: number;
          score: number;
        }[];
        count: number;
        query_vector_used: boolean;
        query_image_url_used: boolean;
        query_text_used: boolean;
      };

      // Store results in nearby empty positions
      const emptyPositions = state.getNClosestEmptyPositionsAt(
        position,
        data.results.length
      );
      console.log("emptyPositions", emptyPositions);

      for (let i = 0; i < emptyPositions.length; i++) {
        const emptyPosition = emptyPositions[i];
        const resultWithTexture = {
          ...data.results[i],
          texture: await textureLoader.loadAsync(data.results[i].image_url),
        };
        state.setPositionData(emptyPosition, resultWithTexture);
      }

      // Return the data for the requested position if available
      return gridPositionToWorldPosition(position.x, position.y);
    } catch (error) {
      console.error("Failed to fetch search results:", error);
      return undefined;
    }
  },
}));

function roundPosition(position: Position2D) {
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
  };
}
