"use client";

import { useState, useCallback, useMemo } from "react";
import { PhotoCard } from "./PhotoCard";
import { Lightbox } from "./Lightbox";
import { SelectionToolbar } from "./SelectionToolbar";
import { usePhotoSelection } from "@/hooks/use-photo-selection";
import { bulkDeletePhotos, bulkDownloadPhotos } from "@/lib/api";
import type { Photo } from "@/lib/api";

interface PhotoGridWithDatesProps {
  photos: Photo[];
  albumId?: string;
  onPhotoDeleted?: (photoId: string) => void;
}

interface PhotoGroup {
  date: string;
  displayDate: string;
  photos: Photo[];
}

function groupPhotosByDate(photos: Photo[]): PhotoGroup[] {
  const groups: Map<string, Photo[]> = new Map();

  photos.forEach((photo) => {
    const date = photo.captured_at || photo.created_at;
    const d = new Date(date);
    // Use local date components to avoid timezone shifts
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(photo);
  });

  // Convert to array and format display dates
  return Array.from(groups.entries()).map(([dateKey, photos]) => {
    // Parse as local date (add time to avoid timezone issues)
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const displayDate = date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return { date: dateKey, displayDate, photos };
  });
}

export function PhotoGridWithDates({
  photos,
  albumId,
  onPhotoDeleted,
}: PhotoGridWithDatesProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const {
    selectedIds,
    isSelectionMode,
    toggleSelection,
    clearSelection,
    isSelected,
  } = usePhotoSelection();

  const photoGroups = useMemo(() => groupPhotosByDate(photos), [photos]);

  const openLightbox = useCallback(
    (index: number) => {
      // Don't open lightbox if in selection mode
      if (!isSelectionMode) {
        setLightboxIndex(index);
      }
    },
    [isSelectionMode]
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

  // Get the albumId for selected photos (needed for bulk operations)
  const getAlbumIdForSelection = useCallback(() => {
    if (albumId) return albumId;
    // If no albumId is provided, get it from the first selected photo
    const firstSelectedPhoto = photos.find((p) => selectedIds.has(p.id));
    return firstSelectedPhoto?.album_id;
  }, [albumId, photos, selectedIds]);

  const handleBulkDownload = async () => {
    const targetAlbumId = getAlbumIdForSelection();
    if (!targetAlbumId) return;

    const photoIds = Array.from(selectedIds);
    const blob = await bulkDownloadPhotos(targetAlbumId, photoIds);

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "photos.zip";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    clearSelection();
  };

  const handleBulkDelete = async () => {
    const targetAlbumId = getAlbumIdForSelection();
    if (!targetAlbumId) return;

    const photoIds = Array.from(selectedIds);
    await bulkDeletePhotos(targetAlbumId, photoIds);

    // Notify parent about deletions
    for (const photoId of photoIds) {
      onPhotoDeleted?.(photoId);
    }

    clearSelection();
  };

  return (
    <>
      <div className="space-y-8">
        {photoGroups.map((group) => (
          <div key={group.date}>
            {/* Date Header */}
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-lg font-semibold">{group.displayDate}</h2>
              <div className="flex-1 h-px bg-border" />
              <span className="text-sm text-muted-foreground">
                {group.photos.length} photo
                {group.photos.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Photo Grid */}
            <div className="masonry">
              {group.photos.map((photo) => {
                const globalIndex = photos.findIndex((p) => p.id === photo.id);
                return (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    index={globalIndex}
                    onClick={() => openLightbox(globalIndex)}
                    isSelected={isSelected(photo.id)}
                    isSelectionMode={isSelectionMode}
                    onToggleSelect={() => toggleSelection(photo.id)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Selection Toolbar */}
      <SelectionToolbar
        selectedCount={selectedIds.size}
        onClearSelection={clearSelection}
        onDownload={handleBulkDownload}
        onDelete={handleBulkDelete}
      />

      {lightboxIndex !== null && photos[lightboxIndex] && (
        <Lightbox
          photo={photos[lightboxIndex]}
          albumId={albumId || photos[lightboxIndex].album_id}
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
