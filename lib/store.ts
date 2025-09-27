import { create } from "zustand";

export type SearchResult = {
  id: string;
  image_id: string;
  image_url: string;
  width: number;
  height: number;
  score: number;
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
  getResultForPosition: (
    position: Position2D
  ) => Promise<SearchResult | undefined>;
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
            const checkPosition = { x: position.x + dx, y: position.y + dy };
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
            const checkPosition = { x: position.x + dx, y: position.y + dy };
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
  getResultForPosition: async (position: Position2D) => {
    const state = get();
    const existingData = state.getPositionData(position);
    const nearestData = state.getNearestAvailablePosition(position);

    if (nearestData) {
      return nearestData;
    }

    // If no data found, fetch from API
    try {
      // Use existing image URL if position has data, otherwise use random string
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          existingData
            ? { image_url: existingData.image_url }
            : { text: Math.random().toString(36).substring(2, 15) }
        ),
      });

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

      for (let i = 0; i < emptyPositions.length; i++) {
        const emptyPosition = emptyPositions[i];
        state.setPositionData(emptyPosition, data.results[i]);
      }

      // Return the data for the requested position if available
      return state.getPositionData(position);
    } catch (error) {
      console.error("Failed to fetch search results:", error);
      return undefined;
    }
  },
}));
