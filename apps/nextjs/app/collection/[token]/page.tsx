import CollectionPageClient from "./CollectionPageClient";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CollectionPageClient token={token} />;
}
