"use client";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { worldPositionToGridPosition } from "@/lib/position";
import {
  CameraControls,
  Environment,
  Fisheye,
  PerspectiveCamera,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View3D } from "./components/3d";
import { Flat } from "./components/flat";
import { FlatCameraControls } from "./components/flat-camera-controls";
import { usePositionCache } from "@/lib/store";

export type SearchResult = {
  id: string;
  image_id: string;
  image_url: string;
  width: number;
  height: number;
  score: number;
};

export default function Home() {
  const [mode, setMode] = useState<"flat" | "3d">("flat");
  const [targetMode, setTargetMode] = useState<"flat" | "3d">("flat");
  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    setMode(targetMode);
  }, [targetMode]);

  const camPos = usePositionCache((state) => state.cameraPosition);

  return (
    <div className="w-full h-screen relative">
      <Canvas
        camera={{ position: [0, 0, 800], fov: 80, near: 0.1, far: 100000 }}
      >
        {mode === "flat" ? (
          <Fisheye zoom={1.4} resolution={2000}>
            <ambientLight intensity={0.8} />
            <Flat doTransition={targetMode === "3d"} />
            <FlatCameraControls isTransitioning={targetMode === "3d"} />
            <Environment background={true} files={"/space.hdr"} />
          </Fisheye>
        ) : (
          <>
            <ambientLight intensity={0.8} />
            <View3D />
            <CameraControls minDistance={100} maxDistance={6000} />
            <Environment background={true} files={"/space.hdr"} />
          </>
        )}
      </Canvas>
      <div className="fixed top-0 left-0 w-full flex items-center justify-center pointer-events-none p-6 z-20">
        <div className="w-full max-w-sm p-3 rounded-3xl bg-background/40 backdrop-blur-sm">
          <Input
            placeholder="Search"
            className="w-full rounded-xl h-12 text-lg pointer-events-auto bg-background/90"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="fixed bottom-6 left-6 pointer-events-none z-20">
        <div className="p-3 gap-2 rounded-3xl h-fit w-fit bg-background/40 backdrop-blur-sm flex flex-col items-center justify-center">
          <Button
            variant="outline"
            className="bg-background/90 size-30 pointer-events-auto rounded-xl text-3xl"
            onClick={() => setTargetMode(targetMode === "flat" ? "3d" : "flat")}
          >
            {targetMode === "flat" ? (
              <img src="/3d.svg" alt="3D" className="size-full"></img>
            ) : (
              <img src="/flat.svg" alt="Flat" className="size-full"></img>
            )}
          </Button>
          <span className="text-sm font-medium">
            Switch to {targetMode === "flat" ? "3D" : "Flat"}
          </span>
          <span className="text-sm font-medium">
            {camPos.x}, {camPos.y}
          </span>
        </div>
      </div>
    </div>
  );
}
