"use client";

import { Fisheye } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMotionValue, useSpring } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Perf } from "r3f-perf";
import { useEffect } from "react";
import { usePositionCache } from "@/lib/store";
import { Flat } from "./components/flat";
import { FlatCameraControls } from "./components/flat-camera-controls";
import { GithubIcon } from "./components/github-icon";
import { Search } from "./components/search";
import { Sheet } from "./components/sheet";
import { buttonVariants } from "./components/ui/button";

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
    <div className="relative h-dvh w-full">
      <Canvas
        camera={{ position: [0, 0, 800], fov: 90, near: 0.1, far: 100_000 }}
      >
        <Fisheye>
          <ambientLight intensity={0.8} />
          <Flat />
          <FlatCameraControls
            xMotionValue={xMotionValue}
            xSpring={xSpring}
            yMotionValue={yMotionValue}
            ySpring={ySpring}
          />
        </Fisheye>
        {showDebug && <Perf position="top-left" />}
      </Canvas>
      <Sheet />
      <Search xMotionValue={xMotionValue} yMotionValue={yMotionValue} />
      <Link
        className={buttonVariants({
          className: "fixed top-4 left-4 z-30",
        })}
        href="https://github.com/takara-ai/mirror"
      >
        <GithubIcon className="size-5" />
        Github
      </Link>
    </div>
  );
}
