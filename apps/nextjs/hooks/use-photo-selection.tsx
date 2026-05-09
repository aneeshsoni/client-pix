"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

interface ToggleSelectionOptions {
  rangeSelect?: boolean;
  orderedPhotoIds?: string[];
}

interface PhotoSelectionContextType {
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  toggleSelection: (photoId: string, options?: ToggleSelectionOptions) => void;
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
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  const toggleSelection = useCallback(
    (photoId: string, options?: ToggleSelectionOptions) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const orderedPhotoIds = options?.orderedPhotoIds ?? [];

        if (options?.rangeSelect && lastSelectedId && orderedPhotoIds.length) {
          const currentIndex = orderedPhotoIds.indexOf(photoId);
          const anchorIndex = orderedPhotoIds.indexOf(lastSelectedId);

          if (currentIndex !== -1 && anchorIndex !== -1) {
            const start = Math.min(currentIndex, anchorIndex);
            const end = Math.max(currentIndex, anchorIndex);
            orderedPhotoIds.slice(start, end + 1).forEach((id) => {
              next.add(id);
            });

            setIsSelectionMode(true);
            return next;
          }
        }

        if (next.has(photoId)) {
          next.delete(photoId);
        } else {
          next.add(photoId);
        }

        setIsSelectionMode(next.size > 0);
        return next;
      });

      setLastSelectedId(photoId);
    },
    [lastSelectedId]
  );

  const selectAll = useCallback((photoIds: string[]) => {
    setSelectedIds(new Set(photoIds));
    setIsSelectionMode(photoIds.length > 0);
    setLastSelectedId(photoIds[photoIds.length - 1] ?? null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
    setLastSelectedId(null);
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
    setLastSelectedId(null);
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
