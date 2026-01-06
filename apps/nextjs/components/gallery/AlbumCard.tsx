"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ImageIcon, Settings } from "lucide-react";
import type { Album } from "@/lib/api";
import { getImageUrl } from "@/lib/api";

interface AlbumCardProps {
  album: Album;
  index: number;
  onSettingsClick?: (album: Album) => void;
}

function formatAlbumDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function AlbumCard({ album, index, onSettingsClick }: AlbumCardProps) {
  const hasCover = album.cover_photo_thumbnail !== null;
  const coverUrl = hasCover ? getImageUrl(album.cover_photo_thumbnail!) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.08,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className="group relative"
    >
      <Link href={`/dashboard/albums/${album.slug}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
          {hasCover && coverUrl ? (
            <>
              {/* Cover image */}
              <Image
                src={coverUrl}
                alt={album.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                unoptimized
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 transition-opacity group-hover:opacity-90" />
            </>
          ) : (
            /* Empty state with icon */
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
              <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
              <span className="mt-2 text-xs text-muted-foreground/50">
                {album.photo_count === 0
                  ? "No photos"
                  : `${album.photo_count} photos`}
              </span>
            </div>
          )}

          {/* Title and metadata - always shown at bottom */}
          <div
            className={`absolute bottom-0 left-0 right-0 p-4 ${
              hasCover ? "" : "bg-gradient-to-t from-black/60 to-transparent"
            }`}
          >
            <h3
              className={`text-lg font-semibold tracking-tight ${
                hasCover ? "text-white" : "text-foreground"
              }`}
            >
              {album.title}
            </h3>
            <div
              className={`mt-1 flex items-center gap-2 text-sm ${
                hasCover ? "text-white/70" : "text-muted-foreground"
              }`}
            >
              <span>
                {album.photo_count} item{album.photo_count !== 1 ? "s" : ""}
              </span>
              <span
                className={
                  hasCover ? "text-white/40" : "text-muted-foreground/40"
                }
              >
                •
              </span>
              <span>{formatAlbumDate(album.created_at)}</span>
            </div>
          </div>
        </div>
      </Link>

      {/* Settings button */}
      {onSettingsClick && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSettingsClick(album);
          }}
          className="absolute top-3 right-3 p-2 rounded-full bg-black/40 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-black/60 hover:text-white transition-all backdrop-blur-sm"
          title="Album settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      )}
    </motion.div>
  );
}
