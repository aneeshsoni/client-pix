"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, FileImage, HardDrive } from "lucide-react";
import type { Photo } from "@/lib/api";

interface MetadataDrawerProps {
  photo: Photo;
  isOpen: boolean;
  onClose: () => void;
}

interface MetadataRowProps {
  icon: React.ReactNode;
  label: string;
  value: string | number | undefined;
}

function MetadataRow({ icon, label, value }: MetadataRowProps) {
  if (!value) return null;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/10 last:border-0">
      <div className="text-white/50 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white/50 uppercase tracking-wide">
          {label}
        </div>
        <div className="text-sm text-white mt-0.5 truncate">{value}</div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MetadataDrawer({
  photo,
  isOpen,
  onClose,
}: MetadataDrawerProps) {
  // Prefer captured_at (EXIF date when photo was taken) over created_at (upload date)
  const displayDate = photo.captured_at || photo.created_at;
  const dateLabel = photo.captured_at ? "Taken" : "Uploaded";

  const formattedDate = new Date(displayDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedTime = new Date(displayDate).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 md:hidden"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-black/90 backdrop-blur-xl border-l border-white/10 z-20 overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 flex items-center justify-between p-4 bg-black/80 backdrop-blur-sm border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">Details</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-1">
              {/* Filename */}
              <div className="pb-4 mb-2 border-b border-white/10">
                <div className="text-white font-medium truncate">
                  {photo.original_filename}
                </div>
                <div className="text-white/50 text-sm">{photo.mime_type}</div>
              </div>

              {/* Date & Time */}
              <MetadataRow
                icon={<Calendar className="h-4 w-4" />}
                label={dateLabel}
                value={`${formattedDate} at ${formattedTime}`}
              />

              {/* File info */}
              <MetadataRow
                icon={<HardDrive className="h-4 w-4" />}
                label="File Size"
                value={formatFileSize(photo.file_size)}
              />

              <MetadataRow
                icon={<FileImage className="h-4 w-4" />}
                label="Dimensions"
                value={
                  photo.width && photo.height
                    ? `${photo.width} × ${photo.height}`
                    : undefined
                }
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
