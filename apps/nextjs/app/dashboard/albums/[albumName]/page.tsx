"use client";

import { use, useEffect, useState, useCallback } from "react";
import { PhotoGrid, ShareModal, AlbumSettingsModal } from "@/components/gallery";
import { Share2, Settings, Upload, Loader2 } from "lucide-react";
import { notFound, useRouter } from "next/navigation";
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
import {
  getAlbumBySlug,
  uploadPhotosToAlbum,
  type AlbumDetail,
} from "@/lib/api";

interface AlbumPageProps {
  params: Promise<{ albumName: string }>;
}

export default function AlbumPage({ params }: AlbumPageProps) {
  const { albumName } = use(params);
  const router = useRouter();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const fetchAlbum = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getAlbumBySlug(albumName);
      setAlbum(data);
    } catch (err) {
      console.error("Failed to fetch album:", err);
      setError(err instanceof Error ? err.message : "Failed to load album");
    } finally {
      setIsLoading(false);
    }
  }, [albumName]);

  useEffect(() => {
    fetchAlbum();
  }, [fetchAlbum]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0 || !album) return;

      setIsUploading(true);
      try {
        await uploadPhotosToAlbum(album.id, Array.from(files));
        await fetchAlbum(); // Refresh album data
      } catch (err) {
        console.error("Failed to upload photos:", err);
      } finally {
        setIsUploading(false);
        // Reset input
        e.target.value = "";
      }
    },
    [album, fetchAlbum]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !album) {
    return notFound();
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
              <BreadcrumbLink href="/dashboard/albums">Albums</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="flex items-center gap-2">
                {album.title}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {album.photo_count} photo{album.photo_count !== 1 ? "s" : ""}
          </span>

          {/* Upload more photos */}
          <label className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors cursor-pointer">
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isUploading ? "Uploading..." : "Add Photos"}
            </span>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isUploading}
            />
          </label>

          <button
            onClick={() => setShareModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Share</span>
          </button>

          <button
            onClick={() => setSettingsModalOpen(true)}
            className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Album settings"
          >
            <Settings className="h-5 w-5" />
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
        {album.photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">No photos in this album yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Click &quot;Add Photos&quot; to upload photos
            </p>
          </div>
        ) : (
          <PhotoGrid
            photos={album.photos}
            albumId={album.id}
            onPhotoDeleted={fetchAlbum}
          />
        )}
      </div>

      {/* Share Modal */}
      {album && (
        <ShareModal
          albumId={album.id}
          open={shareModalOpen}
          onOpenChange={setShareModalOpen}
        />
      )}

      {/* Album Settings Modal */}
      {album && (
        <AlbumSettingsModal
          album={{
            id: album.id,
            title: album.title,
            description: album.description,
            slug: album.slug,
            cover_photo_id: album.cover_photo_id,
            cover_photo_thumbnail: null, // Not needed for settings modal
            photo_count: album.photo_count,
            created_at: album.created_at,
            updated_at: album.updated_at,
          }}
          open={settingsModalOpen}
          onOpenChange={setSettingsModalOpen}
          onAlbumUpdated={fetchAlbum}
          onAlbumDeleted={() => {
            router.push("/dashboard/albums");
          }}
        />
      )}
    </>
  );
}
