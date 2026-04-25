"use client";

import { useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PhotoCard } from "./PhotoCard";
import { Lightbox } from "./Lightbox";
import { SelectionToolbar } from "./SelectionToolbar";
import { usePhotoSelection } from "@/hooks/use-photo-selection";
import { useColumnCount } from "@/hooks/use-column-count";
import {
  bulkDeletePhotos,
  prepareDownload,
  getDownloadStatus,
  getDownloadFileUrl,
} from "@/lib/api";
import type { Photo } from "@/lib/api";

export interface VirtualizedGridPhoto {
  id: string;
  original_filename: string;
  width: number;
  height: number;
  created_at: string | null;
  captured_at: string | null;
  is_video: boolean;
}

interface VirtualizedPhotoGridProps {
  photos: VirtualizedGridPhoto[];
  albumId?: string;
  onPhotoDeleted?: (photoId: string) => void;
  dateField?: "captured" | "uploaded";
  groupByDate?: boolean;
  selectionEnabled?: boolean;
  getPhotoAlbumId?: (photo: VirtualizedGridPhoto) => string | undefined;
  onPhotoOpen?: (index: number) => void;
  renderPhotoCard?: (args: {
    photo: VirtualizedGridPhoto;
    index: number;
    onOpenLightbox: (index: number) => void;
    isSelected: boolean;
    isSelectionMode: boolean;
    onToggleSelect: (photoId: string) => void;
  }) => ReactNode;
}

interface PhotoGroup {
  date: string;
  displayDate: string;
  photos: VirtualizedGridPhoto[];
}

type VirtualRow =
  | { type: "header"; date: string; displayDate: string; photoCount: number }
  | { type: "photoRow"; photos: VirtualizedGridPhoto[] };

function groupPhotosByDate(
  photos: VirtualizedGridPhoto[],
  dateField: "captured" | "uploaded"
): PhotoGroup[] {
  const groups: Map<string, VirtualizedGridPhoto[]> = new Map();

  photos.forEach((photo) => {
    const date =
      dateField === "uploaded"
        ? photo.created_at || ""
        : photo.captured_at || photo.created_at || "";
    const d = new Date(date);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(photo);
  });

  return Array.from(groups.entries()).map(([dateKey, groupPhotos]) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const displayDate = date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return { date: dateKey, displayDate, photos: groupPhotos };
  });
}

function flattenToVirtualRows(
  groups: PhotoGroup[],
  columnCount: number
): VirtualRow[] {
  const rows: VirtualRow[] = [];

  for (const group of groups) {
    rows.push({
      type: "header",
      date: group.date,
      displayDate: group.displayDate,
      photoCount: group.photos.length,
    });

    for (let i = 0; i < group.photos.length; i += columnCount) {
      rows.push({
        type: "photoRow",
        photos: group.photos.slice(i, i + columnCount),
      });
    }
  }

  return rows;
}

function flattenToVirtualRowsFlat(
  photos: VirtualizedGridPhoto[],
  columnCount: number
): VirtualRow[] {
  const rows: VirtualRow[] = [];

  for (let i = 0; i < photos.length; i += columnCount) {
    rows.push({
      type: "photoRow",
      photos: photos.slice(i, i + columnCount),
    });
  }

  return rows;
}

export function VirtualizedPhotoGrid({
  photos,
  albumId,
  onPhotoDeleted,
  dateField = "captured",
  groupByDate = true,
  selectionEnabled = true,
  getPhotoAlbumId,
  onPhotoOpen,
  renderPhotoCard,
}: VirtualizedPhotoGridProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const columnCount = useColumnCount(scrollContainerRef);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const {
    selectedIds,
    isSelectionMode,
    toggleSelection,
    clearSelection,
    isSelected,
  } = usePhotoSelection();

  const photoGroups = useMemo(
    () => groupPhotosByDate(photos, dateField),
    [photos, dateField]
  );

  const virtualRows = useMemo(
    () =>
      groupByDate
        ? flattenToVirtualRows(photoGroups, columnCount)
        : flattenToVirtualRowsFlat(photos, columnCount),
    [groupByDate, photoGroups, photos, columnCount]
  );

  const photoIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < photos.length; i++) {
      map.set(photos[i].id, i);
    }
    return map;
  }, [photos]);

  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const row = virtualRows[index];
      return row.type === "header" ? 56 : 300;
    },
    overscan: 5,
    gap: 16,
  });

  const openLightbox = useCallback(
    (index: number) => {
      if (onPhotoOpen) {
        onPhotoOpen(index);
      } else if (!isSelectionMode) {
        setLightboxIndex(index);
      }
    },
    [isSelectionMode, onPhotoOpen]
  );

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const goToNext = useCallback(() => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex + 1) % photos.length);
    }
  }, [lightboxIndex, photos.length]);

  const goToPrev = useCallback(() => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length);
    }
  }, [lightboxIndex, photos.length]);

  const handlePhotoDeleted = useCallback(
    (photoId: string) => {
      if (lightboxIndex !== null) {
        const deletedIndex = photos.findIndex((p) => p.id === photoId);
        if (deletedIndex !== -1) {
          if (photos.length === 1) {
            setLightboxIndex(null);
          } else if (deletedIndex <= lightboxIndex) {
            setLightboxIndex(Math.max(0, lightboxIndex - 1));
          }
        }
      }
      onPhotoDeleted?.(photoId);
    },
    [lightboxIndex, photos, onPhotoDeleted]
  );

  const getAlbumIdForSelection = useCallback(() => {
    if (albumId) return albumId;
    const firstSelectedPhoto = photos.find((p) => selectedIds.has(p.id));
    return firstSelectedPhoto ? getPhotoAlbumId?.(firstSelectedPhoto) : undefined;
  }, [albumId, photos, selectedIds, getPhotoAlbumId]);

  const handleBulkDownload = async () => {
    const targetAlbumId = getAlbumIdForSelection();
    if (!targetAlbumId) return;

    const photoIds = Array.from(selectedIds);
    let job = await prepareDownload(targetAlbumId, photoIds);

    // Poll until ready
    while (job.status === "queued" || job.status === "processing") {
      await new Promise((r) => setTimeout(r, 1000));
      job = await getDownloadStatus(job.job_id);
    }

    if (job.status === "failed") {
      throw new Error(job.error || "Download preparation failed");
    }

    // Trigger browser download
    window.location.href = getDownloadFileUrl(job.job_id);
    clearSelection();
  };

  const handleBulkDelete = async () => {
    const targetAlbumId = getAlbumIdForSelection();
    if (!targetAlbumId) return;

    const photoIds = Array.from(selectedIds);
    await bulkDeletePhotos(targetAlbumId, photoIds);

    for (const photoId of photoIds) {
      onPhotoDeleted?.(photoId);
    }

    clearSelection();
  };

  return (
    <>
      <div ref={scrollContainerRef} className="masonry-container flex-1 overflow-auto p-6">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const row = virtualRows[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {row.type === "header" ? (
                  <div className="mb-4 flex items-center gap-3 pt-4 first:pt-0">
                    <h2 className="text-lg font-semibold">
                      {row.displayDate}
                    </h2>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-sm text-muted-foreground">
                      {row.photoCount} photo
                      {row.photoCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                ) : (
                  <div className="masonry">
                    {row.photos.map((photo) => {
                      const globalIndex = photoIndexMap.get(photo.id) ?? 0;
                      return (
                        renderPhotoCard ? (
                          renderPhotoCard({
                            photo,
                            index: globalIndex,
                            onOpenLightbox: openLightbox,
                            isSelected: isSelected(photo.id),
                            isSelectionMode,
                            onToggleSelect: toggleSelection,
                          })
                        ) : (
                          <PhotoCard
                            key={photo.id}
                            photo={photo as Photo}
                            index={globalIndex}
                            onOpenLightbox={openLightbox}
                            isSelected={isSelected(photo.id)}
                            isSelectionMode={isSelectionMode}
                            onToggleSelect={toggleSelection}
                          />
                        )
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selection Toolbar */}
      {selectionEnabled && (
        <SelectionToolbar
          selectedCount={selectedIds.size}
          onClearSelection={clearSelection}
          onDownload={handleBulkDownload}
          onDelete={handleBulkDelete}
        />
      )}

      {!onPhotoOpen && lightboxIndex !== null && photos[lightboxIndex] && (
        <Lightbox
          photo={photos[lightboxIndex] as Photo}
          albumId={albumId || getPhotoAlbumId?.(photos[lightboxIndex]) || ""}
          currentIndex={lightboxIndex}
          totalCount={photos.length}
          onClose={closeLightbox}
          onNext={goToNext}
          onPrev={goToPrev}
          onDelete={onPhotoDeleted ? handlePhotoDeleted : undefined}
        />
      )}
    </>
  );
}
