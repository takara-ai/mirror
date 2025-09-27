"use client";

import { Canvas } from "@react-three/fiber";
import { Flat } from "./components/flat";
import { FlatCameraControls } from "./components/flat-camera-controls";
import { Input } from "@/app/components/ui/input";
import { CameraControls, Environment, Fisheye } from "@react-three/drei";
import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { View3D } from "./components/3d";

export default function Home() {
  const [mode, setMode] = useState<"flat" | "3d">("flat");
  const [targetMode, setTargetMode] = useState<"flat" | "3d">("flat");

  // useEffect(() => {
  //   setTimeout(() => {
  //     setMode(targetMode);
  //   }, 1000);
  // }, [targetMode]);

  return (
    <div className="w-full h-screen relative">
      <Canvas camera={{ position: [0, 0, 800], fov: 80 }}>
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
            <CameraControls />
            <Environment background={true} files={"/space.hdr"} />
          </>
        )}
      </Canvas>
      <div className="fixed top-0 left-0 w-full flex items-center justify-center pointer-events-none p-6 z-20">
        <div className="w-full max-w-sm p-3 rounded-3xl bg-background/40 backdrop-blur-sm">
          <Input
            placeholder="Search"
            className="w-full rounded-xl h-12 text-lg pointer-events-auto bg-background/90"
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
        </div>
      </div>
    </div>
  );
}
