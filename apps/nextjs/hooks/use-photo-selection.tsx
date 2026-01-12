"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

interface PhotoSelectionContextType {
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  toggleSelection: (photoId: string) => void;
  selectAll: (photoIds: string[]) => void;
  clearSelection: () => void;
  isSelected: (photoId: string) => boolean;
  enterSelectionMode: () => void;
  exitSelectionMode: () => void;
}

const PhotoSelectionContext = createContext<PhotoSelectionContextType | null>(
  null
);

export function PhotoSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const toggleSelection = useCallback((photoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((photoIds: string[]) => {
    setSelectedIds(new Set(photoIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (photoId: string) => {
      return selectedIds.has(photoId);
    },
    [selectedIds]
  );

  const enterSelectionMode = useCallback(() => {
    setIsSelectionMode(true);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  return (
    <PhotoSelectionContext.Provider
      value={{
        selectedIds,
        isSelectionMode,
        toggleSelection,
        selectAll,
        clearSelection,
        isSelected,
        enterSelectionMode,
        exitSelectionMode,
      }}
    >
      {children}
    </PhotoSelectionContext.Provider>
  );
}

export function usePhotoSelection() {
  const context = useContext(PhotoSelectionContext);
  if (!context) {
    throw new Error(
      "usePhotoSelection must be used within a PhotoSelectionProvider"
    );
  }
  return context;
}
