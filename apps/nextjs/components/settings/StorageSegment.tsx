"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AlbumStorageStats } from "@/lib/api";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// Get storage color based on index
function getStorageColor(colorIndex: number): string {
  if (colorIndex === -1) return "hsl(var(--storage-other))";
  if (colorIndex === -2) return "hsl(var(--storage-free))";
  // Cycle through 10 colors
  const index = (colorIndex % 10) + 1;
  return `hsl(var(--storage-${index}))`;
}

export interface SegmentData {
  album_id: string;
  album_title: string;
  album_slug?: string;
  photo_count?: number;
  video_count?: number;
  total_bytes: number;
  percentage: number;
}

interface StorageSegmentProps {
  album: SegmentData;
  colorIndex: number;
  isSelected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function StorageSegment({
  album,
  colorIndex,
  isSelected,
  onClick,
  onDoubleClick,
}: StorageSegmentProps) {
  // Don't render segments that are too small (< 0.1%)
  if (album.percentage < 0.1) return null;

  const isSpecial = album.album_id === "other" || album.album_id === "free";
  const bgColor = getStorageColor(colorIndex);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`
            h-full cursor-pointer transition-all duration-150
            ${isSelected ? "ring-2 ring-foreground ring-offset-1" : ""}
            ${!isSpecial ? "hover:brightness-110" : ""}
          `}
          style={{
            width: `${Math.max(album.percentage, 0.5)}%`,
            backgroundColor: bgColor,
          }}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-center">
        <div className="font-medium">{album.album_title}</div>
        {album.photo_count !== undefined && album.video_count !== undefined && (
          <div className="text-xs text-muted-foreground">
            {album.photo_count} photos, {album.video_count} videos
          </div>
        )}
        <div className="text-xs">
          {formatBytes(album.total_bytes)} ({album.percentage.toFixed(1)}%)
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export { getStorageColor };
