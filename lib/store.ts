import { create } from "zustand";
import { gridPositionToWorldPosition } from "./position";
import { Texture, TextureLoader } from "three";
import { toast } from "sonner";

const textureLoader = new TextureLoader();
const LIMIT = 100;
const THRESHOLD = 0.2;

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
  isLoading: boolean;
  selectedItem: SearchResult | undefined;
  setSelectedItem: (item: SearchResult | undefined) => void;
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
    moveCamera?: (position: Position2D) => void;
  }) => Promise<void>;
};

const positionToKey = (position: Position2D): string => {
  return `${position.x},${position.y}`;
};

export const usePositionCache = create<PositionCacheState>((set, get) => ({
  positionCache: new Map<string, SearchResult>(),
  idToPositionMap: new Map<string, Position2D>(),
  cameraPosition: { x: 0, y: 0 },
  isLoading: false,
  selectedItem: undefined,
  setSelectedItem: (item: SearchResult | undefined) => {
    set({ selectedItem: item });
  },
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
    moveCamera,
  }: {
    position?: Position2D;
    text?: string;
    moveCamera?: (position: Position2D) => void;
  }) => {
    set({ isLoading: true });
    let doTresholdFiltering = true;
    const state = get();
    if (!position) {
      position = { ...state.cameraPosition };

      const cache = get().positionCache;
      const directions = [
        { x: 1, y: 0 }, // right
        { x: -1, y: 0 }, // left
        { x: 0, y: 1 }, // up
        { x: 0, y: -1 }, // down
        { x: 1, y: 1 }, // up-right
        { x: -1, y: 1 }, // up-left
        { x: 1, y: -1 }, // down-right
        { x: -1, y: -1 }, // down-left
      ];

      let foundPosition = false;
      let attempts = 0;
      const maxAttempts = 100;

      while (!foundPosition && attempts < maxAttempts) {
        // Pick a random direction
        const direction =
          directions[Math.floor(Math.random() * directions.length)];

        // Move 8 steps in that direction
        const testPosition = roundPosition({
          x: position.x + direction.x * 8,
          y: position.y + direction.y * 8,
        });

        const testKey = positionToKey(testPosition);

        // Check if position and its neighbors are empty
        let allEmpty = true;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const neighborPos = roundPosition({
              x: testPosition.x + dx,
              y: testPosition.y + dy,
            });
            const neighborKey = positionToKey(neighborPos);

            if (cache.has(neighborKey)) {
              allEmpty = false;
              break;
            }
          }
          if (!allEmpty) break;
        }

        if (allEmpty) {
          position = testPosition;
          foundPosition = true;
        }

        attempts++;
      }

      if (!foundPosition) {
        toast.error("No empty space found");
        set({ isLoading: false });
        return;
      }
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
            threshold: THRESHOLD,
          }),
        });
      } else if (text) {
        response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: text, top_k: 50, threshold: THRESHOLD }),
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
            threshold: THRESHOLD,
          }),
        });
      } else {
        const natureAdjectives = [
          "beautiful",
          "stunning",
          "majestic",
          "serene",
          "wild",
          "peaceful",
          "vibrant",
          "lush",
          "dramatic",
          "ethereal",
          "pristine",
          "grand",
        ];
        const randomAdjective =
          natureAdjectives[Math.floor(Math.random() * natureAdjectives.length)];

        response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: `${randomAdjective} nature`,
            top_k: LIMIT,
            threshold: THRESHOLD,
          }),
        });
        doTresholdFiltering = false;
      }
      if (!response) {
        alert("No response from API");
        return undefined;
      }

      const rawData = (await response.json()) as {
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
      const data = rawData.results.filter((result) =>
        doTresholdFiltering ? result.score > THRESHOLD : true
      );

      if (data.length === 0 && text) {
        toast.error(`No results found for "${text}"`);
        return;
      }

      const firstResult = data[0];
      if (state.idToPositionMap.has(firstResult.id)) {
        const position = state.idToPositionMap.get(firstResult.id)!;
        moveCamera?.(position);

        const emptyPositions = state.getNClosestEmptyPositionsAt(
          position,
          data.length - 1
        );
        await Promise.all(
          emptyPositions.map(async (emptyPosition, i) => {
            const resultWithTexture = {
              ...data[i + 1],
              texture: await textureLoader.loadAsync(data[i + 1].image_url),
            };
            state.setPositionData(emptyPosition, resultWithTexture);
          })
        );
      } else {
        // Store results in nearby empty positions
        const emptyPositions = state.getNClosestEmptyPositionsAt(
          position,
          data.length
        );

        if (emptyPositions.length > 0) {
          moveCamera?.(emptyPositions[0]);
        }
        await Promise.all(
          emptyPositions.map(async (emptyPosition, i) => {
            const resultWithTexture = {
              ...data[i],
              texture: await textureLoader.loadAsync(data[i].image_url),
            };
            state.setPositionData(emptyPosition, resultWithTexture);
          })
        );
      }
    } catch (error) {
      console.error("Failed to fetch search results:", error);
    } finally {
      set({ isLoading: false });
    }
  },
}));

function roundPosition(position: Position2D) {
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
  };
}
