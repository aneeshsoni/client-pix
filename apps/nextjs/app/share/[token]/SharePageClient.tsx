"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import Image from "next/image";
import {
  Lock,
  ImageIcon,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  Calendar,
  Clock,
  Play,
  Pause,
  ArrowUp,
  ArrowDown,
  Upload,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { VirtualizedPhotoGrid } from "@/components/gallery";
import { PhotoSelectionProvider } from "@/hooks/use-photo-selection";
import { getSharedImageUrl, uploadSharePhotos } from "@/lib/api";
import { useDownloadJob } from "@/hooks/use-download-job";
import { toast } from "sonner";

// Empty string = relative URLs (works with any domain)
const API_BASE_URL = "";
const SWIPE_DISTANCE_THRESHOLD = 80;
const SWIPE_VELOCITY_THRESHOLD = 500;

const mediaVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 320 : -320,
    opacity: 0,
    scale: 0.98,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -320 : 320,
    opacity: 0,
    scale: 0.98,
  }),
};

interface SharedPhoto {
  id: string;
  thumbnail_path: string;
  web_path: string;
  width: number;
  height: number;
  original_filename: string;
  captured_at: string | null;
  created_at: string | null;
  is_video: boolean;
  tags: SharedPhotoTag[];
}

interface SharedPhotoTag {
  id: string;
  name: string | null;
  emoji: string | null;
  color: string | null;
  sort_order: number;
}

interface SharedAlbum {
  id: string;
  title: string;
  description: string | null;
  photo_count: number;
  photos: SharedPhoto[];
  tags: SharedPhotoTag[];
  allows_uploads: boolean;
  is_password_protected: boolean;
  requires_password: boolean;
}

interface SharePageClientProps {
  token: string;
}

type PageState = "loading" | "password" | "album" | "error" | "expired";

function shouldContainThumbnailOnMobile(photo: SharedPhoto): boolean {
  if (photo.width <= 0 || photo.height <= 0) return false;

  return photo.width / photo.height < 0.58;
}

function getTagTitle(tag: SharedPhotoTag) {
  return [tag.emoji, tag.name].filter(Boolean).join(" ") || "Color tag";
}

// Photo card component matching the admin view style
function SharedPhotoCard({
  photo,
  index,
  onClick,
  shareToken,
  password,
  className,
  style,
  fillContainer,
  imageSizes,
}: {
  photo: SharedPhoto;
  index: number;
  onClick: () => void;
  shareToken: string;
  password: string | null;
  className?: string;
  style?: CSSProperties;
  fillContainer?: boolean;
  imageSizes?: string;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const imageFitClass = shouldContainThumbnailOnMobile(photo)
    ? "object-contain object-center sm:object-cover"
    : "object-cover object-center";

  // Use secure share URL
  const imageUrl = getSharedImageUrl(
    shareToken,
    photo.id,
    "thumbnail",
    password || undefined,
  );

  return (
    <div
      className={`${className ?? "masonry-item"} animate-fade-in`}
      style={{
        ...style,
        animationDelay: `${Math.min(index * 30, 500)}ms`,
      }}
    >
      <button
        onClick={onClick}
        className={`group relative block w-full overflow-hidden bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${
          fillContainer ? "h-full" : ""
        }`}
        style={
          fillContainer ? undefined : { aspectRatio: `${photo.width}/${photo.height}` }
        }
      >
        {/* Loading skeleton */}
        {!isLoaded && (
          <div className="absolute inset-0 animate-pulse bg-muted" />
        )}

        {/* Photo/Video thumbnail */}
        <Image
          src={imageUrl}
          alt={photo.original_filename}
          fill
          className={`${imageFitClass} transition-[transform,opacity] duration-300 group-hover:scale-[1.02] ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          sizes={
            imageSizes ??
            "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          }
          loading={index < 8 ? "eager" : "lazy"}
          onLoad={() => setIsLoaded(true)}
          unoptimized
        />

        {/* Video play icon overlay */}
        {photo.is_video && isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-black/60 p-3 transition-transform group-hover:scale-110">
              <Play className="h-8 w-8 text-white fill-white" />
            </div>
          </div>
        )}

        {photo.tags.length > 0 && isLoaded && (
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-10 flex flex-wrap gap-1">
            {photo.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[11px] font-medium leading-none text-white"
              >
                {tag.color && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full border border-white/60"
                    style={{ backgroundColor: tag.color }}
                  />
                )}
                {tag.emoji && <span>{tag.emoji}</span>}
                {tag.name && <span className="truncate">{tag.name}</span>}
              </span>
            ))}
            {photo.tags.length > 3 && (
              <span className="rounded-full bg-black/65 px-2 py-1 text-[11px] font-medium leading-none text-white">
                +{photo.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
      </button>
    </div>
  );
}

export default function SharePageClient({ token }: SharePageClientProps) {
  const [state, setState] = useState<PageState>("loading");
  const [album, setAlbum] = useState<SharedAlbum | null>(null);
  const [password, setPassword] = useState("");
  const [verifiedPassword, setVerifiedPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(
    null,
  );
  const [sortBy, setSortBy] = useState<"captured" | "uploaded">("captured");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | undefined>(undefined);
  const [groupByTags, setGroupByTags] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadProgressPercent, setUploadProgressPercent] = useState(0);
  const [uploadDuplicates, setUploadDuplicates] = useState(0);
  const [uploadBytes, setUploadBytes] = useState<{
    loaded: number;
    total: number;
  } | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const downloadJob = useDownloadJob();

  const effectiveDir = sortDir ?? (sortBy === "captured" ? "asc" : "desc");

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
  const selectedPhoto =
    selectedPhotoIndex !== null && album
      ? album.photos[selectedPhotoIndex]
      : null;

  const tagGroups = useMemo(() => {
    if (!album) return [];

    const groups = album.tags
      .map((tag) => ({
        id: tag.id,
        title: getTagTitle(tag),
        photos: album.photos.filter((photo) =>
          photo.tags.some((assigned) => assigned.id === tag.id),
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

  const goToPreviousPhoto = useCallback(() => {
    if (!album || selectedPhotoIndex === null || album.photos.length <= 1) return;

    setSwipeDirection(-1);
    setIsPlaying(false);
    setSelectedPhotoIndex(
      (selectedPhotoIndex - 1 + album.photos.length) % album.photos.length,
    );
  }, [album, selectedPhotoIndex]);

  const goToNextPhoto = useCallback(() => {
    if (!album || selectedPhotoIndex === null || album.photos.length <= 1) return;

    setSwipeDirection(1);
    setIsPlaying(false);
    setSelectedPhotoIndex((selectedPhotoIndex + 1) % album.photos.length);
  }, [album, selectedPhotoIndex]);

  const handleLightboxDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!album || album.photos.length <= 1) return;

      if (
        info.offset.x < -SWIPE_DISTANCE_THRESHOLD ||
        info.velocity.x < -SWIPE_VELOCITY_THRESHOLD
      ) {
        goToNextPhoto();
      } else if (
        info.offset.x > SWIPE_DISTANCE_THRESHOLD ||
        info.velocity.x > SWIPE_VELOCITY_THRESHOLD
      ) {
        goToPreviousPhoto();
      }
    },
    [album, goToNextPhoto, goToPreviousPhoto],
  );

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Build download URL with optional password
  const getDownloadUrl = (photoId: string) => {
    const url = `${API_BASE_URL}/api/share/${token}/download/${photoId}`;
    return verifiedPassword
      ? `${url}?password=${encodeURIComponent(verifiedPassword)}`
      : url;
  };

  const fetchShareInfo = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/share/${token}/info`);

      if (response.status === 404) {
        setError("This share link doesn't exist or has been removed.");
        setState("error");
        return;
      }

      if (response.status === 410) {
        const data = await response.json();
        setError(data.detail || "This share link has expired or been revoked.");
        setState("expired");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch share info");
      }

      const data = await response.json();

      if (data.is_password_protected) {
        setState("password");
      } else {
        // No password required, fetch album directly
        await accessAlbum();
      }
    } catch (err) {
      console.error("Error fetching share info:", err);
      setError("Unable to load share link. Please try again later.");
      setState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const accessAlbum = useCallback(
    async (pwd?: string) => {
      setIsVerifying(true);
      setError(null);

      try {
        const params = new URLSearchParams({ sort_by: sortBy });
        if (sortDir) params.set("sort_dir", sortDir);
        const response = await fetch(
          `${API_BASE_URL}/api/share/${token}/access?${params}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: pwd || null }),
          },
        );

        if (response.status === 401) {
          setError("Incorrect password. Please try again.");
          setIsVerifying(false);
          return;
        }

        if (response.status === 410) {
          const data = await response.json();
          setError(
            data.detail || "This share link has expired or been revoked.",
          );
          setState("expired");
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to access album");
        }

        const data: SharedAlbum = await response.json();

        if (data.requires_password) {
          setState("password");
          setIsVerifying(false);
          return;
        }

        setAlbum(data);
        setState("album");
        // Save the password for download URLs if it was used
        if (pwd) {
          setVerifiedPassword(pwd);
        }
      } catch (err) {
        console.error("Error accessing album:", err);
        setError("Unable to access album. Please try again later.");
        setState("error");
      } finally {
        setIsVerifying(false);
      }
    },
    [token, sortBy, sortDir],
  );

  useEffect(() => {
    fetchShareInfo();
  }, [fetchShareInfo]);

  // Re-fetch when sort parameters change while viewing album
  useEffect(() => {
    if (state === "album") {
      accessAlbum(verifiedPassword || undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (selectedPhotoIndex === null || !album) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          setSelectedPhotoIndex(null);
          setIsPlaying(false);
          break;
        case "ArrowLeft":
          goToPreviousPhoto();
          break;
        case "ArrowRight":
          goToNextPhoto();
          break;
        case " ":
          e.preventDefault();
          if (selectedPhoto && !selectedPhoto.is_video) {
            setIsPlaying((prev) => !prev);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPhotoIndex, album, selectedPhoto, goToNextPhoto, goToPreviousPhoto]);

  // Slideshow auto-advance
  useEffect(() => {
    if (!isPlaying || !album || selectedPhotoIndex === null) return;
    if (selectedPhoto?.is_video) return;

    const timer = setInterval(() => {
      setSwipeDirection(1);
      setSelectedPhotoIndex((prev) =>
        prev !== null ? (prev + 1) % album.photos.length : null,
      );
    }, 5000); // 5 second interval

    return () => clearInterval(timer);
  }, [isPlaying, album, selectedPhotoIndex, selectedPhoto?.is_video]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      accessAlbum(password);
    }
  };

  const handleUploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const selectedFiles = Array.from(files);
      setIsUploading(true);
      setUploadProgress(
        `Preparing ${selectedFiles.length} file${selectedFiles.length > 1 ? "s" : ""}...`,
      );
      setUploadProgressPercent(0);
      setUploadDuplicates(0);
      setUploadBytes(null);
      try {
        const result = await uploadSharePhotos(
          token,
          selectedFiles,
          verifiedPassword || undefined,
          (uploaded, total) => {
            setUploadProgress(`Uploaded ${uploaded}/${total} files`);
          },
          (loaded, total) => {
            if (total > 0) {
              setUploadProgressPercent(Math.round((loaded / total) * 100));
              setUploadBytes({ loaded, total });
            }
          },
          (duplicateCount) => {
            setUploadDuplicates(duplicateCount);
          },
        );

        setUploadProgress("Upload complete! Refreshing...");
        setUploadProgressPercent(100);
        toast.success(
          `Uploaded ${result.uploaded_count} file${result.uploaded_count !== 1 ? "s" : ""}`,
        );

        if (result.duplicate_count > 0) {
          toast.info(
            `${result.duplicate_count} duplicate file${result.duplicate_count !== 1 ? "s were" : " was"} skipped`,
          );
        }

        await accessAlbum(verifiedPassword || undefined);
      } catch (err) {
        console.error("Error uploading shared photos:", err);
        toast.error(
          err instanceof Error ? err.message : "Failed to upload files",
        );
      } finally {
        if (uploadInputRef.current) {
          uploadInputRef.current.value = "";
        }
        setIsUploading(false);
        setUploadProgress("");
        setUploadProgressPercent(0);
        setUploadDuplicates(0);
        setUploadBytes(null);
      }
    },
    [accessAlbum, token, verifiedPassword],
  );

  // Loading state
  if (state === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (state === "error" || state === "expired") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold mb-2">
            {state === "expired" ? "Link Expired" : "Link Not Found"}
          </h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  // Password entry state
  if (state === "password") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-xl font-semibold mb-2">Protected Album</h1>
            <p className="text-muted-foreground">
              Enter the password to view this album
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isVerifying}
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive mt-2">{error}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={!password.trim() || isVerifying}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Verifying...
                </>
              ) : (
                "View Album"
              )}
            </Button>
          </form>
        </motion.div>
      </div>
    );
  }

  // Album view state
  if (state === "album" && album) {
    return (
      <PhotoSelectionProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight sm:text-2xl break-words">
                {album.title}
              </h1>
              {album.description && (
                <p className="text-muted-foreground mt-1 line-clamp-2">
                  {album.description}
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                {album.photo_count} photo{album.photo_count !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="mt-4 flex items-center gap-3 overflow-x-auto pb-1 sm:mt-3 sm:flex-wrap sm:overflow-visible">
              {album.allows_uploads && (
                <>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => handleUploadFiles(e.target.files)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={isUploading}
                    className="rounded-full shrink-0"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        <span>Upload</span>
                      </>
                    )}
                  </Button>
                </>
              )}
              {album.photos.length > 0 && (
                <>
                  <div className="flex items-center gap-1 rounded-full border bg-background p-1">
                    <button
                      onClick={() => handleSortByChange("captured")}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        sortBy === "captured" && !groupByTags
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
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        sortBy === "uploaded" && !groupByTags
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title="Sort by upload date"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Uploaded</span>
                    </button>
                    {album.tags.length > 0 && (
                      <button
                        onClick={handleGroupByTagsChange}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          groupByTags
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        title="Group by tag"
                      >
                        <Tag className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Tag</span>
                      </button>
                    )}
                  </div>
                  {!groupByTags && (
                    <button
                      onClick={toggleSortDir}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      title={effectiveDir === "asc" ? "Oldest first (click to reverse)" : "Newest first (click to reverse)"}
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
              {album.photos.length > 0 && (
                <button
                  onClick={() => {
                    if (downloadJob.status === "idle" || downloadJob.status === "failed") {
                      downloadJob.startShareDownload(token, verifiedPassword || undefined);
                    }
                  }}
                  disabled={downloadJob.status === "preparing" || downloadJob.status === "downloading"}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-70"
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
                      <span className="hidden sm:inline">Download All</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </header>

        {uploadProgress && (
          <div className="mx-6 mt-4 rounded-lg border bg-primary/10 px-4 py-3">
            <div className="mb-2 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {uploadProgress}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {uploadBytes
                    ? `${formatBytes(uploadBytes.loaded)} / ${formatBytes(uploadBytes.total)}`
                    : "Please wait while files are being uploaded..."}
                  {uploadDuplicates > 0 && (
                    <span className="ml-2">
                      ({uploadDuplicates} duplicate
                      {uploadDuplicates !== 1 ? "s" : ""} skipped)
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
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgressPercent}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Photo Grid */}
        <main className="flex-1">
          {album.photos.length === 0 ? (
            <div className="p-6 text-center py-12">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No photos in this album</p>
            </div>
          ) : (
            <VirtualizedPhotoGrid
              photos={album.photos}
              dateField={sortBy}
              groupByDate={!groupByTags}
              groups={groupByTags ? tagGroups : undefined}
              selectionEnabled={false}
              onPhotoOpen={setSelectedPhotoIndex}
              renderPhotoCard={({
                photo,
                index,
                onOpenLightbox,
                className,
                style,
                fillContainer,
                imageSizes,
              }) => (
                <SharedPhotoCard
                  key={photo.id}
                  photo={photo as SharedPhoto}
                  index={index}
                  onClick={() => onOpenLightbox(index)}
                  shareToken={token}
                  password={verifiedPassword}
                  className={className}
                  style={style}
                  fillContainer={fillContainer}
                  imageSizes={imageSizes}
                />
              )}
            />
          )}
        </main>

        {/* Lightbox */}
        <AnimatePresence>
          {selectedPhoto && selectedPhotoIndex !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black flex items-center justify-center"
              onClick={() => {
                setSelectedPhotoIndex(null);
                setIsPlaying(false);
              }}
            >
              {/* Top bar controls */}
              <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between">
                {/* Photo counter */}
                <div className="px-3 py-1.5 rounded-full bg-black/50 text-white/70 text-sm">
                  {selectedPhotoIndex + 1} / {album.photos.length}
                </div>

                {/* Right side buttons */}
                <div className="flex items-center gap-2">
                  {/* Slideshow play/pause button - only for images */}
                  {!selectedPhoto.is_video && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsPlaying((prev) => !prev);
                      }}
                      className={`p-2 rounded-full transition-colors ${
                        isPlaying
                          ? "bg-white/20 text-white"
                          : "bg-black/50 text-white/70 hover:text-white hover:bg-black/70"
                      }`}
                      title={
                        isPlaying
                          ? "Pause slideshow (Space)"
                          : "Play slideshow (Space)"
                      }
                    >
                      {isPlaying ? (
                        <Pause className="h-6 w-6" />
                      ) : (
                        <Play className="h-6 w-6" />
                      )}
                      <span className="sr-only">
                        {isPlaying ? "Pause" : "Play"} slideshow
                      </span>
                    </button>
                  )}

                  {/* Download button */}
                  <a
                    href={getDownloadUrl(selectedPhoto.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.info("Download starting...");
                    }}
                    className="p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors"
                    title="Download"
                  >
                    <Download className="h-6 w-6" />
                    <span className="sr-only">Download</span>
                  </a>

                  {/* Close button */}
                  <button
                    onClick={() => {
                      setSelectedPhotoIndex(null);
                      setIsPlaying(false);
                    }}
                    className="p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors"
                  >
                    <X className="h-6 w-6" />
                    <span className="sr-only">Close</span>
                  </button>
                </div>
              </div>

              {/* Previous button */}
              {album.photos.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    goToPreviousPhoto();
                  }}
                  className="absolute left-4 z-10 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors"
                >
                  <ChevronLeft className="h-8 w-8" />
                  <span className="sr-only">Previous</span>
                </button>
              )}

              {/* Next button */}
              {album.photos.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    goToNextPhoto();
                  }}
                  className="absolute right-4 z-10 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors"
                >
                  <ChevronRight className="h-8 w-8" />
                  <span className="sr-only">Next</span>
                </button>
              )}

              {/* Image or Video */}
              <AnimatePresence initial={false} custom={swipeDirection} mode="popLayout">
                <motion.div
                  key={selectedPhoto.id}
                  custom={swipeDirection}
                  variants={mediaVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "spring", stiffness: 280, damping: 32 },
                    opacity: { duration: 0.2 },
                    scale: { duration: 0.2 },
                  }}
                  drag={album.photos.length > 1 ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.22}
                  onDragEnd={handleLightboxDragEnd}
                  className="flex max-h-[90vh] max-w-[90vw] touch-pan-y cursor-grab select-none items-center justify-center active:cursor-grabbing"
                  onClick={(e) => e.stopPropagation()}
                >
                  {selectedPhoto.is_video ? (
                    <video
                      src={getSharedImageUrl(
                        token,
                        selectedPhoto.id,
                        "web",
                        verifiedPassword || undefined,
                      )}
                      controls
                      autoPlay
                      className="h-auto max-h-[90vh] w-auto max-w-full object-contain"
                      playsInline
                    />
                  ) : (
                    <Image
                      src={getSharedImageUrl(
                        token,
                        selectedPhoto.id,
                        "web",
                        verifiedPassword || undefined,
                      )}
                      alt={selectedPhoto.original_filename}
                      width={selectedPhoto.width}
                      height={selectedPhoto.height}
                      className="h-auto max-h-[90vh] w-auto max-w-full object-contain"
                      draggable={false}
                      unoptimized
                      priority
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </PhotoSelectionProvider>
    );
  }

  return null;
}
