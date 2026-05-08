"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";

interface AlbumTagManagerModalProps {
  albumId: string;
  tags: PhotoTag[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTagsChanged: () => Promise<void> | void;
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

export function AlbumTagManagerModal({
  albumId,
  tags,
  open,
  onOpenChange,
  onTagsChanged,
}: AlbumTagManagerModalProps) {
  const [newTag, setNewTag] = useState<TagDraft>(emptyDraft);
  const [drafts, setDrafts] = useState<Record<string, TagDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleCreate = async () => {
    if (!hasVisibleMarker(newTag)) {
      setError("Add a name, emoji, or color.");
      return;
    }

    setError(null);
    setIsCreating(true);
    try {
      await createAlbumTag(albumId, {
        ...normalizeDraft(newTag),
        sort_order: tags.length,
      });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Album tags</DialogTitle>
          <DialogDescription>
            Create labels for organizing this album.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-md border p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_90px_120px_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="new-tag-name">Name</Label>
              <Input
                id="new-tag-name"
                value={newTag.name}
                onChange={(event) =>
                  setNewTag((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                maxLength={100}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-tag-emoji">Emoji</Label>
              <Input
                id="new-tag-emoji"
                value={newTag.emoji}
                onChange={(event) =>
                  setNewTag((current) => ({
                    ...current,
                    emoji: event.target.value,
                  }))
                }
                maxLength={16}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-tag-color">Color</Label>
              <Input
                id="new-tag-color"
                value={newTag.color}
                placeholder="#2563eb"
                onChange={(event) =>
                  setNewTag((current) => ({
                    ...current,
                    color: event.target.value,
                  }))
                }
                maxLength={32}
              />
            </div>
            <Button
              type="button"
              className="self-end"
              onClick={handleCreate}
              disabled={isCreating}
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </Button>
          </div>
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {tags.map((tag) => {
            const draft = drafts[tag.id] || emptyDraft;
            const isSaving = savingId === tag.id;

            return (
              <div
                key={tag.id}
                className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_90px_120px_auto_auto]"
              >
                <Input
                  value={draft.name}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [tag.id]: {
                        ...draft,
                        name: event.target.value,
                      },
                    }))
                  }
                  maxLength={100}
                  aria-label="Tag name"
                />
                <Input
                  value={draft.emoji}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [tag.id]: {
                        ...draft,
                        emoji: event.target.value,
                      },
                    }))
                  }
                  maxLength={16}
                  aria-label="Tag emoji"
                />
                <Input
                  value={draft.color}
                  placeholder="#2563eb"
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [tag.id]: {
                        ...draft,
                        color: event.target.value,
                      },
                    }))
                  }
                  maxLength={32}
                  aria-label="Tag color"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
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
                  onClick={() => handleDelete(tag)}
                  disabled={isSaving}
                  aria-label="Delete tag"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
