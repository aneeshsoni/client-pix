"use client";

import { use, useEffect, useState, useCallback, useMemo } from "react";
import {
  VirtualizedPhotoGrid,
  ShareModal,
  AlbumSettingsModal,
  AlbumTagManagerModal,
  PhotoCard,
} from "@/components/gallery";
import {
  Share2,
  Settings,
  Upload,
  Loader2,
  Calendar,
  Clock,
  Download,
  ArrowUp,
  ArrowDown,
  Tag,
} from "lucide-react";
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
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  getAlbumBySlug,
  uploadPhotosToAlbum,
  updatePhotoTags,
  type AlbumDetail,
  type Photo,
  type PhotoTag,
  type SortDir,
} from "@/lib/api";
import { useDownloadJob } from "@/hooks/use-download-job";
import {
  PhotoSelectionProvider,
  usePhotoSelection,
} from "@/hooks/use-photo-selection";

interface AlbumPageProps {
  params: Promise<{ albumName: string }>;
}

function getTagTitle(tag: PhotoTag) {
  return [tag.emoji, tag.name].filter(Boolean).join(" ") || "Color tag";
}

function SelectionTagAction({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onOpen}
      className="h-9 w-9 gap-2 px-0 sm:w-auto sm:px-3"
      aria-label="Tag selected"
    >
      <Tag className="h-4 w-4" />
      <span className="hidden sm:inline">Tag</span>
    </Button>
  );
}

function AlbumTagManagerWithSelection({
  album,
  open,
  onOpenChange,
  onTagsChanged,
  onApplyTag,
  onApplyTags,
}: {
  album: AlbumDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTagsChanged: () => Promise<void> | void;
  onApplyTag: (photoIds: string[], tag: PhotoTag) => Promise<void>;
  onApplyTags: (photoIds: string[], tags: PhotoTag[]) => Promise<void>;
}) {
  const { selectedIds } = usePhotoSelection();
  const selectedPhotoIds = useMemo(() => Array.from(selectedIds), [selectedIds]);

  return (
    <AlbumTagManagerModal
      albumId={album.id}
      tags={album.tags}
      open={open}
      onOpenChange={onOpenChange}
      onTagsChanged={onTagsChanged}
      selectedPhotoIds={selectedPhotoIds}
      onTagCreated={(tag) => onApplyTag(selectedPhotoIds, tag)}
      onTagsSelected={(tags) => onApplyTags(selectedPhotoIds, tags)}
    />
  );
}

export default function AlbumPage({ params }: AlbumPageProps) {
  const { albumName } = use(params);
  const router = useRouter();
  const { state: sidebarState, isMobile } = useSidebar();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [groupByTags, setGroupByTags] = useState(false);
  const [sortBy, setSortBy] = useState<"captured" | "uploaded">("captured");
  const [sortDir, setSortDir] = useState<SortDir | undefined>(undefined);
  const downloadJob = useDownloadJob();

  const effectiveDir = sortDir ?? (sortBy === "captured" ? "asc" : "desc");
  const selectionToolbarLeft = isMobile
    ? "50%"
    : sidebarState === "collapsed"
      ? "calc((100vw + 3rem) / 2)"
      : "calc((100vw + 16rem) / 2)";

  const handleSortByChange = (newSortBy: "captured" | "uploaded") => {
    setSortBy(newSortBy);
    setSortDir(undefined);
    setGroupByTags(false);
  };

  const handleGroupByTagsChange = () => {
    setGroupByTags(true);
  };

  const toggleSortDir = () => {
    setSortDir(effectiveDir === "asc" ? "desc" : "asc");
  };

  const fetchAlbum = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true;
    try {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);
      const data = await getAlbumBySlug(albumName, sortBy, sortDir);
      setAlbum(data);
    } catch (err) {
      console.error("Failed to fetch album:", err);
      setError(err instanceof Error ? err.message : "Failed to load album");
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [albumName, sortBy, sortDir]);

  useEffect(() => {
    fetchAlbum();
  }, [fetchAlbum]);

  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [uploadProgressPercent, setUploadProgressPercent] = useState<number>(0);
  const [uploadDuplicates, setUploadDuplicates] = useState<number>(0);
  const [uploadBytes, setUploadBytes] = useState<{
    loaded: number;
    total: number;
  } | null>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0 || !album) return;

      setIsUploading(true);
      setUploadProgress(
        `Preparing ${files.length} file${files.length > 1 ? "s" : ""}...`
      );
      setUploadProgressPercent(0);
      setUploadDuplicates(0);
      setUploadBytes(null);

      try {
        await uploadPhotosToAlbum(
          album.id,
          Array.from(files),
          (uploaded, total) => {
            // Batch progress (files completed)
            setUploadProgress(`Uploaded ${uploaded}/${total} files`);
          },
          (loaded, total) => {
            // Real-time byte progress
            const percent = Math.round((loaded / total) * 100);
            setUploadProgressPercent(percent);
            setUploadBytes({ loaded, total });
          },
          (duplicateCount) => {
            setUploadDuplicates(duplicateCount);
          }
        );
        setUploadProgress("Upload complete! Refreshing...");
        setUploadProgressPercent(100);
        await fetchAlbum(); // Refresh album data
        setUploadProgress("");
        setUploadProgressPercent(0);
        setUploadDuplicates(0);
        setUploadBytes(null);
      } catch (err) {
        console.error("Failed to upload photos:", err);
        setUploadProgress(
          `Error: ${err instanceof Error ? err.message : "Upload failed"}`
        );
        setUploadProgressPercent(0);
        setUploadBytes(null);
      } finally {
        setIsUploading(false);
        // Reset input
        e.target.value = "";
      }
    },
    [album, fetchAlbum]
  );

  const handlePhotoTagsChange = useCallback(
    async (photoId: string, tagIds: string[]) => {
      if (!album) return;

      const updatedPhoto = await updatePhotoTags(album.id, photoId, tagIds);
      setAlbum((current) => {
        if (!current) return current;

        return {
          ...current,
          photos: current.photos.map((photo) =>
            photo.id === photoId ? updatedPhoto : photo
          ),
        };
      });
    },
    [album]
  );

  const handleBulkApplyTags = useCallback(
    async (photoIds: string[], tags: PhotoTag[]) => {
      if (!album) return;

      const selectedPhotos = album.photos.filter((photo) =>
        photoIds.includes(photo.id)
      );
      const tagsById = new Map(tags.map((tag) => [tag.id, tag]));

      const updatedPhotos = await Promise.all(
        selectedPhotos.map((photo) => {
          const tagIds = new Set(photo.tags.map((assigned) => assigned.id));
          for (const tag of tags) {
            tagIds.add(tag.id);
          }
          return updatePhotoTags(album.id, photo.id, Array.from(tagIds));
        })
      );
      const updatedPhotoMap = new Map(
        updatedPhotos.map((photo) => [photo.id, photo])
      );

      setAlbum((current) => {
        if (!current) return current;

        const existingTagIds = new Set(current.tags.map((tag) => tag.id));
        const tagsToAdd = Array.from(tagsById.values()).filter(
          (tag) => !existingTagIds.has(tag.id)
        );
        return {
          ...current,
          tags: tagsToAdd.length
            ? [...current.tags, ...tagsToAdd]
            : current.tags,
          photos: current.photos.map(
            (photo) => updatedPhotoMap.get(photo.id) || photo
          ),
        };
      });
    },
    [album]
  );

  const handleBulkApplyTag = useCallback(
    async (photoIds: string[], tag: PhotoTag) => {
      await handleBulkApplyTags(photoIds, [tag]);
    },
    [handleBulkApplyTags]
  );

  const tagGroups = useMemo(() => {
    if (!album) return [];

    const groups = album.tags
      .map((tag) => ({
        id: tag.id,
        title: getTagTitle(tag),
        photos: album.photos.filter((photo) =>
          photo.tags.some((assigned) => assigned.id === tag.id)
        ),
      }))
      .filter((group) => group.photos.length > 0);

    const untagged = album.photos.filter((photo) => photo.tags.length === 0);
    if (untagged.length > 0) {
      groups.push({
        id: "untagged",
        title: "Untagged",
        photos: untagged,
      });
    }

    return groups;
  }, [album]);

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
    <PhotoSelectionProvider>
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        {/* Row 1: Title bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />

          {/* Desktop: full breadcrumb */}
          <Breadcrumb className="hidden sm:flex">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/dashboard/albums">Albums</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{album.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Mobile: just album title */}
          <h1 className="sm:hidden text-base font-semibold truncate">
            {album.title}
          </h1>

          <span className="ml-auto text-sm text-muted-foreground">
            {album.photo_count} photo{album.photo_count !== 1 ? "s" : ""}
          </span>
        </header>

        {/* Row 2: Action toolbar */}
        <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto">
          {album.photo_count > 0 && (
            <>
              <div className="flex shrink-0 items-center gap-1 rounded-full border bg-background p-1">
                <button
                  onClick={() => handleSortByChange("captured")}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    sortBy === "captured" && !groupByTags
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Sort by date taken"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="hidden whitespace-nowrap sm:inline">Date Taken</span>
                </button>
                <button
                  onClick={() => handleSortByChange("uploaded")}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    sortBy === "uploaded" && !groupByTags
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Sort by upload date"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span className="hidden whitespace-nowrap sm:inline">Uploaded</span>
                </button>
                <button
                  onClick={handleGroupByTagsChange}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    groupByTags
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Group by tag"
                >
                  <Tag className="h-3.5 w-3.5" />
                  <span className="hidden whitespace-nowrap sm:inline">Tag</span>
                </button>
              </div>
              {!groupByTags && (
                <button
                  onClick={toggleSortDir}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  title={
                    effectiveDir === "asc"
                      ? "Oldest first (click to reverse)"
                      : "Newest first (click to reverse)"
                  }
                >
                  {effectiveDir === "asc" ? (
                    <ArrowUp className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <label
              className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors xl:px-4"
              title="Add media"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span className="hidden whitespace-nowrap xl:inline">
                {isUploading ? "Uploading..." : "Add Media"}
              </span>
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
            </label>

            {/* Download All button */}
            {album.photo_count > 0 && (
              <button
                onClick={() => {
                  if (downloadJob.status === "idle" || downloadJob.status === "failed") {
                    downloadJob.startDownload(album.id);
                  }
                }}
                disabled={downloadJob.status === "preparing" || downloadJob.status === "downloading"}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-70 xl:px-4"
                title="Download all"
              >
                {downloadJob.status === "preparing" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="hidden whitespace-nowrap xl:inline">
                      {downloadJob.progress > 0
                        ? `Preparing... ${downloadJob.progress}%`
                        : "Preparing..."}
                    </span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    <span className="hidden whitespace-nowrap xl:inline">Download All</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => setShareModalOpen(true)}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors xl:px-4"
              title="Share"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden whitespace-nowrap xl:inline">Share</span>
            </button>

            <button
              onClick={() => setSettingsModalOpen(true)}
              className="shrink-0 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Album settings"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Upload Progress Banner */}
      {uploadProgress && (
        <div className="mx-6 mt-4 rounded-lg border bg-primary/10 px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                {uploadProgress}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {uploadBytes
                  ? `${formatBytes(uploadBytes.loaded)} / ${formatBytes(
                      uploadBytes.total
                    )}`
                  : "Please wait while files are being uploaded..."}
                {uploadDuplicates > 0 && (
                  <span className="ml-2">
                    ({uploadDuplicates} duplicate{uploadDuplicates !== 1 ? "s" : ""} skipped)
                  </span>
                )}
              </p>
            </div>
            {uploadProgressPercent > 0 && (
              <span className="text-sm font-semibold text-primary">
                {uploadProgressPercent}%
              </span>
            )}
          </div>
          {uploadProgressPercent > 0 && (
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${uploadProgressPercent}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Album description */}
      {album.description && !uploadProgress && (
        <div className="px-6 pt-4">
          <p className="text-muted-foreground">{album.description}</p>
        </div>
      )}

      {/* Photos grid */}
      {album.photos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No photos in this album yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click &quot;Add Photos&quot; to upload photos
          </p>
        </div>
      ) : (
        <VirtualizedPhotoGrid
          photos={album.photos}
          albumId={album.id}
          onPhotoDeleted={() => fetchAlbum()}
          dateField={sortBy}
          groupByDate={!groupByTags}
          groups={groupByTags ? tagGroups : undefined}
          selectionToolbarLeft={selectionToolbarLeft}
          renderSelectionActions={() => (
            <SelectionTagAction onOpen={() => setTagManagerOpen(true)} />
          )}
          renderPhotoCard={({
            photo,
            index,
            onOpenLightbox,
            isSelected,
            isSelectionMode,
            onToggleSelect,
          }) => (
            <PhotoCard
              key={photo.id}
              photo={photo as Photo}
              index={index}
              onOpenLightbox={onOpenLightbox}
              isSelected={isSelected}
              isSelectionMode={isSelectionMode}
              onToggleSelect={onToggleSelect}
              availableTags={album.tags}
              onTagsChange={handlePhotoTagsChange}
            />
          )}
        />
      )}

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
            cover_photo_position_x: album.cover_photo_position_x,
            cover_photo_position_y: album.cover_photo_position_y,
            photo_count: album.photo_count,
            share_status: album.share_status ?? null,
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

      {album && (
        <AlbumTagManagerWithSelection
          album={album}
          open={tagManagerOpen}
          onOpenChange={setTagManagerOpen}
          onTagsChanged={() => fetchAlbum({ showLoading: false })}
          onApplyTag={handleBulkApplyTag}
          onApplyTags={handleBulkApplyTags}
        />
      )}
    </PhotoSelectionProvider>
  );
}
