"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import type { Photo } from "@/lib/api";
import { getImageUrl } from "@/lib/api";

interface PhotoCardProps {
  photo: Photo;
  index: number;
  onClick: () => void;
}

export function PhotoCard({ photo, index, onClick }: PhotoCardProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  // Get the thumbnail URL from the API
  const thumbnailUrl = getImageUrl(photo.thumbnail_path);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.03, 0.5) }}
      className="masonry-item"
    >
      <button
        onClick={onClick}
        className="group relative block w-full overflow-hidden bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
        style={{ aspectRatio: `${photo.width}/${photo.height}` }}
      >
        {/* Loading skeleton */}
        {!isLoaded && (
          <div className="absolute inset-0 animate-pulse bg-muted" />
        )}

        {/* Photo */}
        <Image
          src={thumbnailUrl}
          alt={photo.original_filename}
          fill
          className={`object-cover transition-all duration-300 group-hover:scale-[1.02] ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          onLoad={() => setIsLoaded(true)}
          unoptimized // Skip Next.js image optimization for external URLs
        />

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
      </button>
    </motion.div>
  );
}
