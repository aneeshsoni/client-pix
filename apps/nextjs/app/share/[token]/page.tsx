import { Metadata } from "next";
import SharePageClient from "./SharePageClient";

// Server-side API URL for metadata fetching
const getServerApiUrl = () => {
  // In server components, we need the full URL
  // Use internal Docker network URL if available, otherwise fall back to public URL
  return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://python:8000";
};

interface SharePageProps {
  params: Promise<{ token: string }>;
}

interface ShareInfo {
  is_password_protected: boolean;
  album_id: string;
  album_title: string;
  album_description: string | null;
  cover_photo_url: string | null;
  photo_count: number;
}

async function getShareInfo(token: string): Promise<ShareInfo | null> {
  try {
    const apiUrl = getServerApiUrl();
    const response = await fetch(`${apiUrl}/api/share/${token}/info`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching share info for metadata:", error);
    return null;
  }
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { token } = await params;
  const shareInfo = await getShareInfo(token);

  if (!shareInfo) {
    return {
      title: "Shared Album",
      description: "View this shared photo album",
    };
  }

  const title = shareInfo.album_title || "Shared Album";
  const description = shareInfo.album_description || 
    `View ${shareInfo.photo_count} photo${shareInfo.photo_count !== 1 ? 's' : ''} in this album`;

  // Build the OG image URL
  // We need to use the public URL for the image since crawlers access it externally
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const ogImageUrl = shareInfo.cover_photo_url 
    ? `${publicUrl}/api/uploads/${shareInfo.cover_photo_url}`
    : null;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(ogImageUrl && {
        images: [
          {
            url: ogImageUrl,
            alt: title,
          },
        ],
      }),
    },
    twitter: {
      card: ogImageUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(ogImageUrl && {
        images: [ogImageUrl],
      }),
    },
  };
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  return <SharePageClient token={token} />;
}
