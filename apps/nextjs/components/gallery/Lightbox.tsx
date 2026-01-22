"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowRight":
          setIsPlaying(false);
          onNext();
          setIsImageLoaded(false);
          break;
        case "ArrowLeft":
          setIsPlaying(false);
          onPrev();
          setIsImageLoaded(false);
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
    [onClose, onNext, onPrev, photo.is_video]
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
          <motion.div
            key={photo.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: isImageLoaded ? 1 : 0, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="relative h-full w-full flex items-center justify-center"
          >
            {photo.is_video ? (
              <video
                ref={videoRef}
                src={imageUrl}
                controls
                autoPlay
                className="max-h-full max-w-full object-contain"
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
                unoptimized
              />
            )}
          </motion.div>
        </div>

        {/* Navigation buttons */}
        <button
          onClick={() => {
            setIsPlaying(false);
            onPrev();
            setIsImageLoaded(false);
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/30 text-white/80 hover:bg-black/50 hover:text-white transition-colors backdrop-blur-sm"
          title="Previous (←)"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <button
          onClick={() => {
            setIsPlaying(false);
            onNext();
            setIsImageLoaded(false);
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
