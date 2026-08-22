"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { NewAlbumModal } from "@/components/gallery/NewAlbumModal";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteCollection,
  getCollection,
  listAlbums,
  updateCollection,
  type Album,
  type Collection,
} from "@/lib/api";

export default function CollectionDetailPage() {
  const params = useParams<{ collectionId: string }>();
  const router = useRouter();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [accessLevel, setAccessLevel] = useState<"public" | "private">("public");
  const [password, setPassword] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [selectedAlbums, setSelectedAlbums] = useState<string[]>([]);
  const [newAlbumOpen, setNewAlbumOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [collectionData, albumData] = await Promise.all([
        getCollection(params.collectionId),
        listAlbums(),
      ]);
      setCollection(collectionData);
      setAlbums(albumData.albums);
      setTitle(collectionData.title);
      setDescription(collectionData.description || "");
      setAccessLevel(collectionData.access_level);
      setCustomSlug(collectionData.custom_slug || "");
      setSelectedAlbums(collectionData.albums.map((album) => album.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load collection");
    } finally {
      setLoading(false);
    }
  }, [params.collectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await updateCollection(params.collectionId, {
        title,
        description: description || null,
        access_level: accessLevel,
        password: password || undefined,
        custom_slug: customSlug || null,
        album_ids: selectedAlbums,
      });
      setCollection(updated);
      setPassword("");
      setMessage("Collection updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save collection");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!collection) {
    return <div className="p-6 text-destructive">{error}</div>;
  }

  return (
    <>
      <header className="flex h-16 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard/collections">Collections</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{collection.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <form onSubmit={save} className="mx-auto max-w-2xl space-y-6">
          <section className="space-y-4 rounded-xl border bg-card p-6">
            <div>
              <h1 className="text-xl font-semibold">Collection settings</h1>
              <p className="text-sm text-muted-foreground">
                Every album uses this collection&apos;s single access policy.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && (
              <p className="flex items-center gap-2 text-sm text-green-600">
                <Check className="h-4 w-4" />
                {message}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="title">Name</Label>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="access">Access</Label>
              <select
                id="access"
                value={accessLevel}
                onChange={(event) =>
                  setAccessLevel(event.target.value as "public" | "private")
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="public">Public — anyone with the link</option>
                <option value="private">Private — password required</option>
              </select>
            </div>
            {accessLevel === "private" && (
              <div className="space-y-2">
                <Label htmlFor="password">
                  {collection.access_level === "private"
                    ? "New password (optional)"
                    : "Password"}
                </Label>
                <Input
                  id="password"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required={collection.access_level !== "private"}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="customSlug">Custom link (optional)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/collection/</span>
                <Input
                  id="customSlug"
                  value={customSlug}
                  onChange={(event) =>
                    setCustomSlug(
                      event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                  minLength={3}
                  maxLength={100}
                  pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
                  placeholder="smith-wedding"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Leave blank to use the random link.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Share link</Label>
              <div className="flex gap-2">
                <Input value={collection.share_url} readOnly />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={async () => {
                    await navigator.clipboard.writeText(collection.share_url);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border bg-card p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Albums</h2>
                <p className="text-sm text-muted-foreground">
                  An album may belong to any number of collections.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewAlbumOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Album
              </Button>
            </div>
            <div className="space-y-1">
              {albums.map((album) => (
                <label
                  key={album.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={selectedAlbums.includes(album.id)}
                    onChange={(event) =>
                      setSelectedAlbums(
                        event.target.checked
                          ? [...selectedAlbums, album.id]
                          : selectedAlbums.filter((id) => id !== album.id),
                      )
                    }
                  />
                  <span>{album.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {album.photo_count} items
                  </span>
                </label>
              ))}
            </div>
          </section>

          <div className="flex justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!window.confirm("Delete this collection? Albums are kept.")) {
                  return;
                }
                await deleteCollection(collection.id);
                router.push("/dashboard/collections");
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Collection
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </main>
      <NewAlbumModal
        open={newAlbumOpen}
        onOpenChange={setNewAlbumOpen}
        onAlbumCreated={(album) => {
          setAlbums((current) => [...current, album]);
          setSelectedAlbums((current) =>
            current.includes(album.id) ? current : [...current, album.id],
          );
          setMessage("Album created and selected. Save changes to add it.");
        }}
      />
    </>
  );
}
