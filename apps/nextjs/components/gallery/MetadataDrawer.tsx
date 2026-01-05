"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Camera,
  Aperture,
  Clock,
  Sun,
  Ruler,
  MapPin,
  Calendar,
} from "lucide-react";
import type { Photo } from "@/lib/mock-data";

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

export function MetadataDrawer({
  photo,
  isOpen,
  onClose,
}: MetadataDrawerProps) {
  const formattedDate = new Date(photo.takenAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedTime = new Date(photo.takenAt).toLocaleTimeString("en-US", {
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
              {/* Date & Time */}
              <div className="pb-4 mb-2 border-b border-white/10">
                <div className="text-white font-medium">{formattedDate}</div>
                <div className="text-white/50 text-sm">{formattedTime}</div>
              </div>

              {/* Camera info */}
              <MetadataRow
                icon={<Camera className="h-4 w-4" />}
                label="Camera"
                value={photo.metadata.camera}
              />

              <MetadataRow
                icon={<Ruler className="h-4 w-4" />}
                label="Lens"
                value={photo.metadata.lens}
              />

              {/* Exposure settings */}
              <MetadataRow
                icon={<Aperture className="h-4 w-4" />}
                label="Aperture"
                value={photo.metadata.aperture}
              />

              <MetadataRow
                icon={<Clock className="h-4 w-4" />}
                label="Shutter Speed"
                value={photo.metadata.shutterSpeed}
              />

              <MetadataRow
                icon={<Sun className="h-4 w-4" />}
                label="ISO"
                value={photo.metadata.iso}
              />

              <MetadataRow
                icon={<Ruler className="h-4 w-4" />}
                label="Focal Length"
                value={photo.metadata.focalLength}
              />

              {/* Location */}
              <MetadataRow
                icon={<MapPin className="h-4 w-4" />}
                label="Location"
                value={photo.metadata.location}
              />

              {/* Dimensions */}
              <div className="pt-4 mt-4 border-t border-white/10">
                <div className="flex items-center gap-3">
                  <div className="text-white/50">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="2"
                        strokeWidth="2"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs text-white/50 uppercase tracking-wide">
                      Dimensions
                    </div>
                    <div className="text-sm text-white mt-0.5">
                      {photo.width} × {photo.height}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
