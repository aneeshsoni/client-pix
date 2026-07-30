"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Loader2, X } from "lucide-react";
import {
  accessSharedCollectionAlbum,
  getCollectionImageUrl,
  type SharedCollectionAlbum,
  type SharedCollectionPhoto,
} from "@/lib/api";

export default function CollectionAlbumClient({
  token,
  albumId,
}: {
  token: string;
  albumId: string;
}) {
  const [album, setAlbum] = useState<SharedCollectionAlbum | null>(null);
  const [selected, setSelected] = useState<SharedCollectionPhoto | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const saved =
        window.sessionStorage.getItem(
          `client-pix-collection-password:${token}`,
        ) || "";
      setPassword(saved);
      try {
        setAlbum(
          await accessSharedCollectionAlbum(
            token,
            albumId,
            saved || undefined,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to open album");
      }
    };
    void load();
  }, [albumId, token]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Link className="text-primary hover:underline" href={`/collection/${token}`}>
          Return to collection
        </Link>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <Link
            href={`/collection/${token}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to collection
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">{album.title}</h1>
          {album.description && (
            <p className="mt-1 text-muted-foreground">{album.description}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {album.photo_count} item{album.photo_count === 1 ? "" : "s"}
          </p>
        </div>
      </header>
      <main className="container mx-auto p-2 py-6 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {album.photos.map((photo) => (
            <button
              key={photo.id}
              onClick={() => setSelected(photo)}
              className="relative aspect-square overflow-hidden rounded-md bg-muted"
            >
              <Image
                src={getCollectionImageUrl(
                  token,
                  album.id,
                  photo.id,
                  "thumbnail",
                  password || undefined,
                )}
                alt={photo.original_filename}
                fill
                unoptimized
                className="object-cover transition-transform hover:scale-105"
              />
            </button>
          ))}
        </div>
      </main>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setSelected(null)}
        >
          <button
            className="absolute right-4 top-4 rounded-full p-2 text-white"
            onClick={() => setSelected(null)}
          >
            <X className="h-6 w-6" />
          </button>
          {selected.is_video ? (
            <video
              src={getCollectionImageUrl(
                token,
                album.id,
                selected.id,
                "web",
                password || undefined,
              )}
              controls
              autoPlay
              playsInline
              className="max-h-[90vh] max-w-[95vw]"
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <Image
              src={getCollectionImageUrl(
                token,
                album.id,
                selected.id,
                "web",
                password || undefined,
              )}
              alt={selected.original_filename}
              width={selected.width}
              height={selected.height}
              unoptimized
              className="max-h-[90vh] max-w-[95vw] object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}
