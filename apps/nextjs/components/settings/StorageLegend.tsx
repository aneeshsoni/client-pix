"use client";

import type { AlbumStorageStats } from "@/lib/api";
import { getStorageColor } from "./StorageSegment";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

interface StorageLegendProps {
  albums: AlbumStorageStats[];
  otherBytes: number;
  freeBytes: number;
  totalBytes: number;
  selectedAlbumId?: string | null;
  onAlbumClick?: (albumId: string) => void;
}

export function StorageLegend({
  albums,
  otherBytes,
  freeBytes,
  totalBytes,
  selectedAlbumId,
  onAlbumClick,
}: StorageLegendProps) {
  const otherPercentage = totalBytes > 0 ? (otherBytes / totalBytes) * 100 : 0;
  const freePercentage = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {albums.map((album, index) => (
        <button
          key={album.album_id}
          className={`
            flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors
            hover:bg-muted
            ${selectedAlbumId === album.album_id ? "bg-muted" : ""}
          `}
          onClick={() => onAlbumClick?.(album.album_id)}
        >
          <span
            className="h-3 w-3 rounded-sm flex-shrink-0"
            style={{ backgroundColor: getStorageColor(index) }}
          />
          <span className="truncate max-w-[120px]">{album.album_title}</span>
          <span className="text-muted-foreground text-xs">
            {formatBytes(album.total_bytes)}
          </span>
        </button>
      ))}

      {/* Other segment */}
      {otherPercentage >= 0.5 && (
        <button
          className={`
            flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors
            hover:bg-muted
            ${selectedAlbumId === "other" ? "bg-muted" : ""}
          `}
          onClick={() => onAlbumClick?.("other")}
        >
          <span
            className="h-3 w-3 rounded-sm flex-shrink-0"
            style={{ backgroundColor: getStorageColor(-1) }}
          />
          <span>Other</span>
          <span className="text-muted-foreground text-xs">
            {formatBytes(otherBytes)}
          </span>
        </button>
      )}

      {/* Free space segment */}
      <div className="flex items-center gap-1.5 px-1.5 py-0.5">
        <span
          className="h-3 w-3 rounded-sm flex-shrink-0"
          style={{ backgroundColor: getStorageColor(-2) }}
        />
        <span>Free</span>
        <span className="text-muted-foreground text-xs">
          {formatBytes(freeBytes)}
        </span>
      </div>
    </div>
  );
}
