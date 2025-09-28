"use client";

import { usePositionCache } from "@/lib/store";
import { useEffect, useState } from "react";
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Sheet as UISheet,
} from "./ui/sheet";
import { Button, buttonVariants } from "./ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

export function Sheet() {
  const selected = usePositionCache((state) =>
    state.isDragging ? undefined : state.selectedItem
  );

  return (
    <UISheet
      open={!!selected}
      onOpenChange={() => {
        usePositionCache.getState().setSelectedItem(undefined);
      }}
      modal={false}
    >
      <SheetContent>
        <SheetHeader className="pb-0">
          <SheetTitle>Image Details</SheetTitle>
        </SheetHeader>
        <div className="p-6 pt-0">
          {selected && (
            <div className="space-y-4">
              <div className="w-full">
                <img
                  src={selected.image_url}
                  alt="Selected image"
                  className="w-full h-auto rounded-lg"
                />
              </div>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium">Dimensions:</span>{" "}
                  {selected.width} × {selected.height}px
                </p>
                <p>
                  <span className="font-medium">ID:</span> {selected.id}
                </p>
              </div>
              <Button
                onClick={async () => {
                  try {
                    const response = await fetch(selected.image_url);
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `image-${selected.id}.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                  } catch (error) {
                    console.error("Failed to download image:", error);
                    toast.error("Failed to download image");
                  }
                }}
              >
                <Download className="size-4" />
                Download Image
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </UISheet>
  );
}
