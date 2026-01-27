"use client";

import { useState, useCallback } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { StorageBreakdown, AlbumStorageStats } from "@/lib/api";
import { StorageSegment } from "./StorageSegment";
import { StorageLegend } from "./StorageLegend";
import { AlbumDetailPanel } from "./AlbumDetailPanel";

const MAX_VISIBLE_ALBUMS = 9;

interface ProcessedAlbums {
  displayAlbums: AlbumStorageStats[];
  groupedAlbums: AlbumStorageStats[];
  groupedTotalBytes: number;
  groupedPercentage: number;
}

function processAlbumsForDisplay(
  albums: AlbumStorageStats[],
  totalBytes: number,
): ProcessedAlbums {
  // Sort by size (largest first) - already sorted from API
  const sortedAlbums = [...albums];

  // Take top albums for display
  const displayAlbums = sortedAlbums.slice(0, MAX_VISIBLE_ALBUMS);
  const groupedAlbums = sortedAlbums.slice(MAX_VISIBLE_ALBUMS);

  // Calculate grouped stats
  const groupedTotalBytes = groupedAlbums.reduce(
    (sum, a) => sum + a.total_bytes,
    0,
  );
  const groupedPercentage =
    totalBytes > 0 ? (groupedTotalBytes / totalBytes) * 100 : 0;

  return {
    displayAlbums,
    groupedAlbums,
    groupedTotalBytes,
    groupedPercentage,
  };
}

interface AlbumStorageBarProps {
  data: StorageBreakdown;
}

export function AlbumStorageBar({ data }: AlbumStorageBarProps) {
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);

  const { displayAlbums, groupedAlbums, groupedTotalBytes, groupedPercentage } =
    processAlbumsForDisplay(data.albums, data.total_bytes);

  const handleSegmentClick = useCallback((albumId: string) => {
    setSelectedAlbumId((prev) => (prev === albumId ? null : albumId));
  }, []);

  const handleSegmentDoubleClick = useCallback((albumId: string) => {
    // Only expand actual albums, not "other" or "free"
    if (albumId !== "other" && albumId !== "free" && albumId !== "grouped") {
      setExpandedAlbumId((prev) => (prev === albumId ? null : albumId));
    }
  }, []);

  const handleLegendClick = useCallback((albumId: string) => {
    setSelectedAlbumId((prev) => (prev === albumId ? null : albumId));
  }, []);

  const handleCloseDetail = useCallback(() => {
    setExpandedAlbumId(null);
  }, []);

  // Calculate percentages
  const otherPercentage =
    data.total_bytes > 0 ? (data.other_bytes / data.total_bytes) * 100 : 0;
  const freePercentage =
    data.total_bytes > 0 ? (data.free_bytes / data.total_bytes) * 100 : 0;

  // Find the expanded album
  const expandedAlbum = expandedAlbumId
    ? data.albums.find((a) => a.album_id === expandedAlbumId)
    : null;
  const expandedAlbumIndex = expandedAlbum
    ? displayAlbums.findIndex((a) => a.album_id === expandedAlbumId)
    : -1;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Storage Bar */}
        <div className="h-6 w-full rounded-full bg-muted overflow-hidden flex">
          {/* Album segments */}
          {displayAlbums.map((album, index) => (
            <StorageSegment
              key={album.album_id}
              album={{
                album_id: album.album_id,
                album_title: album.album_title,
                album_slug: album.album_slug,
                photo_count: album.photo_count,
                video_count: album.video_count,
                total_bytes: album.total_bytes,
                percentage:
                  data.total_bytes > 0
                    ? (album.total_bytes / data.total_bytes) * 100
                    : 0,
              }}
              colorIndex={index}
              isSelected={selectedAlbumId === album.album_id}
              onClick={() => handleSegmentClick(album.album_id)}
              onDoubleClick={() => handleSegmentDoubleClick(album.album_id)}
            />
          ))}

          {/* Grouped small albums segment */}
          {groupedAlbums.length > 0 && groupedPercentage >= 0.5 && (
            <StorageSegment
              album={{
                album_id: "grouped",
                album_title: `${groupedAlbums.length} other albums`,
                total_bytes: groupedTotalBytes,
                percentage: groupedPercentage,
              }}
              colorIndex={MAX_VISIBLE_ALBUMS}
              isSelected={selectedAlbumId === "grouped"}
              onClick={() => handleSegmentClick("grouped")}
            />
          )}

          {/* Other (system/orphaned) segment */}
          {otherPercentage >= 0.5 && (
            <StorageSegment
              album={{
                album_id: "other",
                album_title: "Other",
                total_bytes: data.other_bytes,
                percentage: otherPercentage,
              }}
              colorIndex={-1}
              isSelected={selectedAlbumId === "other"}
              onClick={() => handleSegmentClick("other")}
            />
          )}

          {/* Free space segment */}
          <StorageSegment
            album={{
              album_id: "free",
              album_title: "Free",
              total_bytes: data.free_bytes,
              percentage: freePercentage,
            }}
            colorIndex={-2}
            isSelected={false}
          />
        </div>

        {/* Legend */}
        <StorageLegend
          albums={displayAlbums}
          otherBytes={data.other_bytes}
          freeBytes={data.free_bytes}
          totalBytes={data.total_bytes}
          selectedAlbumId={selectedAlbumId}
          onAlbumClick={handleLegendClick}
        />

        {/* Expanded Album Detail Panel */}
        {expandedAlbum && expandedAlbumIndex >= 0 && (
          <AlbumDetailPanel
            album={expandedAlbum}
            colorIndex={expandedAlbumIndex}
            onClose={handleCloseDetail}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
