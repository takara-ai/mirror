"use client";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { usePositionCache } from "@/lib/store";
import { MotionValue } from "motion/react";
import { useState } from "react";

export function Search({
  xMotionValue,
  yMotionValue,
}: {
  xMotionValue: MotionValue<number>;
  yMotionValue: MotionValue<number>;
}) {
  const [query, setQuery] = useState<string>("");

  return (
    <div className="fixed top-0 left-0 w-full flex items-center justify-center pointer-events-none p-6 z-20">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const position = await usePositionCache
            .getState()
            .getResultForPosition({ text: query });
          console.log(position);
          xMotionValue.set(position?.x || 0);
          yMotionValue.set(position?.y || 0);
          setQuery("");
        }}
        className="w-full max-w-sm p-3 rounded-3xl bg-background/40 backdrop-blur-sm flex gap-2"
      >
        <Input
          placeholder="Search"
          className="w-full rounded-xl h-12 text-lg pointer-events-auto bg-background/90"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button
          variant="outline"
          className=" rounded-xl h-12 text-lg pointer-events-auto bg-background/90"
          type="submit"
        >
          Search
        </Button>
      </form>
    </div>
  );
}
