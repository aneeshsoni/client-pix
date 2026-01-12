import { Metadata } from "next";
import { headers } from "next/headers";
import SharePageClient from "./SharePageClient";

// Server-side API URL for metadata fetching
// In Docker, Next.js can reach the backend via the internal network
const getServerApiUrl = () => {
  return process.env.INTERNAL_API_URL || "http://backend:8000";
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
    console.log(
      `[OG Metadata] Fetching share info from: ${apiUrl}/api/share/${token}/info`
    );

    const response = await fetch(`${apiUrl}/api/share/${token}/info`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      console.log(`[OG Metadata] API returned status ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`[OG Metadata] Got share info:`, data);
    return data;
  } catch (error) {
    console.error("[OG Metadata] Error fetching share info:", error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: SharePageProps): Promise<Metadata> {
  const { token } = await params;
  const shareInfo = await getShareInfo(token);

  if (!shareInfo) {
    return {
      title: "Shared Album",
      description: "View this shared photo album",
    };
  }

  const title = shareInfo.album_title || "Shared Album";
  const description =
    shareInfo.album_description ||
    `View ${shareInfo.photo_count} photo${
      shareInfo.photo_count !== 1 ? "s" : ""
    } in this album`;

  // Get the host from headers to build absolute OG image URL
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const protocol = headersList.get("x-forwarded-proto") || "https";
  const baseUrl = host ? `${protocol}://${host}` : "";

  // Build the OG image URL - crawlers need absolute URLs
  const ogImageUrl = shareInfo.cover_photo_url
    ? `${baseUrl}/api/uploads/${shareInfo.cover_photo_url}`
    : null;

  console.log(
    `[OG Metadata] Generated metadata - title: ${title}, ogImage: ${ogImageUrl}`
  );

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
