"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SelectionToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onDownload: () => Promise<void>;
  onDelete: () => Promise<void>;
  children?: ReactNode;
  left?: string;
}

export function SelectionToolbar({
  selectedCount,
  onClearSelection,
  onDownload,
  onDelete,
  children,
  left = "50%",
}: SelectionToolbarProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    const toastId = toast.loading("Preparing download...");
    try {
      await onDownload();
      toast.success("Download ready!", { id: toastId });
    } catch {
      toast.error("Download failed", { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
      setShowDeleteDialog(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {selectedCount > 0 && (
          <div
            className="fixed bottom-6 z-50 -translate-x-1/2"
            style={{ left }}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="flex max-w-[calc(100vw-1rem)] items-center gap-1 rounded-full border bg-background px-2 py-2 shadow-lg sm:gap-2 sm:px-4">
                {/* Selection count */}
                <span className="whitespace-nowrap px-2 text-sm font-medium">
                  <span>{selectedCount}</span>
                  <span className="hidden sm:inline"> selected</span>
                </span>

                <div className="w-px h-6 bg-border" />

                {children}

                {children && <div className="w-px h-6 bg-border" />}

                {/* Download button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="h-9 w-9 gap-2 px-0 sm:w-auto sm:px-3"
                  aria-label="Download selected"
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Download</span>
                </Button>

                {/* Delete button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isDeleting}
                  className="h-9 w-9 gap-2 px-0 text-red-500 hover:bg-red-500/10 hover:text-red-400 sm:w-auto sm:px-3 dark:text-red-400 dark:hover:text-red-300"
                  aria-label="Delete selected"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Delete</span>
                </Button>

                <div className="w-px h-6 bg-border" />

                {/* Clear selection */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClearSelection}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} photos?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected photos will be
              permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
