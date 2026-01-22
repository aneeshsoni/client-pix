"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { getSharedImageUrl } from "@/lib/api";
import { toast } from "sonner";

// Empty string = relative URLs (works with any domain)
const API_BASE_URL = "";

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
}

interface SharedAlbum {
  id: string;
  title: string;
  description: string | null;
  photo_count: number;
  photos: SharedPhoto[];
  is_password_protected: boolean;
  requires_password: boolean;
}

interface SharePageClientProps {
  token: string;
}

type PageState = "loading" | "password" | "album" | "error" | "expired";

interface PhotoGroup {
  date: string;
  displayDate: string;
  photos: SharedPhoto[];
}

function groupPhotosByDate(photos: SharedPhoto[]): PhotoGroup[] {
  const groups: Map<string, SharedPhoto[]> = new Map();

  photos.forEach((photo) => {
    const date = photo.captured_at || photo.created_at || "";
    const d = new Date(date);
    // Use local date components to avoid timezone shifts
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(photo);
  });

  // Convert to array and format display dates
  return Array.from(groups.entries()).map(([dateKey, photos]) => {
    // Parse as local date (add time to avoid timezone issues)
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const displayDate = date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return { date: dateKey, displayDate, photos };
  });
}

// Photo card component matching the admin view style
function SharedPhotoCard({
  photo,
  index,
  onClick,
  shareToken,
  password,
}: {
  photo: SharedPhoto;
  index: number;
  onClick: () => void;
  shareToken: string;
  password: string | null;
}) {
  const [isLoaded, setIsLoaded] = useState(false);

  // Use secure share URL
  const imageUrl = getSharedImageUrl(
    shareToken,
    photo.id,
    "thumbnail",
    password || undefined
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.03, 0.5) }}
      className="masonry-item"
    >
      <button
        onClick={onClick}
        className="group relative block w-full overflow-hidden bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
        style={{ aspectRatio: `${photo.width}/${photo.height}` }}
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
          className={`object-cover transition-all duration-300 group-hover:scale-[1.02] ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
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

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
      </button>
    </motion.div>
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
    null
  );
  const [sortBy, setSortBy] = useState<"captured" | "uploaded">("captured");
  const [isPlaying, setIsPlaying] = useState(false);
  const selectedPhoto =
    selectedPhotoIndex !== null && album
      ? album.photos[selectedPhotoIndex]
      : null;

  // Build download URL with optional password
  const getDownloadUrl = (photoId: string) => {
    const url = `${API_BASE_URL}/api/share/${token}/download/${photoId}`;
    return verifiedPassword
      ? `${url}?password=${encodeURIComponent(verifiedPassword)}`
      : url;
  };

  const getDownloadAllUrl = () => {
    const url = `${API_BASE_URL}/api/share/${token}/download-all`;
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
  }, [token]);

  const accessAlbum = useCallback(
    async (pwd?: string) => {
      setIsVerifying(true);
      setError(null);

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/share/${token}/access?sort_by=${encodeURIComponent(
            sortBy
          )}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: pwd || null }),
          }
        );

        if (response.status === 401) {
          setError("Incorrect password. Please try again.");
          setIsVerifying(false);
          return;
        }

        if (response.status === 410) {
          const data = await response.json();
          setError(
            data.detail || "This share link has expired or been revoked."
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
    [token, sortBy]
  );

  useEffect(() => {
    fetchShareInfo();
  }, [fetchShareInfo]);

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
          setIsPlaying(false);
          setSelectedPhotoIndex(
            (selectedPhotoIndex - 1 + album.photos.length) % album.photos.length
          );
          break;
        case "ArrowRight":
          setIsPlaying(false);
          setSelectedPhotoIndex((selectedPhotoIndex + 1) % album.photos.length);
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
  }, [selectedPhotoIndex, album, selectedPhoto]);

  // Slideshow auto-advance
  useEffect(() => {
    if (!isPlaying || !album || selectedPhotoIndex === null) return;
    if (selectedPhoto?.is_video) return;

    const timer = setInterval(() => {
      setSelectedPhotoIndex((prev) =>
        prev !== null ? (prev + 1) % album.photos.length : null
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
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
          <div className="container mx-auto px-4 py-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold truncate">{album.title}</h1>
              {album.description && (
                <p className="text-muted-foreground mt-1 line-clamp-2">
                  {album.description}
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                {album.photo_count} photo{album.photo_count !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {album.photos.length > 0 && (
                <div className="flex items-center gap-1 rounded-full border bg-background p-1">
                  <button
                    onClick={() => setSortBy("captured")}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      sortBy === "captured"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Sort by date taken (oldest first)"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Date Taken</span>
                  </button>
                  <button
                    onClick={() => setSortBy("uploaded")}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      sortBy === "uploaded"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Sort by upload date (newest first)"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Uploaded</span>
                  </button>
                </div>
              )}
              {album.photos.length > 0 && (
                <a
                  href={getDownloadAllUrl()}
                  onClick={() => toast.info("Download starting...")}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download All</span>
                </a>
              )}
            </div>
          </div>
        </header>

        {/* Photo Grid */}
        <main className="p-6">
          {album.photos.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No photos in this album</p>
            </div>
          ) : sortBy === "captured" ? (
            <div className="space-y-8">
              {groupPhotosByDate(album.photos).map((group) => (
                <div key={group.date}>
                  {/* Date Header */}
                  <div className="mb-4 flex items-center gap-3">
                    <h2 className="text-lg font-semibold">
                      {group.displayDate}
                    </h2>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-sm text-muted-foreground">
                      {group.photos.length} photo
                      {group.photos.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Photo Grid */}
                  <div className="masonry">
                    {group.photos.map((photo) => {
                      const globalIndex = album.photos.findIndex(
                        (p) => p.id === photo.id
                      );
                      return (
                        <SharedPhotoCard
                          key={photo.id}
                          photo={photo}
                          index={globalIndex}
                          onClick={() => setSelectedPhotoIndex(globalIndex)}
                          shareToken={token}
                          password={verifiedPassword}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="masonry">
              {album.photos.map((photo, index) => (
                <SharedPhotoCard
                  key={photo.id}
                  photo={photo}
                  index={index}
                  onClick={() => setSelectedPhotoIndex(index)}
                  shareToken={token}
                  password={verifiedPassword}
                />
              ))}
            </div>
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
                      title={isPlaying ? "Pause slideshow (Space)" : "Play slideshow (Space)"}
                    >
                      {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                      <span className="sr-only">{isPlaying ? "Pause" : "Play"} slideshow</span>
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
                    setIsPlaying(false);
                    setSelectedPhotoIndex(
                      (selectedPhotoIndex - 1 + album.photos.length) %
                        album.photos.length
                    );
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
                    setIsPlaying(false);
                    setSelectedPhotoIndex(
                      (selectedPhotoIndex + 1) % album.photos.length
                    );
                  }}
                  className="absolute right-4 z-10 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors"
                >
                  <ChevronRight className="h-8 w-8" />
                  <span className="sr-only">Next</span>
                </button>
              )}

              {/* Image or Video */}
              <motion.div
                key={selectedPhoto.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="max-w-[90vw] max-h-[90vh] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                {selectedPhoto.is_video ? (
                  <video
                    src={getSharedImageUrl(
                      token,
                      selectedPhoto.id,
                      "web",
                      verifiedPassword || undefined
                    )}
                    controls
                    autoPlay
                    className="max-w-full max-h-[90vh] w-auto h-auto object-contain"
                    playsInline
                  />
                ) : (
                  <Image
                    src={getSharedImageUrl(
                      token,
                      selectedPhoto.id,
                      "web",
                      verifiedPassword || undefined
                    )}
                    alt={selectedPhoto.original_filename}
                    width={selectedPhoto.width}
                    height={selectedPhoto.height}
                    className="max-w-full max-h-[90vh] w-auto h-auto object-contain"
                    unoptimized
                    priority
                  />
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return null;
}
