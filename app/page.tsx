"use client";

import { usePositionCache } from "@/lib/store";
import { Environment, Fisheye } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMotionValue, useSpring } from "motion/react";
import { useEffect } from "react";
import { Flat } from "./components/flat";
import { FlatCameraControls } from "./components/flat-camera-controls";
import { Search } from "./components/search";
import { Perf } from "r3f-perf";
import { useSearchParams } from "next/navigation";

export type SearchResult = {
  id: string;
  image_id: string;
  image_url: string;
  width: number;
  height: number;
  score: number;
};

export default function Home() {
  // Camera motion values for smooth transitions
  const xMotionValue = useMotionValue(0);
  const yMotionValue = useMotionValue(0);

  const xSpring = useSpring(xMotionValue, {
    stiffness: 400,
    damping: 25,
    mass: 0.5,
  });

  const ySpring = useSpring(yMotionValue, {
    stiffness: 400,
    damping: 25,
    mass: 0.5,
  });

  const currentEmptySpace = usePositionCache((state) => {
    const data = state.getPositionData(state.cameraPosition);
    if (!data) {
      return state.cameraPosition;
    }
    return null;
  });

  useEffect(() => {
    if (currentEmptySpace && !usePositionCache.getState().isLoading) {
      usePositionCache.getState().getResultForPosition({
        position: currentEmptySpace,
      });
    }
  }, [currentEmptySpace]);

  const params = useSearchParams();
  const showDebug = params.get("debug") === "true";

  return (
    <div className="w-full h-screen relative">
      <Canvas
        camera={{ position: [0, 0, 800], fov: 90, near: 0.1, far: 100000 }}
      >
        <Fisheye>
          <ambientLight intensity={0.8} />
          <Flat />
          <FlatCameraControls
            xMotionValue={xMotionValue}
            yMotionValue={yMotionValue}
            xSpring={xSpring}
            ySpring={ySpring}
          />
        </Fisheye>

        {showDebug && <Perf position="top-left" />}
      </Canvas>
      <Search xMotionValue={xMotionValue} yMotionValue={yMotionValue} />
    </div>
  );
}
