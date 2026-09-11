"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { EMPTY_FILE_DROP_MESSAGE, getDroppedFiles, isFileTransfer } from "@/lib/drop-files";

interface WindowDropUploadProps {
  destination: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
}

function isFileDrag(event: DragEvent): boolean {
  return isFileTransfer(event.dataTransfer);
}

export function WindowDropUpload({
  destination,
  disabled = false,
  onFiles,
}: WindowDropUploadProps) {
  const [active, setActive] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    if (disabled) {
      dragDepth.current = 0;
      setActive(false);
    }

    const handleDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (disabled) return;
      dragDepth.current += 1;
      setActive(true);
    };

    const handleDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }
    };

    const handleDragLeave = (event: DragEvent) => {
      if (dragDepth.current === 0) return;
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setActive(false);
    };

    const handleDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setActive(false);
      if (disabled) return;
      const files = getDroppedFiles(event.dataTransfer);
      if (files.length > 0) void onFiles(files);
      else toast.error(EMPTY_FILE_DROP_MESSAGE);
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [disabled, onFiles]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-6 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex h-full w-full items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/5">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Upload className="h-8 w-8" />
          </div>
          <p className="mt-5 text-xl font-semibold">Drop to upload</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add these photos and videos to {destination}
          </p>
        </div>
      </div>
    </div>
  );
}
