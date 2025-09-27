"use client";

import { Canvas } from "@react-three/fiber";
import { Flat } from "./components/flat";
import { FlatCameraControls } from "./components/flat-camera-controls";
import { Input } from "@/app/components/ui/input";
import { CameraControls, Environment, Fisheye } from "@react-three/drei";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { View3D } from "./components/3d";

export default function Home() {
  const [mode, setMode] = useState<"flat" | "3d">("flat");
  return (
    <div className="w-full h-screen relative">
      <Canvas camera={{ position: [0, 0, 800], fov: 80 }}>
        {mode === "flat" ? (
          <Fisheye zoom={1.4} resolution={2000}>
            <ambientLight intensity={0.8} />
            <pointLight position={[0, 0, 1000]} intensity={0.5} />
            <Flat />
            <FlatCameraControls />
            <Environment background={true} files={"/space.hdr"} />
          </Fisheye>
        ) : (
          <>
            <ambientLight intensity={0.8} />
            <pointLight position={[0, 0, 1000]} intensity={0.5} />
            <View3D />
            <CameraControls />
            <Environment background={true} files={"/space.hdr"} />
          </>
        )}
      </Canvas>
      <div className="fixed top-0 left-0 w-full flex items-center justify-center pointer-events-none p-6">
        <div className="w-full max-w-sm p-3 rounded-3xl bg-background/40 backdrop-blur-sm">
          <Input
            placeholder="Search"
            className="w-full rounded-xl h-12 text-lg pointer-events-auto bg-background/90"
          />
        </div>
      </div>
      <div className="fixed bottom-6 left-6 pointer-events-none">
        <div className="p-3 rounded-[40px] bg-background/40 backdrop-blur-sm">
          <Button
            variant="outline"
            size="icon"
            className="size-30 bg-background/90 pointer-events-auto rounded-4xl text-3xl"
            onClick={() => setMode(mode === "flat" ? "3d" : "flat")}
          >
            {mode === "flat" ? "3D" : "Flat"}
          </Button>
        </div>
      </div>
    </div>
  );
}
