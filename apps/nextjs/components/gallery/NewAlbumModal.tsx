"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Images,
  ArrowDownToLine,
  ImageIcon,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createAlbum, uploadPhotosToAlbum } from "@/lib/api";

interface NewAlbumModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAlbumCreated?: () => void;
}

export function NewAlbumModal({
  open,
  onOpenChange,
  onAlbumCreated,
}: NewAlbumModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [uploadProgressPercent, setUploadProgressPercent] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((fileList: FileList) => {
    const imageFiles = Array.from(fileList).filter((file) =>
      file.type.startsWith("image/")
    );
    setFiles((prev) => [...prev, ...imageFiles]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles]
  );

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return;

    setIsUploading(true);
    setUploadProgress("Creating album...");

    try {
      // Create the album
      const album = await createAlbum(
        title.trim(),
        description.trim() || undefined
      );

      // Upload photos if any (in batches for reliability)
      if (files.length > 0) {
        setUploadProgress(`Uploading 0/${files.length} photos...`);
        setUploadProgressPercent(0);
        await uploadPhotosToAlbum(album.id, files, (uploaded, total) => {
          const percent = Math.round((uploaded / total) * 100);
          setUploadProgress(`Uploading ${uploaded}/${total} photos...`);
          setUploadProgressPercent(percent);
        });
        setUploadProgress("Upload complete!");
        setUploadProgressPercent(100);
      }

      // Success! Reset and close
      setTitle("");
      setDescription("");
      setFiles([]);
      setUploadProgress("");
      setUploadProgressPercent(0);
      onOpenChange(false);

      // Notify parent to refresh album list
      onAlbumCreated?.();
    } catch (error) {
      console.error("Failed to create album:", error);
      setUploadProgress(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsUploading(false);
    }
  }, [title, description, files, onOpenChange, onAlbumCreated]);

  const handleClose = useCallback(() => {
    if (isUploading) return; // Prevent closing during upload
    setTitle("");
    setDescription("");
    setFiles([]);
    setUploadProgress("");
    setUploadProgressPercent(0);
    onOpenChange(false);
  }, [isUploading, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl overflow-hidden border bg-background p-0">
        <div className="relative p-6">
          <DialogHeader className="pb-2">
            <DialogTitle asChild>
              <div className="relative">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Add your album title here..."
                  className="w-full bg-transparent text-2xl font-semibold tracking-tight placeholder:text-muted-foreground/40 focus:outline-none focus:placeholder:text-muted-foreground/60"
                  autoFocus
                  disabled={isUploading}
                />
                <motion.div
                  className="absolute -bottom-1 left-0 h-0.5 bg-foreground"
                  initial={{ width: 0 }}
                  animate={{ width: title ? "100%" : "0%" }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            {/* Description */}
            <div className="group relative">
              <Label
                htmlFor="description"
                className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                <Images className="h-3 w-3" />
                Description
              </Label>
              <Textarea
                id="description"
                placeholder="Add a description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="border-2 bg-background/50 transition-all focus:border-foreground focus:ring-foreground/20"
                disabled={isUploading}
              />
            </div>

            {/* Upload Area */}
            <div className="relative">
              <Label className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Upload className="h-3 w-3" />
                Drop Your Photos
              </Label>
              <motion.div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                animate={isDragOver ? { scale: 1.02 } : { scale: 1 }}
                className={`
                  relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300
                  ${isUploading ? "pointer-events-none opacity-50" : ""}
                  ${
                    isDragOver
                      ? "border-foreground bg-accent"
                      : "border-muted-foreground/20 hover:border-muted-foreground/50 hover:bg-accent/50"
                  }
                `}
              >
                {/* Subtle background pattern */}
                <div className="absolute inset-0 opacity-[0.02]">
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                    }}
                  />
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleFileInput}
                  className="hidden"
                  disabled={isUploading}
                />

                <AnimatePresence mode="wait">
                  {isDragOver ? (
                    <motion.div
                      key="drag"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex flex-col items-center"
                    >
                      <motion.div
                        animate={{ y: [0, -8, 0] }}
                        transition={{ repeat: Infinity, duration: 0.6 }}
                      >
                        <ArrowDownToLine className="h-12 w-12 text-foreground" />
                      </motion.div>
                      <p className="mt-3 text-lg font-semibold">
                        Drop them here!
                      </p>
                    </motion.div>
                  ) : files.length > 0 ? (
                    <motion.div
                      key="files"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex flex-col items-center text-center"
                    >
                      <div className="relative flex items-center justify-center rounded-2xl bg-primary p-4">
                        <ImageIcon className="h-8 w-8 text-primary-foreground" />
                      </div>
                      <p className="mt-4 text-base font-medium">
                        {files.length} photo{files.length !== 1 ? "s" : ""}{" "}
                        selected
                      </p>
                      <div className="mt-2 max-w-xs space-y-0.5">
                        {files.slice(0, 3).map((file, i) => (
                          <p
                            key={i}
                            className="truncate text-xs text-muted-foreground"
                          >
                            {file.name}
                          </p>
                        ))}
                        {files.length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            +{files.length - 3} more
                          </p>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Click to add more
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex flex-col items-center"
                    >
                      <div className="relative">
                        <motion.div
                          className="absolute -inset-3 rounded-full bg-muted-foreground/10 blur-xl"
                          animate={{
                            scale: [1, 1.2, 1],
                            opacity: [0.3, 0.5, 0.3],
                          }}
                          transition={{ repeat: Infinity, duration: 3 }}
                        />
                        <div className="relative rounded-2xl bg-primary p-4">
                          <Upload className="h-8 w-8 text-primary-foreground" />
                        </div>
                      </div>
                      <p className="mt-4 text-base">
                        <span className="font-medium">Drag files here</span>
                        <span className="text-muted-foreground">
                          {" "}
                          or click to browse
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        PNG, JPG, WEBP, GIF
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          </div>

          {/* Upload Progress */}
          {uploadProgress && (
            <div className="rounded-lg border bg-primary/10 px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {uploadProgress}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Please wait while photos are being uploaded...
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

          {/* Footer */}
          <div className="flex items-center justify-between pt-4">
            {/* Left side - Clear button */}
            <div>
              <AnimatePresence>
                {files.length > 0 && !isUploading && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setFiles([]);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      Clear {files.length} photo{files.length !== 1 ? "s" : ""}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right side - Cancel and Create */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={isUploading}
                className="text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
              <motion.div
                whileHover={{ scale: isUploading ? 1 : 1.02 }}
                whileTap={{ scale: isUploading ? 1 : 0.98 }}
              >
                <Button
                  onClick={handleSubmit}
                  disabled={!title.trim() || isUploading}
                  className="px-6"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Album"
                  )}
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
