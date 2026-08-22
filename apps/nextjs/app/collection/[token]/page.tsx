import { Metadata } from "next";
import { headers } from "next/headers";
import CollectionPageClient from "./CollectionPageClient";

const getServerApiUrl = () =>
  process.env.INTERNAL_API_URL || "http://backend:8000";

interface CollectionInfo {
  title: string;
  description: string | null;
  album_count: number;
}

async function getCollectionInfo(token: string): Promise<CollectionInfo | null> {
  try {
    const response = await fetch(
      `${getServerApiUrl()}/api/collection-share/${token}/info`,
      { next: { revalidate: 60 } },
    );
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const info = await getCollectionInfo(token);
  if (!info) {
    return {
      title: "Shared Collection",
      description: "View this shared photo collection",
    };
  }

  const title = info.title || "Shared Collection";
  const description =
    info.description ||
    `View ${info.album_count} album${info.album_count === 1 ? "" : "s"} in this collection`;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "";
  const protocol = requestHeaders.get("x-forwarded-proto") || "https";
  const baseUrl = host ? `${protocol}://${host}` : "";
  const imageUrl = info.album_count
    ? `${baseUrl}/api/collection-share/${token}/og-image`
    : `${baseUrl}/client_pix_logo.png`;

  return {
    title,
    description,
    icons: {
      icon: "/client_pix_logo.png",
      apple: "/client_pix_logo.png",
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: imageUrl, alt: title, width: 1200, height: 630 }],
    },
    twitter: {
      card: info.album_count ? "summary_large_image" : "summary",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CollectionPageClient token={token} />;
}
