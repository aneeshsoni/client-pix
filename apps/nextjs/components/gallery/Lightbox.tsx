"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, Info, Download } from "lucide-react";
import { MetadataDrawer } from "./MetadataDrawer";
import type { Photo } from "@/lib/api";
import { getImageUrl, getDownloadUrl } from "@/lib/api";

interface LightboxProps {
  photo: Photo;
  albumId: string;
  currentIndex: number;
  totalCount: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export function Lightbox({
  photo,
  albumId,
  currentIndex,
  totalCount,
  onClose,
  onNext,
  onPrev,
}: LightboxProps) {
  const [showMetadata, setShowMetadata] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  // Get the full resolution image URL
  const imageUrl = getImageUrl(photo.web_path);
  const downloadUrl = getDownloadUrl(albumId, photo.id);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowRight":
          onNext();
          setIsImageLoaded(false);
          break;
        case "ArrowLeft":
          onPrev();
          setIsImageLoaded(false);
          break;
        case "i":
          setShowMetadata((prev) => !prev);
          break;
      }
    },
    [onClose, onNext, onPrev]
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

            <button
              onClick={onClose}
              className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              title="Close (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </motion.header>

        {/* Main image area */}
        <div className="absolute inset-0 flex items-center justify-center p-4 md:p-16">
          {/* Loading indicator */}
          {!isImageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* Image */}
          <motion.div
            key={photo.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: isImageLoaded ? 1 : 0, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="relative h-full w-full"
          >
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
          </motion.div>
        </div>

        {/* Navigation buttons */}
        <button
          onClick={() => {
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
