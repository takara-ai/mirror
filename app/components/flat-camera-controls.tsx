"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type MotionValue, useMotionValue, useSpring } from "motion/react";
import { useEffect, useState } from "react";
import { PerspectiveCamera } from "three";
import { worldPositionToGridPosition } from "@/lib/position";
import { usePositionCache } from "@/lib/store";

// Panning sensitivity - adjust these values to change how fast the camera moves
const MOUSE_PAN_SENSITIVITY = 0.5;
const TOUCHPAD_PAN_SENSITIVITY = 0.5;
const TOUCH_PAN_SENSITIVITY = 0.8;
const Z_DISTANCE_DRAGGING = 110;
const Z_DISTANCE_IDLE = 70;

export function FlatCameraControls({
  xMotionValue,
  yMotionValue,
  xSpring,
  ySpring,
}: {
  xMotionValue: MotionValue<number>;
  yMotionValue: MotionValue<number>;
  xSpring: MotionValue<number>;
  ySpring: MotionValue<number>;
}) {
  const setGridCameraPosition = usePositionCache(
    (state) => state.setCameraPosition
  );
  const { camera, gl } = useThree();
  const setIsDragging = usePositionCache((state) => state.setIsDragging);
  const isDragging = usePositionCache((state) => state.isDragging);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [lastTouch, setLastTouch] = useState({ x: 0, y: 0 });

  // Motion values for smooth transitions
  const zMotionValue = useMotionValue(Z_DISTANCE_IDLE);
  const zSpring = useSpring(zMotionValue, {
    stiffness: 300,
    damping: 30,
    mass: 0.8,
  });

  // Motion values are now passed as props from parent component

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
      if (!isDragging) {
        return;
      }

      const deltaX = event.clientX - lastMouse.x;
      const deltaY = event.clientY - lastMouse.y;

      // Get current position from motion values
      const currentX = xMotionValue.get();
      const currentY = yMotionValue.get();

      const newX = currentX - deltaX * MOUSE_PAN_SENSITIVITY;
      const newY = currentY + deltaY * MOUSE_PAN_SENSITIVITY;

      xMotionValue.set(newX);
      yMotionValue.set(newY);

      const newGridPos = worldPositionToGridPosition(newX, newY);
      setGridCameraPosition(newGridPos);

      setLastMouse({ x: event.clientX, y: event.clientY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    // Touch events for mobile
    const handleTouchStart = (event: TouchEvent) => {
      event.preventDefault();
      if (event.touches.length === 1) {
        setIsDragging(true);
        const touch = event.touches[0];
        setLastTouch({ x: touch.clientX, y: touch.clientY });
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      if (!isDragging || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const deltaX = touch.clientX - lastTouch.x;
      const deltaY = touch.clientY - lastTouch.y;

      // Get current position from motion values
      const currentX = xMotionValue.get();
      const currentY = yMotionValue.get();

      const newX = currentX - deltaX * TOUCH_PAN_SENSITIVITY;
      const newY = currentY + deltaY * TOUCH_PAN_SENSITIVITY;

      xMotionValue.set(newX);
      yMotionValue.set(newY);

      const newGridPos = worldPositionToGridPosition(newX, newY);
      setGridCameraPosition(newGridPos);

      setLastTouch({ x: touch.clientX, y: touch.clientY });
    };

    const handleTouchEnd = (event: TouchEvent) => {
      event.preventDefault();
      setIsDragging(false);
    };

    // Wheel events for trackpad panning
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      // Use wheel delta for smooth trackpad panning
      const deltaX = event.deltaX * TOUCHPAD_PAN_SENSITIVITY;
      const deltaY = event.deltaY * TOUCHPAD_PAN_SENSITIVITY;

      // Get current position from motion values
      const currentX = xMotionValue.get();
      const currentY = yMotionValue.get();

      const newX = currentX + deltaX;
      const newY = currentY - deltaY;

      xMotionValue.set(newX);
      yMotionValue.set(newY);

      const newGridPos = worldPositionToGridPosition(newX, newY);
      setGridCameraPosition(newGridPos);
    };

    const canvas = gl.domElement;

    // Mouse events
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    // Touch events
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });

    return () => {
      // Mouse events cleanup
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("wheel", handleWheel);

      // Touch events cleanup
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, [
    isDragging,
    lastMouse,
    lastTouch,
    gl.domElement,
    xMotionValue,
    yMotionValue,
    setGridCameraPosition,
  ]);

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
