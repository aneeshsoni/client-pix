import CollectionAlbumClient from "./CollectionAlbumClient";

export default async function CollectionAlbumPage({
  params,
}: {
  params: Promise<{ token: string; albumId: string }>;
}) {
  const { token, albumId } = await params;
  return <CollectionAlbumClient token={token} albumId={albumId} />;
}
