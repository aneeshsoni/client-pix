"use client";

import { useState, useCallback } from "react";
import { PhotoCard } from "./PhotoCard";
import { Lightbox } from "./Lightbox";
import type { Photo } from "@/lib/api";

interface PhotoGridProps {
  photos: Photo[];
  albumId?: string; // Optional, will use photo.album_id if not provided
}

export function PhotoGrid({ photos, albumId }: PhotoGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

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

  return (
    <>
      <div className="masonry">
        {photos.map((photo, index) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            index={index}
            onClick={() => openLightbox(index)}
          />
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          photo={photos[lightboxIndex]}
          albumId={albumId || photos[lightboxIndex].album_id}
          currentIndex={lightboxIndex}
          totalCount={photos.length}
          onClose={closeLightbox}
          onNext={goToNext}
          onPrev={goToPrev}
        />
      )}
    </>
  );
}
