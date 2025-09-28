"use client";

import { Button, buttonVariants } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { gridPositionToWorldPosition } from "@/lib/position";
import { usePositionCache } from "@/lib/store";
import { MotionValue } from "motion/react";
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Loader2, Plus, ScanSearch } from "lucide-react";
import { Input } from "./ui/input";
import { useMutation } from "@tanstack/react-query";

export function Search({
  xMotionValue,
  yMotionValue,
}: {
  xMotionValue: MotionValue<number>;
  yMotionValue: MotionValue<number>;
}) {
  const [query, setQuery] = useState<string>("");
  const [lastSubmit, setLastSubmit] = useState<string | null>(null);
  const [bursting, setBursting] = useState(false);
  const [burstingTimeout, setBurstingTimeout] = useState<NodeJS.Timeout | null>(
    null
  );
  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload file");
      }

      const result = await response.json();
      console.log(result);
      return result;
    },
  });

  const submit = useCallback(async () => {
    if (!query) return;

    setLastSubmit(query);
    setQuery("");
    if (burstingTimeout) {
      clearTimeout(burstingTimeout);
    }
    setBursting(true);
    setBurstingTimeout(
      setTimeout(() => {
        setBursting(false);
      }, 1000)
    );

    (document.activeElement as HTMLElement)?.blur?.();

    await usePositionCache.getState().getResultForPosition({
      text: query,
      moveCamera: (position) => {
        const worldPosition = gridPositionToWorldPosition(
          position.x,
          position.y
        );
        xMotionValue.set(worldPosition.x);
        yMotionValue.set(worldPosition.y);
      },
    });
  }, [burstingTimeout, query, xMotionValue, yMotionValue]);
  const isLoading = usePositionCache((state) => state.isLoading);

  return (
    <div className="fixed bottom-0 left-0 w-full flex items-center justify-center pointer-events-none p-6 z-20">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        id="cool-textarea"
        className="group animate-bg-slide relative flex h-full w-full max-w-md rounded-2xl bg-[url(/accent-texture.webp)] bg-cover"
      >
        {(lastSubmit || isLoading) && (
          <span className="text-foreground absolute w-fit mx-auto -top-16 right-0 left-0 text-center font-mono text-sm bg-white/60 rounded-full px-4 py-2 backdrop-blur-sm flex items-center gap-2">
            {lastSubmit}{" "}
            {isLoading && <Loader2 className="size-4 animate-spin" />}
          </span>
        )}
        <Textarea
          placeholder="Search for images..."
          autoFocus
          className={cn(
            "peer bg-input min-h-20 max-w-md resize-none rounded-2xl p-3 transition-all duration-75 focus-within:-translate-y-2 focus:ring-0 focus:outline-none focus-visible:ring-0 pointer-events-auto"
          )}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (!e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }
          }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label
          className={buttonVariants({
            variant: "secondary",
            size: "icon",
            className:
              "pointer-events-auto absolute right-12 bottom-2 ml-auto !size-8 !rounded-lg transition-all duration-75 peer-focus-within:-translate-y-2",
          })}
          htmlFor="file-input"
        >
          <Plus className="size-5" />
        </label>
        <Input
          type="file"
          className="hidden"
          id="file-input"
          accept="image/*"
          multiple={false}
          onChange={(e) => {
            uploadFile.mutate(e.target.files?.[0] as File);
            e.target.value = "";
          }}
        />
        <Button
          className={cn(
            "pointer-events-auto absolute right-2 bottom-2 ml-auto size-8 rounded-lg transition-all duration-75 peer-focus-within:-translate-y-2"
          )}
          variant={"default"}
          size="icon"
          type="submit"
        >
          <ScanSearch className="size-5" />
        </Button>
        <div
          className={cn(
            "animate-bg-slide absolute bottom-0 -z-10 h-2/3 w-full rounded-2xl bg-[url(/accent-texture.webp)] bg-cover opacity-0 blur-3xl transition-all peer-focus-within:opacity-100",
            bursting && "animate-burst"
          )}
        />
      </form>
    </div>
  );
}
