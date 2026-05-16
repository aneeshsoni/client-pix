"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import Image from "next/image";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Info,
  Download,
  Trash2,
  Play,
  Pause,
} from "lucide-react";
import { MetadataDrawer } from "./MetadataDrawer";
import type { Photo } from "@/lib/api";
import { getSecureImageUrl, getDownloadUrl, deletePhoto } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface LightboxProps {
  photo: Photo;
  albumId: string;
  currentIndex: number;
  totalCount: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onDelete?: (photoId: string) => void;
}

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

export function Lightbox({
  photo,
  albumId,
  currentIndex,
  totalCount,
  onClose,
  onNext,
  onPrev,
  onDelete,
}: LightboxProps) {
  const [showMetadata, setShowMetadata] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { token } = useAuth();

  // Slideshow auto-advance
  useEffect(() => {
    if (!isPlaying || photo.is_video) return;

    const timer = setInterval(() => {
      onNext();
      setIsImageLoaded(false);
    }, 5000); // 5 second interval

    return () => clearInterval(timer);
  }, [isPlaying, photo.is_video, onNext]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${photo.original_filename}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deletePhoto(albumId, photo.id);
      onDelete(photo.id);
      // If this was the last photo, close the lightbox
      if (totalCount === 1) {
        onClose();
      }
    } catch (error) {
      console.error("Failed to delete photo:", error);
      alert("Failed to delete photo. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }, [
    albumId,
    photo.id,
    photo.original_filename,
    onDelete,
    onClose,
    totalCount,
  ]);

  // Get the full resolution image URL with auth token
  const imageUrl = getSecureImageUrl(photo.id, "web", token || undefined);
  const downloadUrl = getDownloadUrl(albumId, photo.id);

  const goToNext = useCallback(() => {
    if (totalCount <= 1) return;
    setSwipeDirection(1);
    setIsPlaying(false);
    onNext();
    setIsImageLoaded(false);
  }, [onNext, totalCount]);

  const goToPrev = useCallback(() => {
    if (totalCount <= 1) return;
    setSwipeDirection(-1);
    setIsPlaying(false);
    onPrev();
    setIsImageLoaded(false);
  }, [onPrev, totalCount]);

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (totalCount <= 1) return;

      if (
        info.offset.x < -SWIPE_DISTANCE_THRESHOLD ||
        info.velocity.x < -SWIPE_VELOCITY_THRESHOLD
      ) {
        goToNext();
      } else if (
        info.offset.x > SWIPE_DISTANCE_THRESHOLD ||
        info.velocity.x > SWIPE_VELOCITY_THRESHOLD
      ) {
        goToPrev();
      }
    },
    [goToNext, goToPrev, totalCount]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowRight":
          goToNext();
          break;
        case "ArrowLeft":
          goToPrev();
          break;
        case "i":
          setShowMetadata((prev) => !prev);
          break;
        case " ":
          e.preventDefault();
          if (!photo.is_video) {
            setIsPlaying((prev) => !prev);
          }
          break;
      }
    },
    [onClose, goToNext, goToPrev, photo.is_video]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  // Reset image loaded state when photo changes
  useEffect(() => {
    setIsImageLoaded(false);
  }, [photo.id]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 bg-black"
      >
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent"
        >
          <div className="text-sm text-white/70 font-medium">
            {currentIndex + 1} / {totalCount}
          </div>

          <div className="flex items-center gap-2">
            {/* Slideshow play/pause button - only for images */}
            {!photo.is_video && (
              <button
                onClick={() => setIsPlaying((prev) => !prev)}
                className={`p-2 rounded-full transition-colors ${
                  isPlaying
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
                title={isPlaying ? "Pause slideshow (Space)" : "Play slideshow (Space)"}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
            )}

            <button
              onClick={() => setShowMetadata((prev) => !prev)}
              className={`p-2 rounded-full transition-colors ${
                showMetadata
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
              title="Show info (i)"
            >
              <Info className="h-5 w-5" />
            </button>

            <a
              href={downloadUrl}
              download={photo.original_filename}
              className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              title="Download"
            >
              <Download className="h-5 w-5" />
            </a>

            {onDelete && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-2 rounded-full text-white/70 hover:text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                title="Delete photo"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              title="Close (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </motion.header>

        {/* Main image/video area */}
        <div className="absolute inset-0 flex items-center justify-center p-4 md:p-16">
          {/* Loading indicator */}
          {!isImageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* Video or Image */}
          <AnimatePresence initial={false} custom={swipeDirection} mode="popLayout">
            <motion.div
              key={photo.id}
              custom={swipeDirection}
              variants={mediaVariants}
              initial="enter"
              animate={isImageLoaded ? "center" : { opacity: 0, scale: 0.98, x: 0 }}
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 280, damping: 32 },
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 },
              }}
              drag={totalCount > 1 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.22}
              onDragEnd={handleDragEnd}
              className="relative flex h-full w-full touch-pan-y cursor-grab select-none items-center justify-center active:cursor-grabbing"
            >
              {photo.is_video ? (
                <video
                  ref={videoRef}
                  src={imageUrl}
                  controls
                  autoPlay
                  className="h-full w-full object-contain"
                  onLoadedData={() => setIsImageLoaded(true)}
                  playsInline
                />
              ) : (
                <Image
                  src={imageUrl}
                  alt={photo.original_filename}
                  fill
                  className="object-contain"
                  sizes="100vw"
                  priority
                  onLoad={() => setIsImageLoaded(true)}
                  draggable={false}
                  unoptimized
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation buttons */}
        <button
          onClick={() => {
            goToPrev();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/30 text-white/80 hover:bg-black/50 hover:text-white transition-colors backdrop-blur-sm"
          title="Previous (←)"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <button
          onClick={() => {
            goToNext();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/30 text-white/80 hover:bg-black/50 hover:text-white transition-colors backdrop-blur-sm"
          title="Next (→)"
        >
          <ChevronRight className="h-6 w-6" />
        </button>

        {/* Metadata drawer */}
        <MetadataDrawer
          photo={photo}
          isOpen={showMetadata}
          onClose={() => setShowMetadata(false)}
        />
      </motion.div>
    </AnimatePresence>
  );
}
