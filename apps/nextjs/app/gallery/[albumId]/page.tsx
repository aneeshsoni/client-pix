"use client";

import { use, useMemo } from "react";
import { getAlbum, getAlbumPhotos } from "@/lib/mock-data";
import { PhotoGrid } from "@/components/gallery";
import { ArrowLeft, Share2, MoreHorizontal, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

interface AlbumPageProps {
  params: Promise<{ albumId: string }>;
}

export default function AlbumPage({ params }: AlbumPageProps) {
  const { albumId } = use(params);
  const album = getAlbum(albumId);
  
  // Generate photos with stable seed based on album ID
  const photos = useMemo(() => getAlbumPhotos(albumId), [albumId]);

  if (!album) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/gallery"
                className="p-2 -ml-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight">
                    {album.title}
                  </h1>
                  {album.isPrivate && (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {album.photoCount} photos
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                <Share2 className="h-4 w-4" />
                <span className="hidden sm:inline">Share</span>
              </button>
              
              <button className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Album description */}
      {album.description && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
          <p className="text-muted-foreground">{album.description}</p>
        </div>
      )}

      {/* Photos grid */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <PhotoGrid photos={photos} />
      </div>
    </main>
  );
}

