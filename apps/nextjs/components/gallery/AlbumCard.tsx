"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Lock, Images } from "lucide-react";
import type { Album } from "@/lib/mock-data";

interface AlbumCardProps {
  album: Album;
  index: number;
}

export function AlbumCard({ album, index }: AlbumCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Link href={`/gallery/${album.id}`} className="group block">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
          {/* Cover image */}
          <Image
            src={album.coverPhoto}
            alt={album.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
          
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-80 transition-opacity group-hover:opacity-90" />
          
          {/* Photo count badge */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-white">
            <Images className="h-3.5 w-3.5" />
            {album.photoCount}
          </div>
          
          {/* Private badge */}
          {album.isPrivate && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-white">
              <Lock className="h-3 w-3" />
              Private
            </div>
          )}
          
          {/* Title and description */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="text-lg font-semibold text-white tracking-tight">
              {album.title}
            </h3>
            {album.description && (
              <p className="mt-1 text-sm text-white/70 line-clamp-1">
                {album.description}
              </p>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

