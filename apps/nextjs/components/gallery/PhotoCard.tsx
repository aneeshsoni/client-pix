"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Play } from "lucide-react";
import type { Photo } from "@/lib/api";
import { getSecureImageUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface PhotoCardProps {
  photo: Photo;
  index: number;
  onClick: () => void;
}

export function PhotoCard({ photo, index, onClick }: PhotoCardProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const { token } = useAuth();

  // Get the secure thumbnail URL with auth token
  const thumbnailUrl = getSecureImageUrl(
    photo.id,
    "thumbnail",
    token || undefined
  );

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

        {/* Photo/Video thumbnail */}
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

        {/* Video play icon overlay */}
        {photo.is_video && isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-black/60 p-3 transition-transform group-hover:scale-110">
              <Play className="h-8 w-8 text-white fill-white" />
            </div>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
      </button>
    </motion.div>
  );
}
