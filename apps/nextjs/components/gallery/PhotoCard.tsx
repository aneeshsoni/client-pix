"use client";

import { useState, memo } from "react";
import Image from "next/image";
import { Play, Check, Loader2, Tag } from "lucide-react";
import type { CSSProperties } from "react";
import type { Photo, PhotoTag } from "@/lib/api";
import { getSecureImageUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PhotoCardProps {
  photo: Photo;
  index: number;
  onOpenLightbox: (index: number) => void;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  onToggleSelect?: (
    photoId: string,
    options?: { rangeSelect?: boolean },
  ) => void;
  availableTags?: PhotoTag[];
  onTagsChange?: (photoId: string, tagIds: string[]) => Promise<void> | void;
  className?: string;
  style?: CSSProperties;
  fillContainer?: boolean;
  imageSizes?: string;
}

function getTagLabel(tag: PhotoTag): string {
  return [tag.emoji, tag.name].filter(Boolean).join(" ") || "Color tag";
}

function shouldContainThumbnailOnMobile(photo: Photo): boolean {
  if (photo.width <= 0 || photo.height <= 0) return false;

  return photo.width / photo.height < 0.58;
}

function PhotoCardInner({
  photo,
  index,
  onOpenLightbox,
  isSelected = false,
  isSelectionMode = false,
  onToggleSelect,
  availableTags = [],
  onTagsChange,
  className,
  style,
  fillContainer = false,
  imageSizes,
}: PhotoCardProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const { token } = useAuth();
  const assignedTags = photo.tags ?? [];
  const showTagControls = availableTags.length > 0 && Boolean(onTagsChange);
  const imageFitClass = shouldContainThumbnailOnMobile(photo)
    ? "object-contain object-center sm:object-cover"
    : "object-cover object-center";

  // Get the secure thumbnail URL with auth token
  const thumbnailUrl = getSecureImageUrl(
    photo.id,
    "thumbnail",
    token || undefined
  );

  const handleClick = (e: React.MouseEvent) => {
    // If in selection mode or shift/cmd clicking, toggle selection
    if (isSelectionMode || e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
      onToggleSelect?.(photo.id, { rangeSelect: e.shiftKey });
    } else {
      onOpenLightbox(index);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.(photo.id, { rangeSelect: e.shiftKey });
  };

  const handleTagToggle = async (tagId: string, checked: boolean) => {
    const currentTagIds = new Set(assignedTags.map((tag) => tag.id));
    if (checked) {
      currentTagIds.add(tagId);
    } else {
      currentTagIds.delete(tagId);
    }

    setIsSavingTags(true);
    try {
      await onTagsChange?.(photo.id, Array.from(currentTagIds));
    } finally {
      setIsSavingTags(false);
    }
  };

  return (
    <div
      className={`${className ?? "masonry-item"} animate-fade-in group/card relative`}
      style={style}
    >
      <button
        onClick={handleClick}
        className={`group relative block w-full overflow-hidden bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${
          fillContainer ? "h-full" : ""
        } ${
          isSelected
            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
            : ""
        }`}
        style={
          fillContainer ? undefined : { aspectRatio: `${photo.width}/${photo.height}` }
        }
      >
        {/* Loading skeleton */}
        {!isLoaded && (
          <div className="absolute inset-0 animate-pulse bg-muted" />
        )}

        {/* Photo/Video thumbnail */}
        <Image
          src={thumbnailUrl}
          alt={photo.original_filename}
          fill
          className={`${imageFitClass} transition-[transform,opacity] duration-300 group-hover:scale-[1.02] ${
            isLoaded ? "opacity-100" : "opacity-0"
          } ${isSelected ? "brightness-90" : ""}`}
          sizes={
            imageSizes ??
            "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          }
          loading={index < 8 ? "eager" : "lazy"}
          onLoad={() => setIsLoaded(true)}
          unoptimized // Skip Next.js image optimization for external URLs
        />

        {/* Video play icon overlay */}
        {photo.is_video && isLoaded && !isSelected && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-black/60 p-3 transition-transform group-hover:scale-110">
              <Play className="h-8 w-8 text-white fill-white" />
            </div>
          </div>
        )}

        {/* Selection checkbox - visible on hover or when in selection mode or when selected */}
        {onToggleSelect && (
          <div
            onClick={handleCheckboxClick}
            className={`absolute top-2 left-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-[opacity,background-color,border-color] cursor-pointer ${
              isSelected
                ? "bg-primary border-primary"
                : "bg-black/40 border-white/70 opacity-0 group-hover:opacity-100"
            } ${isSelectionMode ? "opacity-100" : ""}`}
          >
            {isSelected && (
              <Check className="h-4 w-4 text-white" strokeWidth={3} />
            )}
          </div>
        )}

        {/* Selected overlay */}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/20 pointer-events-none" />
        )}

        {/* Assigned tag chips */}
        {showTagControls && assignedTags.length > 0 && isLoaded && (
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-10 flex flex-wrap gap-1">
            {assignedTags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[11px] font-medium leading-none text-white"
              >
                {tag.color && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full border border-white/60"
                    style={{ backgroundColor: tag.color }}
                  />
                )}
                {tag.emoji && <span>{tag.emoji}</span>}
                {tag.name && <span className="truncate">{tag.name}</span>}
              </span>
            ))}
            {assignedTags.length > 3 && (
              <span className="rounded-full bg-black/65 px-2 py-1 text-[11px] font-medium leading-none text-white">
                +{assignedTags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Hover overlay */}
        <div
          className={`absolute inset-0 transition-colors ${
            isSelected ? "" : "bg-black/0 group-hover:bg-black/10"
          }`}
        />
      </button>

      {showTagControls && (
        <div className="absolute right-2 top-2 z-20 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white shadow-sm transition-colors hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Edit photo tags"
                disabled={isSavingTags}
              >
                {isSavingTags ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Tag className="h-3.5 w-3.5" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {availableTags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag.id}
                  checked={assignedTags.some((assigned) => assigned.id === tag.id)}
                  disabled={isSavingTags}
                  onCheckedChange={(checked) =>
                    handleTagToggle(tag.id, checked === true)
                  }
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {tag.color && (
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border"
                        style={{ backgroundColor: tag.color }}
                      />
                    )}
                    <span className="truncate">{getTagLabel(tag)}</span>
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

export const PhotoCard = memo(PhotoCardInner);
