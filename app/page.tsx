"use client";

import { usePositionCache } from "@/lib/store";
import { CameraControls, Environment, Fisheye } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMotionValue, useSpring } from "motion/react";
import { useEffect, useState } from "react";
import { View3D } from "./components/3d";
import { Flat } from "./components/flat";
import { FlatCameraControls } from "./components/flat-camera-controls";
import { Search } from "./components/search";
import { Image } from "./components/image";
import { gridPositionToWorldPosition } from "@/lib/position";

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
          <Environment background={true} files={"/space.hdr"} />
        </Fisheye>
      </Canvas>
      <Search xMotionValue={xMotionValue} yMotionValue={yMotionValue} />
    </div>
  );
}
