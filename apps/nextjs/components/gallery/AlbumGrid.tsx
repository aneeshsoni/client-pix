"use client";

import { AlbumCard } from "./AlbumCard";
import type { Album } from "@/lib/mock-data";

interface AlbumGridProps {
  albums: Album[];
}

export function AlbumGrid({ albums }: AlbumGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
      {albums.map((album, index) => (
        <AlbumCard key={album.id} album={album} index={index} />
      ))}
    </div>
  );
}

