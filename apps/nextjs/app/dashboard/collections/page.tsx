"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FolderPlus, Globe, ImageIcon, Loader2, Lock } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import {
  createCollection,
  getSecureImageUrl,
  listAlbums,
  listCollections,
  type Album,
  type Collection,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function CollectionsPage() {
  const { token } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [accessLevel, setAccessLevel] = useState<"public" | "private">("public");
  const [password, setPassword] = useState("");
  const [selectedAlbums, setSelectedAlbums] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [collectionData, albumData] = await Promise.all([
        listCollections(),
        listAlbums(),
      ]);
      setCollections(collectionData);
      setAlbums(albumData.albums);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setAccessLevel("public");
    setPassword("");
    setSelectedAlbums([]);
    setError("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createCollection({
        title,
        description: description || null,
        access_level: accessLevel,
        password: accessLevel === "private" ? password : undefined,
        album_ids: selectedAlbums,
      });
      setOpen(false);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create collection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="flex h-16 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Collections</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {collections.length} collection{collections.length === 1 ? "" : "s"}
          </span>
          <Button className="rounded-full" onClick={() => setOpen(true)}>
            <FolderPlus className="mr-2 h-4 w-4" />
            New Collection
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : collections.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <p>No collections yet</p>
            <p className="mt-1 text-sm">
              Group albums together and share them with one link.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => {
              const coverAlbum = collection.albums.find(
                (album) => album.cover_photo_id,
              );
              return (
                <Link
                  key={collection.id}
                  href={`/dashboard/collections/${collection.id}`}
                  className="group overflow-hidden rounded-xl border bg-card"
                >
                  <div className="relative aspect-[4/3] bg-muted">
                    {coverAlbum?.cover_photo_id ? (
                      <Image
                        src={getSecureImageUrl(
                          coverAlbum.cover_photo_id,
                          "thumbnail",
                          token || undefined,
                        )}
                        alt={collection.title}
                        fill
                        unoptimized
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute left-4 right-4 bottom-4 text-white">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold">
                          {collection.title}
                        </h2>
                        {collection.access_level === "private" ? (
                          <Lock className="h-4 w-4" />
                        ) : (
                          <Globe className="h-4 w-4" />
                        )}
                      </div>
                      <p className="text-sm text-white/70">
                        {collection.album_count} album
                        {collection.album_count === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Collection</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="collectionTitle">Name</Label>
              <Input
                id="collectionTitle"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="collectionDescription">Description</Label>
              <Textarea
                id="collectionDescription"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="collectionAccess">Access</Label>
              <select
                id="collectionAccess"
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
                <Label htmlFor="collectionPassword">Password</Label>
                <Input
                  id="collectionPassword"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
            )}
            <AlbumPicker
              albums={albums}
              selected={selectedAlbums}
              onChange={setSelectedAlbums}
            />
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Collection
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AlbumPicker({
  albums,
  selected,
  onChange,
}: {
  albums: Album[];
  selected: string[];
  onChange: (albumIds: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Albums</Label>
      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
        {albums.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">
            Create an album first.
          </p>
        ) : (
          albums.map((album) => (
            <label
              key={album.id}
              className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.includes(album.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, album.id]
                      : selected.filter((id) => id !== album.id),
                  )
                }
              />
              <span className="text-sm">{album.title}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {album.photo_count} items
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
