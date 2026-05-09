"use client";

import { useState, useCallback, useMemo } from "react";
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

interface PhotoGridProps {
  photos: Photo[];
  albumId?: string; // Optional, will use photo.album_id if not provided
  onPhotoDeleted?: (photoId: string) => void; // Callback when a photo is deleted
}

export function PhotoGrid({ photos, albumId, onPhotoDeleted }: PhotoGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const {
    selectedIds,
    isSelectionMode,
    toggleSelection,
    clearSelection,
    isSelected,
  } = usePhotoSelection();
  const orderedPhotoIds = useMemo(
    () => photos.map((photo) => photo.id),
    [photos]
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
      // Adjust lightbox index after deletion
      if (lightboxIndex !== null) {
        const deletedIndex = photos.findIndex((p) => p.id === photoId);
        if (deletedIndex !== -1) {
          if (photos.length === 1) {
            // Last photo, close lightbox
            setLightboxIndex(null);
          } else if (deletedIndex <= lightboxIndex) {
            // Deleted photo was before or at current index
            setLightboxIndex(Math.max(0, lightboxIndex - 1));
          }
        }
      }
      // Notify parent
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

    // Notify parent about deletions
    for (const photoId of photoIds) {
      onPhotoDeleted?.(photoId);
    }

    clearSelection();
  };

  return (
    <>
      <div className="masonry">
        {photos.map((photo, index) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            index={index}
            onOpenLightbox={openLightbox}
            isSelected={isSelected(photo.id)}
            isSelectionMode={isSelectionMode}
            onToggleSelect={handleToggleSelection}
          />
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
