"use client";

import { useState, useEffect, type RefObject } from "react";

/**
 * Returns the photo grid column count based on the container width,
 * matching the CSS breakpoints in global.css .masonry class.
 */
export function useColumnCount(
  containerRef: RefObject<HTMLElement | null>
): number {
  const [columnCount, setColumnCount] = useState(2);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w >= 1280) setColumnCount(5);
      else if (w >= 1024) setColumnCount(4);
      else if (w >= 640) setColumnCount(3);
      else setColumnCount(2);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  return columnCount;
}
