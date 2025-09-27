"use client";

import { useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "three";
import { useMotionValue, useSpring } from "motion/react";
import { usePositionCache } from "@/lib/store";
import { worldPositionToGridPosition } from "@/lib/position";

// Panning sensitivity - adjust these values to change how fast the camera moves
const MOUSE_PAN_SENSITIVITY = 2;
const TOUCHPAD_PAN_SENSITIVITY = 3;
const Z_DISTANCE_DRAGGING = 1000;
const Z_DISTANCE_IDLE = 800;

export function FlatCameraControls({
  isTransitioning,
}: {
  isTransitioning: boolean;
}) {
  const setGridCameraPosition = usePositionCache(
    (state) => state.setCameraPosition
  );
  const { camera, gl } = useThree();
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [_, setCameraPosition] = useState({ x: 0, y: 0 });

  // Motion values for smooth transitions
  const zMotionValue = useMotionValue(Z_DISTANCE_IDLE);
  const zSpring = useSpring(zMotionValue, {
    stiffness: 300,
    damping: 30,
    mass: 0.8,
  });

  // Motion values for smooth camera position
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

  // Update motion value when dragging state changes
  useEffect(() => {
    zMotionValue.set(isDragging ? Z_DISTANCE_DRAGGING : Z_DISTANCE_IDLE);
  }, [isDragging, zMotionValue]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      setIsDragging(true);
      setLastMouse({ x: event.clientX, y: event.clientY });
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = event.clientX - lastMouse.x;
      const deltaY = event.clientY - lastMouse.y;

      setCameraPosition((prev) => {
        const newX = prev.x - deltaX * MOUSE_PAN_SENSITIVITY;
        const newY = prev.y + deltaY * MOUSE_PAN_SENSITIVITY;
        xMotionValue.set(newX);
        yMotionValue.set(newY);
        const newGridPos = worldPositionToGridPosition(newX, newY);
        setGridCameraPosition(newGridPos);
        return { x: newX, y: newY };
      });

      setLastMouse({ x: event.clientX, y: event.clientY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    // Wheel events for trackpad panning
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      // Use wheel delta for smooth trackpad panning
      const deltaX = event.deltaX * TOUCHPAD_PAN_SENSITIVITY;
      const deltaY = event.deltaY * TOUCHPAD_PAN_SENSITIVITY;

      setCameraPosition((prev) => {
        const newX = prev.x + deltaX;
        const newY = prev.y - deltaY;
        xMotionValue.set(newX);
        yMotionValue.set(newY);
        return { x: newX, y: newY };
      });
    };

    const canvas = gl.domElement;

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [isDragging, lastMouse, gl.domElement]);

  useFrame(() => {
    if (camera instanceof PerspectiveCamera) {
      // Use smooth spring animations for all positions
      camera.position.x = xSpring.get();
      camera.position.y = ySpring.get();
      camera.position.z = zSpring.get();

      camera.lookAt(xSpring.get(), ySpring.get(), 0);
    }
  });

  return null;
}
