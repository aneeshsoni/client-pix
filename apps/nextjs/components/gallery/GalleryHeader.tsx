"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { NewAlbumModal } from "./NewAlbumModal";

interface GalleryHeaderProps {
  albumCount: number;
  onAlbumCreated?: () => void;
}

export function GalleryHeader({
  albumCount,
  onAlbumCreated,
}: GalleryHeaderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="ml-auto flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          {albumCount} album{albumCount !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Album</span>
        </button>
      </div>

      <NewAlbumModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onAlbumCreated={onAlbumCreated}
      />
    </>
  );
}
