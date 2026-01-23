"use client";

import Link from "next/link";
import { X, ExternalLink, Image, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AlbumStorageStats } from "@/lib/api";
import { getStorageColor } from "./StorageSegment";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

interface AlbumDetailPanelProps {
  album: AlbumStorageStats;
  colorIndex: number;
  onClose: () => void;
}

export function AlbumDetailPanel({
  album,
  colorIndex,
  onClose,
}: AlbumDetailPanelProps) {
  return (
    <div
      className="rounded-lg border bg-card p-4 animate-in slide-in-from-top-2 duration-200"
      style={{ borderLeftColor: getStorageColor(colorIndex), borderLeftWidth: 4 }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3 flex-1">
          <div>
            <h3 className="font-semibold text-lg">{album.album_title}</h3>
            <p className="text-sm text-muted-foreground">
              {formatBytes(album.total_bytes)} ({album.percentage.toFixed(1)}% of
              total storage)
            </p>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Image className="h-4 w-4 text-muted-foreground" />
              <span>
                {album.photo_count} {album.photo_count === 1 ? "photo" : "photos"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground" />
              <span>
                {album.video_count} {album.video_count === 1 ? "video" : "videos"}
              </span>
            </div>
          </div>

          <div className="pt-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/albums/${album.album_slug}`}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Album
              </Link>
            </Button>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>
    </div>
  );
}
