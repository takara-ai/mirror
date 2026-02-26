"use client";

import { Loader2, ScanSearch } from "lucide-react";
import type { MotionValue } from "motion/react";
import { useCallback, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { gridPositionToWorldPosition } from "@/lib/position";
import { usePositionCache } from "@/lib/store";
import { cn } from "@/lib/utils";

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

  const submit = useCallback(async () => {
    if (!query) {
      return;
    }

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
    <div className="pointer-events-none fixed bottom-0 left-0 z-20 flex w-full items-center justify-center p-6">
      <form
        className="group relative flex h-full w-full max-w-md animate-bg-slide rounded-2xl bg-[url(/accent-texture.webp)] bg-cover"
        id="cool-textarea"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {(lastSubmit || isLoading) && (
          <span className="absolute -top-16 right-0 left-0 mx-auto flex w-fit items-center gap-2 rounded-full bg-white/60 px-4 py-2 text-center font-mono text-foreground text-sm backdrop-blur-sm">
            {lastSubmit}{" "}
            {isLoading && <Loader2 className="size-4 animate-spin" />}
          </span>
        )}
        <Textarea
          autoFocus
          className={cn(
            "peer pointer-events-auto min-h-20 max-w-md resize-none rounded-2xl bg-input p-3 transition-all duration-75 focus-within:-translate-y-2 focus:outline-none focus:ring-0 focus-visible:ring-0"
          )}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Search for images..."
          value={query}
        />
        <Button
          className={cn(
            "pointer-events-auto absolute right-2 bottom-2 ml-auto size-8 rounded-lg transition-all duration-75 peer-focus-within:-translate-y-2"
          )}
          size="icon"
          type="submit"
          variant={"default"}
        >
          <ScanSearch className="size-5" />
        </Button>
        <div
          className={cn(
            "absolute bottom-0 -z-10 h-2/3 w-full animate-bg-slide rounded-2xl bg-[url(/accent-texture.webp)] bg-cover opacity-0 blur-3xl transition-all peer-focus-within:opacity-100",
            bursting && "animate-burst"
          )}
        />
      </form>
    </div>
  );
}
