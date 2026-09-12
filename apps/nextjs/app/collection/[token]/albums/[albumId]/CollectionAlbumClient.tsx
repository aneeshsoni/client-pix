"use client";

import SharePageClient from "@/app/share/[token]/SharePageClient";

export default function CollectionAlbumClient({ token, albumId }: { token: string; albumId: string }) {
  return <SharePageClient key={`${token}:${albumId}`} token={token} collectionAlbumId={albumId} />;
}
