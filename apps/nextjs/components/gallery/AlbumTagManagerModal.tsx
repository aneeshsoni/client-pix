"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import {
  createAlbumTag,
  deleteAlbumTag,
  updateAlbumTag,
  type PhotoTag,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface AlbumTagManagerModalProps {
  albumId: string;
  tags: PhotoTag[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTagsChanged: () => Promise<void> | void;
  selectedPhotoIds?: string[];
  onTagCreated?: (tag: PhotoTag) => Promise<void> | void;
  onTagsSelected?: (tags: PhotoTag[]) => Promise<void> | void;
}

interface TagDraft {
  name: string;
  emoji: string;
  color: string;
}

const emptyDraft: TagDraft = {
  name: "",
  emoji: "",
  color: "",
};

const NONE_VALUE = "__none";

const emojiOptions = [
  { value: "✨", label: "Favorite" },
  { value: "📌", label: "Pinned" },
  { value: "⭐", label: "Highlight" },
  { value: "❤️", label: "Loved" },
  { value: "🎉", label: "Celebration" },
  { value: "👤", label: "People" },
  { value: "🏡", label: "Home" },
  { value: "🌿", label: "Nature" },
  { value: "🌊", label: "Travel" },
  { value: "🍽️", label: "Food" },
  { value: "🎂", label: "Birthday" },
  { value: "💍", label: "Wedding" },
  { value: "🐶", label: "Pets" },
  { value: "📷", label: "Photos" },
  { value: "🗂️", label: "Archive" },
];

const colorOptions = [
  { value: "#71717a", label: "Gray", className: "bg-zinc-500" },
  { value: "#ef4444", label: "Red", className: "bg-red-500" },
  { value: "#f97316", label: "Orange", className: "bg-orange-500" },
  { value: "#eab308", label: "Yellow", className: "bg-yellow-500" },
  { value: "#22c55e", label: "Green", className: "bg-green-500" },
  { value: "#06b6d4", label: "Cyan", className: "bg-cyan-500" },
  { value: "#3b82f6", label: "Blue", className: "bg-blue-500" },
  { value: "#8b5cf6", label: "Purple", className: "bg-violet-500" },
  { value: "#ec4899", label: "Pink", className: "bg-pink-500" },
];

function normalizeDraft(draft: TagDraft) {
  return {
    name: draft.name.trim() || null,
    emoji: draft.emoji.trim() || null,
    color: draft.color.trim() || null,
  };
}

function hasVisibleMarker(draft: TagDraft): boolean {
  const normalized = normalizeDraft(draft);
  return Boolean(normalized.name || normalized.emoji || normalized.color);
}

function draftWithSelectValue<T extends keyof TagDraft>(
  draft: TagDraft,
  field: T,
  value: string,
): TagDraft {
  return {
    ...draft,
    [field]: value === NONE_VALUE ? "" : value,
  };
}

function EmojiPicker({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Choose tag emoji"
        >
          {value || "🏷️"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="grid w-[188px] grid-cols-5 gap-1 p-2"
      >
        <DropdownMenuItem
          className="flex h-8 w-8 justify-center p-0 text-sm text-muted-foreground"
          onSelect={() => onValueChange(NONE_VALUE)}
          aria-label="No emoji"
        >
          –
        </DropdownMenuItem>
        {emojiOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="flex h-8 w-8 justify-center p-0 text-lg"
            onSelect={() => onValueChange(option.value)}
            aria-label={option.label}
          >
            {option.value}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ColorPicker({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const selectedColor = colorOptions.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Choose tag color"
        >
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "h-3.5 w-3.5 rounded-full ring-1 ring-black/10",
                selectedColor?.className || "bg-muted-foreground",
              )}
            />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="grid w-[152px] grid-cols-5 gap-1 p-2"
      >
        <DropdownMenuItem
          className="flex h-8 w-8 justify-center p-0 text-sm text-muted-foreground"
          onSelect={() => onValueChange(NONE_VALUE)}
          aria-label="No color"
        >
          –
        </DropdownMenuItem>
        {colorOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="flex h-8 w-8 justify-center p-0"
            onSelect={() => onValueChange(option.value)}
            aria-label={option.label}
          >
            <span
              className={cn(
                "h-4 w-4 rounded-full ring-1 ring-black/10",
                option.className,
              )}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TagEditorRow({
  draft,
  onChange,
  actions,
  namePlaceholder = "Untitled tag",
}: {
  draft: TagDraft;
  onChange: (draft: TagDraft) => void;
  actions: React.ReactNode;
  namePlaceholder?: string;
}) {
  return (
    <div
      className="group flex min-w-0 items-center gap-1 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40 focus-within:border-ring focus-within:bg-muted/40"
      style={{
        borderColor: draft.color || undefined,
      }}
    >
      <EmojiPicker
        value={draft.emoji}
        onValueChange={(value) =>
          onChange(draftWithSelectValue(draft, "emoji", value))
        }
      />
      <ColorPicker
        value={draft.color}
        onValueChange={(value) =>
          onChange(draftWithSelectValue(draft, "color", value))
        }
      />
      <Input
        value={draft.name}
        onChange={(event) =>
          onChange({
            ...draft,
            name: event.target.value,
          })
        }
        maxLength={100}
        placeholder={namePlaceholder}
        aria-label="Tag name"
        className="h-9 min-w-0 flex-1 border-0 bg-transparent px-2 text-base font-medium shadow-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <div className="ml-1 flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {actions}
      </div>
    </div>
  );
}

function getTagTitle(tag: PhotoTag) {
  return [tag.emoji, tag.name].filter(Boolean).join(" ") || "Color tag";
}

function TagDisplayRow({
  tag,
  isSelected,
  isSelectable,
  onToggleSelected,
  actions,
}: {
  tag: PhotoTag;
  isSelected: boolean;
  isSelectable: boolean;
  onToggleSelected: () => void;
  actions: React.ReactNode;
}) {
  const colorStyles = tag.color
    ? {
        "--tag-hover-bg": `${tag.color}20`,
        "--tag-selected-bg": `${tag.color}26`,
      } as React.CSSProperties
    : undefined;

  return (
    <div
      role={isSelectable ? "button" : undefined}
      tabIndex={isSelectable ? 0 : undefined}
      onClick={isSelectable ? onToggleSelected : undefined}
      onKeyDown={(event) => {
        if (!isSelectable) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggleSelected();
        }
      }}
      className={cn(
        "group flex min-w-0 items-center gap-1 rounded-md border border-transparent px-2 py-1.5 transition-colors",
        isSelectable &&
          (tag.color
            ? "cursor-pointer hover:border-border hover:bg-[var(--tag-hover-bg)]"
            : "cursor-pointer hover:border-border hover:bg-muted/40"),
        isSelected &&
          (tag.color
            ? "border-primary bg-[var(--tag-selected-bg)] hover:border-primary"
            : "border-primary bg-primary/10 hover:border-primary"),
      )}
      style={{
        ...colorStyles,
        borderColor: isSelected ? undefined : tag.color || undefined,
      }}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xl">
        {tag.emoji || "🏷️"}
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">
        <span
          className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: tag.color || "transparent" }}
        />
      </div>
      <div className="min-w-0 flex-1 px-2">
        <p className="truncate text-base font-medium">{getTagTitle(tag)}</p>
      </div>
      {isSelected && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-primary">
          <Check className="h-4 w-4" />
        </div>
      )}
      <div
        className="ml-1 flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={(event) => event.stopPropagation()}
      >
        {actions}
      </div>
    </div>
  );
}

export function AlbumTagManagerModal({
  albumId,
  tags,
  open,
  onOpenChange,
  onTagsChanged,
  selectedPhotoIds = [],
  onTagCreated,
  onTagsSelected,
}: AlbumTagManagerModalProps) {
  const [newTag, setNewTag] = useState<TagDraft>(emptyDraft);
  const [drafts, setDrafts] = useState<Record<string, TagDraft>>({});
  const [editingTagIds, setEditingTagIds] = useState<Set<string>>(new Set());
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPhotoSelection = selectedPhotoIds.length > 0;

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        tags.map((tag) => [
          tag.id,
          {
            name: tag.name || "",
            emoji: tag.emoji || "",
            color: tag.color || "",
          },
        ]),
      ),
    );
  }, [tags]);

  useEffect(() => {
    if (!open) {
      setEditingTagIds(new Set());
      setSelectedTagIds(new Set());
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!hasPhotoSelection) {
      setSelectedTagIds(new Set());
    }
  }, [hasPhotoSelection]);

  const handleCreate = async () => {
    if (!hasVisibleMarker(newTag)) {
      setError("Add a name, emoji, or color.");
      return;
    }

    setError(null);
    setIsCreating(true);
    try {
      const tag = await createAlbumTag(albumId, {
        ...normalizeDraft(newTag),
        sort_order: tags.length,
      });
      if (selectedPhotoIds.length > 0) {
        await onTagCreated?.(tag);
      }
      setNewTag(emptyDraft);
      await onTagsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tag.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async (tag: PhotoTag) => {
    const draft = drafts[tag.id];
    if (!draft || !hasVisibleMarker(draft)) {
      setError("A tag needs a name, emoji, or color.");
      return;
    }

    setError(null);
    setSavingId(tag.id);
    try {
      await updateAlbumTag(albumId, tag.id, normalizeDraft(draft));
      setEditingTagIds((current) => {
        const next = new Set(current);
        next.delete(tag.id);
        return next;
      });
      await onTagsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tag.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (tag: PhotoTag) => {
    if (!window.confirm("Delete this tag from the album?")) return;

    setError(null);
    setSavingId(tag.id);
    try {
      await deleteAlbumTag(albumId, tag.id);
      await onTagsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tag.");
    } finally {
      setSavingId(null);
    }
  };

  const toggleTagSelection = (tagId: string) => {
    if (!hasPhotoSelection) return;

    setSelectedTagIds((current) => {
      const next = new Set(current);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  const handleApplySelectedTags = async () => {
    const selectedTags = tags.filter((tag) => selectedTagIds.has(tag.id));
    if (selectedTags.length === 0) return;

    setError(null);
    setIsApplying(true);
    try {
      await onTagsSelected?.(selectedTags);
      setSelectedTagIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply tags.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Album tags</DialogTitle>
          <DialogDescription>
            {hasPhotoSelection
              ? `Create or choose tags for ${selectedPhotoIds.length} selected item${
                  selectedPhotoIds.length === 1 ? "" : "s"
                }`
              : "Create labels for organizing this album"}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-card p-2">
          <TagEditorRow
            draft={newTag}
            onChange={setNewTag}
            namePlaceholder="New tag"
            actions={
              <Button
                type="button"
                size="icon"
                className="h-8 w-8"
                onClick={handleCreate}
                disabled={isCreating}
                aria-label="Add tag"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            }
          />
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {tags.map((tag) => {
            const draft = drafts[tag.id] || emptyDraft;
            const isSaving = savingId === tag.id;
            const isEditing = editingTagIds.has(tag.id);
            const isSelected = selectedTagIds.has(tag.id);

            return isEditing ? (
              <TagEditorRow
                key={tag.id}
                draft={draft}
                onChange={(nextDraft) =>
                  setDrafts((current) => ({
                    ...current,
                    [tag.id]: nextDraft,
                  }))
                }
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleUpdate(tag)}
                      disabled={isSaving}
                      aria-label="Save tag"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDelete(tag)}
                      disabled={isSaving}
                      aria-label="Delete tag"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                }
              />
            ) : (
              <TagDisplayRow
                key={tag.id}
                tag={tag}
                isSelected={isSelected}
                isSelectable={hasPhotoSelection}
                onToggleSelected={() => toggleTagSelection(tag.id)}
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setEditingTagIds((current) => {
                          const next = new Set(current);
                          next.add(tag.id);
                          return next;
                        })
                      }
                      aria-label="Edit tag"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDelete(tag)}
                      disabled={isSaving}
                      aria-label="Delete tag"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                }
              />
            );
          })}
        </div>

        {hasPhotoSelection && (
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleApplySelectedTags}
              disabled={selectedTagIds.size === 0 || isApplying}
            >
              {isApplying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Apply
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
