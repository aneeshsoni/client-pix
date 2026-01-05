"use client";

import { use, useMemo } from "react";
import { getAlbum, getAlbumPhotos } from "@/lib/mock-data";
import { PhotoGrid } from "@/components/gallery";
import { Share2, MoreHorizontal, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

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
    <>
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard/gallery">Gallery</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="flex items-center gap-2">
                {album.title}
                {album.isPrivate && (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                )}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {album.photoCount} photos
          </span>
          <button className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Share</span>
          </button>

          <button className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Album description */}
      {album.description && (
        <div className="px-6 pt-4">
          <p className="text-muted-foreground">{album.description}</p>
        </div>
      )}

      {/* Photos grid */}
      <div className="flex-1 overflow-auto p-6">
        <PhotoGrid photos={photos} />
      </div>
    </>
  );
}
