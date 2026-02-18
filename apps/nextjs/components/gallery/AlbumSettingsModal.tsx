"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Loader2, Check, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  updateAlbum,
  deleteAlbum,
  getAlbum,
  getSecureImageUrl,
  type Album,
  type Photo,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

function CoverPositionAdjuster({
  photoId,
  token,
  positionX,
  positionY,
  onPositionChange,
}: {
  photoId: string;
  token: string | null;
  positionX: number;
  positionY: number;
  onPositionChange: (x: number, y: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const imageUrl = getSecureImageUrl(photoId, "web", token || undefined);

  const updatePosition = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    onPositionChange(Math.round(x), Math.round(y));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updatePosition(e);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative aspect-[4/3] overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/30 cursor-crosshair select-none touch-none"
    >
      <Image
        src={imageUrl}
        alt="Cover preview"
        fill
        className="object-cover pointer-events-none"
        style={{
          objectPosition: `${positionX}% ${positionY}%`,
        }}
        sizes="500px"
        unoptimized
        draggable={false}
      />
      {/* Focal point indicator */}
      <div
        className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white pointer-events-none"
        style={{
          left: `${positionX}%`,
          top: `${positionY}%`,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)",
        }}
      >
        <div className="absolute inset-0 rounded-full bg-white/30" />
      </div>
      <div className="absolute bottom-2 left-2 text-xs bg-black/50 text-white px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
        Click or drag to set focal point
      </div>
    </div>
  );
}

interface AlbumSettingsModalProps {
  album: Album | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAlbumUpdated?: () => void;
  onAlbumDeleted?: () => void;
}

export function AlbumSettingsModal({
  album,
  open,
  onOpenChange,
  onAlbumUpdated,
  onAlbumDeleted,
}: AlbumSettingsModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedCoverId, setSelectedCoverId] = useState<string | null>(null);
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { token } = useAuth();

  // Load album details when opened
  useEffect(() => {
    if (open && album) {
      setTitle(album.title);
      setDescription(album.description || "");
      setSelectedCoverId(album.cover_photo_id);
      setPositionX(album.cover_photo_position_x);
      setPositionY(album.cover_photo_position_y);
      setShowDeleteConfirm(false);

      // Fetch photos for cover selection
      setIsLoading(true);
      getAlbum(album.id)
        .then((detail) => {
          setPhotos(detail.photos);
        })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [open, album]);

  const handleCoverSelect = useCallback(
    (photoId: string) => {
      if (photoId !== selectedCoverId) {
        setPositionX(50);
        setPositionY(50);
      }
      setSelectedCoverId(photoId);
    },
    [selectedCoverId]
  );

  const handleSave = useCallback(async () => {
    if (!album) return;

    setIsSaving(true);
    try {
      const updates: {
        title?: string;
        description?: string;
        cover_photo_id?: string;
        cover_photo_position_x?: number;
        cover_photo_position_y?: number;
      } = {
        title: title.trim(),
        description: description.trim() || undefined,
      };

      // Include cover photo if changed
      if (selectedCoverId && selectedCoverId !== album.cover_photo_id) {
        updates.cover_photo_id = selectedCoverId;
      }

      // Include position if changed or if cover photo changed
      if (
        positionX !== album.cover_photo_position_x ||
        positionY !== album.cover_photo_position_y ||
        selectedCoverId !== album.cover_photo_id
      ) {
        updates.cover_photo_position_x = positionX;
        updates.cover_photo_position_y = positionY;
      }

      await updateAlbum(album.id, updates);

      onOpenChange(false);
      onAlbumUpdated?.();
    } catch (error) {
      console.error("Failed to save album:", error);
    } finally {
      setIsSaving(false);
    }
  }, [
    album,
    title,
    description,
    selectedCoverId,
    positionX,
    positionY,
    onOpenChange,
    onAlbumUpdated,
  ]);

  const handleDelete = useCallback(
    async (deletePhotos: boolean) => {
      if (!album) return;

      setIsDeleting(true);
      try {
        await deleteAlbum(album.id, deletePhotos);
        onOpenChange(false);
        onAlbumDeleted?.();
      } catch (error) {
        console.error("Failed to delete album:", error);
      } finally {
        setIsDeleting(false);
      }
    },
    [album, onOpenChange, onAlbumDeleted]
  );

  const handleClose = useCallback(() => {
    if (isSaving || isDeleting) return;
    onOpenChange(false);
  }, [isSaving, isDeleting, onOpenChange]);

  if (!album) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Album Settings</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4 px-2">
          {/* Title */}
          <div>
            <Label htmlFor="title" className="text-sm font-medium">
              Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Album title"
              className="mt-1.5"
              disabled={isSaving}
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description" className="text-sm font-medium">
              Description
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="mt-1.5"
              disabled={isSaving}
            />
          </div>

          {/* Cover Photo Selection */}
          <div>
            <Label className="text-sm font-medium">Cover Photo</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">
              Select a photo to use as the album cover
            </p>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : photos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No photos in this album yet
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto rounded-lg border p-2">
                {photos.map((photo) => (
                  <motion.button
                    key={photo.id}
                    onClick={() => handleCoverSelect(photo.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`relative aspect-square rounded-md overflow-hidden border-2 transition-colors ${
                      selectedCoverId === photo.id
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-transparent hover:border-muted-foreground/30"
                    }`}
                    disabled={isSaving}
                  >
                    <Image
                      src={getSecureImageUrl(
                        photo.id,
                        "thumbnail",
                        token || undefined
                      )}
                      alt={photo.original_filename}
                      fill
                      className="object-cover"
                      sizes="100px"
                      unoptimized
                    />
                    {selectedCoverId === photo.id && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="bg-primary text-primary-foreground rounded-full p-1">
                          <Check className="h-4 w-4" />
                        </div>
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* Cover Position Adjustment */}
          {selectedCoverId && !isLoading && (
            <div>
              <Label className="text-sm font-medium">Adjust Cover Position</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Drag the focal point to adjust which part of the image is visible
              </p>
              <CoverPositionAdjuster
                photoId={selectedCoverId}
                token={token}
                positionX={positionX}
                positionY={positionY}
                onPositionChange={(x, y) => {
                  setPositionX(x);
                  setPositionY(y);
                }}
              />
            </div>
          )}

          {/* Danger Zone */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-medium text-destructive mb-2">
              Danger Zone
            </h3>
            {showDeleteConfirm ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  How would you like to delete this album?
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(false)}
                    disabled={isDeleting}
                    className="justify-start"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete Album Only
                    <span className="text-xs text-muted-foreground ml-2">
                      (keep photos)
                    </span>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(true)}
                    disabled={isDeleting}
                    className="justify-start"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete Album & Photos
                    <span className="text-xs opacity-80 ml-2">(permanent)</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Album
              </Button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="ghost" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
