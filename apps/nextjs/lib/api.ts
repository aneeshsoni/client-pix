/**
 * API client for communicating with the Python backend
 */

// In development with nginx: use port 80
// Without nginx: use port 8000 directly
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost";

// --- Types ---

export interface Album {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  cover_photo_id: string | null;
  cover_photo_thumbnail: string | null;
  photo_count: number;
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: string;
  album_id: string;
  original_filename: string;
  caption: string | null;
  sort_order: number;
  storage_path: string;
  thumbnail_path: string;
  web_path: string;
  width: number;
  height: number;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface AlbumDetail extends Album {
  photos: Photo[];
}

export interface AlbumListResponse {
  albums: Album[];
  total_count: number;
}

export interface PhotoUploadResponse {
  photos: Photo[];
  uploaded_count: number;
  duplicate_count: number;
}

// --- API Functions ---

export async function createAlbum(
  title: string,
  description?: string
): Promise<Album> {
  const response = await fetch(`${API_BASE_URL}/api/albums`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, description }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create album: ${response.statusText}`);
  }

  return response.json();
}

export async function listAlbums(): Promise<AlbumListResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/albums`, {
      cache: "no-store", // Always fetch latest
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(
        `Failed to fetch albums: ${response.status} ${errorText}`
      );
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `Network error: Unable to connect to backend at ${API_BASE_URL}. Make sure the backend is running.`
      );
    }
    throw error;
  }
}

export async function getAlbum(albumId: string): Promise<AlbumDetail> {
  const response = await fetch(`${API_BASE_URL}/api/albums/${albumId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch album: ${response.statusText}`);
  }

  return response.json();
}

export async function getAlbumBySlug(slug: string): Promise<AlbumDetail> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/albums/slug/${encodeURIComponent(slug)}`
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Failed to fetch album: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `Network error: Unable to connect to backend at ${API_BASE_URL}. Make sure the backend is running.`
      );
    }
    throw error;
  }
}

export async function updateAlbum(
  albumId: string,
  data: { title?: string; description?: string; cover_photo_id?: string }
): Promise<Album> {
  const response = await fetch(`${API_BASE_URL}/api/albums/${albumId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to update album: ${response.statusText}`);
  }

  return response.json();
}

export async function deleteAlbum(albumId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/albums/${albumId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to delete album: ${response.statusText}`);
  }
}

export async function uploadPhotosToAlbum(
  albumId: string,
  files: File[],
  onProgress?: (uploaded: number, total: number) => void
): Promise<PhotoUploadResponse> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await fetch(`${API_BASE_URL}/api/albums/${albumId}/photos`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload photos: ${response.statusText}`);
  }

  return response.json();
}

export async function deletePhoto(
  albumId: string,
  photoId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}/photos/${photoId}`,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete photo: ${response.statusText}`);
  }
}

export async function setCoverPhoto(
  albumId: string,
  photoId: string
): Promise<Album> {
  const response = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}/cover/${photoId}`,
    {
      method: "PUT",
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to set cover photo: ${response.statusText}`);
  }

  return response.json();
}

export async function getAllPhotos(): Promise<Photo[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/albums/photos/all`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(
        `Failed to fetch photos: ${response.status} ${errorText}`
      );
    }

    const data = await response.json();
    return data.photos;
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `Network error: Unable to connect to backend at ${API_BASE_URL}. Make sure the backend is running.`
      );
    }
    throw error;
  }
}

// --- Helper to get image URLs ---

export function getImageUrl(path: string): string {
  // Serve directly from the uploads folder
  // In production, this would go through a CDN or nginx
  return `${API_BASE_URL}/uploads/${path}`;
}

export function getDownloadUrl(albumId: string, photoId: string): string {
  // Use the download endpoint which sets proper Content-Disposition header
  return `${API_BASE_URL}/api/albums/${albumId}/photos/${photoId}/download`;
}

// --- Share Link Types ---

export interface ShareLink {
  id: string;
  album_id: string;
  token: string;
  share_url: string;
  is_password_protected: boolean;
  expires_at: string | null;
  is_revoked: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShareLinkListResponse {
  share_links: ShareLink[];
  total_count: number;
}

// --- Share Link API ---

export async function createShareLink(
  albumId: string,
  password?: string
): Promise<ShareLink> {
  const response = await fetch(`${API_BASE_URL}/api/albums/${albumId}/share`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: password || null }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || "Failed to create share link");
  }

  return response.json();
}

export async function getShareLinks(albumId: string): Promise<ShareLink[]> {
  const response = await fetch(`${API_BASE_URL}/api/albums/${albumId}/share`);

  if (!response.ok) {
    throw new Error(`Failed to fetch share links: ${response.statusText}`);
  }

  const data: ShareLinkListResponse = await response.json();
  return data.share_links;
}

export async function updateShareLink(
  albumId: string,
  shareLinkId: string,
  updates: {
    password?: string | null;
    expires_at?: string | null;
    is_revoked?: boolean;
  }
): Promise<ShareLink> {
  const response = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}/share/${shareLinkId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || "Failed to update share link");
  }

  return response.json();
}

export async function deleteShareLink(
  albumId: string,
  shareLinkId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}/share/${shareLinkId}`,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete share link: ${response.statusText}`);
  }
}
