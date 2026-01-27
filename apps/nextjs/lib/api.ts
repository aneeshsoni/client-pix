/**
 * API client for communicating with the Python backend
 *
 * Uses relative URLs so it works automatically with any domain.
 * No need to configure NEXT_PUBLIC_API_URL - just works!
 */

// Empty string = relative URLs (works with any domain via Nginx proxy)
const API_BASE_URL = "";

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
  captured_at: string | null;
  is_video: boolean;
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
  description?: string,
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
        `Failed to fetch albums: ${response.status} ${errorText}`,
      );
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        "Network error: Unable to connect to backend. Make sure the backend is running.",
      );
    }
    throw error;
  }
}

export async function getAlbum(
  albumId: string,
  sortBy: "captured" | "uploaded" = "captured",
): Promise<AlbumDetail> {
  const response = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}?sort_by=${sortBy}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch album: ${response.statusText}`);
  }

  return response.json();
}

export async function getAlbumBySlug(
  slug: string,
  sortBy: "captured" | "uploaded" = "captured",
): Promise<AlbumDetail> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/albums/slug/${encodeURIComponent(
        slug,
      )}?sort_by=${sortBy}`,
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Failed to fetch album: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        "Network error: Unable to connect to backend. Make sure the backend is running.",
      );
    }
    throw error;
  }
}

export async function updateAlbum(
  albumId: string,
  data: { title?: string; description?: string; cover_photo_id?: string },
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

export async function deleteAlbum(
  albumId: string,
  deletePhotos: boolean = false,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}?delete_photos=${deletePhotos}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to delete album: ${response.statusText}`);
  }
}

/**
 * Upload a single file with progress tracking using XMLHttpRequest.
 * Returns a promise that resolves with the response or rejects on error.
 */
function uploadFileWithProgress(
  url: string,
  formData: FormData,
  onProgress?: (loaded: number, total: number) => void,
  timeoutMs: number = 15 * 60 * 1000,
): Promise<PhotoUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded, e.total);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error during upload"));
    });

    xhr.addEventListener("timeout", () => {
      reject(new Error("Upload timed out"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload aborted"));
    });

    xhr.open("POST", url);
    xhr.timeout = timeoutMs;
    xhr.send(formData);
  });
}

// Threshold for chunked upload (50MB)
const CHUNKED_UPLOAD_THRESHOLD = 50 * 1024 * 1024;
// Chunk size (1MB - small enough to pass through proxy buffers)
const CHUNK_SIZE = 1 * 1024 * 1024;

/**
 * Upload a large file using chunked upload.
 * Splits the file into small chunks that can pass through proxy buffers.
 */
async function uploadLargeFileChunked(
  albumId: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<PhotoUploadResponse> {
  // Initialize upload session
  const initResponse = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}/upload/init?filename=${encodeURIComponent(
      file.name,
    )}&file_size=${file.size}`,
    { method: "POST" },
  );

  if (!initResponse.ok) {
    throw new Error(`Failed to initialize upload: ${initResponse.statusText}`);
  }

  const { upload_id } = await initResponse.json();

  // Upload chunks
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let uploadedBytes = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const chunkResponse = await fetch(
      `${API_BASE_URL}/api/albums/${albumId}/upload/${upload_id}/chunk?chunk_index=${chunkIndex}`,
      {
        method: "POST",
        body: chunk,
        headers: {
          "Content-Type": "application/octet-stream",
        },
      },
    );

    if (!chunkResponse.ok) {
      throw new Error(
        `Failed to upload chunk ${chunkIndex}: ${chunkResponse.statusText}`,
      );
    }

    uploadedBytes += chunk.size;
    onProgress?.(uploadedBytes, file.size);
  }

  // Complete the upload
  const completeResponse = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}/upload/${upload_id}/complete`,
    { method: "POST" },
  );

  if (!completeResponse.ok) {
    const errorText = await completeResponse.text();
    throw new Error(`Failed to complete upload: ${errorText}`);
  }

  return completeResponse.json();
}

/**
 * Upload photos to an album in batches for reliability.
 *
 * Uploads in batches of BATCH_SIZE to prevent timeouts and memory issues.
 * Supports uploading 100+ photos at once.
 * Uses chunked upload for files > 50MB to bypass proxy buffer limits.
 *
 * @param albumId - Album to upload to
 * @param files - Array of files to upload
 * @param onProgress - Callback with (uploaded, total) counts for batch progress
 * @param onUploadProgress - Callback with (loaded, total) bytes for real-time progress
 * @param batchSize - Number of files per batch (default: 1 for large files to show progress)
 */
export async function uploadPhotosToAlbum(
  albumId: string,
  files: File[],
  onProgress?: (uploaded: number, total: number) => void,
  onUploadProgress?: (loaded: number, total: number) => void,
  _batchSize: number = 1, // Default to 1 for better progress tracking
): Promise<PhotoUploadResponse> {
  const allPhotos: Photo[] = [];
  let totalUploaded = 0;
  let totalDuplicates = 0;
  let successfullyProcessed = 0;

  // Calculate total size for progress
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  let uploadedSize = 0;

  // Process files one at a time for large files, or in batches for small files
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      let result: PhotoUploadResponse;

      if (file.size > CHUNKED_UPLOAD_THRESHOLD) {
        // Use chunked upload for large files
        console.log(
          `Using chunked upload for ${file.name} (${(
            file.size /
            1024 /
            1024
          ).toFixed(1)} MB)`,
        );
        result = await uploadLargeFileChunked(
          albumId,
          file,
          (loaded, _total) => {
            onUploadProgress?.(uploadedSize + loaded, totalSize);
          },
        );
      } else {
        // Use regular upload for small files
        const formData = new FormData();
        formData.append("files", file);

        result = await uploadFileWithProgress(
          `${API_BASE_URL}/api/albums/${albumId}/photos`,
          formData,
          (loaded, _total) => {
            onUploadProgress?.(uploadedSize + loaded, totalSize);
          },
          15 * 60 * 1000,
        );
      }

      allPhotos.push(...result.photos);
      totalUploaded += result.uploaded_count;
      totalDuplicates += result.duplicate_count;
      successfullyProcessed += 1;
      uploadedSize += file.size;
    } catch (error) {
      console.error(`File ${i + 1}/${files.length} error:`, error);
      uploadedSize += file.size; // Still count for progress
    }

    // Report file progress
    onProgress?.(i + 1, files.length);
  }

  // If nothing was uploaded at all, throw an error
  if (successfullyProcessed === 0 && files.length > 0) {
    throw new Error("Failed to upload any files. Please try again.");
  }

  return {
    photos: allPhotos,
    uploaded_count: totalUploaded,
    duplicate_count: totalDuplicates,
  };
}

export async function deletePhoto(
  albumId: string,
  photoId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}/photos/${photoId}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to delete photo: ${response.statusText}`);
  }
}

export async function bulkDeletePhotos(
  albumId: string,
  photoIds: string[],
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}/photos/bulk-delete`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(photoIds),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to delete photos: ${response.statusText}`);
  }
}

export async function bulkDownloadPhotos(
  albumId: string,
  photoIds: string[],
): Promise<Blob> {
  const response = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}/photos/bulk-download`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(photoIds),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to download photos: ${response.statusText}`);
  }

  return response.blob();
}

export async function setCoverPhoto(
  albumId: string,
  photoId: string,
): Promise<Album> {
  const response = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}/cover/${photoId}`,
    {
      method: "PUT",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to set cover photo: ${response.statusText}`);
  }

  return response.json();
}

export async function getAllPhotos(
  sortBy: "captured" | "uploaded" = "captured",
): Promise<Photo[]> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/albums/photos/all?sort_by=${encodeURIComponent(
        sortBy,
      )}`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(
        `Failed to fetch photos: ${response.status} ${errorText}`,
      );
    }

    const data = await response.json();
    return data.photos;
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        "Network error: Unable to connect to backend. Make sure the backend is running.",
      );
    }
    throw error;
  }
}

// --- Helper to get image URLs (Secure - requires auth token) ---

/**
 * Get a secure image URL for authenticated users.
 * Images are served through the API with JWT authentication.
 *
 * @param photoId - The photo ID
 * @param variant - "thumbnail" | "web" | "original" (default: "web")
 * @param token - JWT auth token (passed via query param for Image components)
 */
export function getSecureImageUrl(
  photoId: string,
  variant: "thumbnail" | "web" | "original" = "web",
  token?: string,
): string {
  let url = `${API_BASE_URL}/api/files/photo/${photoId}?variant=${variant}`;
  if (token) {
    url += `&token=${encodeURIComponent(token)}`;
  }
  return url;
}

/**
 * Get a secure image URL by file hash (for cover photos).
 * @param fileHash - The SHA256 hash of the file
 * @param variant - Image variant
 * @param token - JWT auth token
 */
export function getSecureImageUrlByHash(
  fileHash: string,
  variant: "thumbnail" | "web" | "original" = "web",
  token?: string,
): string {
  let url = `${API_BASE_URL}/api/files/hash/${fileHash}?variant=${variant}`;
  if (token) {
    url += `&token=${encodeURIComponent(token)}`;
  }
  return url;
}

/**
 * Get image URL for shared album (public with share token validation).
 *
 * @param shareToken - The share link token
 * @param photoId - The photo ID
 * @param variant - Image variant
 * @param password - Password if share is protected
 */
export function getSharedImageUrl(
  shareToken: string,
  photoId: string,
  variant: "thumbnail" | "web" | "original" = "web",
  password?: string,
): string {
  let url = `${API_BASE_URL}/api/files/share/${shareToken}/photo/${photoId}?variant=${variant}`;
  if (password) {
    url += `&password=${encodeURIComponent(password)}`;
  }
  return url;
}

/**
 * @deprecated - Use getSecureImageUrl for authenticated access or getSharedImageUrl for shared access.
 * This function no longer works as direct file access has been removed for security.
 */
export function getImageUrl(path: string): string {
  console.warn(
    "getImageUrl is deprecated. Use getSecureImageUrl or getSharedImageUrl instead.",
  );
  // Return a placeholder that will 404 - this helps identify code that needs updating
  return `${API_BASE_URL}/api/files/deprecated?path=${encodeURIComponent(
    path,
  )}`;
}

export function getDownloadUrl(albumId: string, photoId: string): string {
  // Use the download endpoint which sets proper Content-Disposition header
  return `${API_BASE_URL}/api/albums/${albumId}/photos/${photoId}/download`;
}

export function getDownloadAllUrl(albumId: string): string {
  // Direct link to download all photos in an album as a zip
  return `${API_BASE_URL}/api/albums/${albumId}/download-all`;
}

// --- Share Link Types ---

export interface ShareLink {
  id: string;
  album_id: string;
  token: string;
  custom_slug: string | null;
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
  password?: string,
  customSlug?: string,
  expiresAt?: string,
): Promise<ShareLink> {
  const response = await fetch(`${API_BASE_URL}/api/albums/${albumId}/share`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      password: password || null,
      custom_slug: customSlug || null,
      expires_at: expiresAt || null,
    }),
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
  },
): Promise<ShareLink> {
  const response = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}/share/${shareLinkId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    },
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || "Failed to update share link");
  }

  return response.json();
}

export async function deleteShareLink(
  albumId: string,
  shareLinkId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/albums/${albumId}/share/${shareLinkId}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to delete share link: ${response.statusText}`);
  }
}

// --- Storage API ---

export interface StorageInfo {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  used_percentage: number;
}

export interface AlbumStorageStats {
  album_id: string;
  album_title: string;
  album_slug: string;
  photo_count: number;
  video_count: number;
  total_bytes: number;
  percentage: number;
}

export interface StorageBreakdown {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  used_percentage: number;
  albums: AlbumStorageStats[];
  other_bytes: number;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const response = await fetch(`${API_BASE_URL}/api/system/storage`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch storage info: ${response.statusText}`);
  }

  return response.json();
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const response = await fetch(`${API_BASE_URL}/api/system/storage/albums`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch storage breakdown: ${response.statusText}`,
    );
  }

  return response.json();
}

export interface TempFilesInfo {
  download_files_count: number;
  download_files_bytes: number;
  upload_temp_files_count: number;
  upload_temp_files_bytes: number;
  chunked_uploads_count: number;
  chunked_uploads_bytes: number;
  total_bytes: number;
}

export async function getTempFilesInfo(): Promise<TempFilesInfo> {
  const response = await fetch(`${API_BASE_URL}/api/system/temp-files`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch temp files info: ${response.statusText}`);
  }

  return response.json();
}

export interface CleanupResult {
  cleaned_count: number;
  cleaned_bytes: number;
  message: string;
}

export async function cleanupDownloadTempFiles(): Promise<CleanupResult> {
  const response = await fetch(`${API_BASE_URL}/api/system/cleanup/downloads`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to cleanup downloads: ${response.statusText}`);
  }

  return response.json();
}

export async function cleanupUploadTempFiles(): Promise<CleanupResult> {
  const response = await fetch(`${API_BASE_URL}/api/system/cleanup/uploads`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to cleanup uploads: ${response.statusText}`);
  }

  return response.json();
}
