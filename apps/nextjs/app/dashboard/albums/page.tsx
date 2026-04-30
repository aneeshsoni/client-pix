"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, Loader2 } from "lucide-react";
import { AlbumGrid } from "@/components/gallery";
import { GalleryHeader } from "@/components/gallery/GalleryHeader";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useDownloadJob } from "@/hooks/use-download-job";
import { listAlbums, type Album } from "@/lib/api";

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const downloadJob = useDownloadJob();

  const fetchAlbums = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await listAlbums();
      setAlbums(response.albums);
    } catch (err) {
      console.error("Failed to fetch albums:", err);
      setError(err instanceof Error ? err.message : "Failed to load albums");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlbums();
  }, [fetchAlbums]);

  return (
    <>
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Albums</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex items-center gap-3">
          {albums.length > 0 && (
            <button
              onClick={() => {
                if (
                  downloadJob.status === "idle" ||
                  downloadJob.status === "failed"
                ) {
                  downloadJob.startAllAlbumsDownload();
                }
              }}
              disabled={
                downloadJob.status === "preparing" ||
                downloadJob.status === "downloading"
              }
              className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-70"
            >
              {downloadJob.status === "preparing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">
                    {downloadJob.progress > 0
                      ? `Preparing... ${downloadJob.progress}%`
                      : "Preparing..."}
                  </span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download All Albums</span>
                </>
              )}
            </button>
          )}

          <GalleryHeader
            albumCount={albums.length}
            onAlbumCreated={fetchAlbums}
          />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-destructive">{error}</p>
            <button
              onClick={fetchAlbums}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        ) : albums.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">No albums yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Click &quot;New Album&quot; to create your first album
            </p>
          </div>
        ) : (
          <AlbumGrid
            albums={albums}
            onAlbumUpdated={fetchAlbums}
            onAlbumDeleted={fetchAlbums}
          />
        )}
      </div>
    </>
  );
}
