"use client";

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PhotoCard } from "./PhotoCard";
import { Lightbox } from "./Lightbox";
import { SelectionToolbar } from "./SelectionToolbar";
import { usePhotoSelection } from "@/hooks/use-photo-selection";
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
  groups?: Array<{
    id: string;
    title: string;
    photos: VirtualizedGridPhoto[];
  }>;
  selectionEnabled?: boolean;
  getPhotoAlbumId?: (photo: VirtualizedGridPhoto) => string | undefined;
  onPhotoOpen?: (index: number) => void;
  renderSelectionActions?: (args: {
    selectedPhotoIds: string[];
    clearSelection: () => void;
  }) => ReactNode;
  selectionToolbarLeft?: string;
  renderPhotoCard?: (args: {
    photo: VirtualizedGridPhoto;
    index: number;
    onOpenLightbox: (index: number) => void;
    isSelected: boolean;
    isSelectionMode: boolean;
    onToggleSelect: (
      photoId: string,
      options?: { rangeSelect?: boolean },
    ) => void;
    className: string;
    style: CSSProperties;
    fillContainer: boolean;
    imageSizes: string;
  }) => ReactNode;
}

interface PhotoGroup {
  id: string;
  title: string;
  photos: VirtualizedGridPhoto[];
}

type VirtualRow =
  | { type: "header"; id: string; title: string; photoCount: number }
  | { type: "photoRow"; photos: JustifiedPhoto[]; height: number };

interface JustifiedPhoto {
  photo: VirtualizedGridPhoto;
  width: number;
  height: number;
}

interface JustifiedPhotoCandidate {
  photo: VirtualizedGridPhoto;
  aspectRatio: number;
}

const ROW_GAP = 4;
const VIRTUAL_ROW_GAP = 16;
const HEADER_ROW_HEIGHT = 56;
const MAX_ROW_HEIGHT = 520;
const EXTREME_PORTRAIT_ASPECT_RATIO = 0.58;
const MOBILE_EXTREME_PORTRAIT_LAYOUT_ASPECT_RATIO = 0.72;

function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateWidth = () => {
      setWidth(element.clientWidth);
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [ref]);

  return width;
}

function getTargetRowHeight(containerWidth: number) {
  if (containerWidth < 520) return 220;
  if (containerWidth < 768) return 260;
  if (containerWidth < 1280) return 340;
  return 400;
}

function getMinimumTileWidth(containerWidth: number) {
  if (containerWidth < 520) return 170;
  if (containerWidth < 768) return 215;
  if (containerWidth < 1280) return 320;
  return 360;
}

function getPhotoAspectRatio(photo: VirtualizedGridPhoto) {
  if (photo.width > 0 && photo.height > 0) {
    return photo.width / photo.height;
  }

  return 1;
}

function getPhotoLayoutAspectRatio(
  photo: VirtualizedGridPhoto,
  containerWidth: number
) {
  const aspectRatio = getPhotoAspectRatio(photo);

  if (containerWidth < 768 && aspectRatio < EXTREME_PORTRAIT_ASPECT_RATIO) {
    return MOBILE_EXTREME_PORTRAIT_LAYOUT_ASPECT_RATIO;
  }

  return aspectRatio;
}

function getNaturalRowHeight(
  candidates: JustifiedPhotoCandidate[],
  containerWidth: number
) {
  const totalGap = ROW_GAP * Math.max(0, candidates.length - 1);
  const aspectRatioSum = candidates.reduce(
    (sum, candidate) => sum + candidate.aspectRatio,
    0
  );
  const availableWidth = Math.max(1, containerWidth - totalGap);

  return availableWidth / Math.max(1, aspectRatioSum);
}

function rowWouldCompressTiles(
  candidates: JustifiedPhotoCandidate[],
  containerWidth: number,
  minTileWidth: number
) {
  const naturalHeight = getNaturalRowHeight(candidates, containerWidth);

  return candidates.some(
    (candidate) => candidate.aspectRatio * naturalHeight < minTileWidth
  );
}

function createJustifiedPhotoRow(
  candidates: JustifiedPhotoCandidate[],
  containerWidth: number,
  targetRowHeight: number,
  stretchToWidth: boolean
): VirtualRow {
  const naturalHeight = getNaturalRowHeight(candidates, containerWidth);
  const rowHeight = stretchToWidth
    ? Math.min(MAX_ROW_HEIGHT, naturalHeight)
    : Math.min(targetRowHeight, naturalHeight);

  return {
    type: "photoRow",
    height: rowHeight,
    photos: candidates.map((candidate) => ({
      photo: candidate.photo,
      width: candidate.aspectRatio * rowHeight,
      height: rowHeight,
    })),
  };
}

function buildJustifiedRows(
  photos: VirtualizedGridPhoto[],
  containerWidth: number,
  targetRowHeight: number
): VirtualRow[] {
  if (containerWidth <= 0) return [];

  const rows: VirtualRow[] = [];
  let candidates: JustifiedPhotoCandidate[] = [];
  let aspectRatioSum = 0;
  const minTileWidth = getMinimumTileWidth(containerWidth);

  for (const photo of photos) {
    const aspectRatio = getPhotoLayoutAspectRatio(photo, containerWidth);
    const nextCandidates = [...candidates, { photo, aspectRatio }];
    const nextAspectRatioSum = aspectRatioSum + aspectRatio;

    const totalGap = ROW_GAP * Math.max(0, nextCandidates.length - 1);
    const rowWidthAtTarget = nextAspectRatioSum * targetRowHeight + totalGap;

    if (
      candidates.length > 0 &&
      rowWidthAtTarget >= containerWidth &&
      rowWouldCompressTiles(nextCandidates, containerWidth, minTileWidth)
    ) {
      rows.push(
        createJustifiedPhotoRow(candidates, containerWidth, targetRowHeight, true)
      );
      candidates = [{ photo, aspectRatio }];
      aspectRatioSum = aspectRatio;
      continue;
    }

    candidates = nextCandidates;
    aspectRatioSum = nextAspectRatioSum;

    if (rowWidthAtTarget >= containerWidth) {
      rows.push(
        createJustifiedPhotoRow(candidates, containerWidth, targetRowHeight, true)
      );
      candidates = [];
      aspectRatioSum = 0;
    }
  }

  if (candidates.length > 0) {
    rows.push(
      createJustifiedPhotoRow(candidates, containerWidth, targetRowHeight, true)
    );
  }

  return rows;
}

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

    return { id: dateKey, title: displayDate, photos: groupPhotos };
  });
}

function flattenToVirtualRows(
  groups: PhotoGroup[],
  containerWidth: number,
  targetRowHeight: number
): VirtualRow[] {
  const rows: VirtualRow[] = [];

  for (const group of groups) {
    rows.push({
      type: "header",
      id: group.id,
      title: group.title,
      photoCount: group.photos.length,
    });

    rows.push(...buildJustifiedRows(group.photos, containerWidth, targetRowHeight));
  }

  return rows;
}

function flattenToVirtualRowsFlat(
  photos: VirtualizedGridPhoto[],
  containerWidth: number,
  targetRowHeight: number
): VirtualRow[] {
  return buildJustifiedRows(photos, containerWidth, targetRowHeight);
}

export function VirtualizedPhotoGrid({
  photos,
  albumId,
  onPhotoDeleted,
  dateField = "captured",
  groupByDate = true,
  groups,
  selectionEnabled = true,
  getPhotoAlbumId,
  onPhotoOpen,
  renderSelectionActions,
  selectionToolbarLeft,
  renderPhotoCard,
}: VirtualizedPhotoGridProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useElementWidth(scrollContainerRef);
  const targetRowHeight = useMemo(
    () => getTargetRowHeight(containerWidth),
    [containerWidth]
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const {
    selectedIds,
    isSelectionMode,
    toggleSelection,
    clearSelection,
    isSelected,
  } = usePhotoSelection();

  const photoGroups = useMemo(() => {
    if (groups) {
      return groups.map((group) => ({
        id: group.id,
        title: group.title,
        photos: group.photos,
      }));
    }

    return groupPhotosByDate(photos, dateField);
  }, [groups, photos, dateField]);

  const virtualRows = useMemo(
    () =>
      groups || groupByDate
        ? flattenToVirtualRows(photoGroups, containerWidth, targetRowHeight)
        : flattenToVirtualRowsFlat(photos, containerWidth, targetRowHeight),
    [groups, groupByDate, photoGroups, photos, containerWidth, targetRowHeight]
  );

  const photoIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < photos.length; i++) {
      map.set(photos[i].id, i);
    }
    return map;
  }, [photos]);

  const orderedPhotoIds = useMemo(
    () =>
      groups || groupByDate
        ? photoGroups.flatMap((group) => group.photos.map((photo) => photo.id))
        : photos.map((photo) => photo.id),
    [groups, groupByDate, photoGroups, photos]
  );

  const selectedPhotoIds = useMemo(
    () => Array.from(selectedIds),
    [selectedIds]
  );

  const handleToggleSelection = useCallback(
    (photoId: string, options?: { rangeSelect?: boolean }) => {
      toggleSelection(photoId, {
        ...options,
        orderedPhotoIds,
      });
    },
    [orderedPhotoIds, toggleSelection]
  );

  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const row = virtualRows[index];
      return row.type === "header" ? HEADER_ROW_HEIGHT : row.height;
    },
    overscan: 5,
    gap: VIRTUAL_ROW_GAP,
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
    <div className="relative flex min-h-0 flex-1">
      <div
        ref={scrollContainerRef}
        className="masonry-container flex-1 overflow-auto p-6"
      >
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
                  <div className="flex h-14 items-center gap-3">
                    <h2 className="text-lg font-semibold">
                      {row.title}
                    </h2>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-sm text-muted-foreground">
                      {row.photoCount} photo
                      {row.photoCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                ) : (
                  <div
                    className="flex w-full gap-1 overflow-hidden"
                    style={{ height: row.height }}
                  >
                    {row.photos.map(({ photo, width, height }) => {
                      const globalIndex = photoIndexMap.get(photo.id) ?? 0;
                      const photoStyle = { width, height };
                      return (
                        renderPhotoCard ? (
                          renderPhotoCard({
                            photo,
                            index: globalIndex,
                            onOpenLightbox: openLightbox,
                            isSelected: isSelected(photo.id),
                            isSelectionMode,
                            onToggleSelect: handleToggleSelection,
                            className: "shrink-0",
                            style: photoStyle,
                            fillContainer: true,
                            imageSizes: `${Math.ceil(width)}px`,
                          })
                        ) : (
                          <PhotoCard
                            key={photo.id}
                            photo={photo as Photo}
                            index={globalIndex}
                            onOpenLightbox={openLightbox}
                            isSelected={isSelected(photo.id)}
                            isSelectionMode={isSelectionMode}
                            onToggleSelect={handleToggleSelection}
                            className="shrink-0"
                            style={photoStyle}
                            fillContainer
                            imageSizes={`${Math.ceil(width)}px`}
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
          left={selectionToolbarLeft}
        >
          {renderSelectionActions?.({ selectedPhotoIds, clearSelection })}
        </SelectionToolbar>
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
    </div>
  );
}
