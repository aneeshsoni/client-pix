"use client";

import { useState, useCallback } from "react";
import { AlbumCard } from "./AlbumCard";
import { AlbumSettingsModal } from "./AlbumSettingsModal";
import type { Album } from "@/lib/api";

interface AlbumGridProps {
  albums: Album[];
  onAlbumUpdated?: () => void;
  onAlbumDeleted?: () => void;
}

export function AlbumGrid({
  albums,
  onAlbumUpdated,
  onAlbumDeleted,
}: AlbumGridProps) {
  const [settingsAlbum, setSettingsAlbum] = useState<Album | null>(null);

  const handleSettingsClick = useCallback((album: Album) => {
    setSettingsAlbum(album);
  }, []);

  const handleSettingsClose = useCallback((open: boolean) => {
    if (!open) {
      setSettingsAlbum(null);
    }
  }, []);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {albums.map((album, index) => (
          <AlbumCard
            key={album.id}
            album={album}
            index={index}
            onSettingsClick={handleSettingsClick}
          />
        ))}
      </div>

      <AlbumSettingsModal
        album={settingsAlbum}
        open={settingsAlbum !== null}
        onOpenChange={handleSettingsClose}
        onAlbumUpdated={onAlbumUpdated}
        onAlbumDeleted={onAlbumDeleted}
      />
    </>
  );
}
