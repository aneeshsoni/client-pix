"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImageIcon, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  accessSharedCollection,
  getCollectionImageUrl,
  getCollectionInfo,
  type SharedCollection,
} from "@/lib/api";

export default function CollectionPageClient({ token }: { token: string }) {
  const [collection, setCollection] = useState<SharedCollection | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const openCollection = useCallback(
    async (value?: string) => {
      setLoading(true);
      setError("");
      try {
        const data = await accessSharedCollection(token, value);
        setCollection(data);
        if (value) {
          window.sessionStorage.setItem(
            `client-pix-collection-password:${token}`,
            value,
          );
          setPassword(value);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to open collection");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const info = await getCollectionInfo(token);
        if (info.is_password_protected) {
          setPasswordRequired(true);
          const saved = window.sessionStorage.getItem(
            `client-pix-collection-password:${token}`,
          );
          if (saved) await openCollection(saved);
          else setLoading(false);
        } else {
          await openCollection();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Collection not found");
        setLoading(false);
      }
    };
    void load();
  }, [openCollection, token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (passwordRequired && !collection) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <form
          className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void openCollection(password);
          }}
        >
          <div className="text-center">
            <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
            <h1 className="mt-3 text-xl font-semibold">Private Collection</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the collection password to view its albums.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
          />
          <Button className="w-full" type="submit">
            View Collection
          </Button>
        </form>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="flex min-h-screen items-center justify-center text-destructive">
        {error || "Collection not found"}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-8">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Collection
          </p>
          <h1 className="mt-1 text-3xl font-semibold">{collection.title}</h1>
          {collection.description && (
            <p className="mt-2 max-w-2xl text-muted-foreground">
              {collection.description}
            </p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {collection.albums.length} album
            {collection.albums.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>
      <main className="container mx-auto p-4 py-8">
        {collection.albums.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            This collection does not contain any albums yet.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {collection.albums.map((album) => (
              <Link
                key={album.id}
                href={`/collection/${token}/albums/${album.id}`}
                className="group overflow-hidden rounded-xl border bg-card"
              >
                <div className="relative aspect-[4/3] bg-muted">
                  {album.cover_photo_id ? (
                    <Image
                      src={getCollectionImageUrl(
                        token,
                        album.id,
                        album.cover_photo_id,
                        "thumbnail",
                        password || undefined,
                      )}
                      alt={album.title}
                      fill
                      unoptimized
                      className="object-cover transition-transform group-hover:scale-105"
                      style={{
                        objectPosition: `${album.cover_photo_position_x}% ${album.cover_photo_position_y}%`,
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="font-semibold">{album.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {album.photo_count} item{album.photo_count === 1 ? "" : "s"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
