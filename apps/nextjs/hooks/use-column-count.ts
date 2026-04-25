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

    const updateColumnCount = (width: number) => {
      const w = width;
      if (w >= 1280) setColumnCount(5);
      else if (w >= 1024) setColumnCount(4);
      else if (w >= 640) setColumnCount(3);
      else setColumnCount(2);
    };

    // Set the right column count immediately on mount instead of waiting for
    // ResizeObserver to deliver its first callback.
    updateColumnCount(el.getBoundingClientRect().width);

    const observer = new ResizeObserver(([entry]) => {
      updateColumnCount(entry.contentRect.width);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  return columnCount;
}
