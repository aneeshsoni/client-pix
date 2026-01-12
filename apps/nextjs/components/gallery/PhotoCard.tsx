"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Play, Check } from "lucide-react";
import type { Photo } from "@/lib/api";
import { getSecureImageUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface PhotoCardProps {
  photo: Photo;
  index: number;
  onClick: () => void;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  onToggleSelect?: () => void;
}

export function PhotoCard({
  photo,
  index,
  onClick,
  isSelected = false,
  isSelectionMode = false,
  onToggleSelect,
}: PhotoCardProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const { token } = useAuth();

  // Get the secure thumbnail URL with auth token
  const thumbnailUrl = getSecureImageUrl(
    photo.id,
    "thumbnail",
    token || undefined
  );

  const handleClick = (e: React.MouseEvent) => {
    // If in selection mode or shift/cmd clicking, toggle selection
    if (isSelectionMode || e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
      onToggleSelect?.();
    } else {
      onClick();
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.03, 0.5) }}
      className="masonry-item"
    >
      <button
        onClick={handleClick}
        className={`group relative block w-full overflow-hidden bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${
          isSelected
            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
            : ""
        }`}
        style={{ aspectRatio: `${photo.width}/${photo.height}` }}
      >
        {/* Loading skeleton */}
        {!isLoaded && (
          <div className="absolute inset-0 animate-pulse bg-muted" />
        )}

        {/* Photo/Video thumbnail */}
        <Image
          src={thumbnailUrl}
          alt={photo.original_filename}
          fill
          className={`object-cover transition-all duration-300 group-hover:scale-[1.02] ${
            isLoaded ? "opacity-100" : "opacity-0"
          } ${isSelected ? "brightness-90" : ""}`}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          onLoad={() => setIsLoaded(true)}
          unoptimized // Skip Next.js image optimization for external URLs
        />

        {/* Video play icon overlay */}
        {photo.is_video && isLoaded && !isSelected && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-black/60 p-3 transition-transform group-hover:scale-110">
              <Play className="h-8 w-8 text-white fill-white" />
            </div>
          </div>
        )}

        {/* Selection checkbox - visible on hover or when in selection mode or when selected */}
        {onToggleSelect && (
          <div
            onClick={handleCheckboxClick}
            className={`absolute top-2 left-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all cursor-pointer ${
              isSelected
                ? "bg-primary border-primary"
                : "bg-black/40 border-white/70 opacity-0 group-hover:opacity-100"
            } ${isSelectionMode ? "opacity-100" : ""}`}
          >
            {isSelected && (
              <Check className="h-4 w-4 text-white" strokeWidth={3} />
            )}
          </div>
        )}

        {/* Selected overlay */}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/20 pointer-events-none" />
        )}

        {/* Hover overlay */}
        <div
          className={`absolute inset-0 transition-colors ${
            isSelected ? "" : "bg-black/0 group-hover:bg-black/10"
          }`}
        />
      </button>
    </motion.div>
  );
}
