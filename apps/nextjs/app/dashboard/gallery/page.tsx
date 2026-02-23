"use client";

import { useEffect, useState, useCallback } from "react";
import { VirtualizedPhotoGrid } from "@/components/gallery";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getAllPhotos, type Photo, type SortDir } from "@/lib/api";
import { PhotoSelectionProvider } from "@/hooks/use-photo-selection";
import { Loader2, Calendar, Clock, ArrowUp, ArrowDown } from "lucide-react";

export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"captured" | "uploaded">("captured");
  const [sortDir, setSortDir] = useState<SortDir | undefined>(undefined);

  const effectiveDir = sortDir ?? (sortBy === "captured" ? "asc" : "desc");

  const handleSortByChange = (newSortBy: "captured" | "uploaded") => {
    setSortBy(newSortBy);
    setSortDir(undefined);
  };

  const toggleSortDir = () => {
    setSortDir(effectiveDir === "asc" ? "desc" : "asc");
  };

  const fetchPhotos = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getAllPhotos(sortBy, sortDir);
      setPhotos(data);
    } catch (err) {
      console.error("Failed to fetch photos:", err);
      setError(err instanceof Error ? err.message : "Failed to load photos");
    } finally {
      setIsLoading(false);
    }
  }, [sortBy, sortDir]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  return (
    <PhotoSelectionProvider>
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Gallery</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex items-center gap-2">
          {photos.length > 0 && (
            <>
              <div className="flex items-center gap-1 rounded-full border bg-background p-1">
                <button
                  onClick={() => handleSortByChange("captured")}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    sortBy === "captured"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Sort by date taken"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Date Taken</span>
                </button>
                <button
                  onClick={() => handleSortByChange("uploaded")}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    sortBy === "uploaded"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Sort by upload date"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Uploaded</span>
                </button>
              </div>
              <button
                onClick={toggleSortDir}
                className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                title={effectiveDir === "asc" ? "Oldest first (click to reverse)" : "Newest first (click to reverse)"}
              >
                {effectiveDir === "asc" ? (
                  <ArrowUp className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5" />
                )}
              </button>
            </>
          )}
        </div>
      </header>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <p className="text-destructive">{error}</p>
          <button
            onClick={fetchPhotos}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No photos yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload photos to albums to see them here
          </p>
        </div>
      ) : (
        <VirtualizedPhotoGrid
          photos={photos}
          onPhotoDeleted={fetchPhotos}
          dateField={sortBy}
          groupByDate
        />
      )}
    </PhotoSelectionProvider>
  );
}
