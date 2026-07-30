/**
 * API client for communicating with the Python backend
 *
 * Uses relative URLs so it works automatically with any domain.
 * No need to configure NEXT_PUBLIC_API_URL - just works!
 */

import { authFetch, getAuthToken } from "./auth";

// Empty string = relative URLs (works with any domain via Nginx proxy)
const API_BASE_URL = "";

export type SortDir = "asc" | "desc";

// --- Types ---

export interface Album {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  cover_photo_id: string | null;
  cover_photo_thumbnail: string | null;
  cover_photo_position_x: number;
  cover_photo_position_y: number;
  photo_count: number;
  share_status: "public" | "password" | null;
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
  tags: PhotoTag[];
}

export interface AlbumDetail extends Album {
  photos: Photo[];
  tags: PhotoTag[];
}

export interface AlbumListResponse {
  albums: Album[];
  total_count: number;
}

export interface CollectionAlbum {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  cover_photo_id: string | null;
  cover_photo_position_x: number;
  cover_photo_position_y: number;
  photo_count: number;
}

export interface Collection {
  id: string;
  title: string;
  description: string | null;
  token: string;
  share_url: string;
  access_level: "public" | "private";
  album_count: number;
  albums: CollectionAlbum[];
  created_at: string;
  updated_at: string;
}

export interface CollectionPayload {
  title?: string;
  description?: string | null;
  access_level?: "public" | "private";
  password?: string;
  album_ids?: string[];
}

export interface SharedCollection {
  id: string;
  title: string;
  description: string | null;
  is_password_protected: boolean;
  requires_password: boolean;
  albums: CollectionAlbum[];
}

export interface SharedCollectionPhoto {
  id: string;
  thumbnail_path: string;
  web_path: string;
  width: number;
  height: number;
  original_filename: string;
  captured_at: string | null;
  created_at: string | null;
  is_video: boolean;
}

export interface SharedCollectionAlbum {
  id: string;
  title: string;
  description: string | null;
  photo_count: number;
  photos: SharedCollectionPhoto[];
}

export interface PhotoUploadResponse {
  photos: Photo[];
  uploaded_count: number;
  duplicate_count: number;
  failed_files?: UploadFailure[];
}

export interface UploadFailure {
  filename: string;
  code: string;
  message: string;
  retryable: boolean;
}

export interface UploadCapabilities {
  max_file_bytes: number;
  resumable_threshold_bytes: number;
  chunk_size_bytes: number;
  resumable_uploads: boolean;
}

export class UploadApiError extends Error {
  constructor(
    message: string,
    public readonly code = "UNKNOWN_UPLOAD_ERROR",
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "UploadApiError";
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function uploadErrorFromBody(
  body: unknown,
  fallback: string,
  status?: number,
): UploadApiError {
  const data = body as {
    detail?: string | { error?: { code?: string; message?: string; retryable?: boolean } };
    error?: { code?: string; message?: string; retryable?: boolean };
  };
  const structured =
    typeof data?.detail === "object" ? data.detail?.error : data?.error;
  if (structured?.message) {
    return new UploadApiError(
      structured.message,
      structured.code,
      structured.retryable,
    );
  }
  if (typeof data?.detail === "string") {
    return new UploadApiError(
      data.detail,
      status === 413 ? "FILE_TOO_LARGE" : "UPLOAD_FAILED",
    );
  }
  return new UploadApiError(fallback);
}

async function responseUploadError(
  response: Response,
  fallback: string,
): Promise<UploadApiError> {
  try {
    return uploadErrorFromBody(await response.json(), fallback, response.status);
  } catch {
    return new UploadApiError(fallback);
  }
}

export interface PhotoTag {
  id: string;
  album_id: string;
  name: string | null;
  emoji: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PhotoTagPayload {
  name?: string | null;
  emoji?: string | null;
  color?: string | null;
  sort_order?: number;
}

// --- API Functions ---

export async function createAlbum(
  title: string,
  description?: string,
): Promise<Album> {
  const response = await authFetch(`${API_BASE_URL}/api/albums`, {
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
    const response = await authFetch(`${API_BASE_URL}/api/albums`, {
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

export async function listCollections(): Promise<Collection[]> {
  const response = await authFetch(`${API_BASE_URL}/api/collections`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch collections: ${response.statusText}`);
  }
  const data = await response.json();
  return data.collections;
}

export async function getCollection(
  collectionId: string,
): Promise<Collection> {
  const response = await authFetch(
    `${API_BASE_URL}/api/collections/${collectionId}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch collection: ${response.statusText}`);
  }
  return response.json();
}

export async function createCollection(
  payload: Required<Pick<CollectionPayload, "title" | "access_level">> &
    CollectionPayload,
): Promise<Collection> {
  const response = await authFetch(`${API_BASE_URL}/api/collections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || "Failed to create collection");
  }
  return response.json();
}

export async function updateCollection(
  collectionId: string,
  payload: CollectionPayload,
): Promise<Collection> {
  const response = await authFetch(
    `${API_BASE_URL}/api/collections/${collectionId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || "Failed to update collection");
  }
  return response.json();
}

export async function deleteCollection(collectionId: string): Promise<void> {
  const response = await authFetch(
    `${API_BASE_URL}/api/collections/${collectionId}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(`Failed to delete collection: ${response.statusText}`);
  }
}

export async function getCollectionInfo(token: string): Promise<{
  title: string;
  description: string | null;
  is_password_protected: boolean;
  album_count: number;
}> {
  const response = await fetch(
    `${API_BASE_URL}/api/collection-share/${token}/info`,
  );
  if (!response.ok) {
    throw new Error("Collection not found");
  }
  return response.json();
}

export async function accessSharedCollection(
  token: string,
  password?: string,
): Promise<SharedCollection> {
  const response = await fetch(
    `${API_BASE_URL}/api/collection-share/${token}/access`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password || null }),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      response.status === 401
        ? "Incorrect password"
        : data?.detail || "Unable to open collection",
    );
  }
  return response.json();
}

export async function accessSharedCollectionAlbum(
  token: string,
  albumId: string,
  password?: string,
  sortBy: "captured" | "uploaded" = "captured",
  sortDir: SortDir = "asc",
): Promise<SharedCollectionAlbum> {
  const params = new URLSearchParams({ sort_by: sortBy, sort_dir: sortDir });
  const response = await fetch(
    `${API_BASE_URL}/api/collection-share/${token}/albums/${albumId}/access?${params}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password || null }),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      response.status === 401
        ? "Incorrect password"
        : data?.detail || "Unable to open album",
    );
  }
  return response.json();
}

export function getCollectionImageUrl(
  collectionToken: string,
  albumId: string,
  photoId: string,
  variant: "thumbnail" | "web" | "original" = "web",
  password?: string,
): string {
  let url = `${API_BASE_URL}/api/files/collection/${collectionToken}/album/${albumId}/photo/${photoId}?variant=${variant}`;
  if (password) url += `&password=${encodeURIComponent(password)}`;
  return url;
}

export async function getAlbum(
  albumId: string,
  sortBy: "captured" | "uploaded" = "captured",
  sortDir?: SortDir,
): Promise<AlbumDetail> {
  const params = new URLSearchParams({ sort_by: sortBy });
  if (sortDir) params.set("sort_dir", sortDir);
  const response = await authFetch(
    `${API_BASE_URL}/api/albums/${albumId}?${params}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch album: ${response.statusText}`);
  }

  return response.json();
}

export async function getAlbumBySlug(
  slug: string,
  sortBy: "captured" | "uploaded" = "captured",
  sortDir?: SortDir,
): Promise<AlbumDetail> {
  try {
    const params = new URLSearchParams({ sort_by: sortBy });
    if (sortDir) params.set("sort_dir", sortDir);
    const response = await authFetch(
      `${API_BASE_URL}/api/albums/slug/${encodeURIComponent(slug)}?${params}`,
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
  data: { title?: string; description?: string; cover_photo_id?: string; cover_photo_position_x?: number; cover_photo_position_y?: number },
): Promise<Album> {
  const response = await authFetch(`${API_BASE_URL}/api/albums/${albumId}`, {
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
  const response = await authFetch(
    `${API_BASE_URL}/api/albums/${albumId}?delete_photos=${deletePhotos}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to delete album: ${response.statusText}`);
  }
}

export async function listAlbumTags(albumId: string): Promise<PhotoTag[]> {
  const response = await authFetch(`${API_BASE_URL}/api/albums/${albumId}/tags`);

  if (!response.ok) {
    throw new Error(`Failed to fetch tags: ${response.statusText}`);
  }

  return response.json();
}

export async function createAlbumTag(
  albumId: string,
  data: PhotoTagPayload,
): Promise<PhotoTag> {
  const response = await authFetch(`${API_BASE_URL}/api/albums/${albumId}/tags`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to create tag: ${response.statusText}`);
  }

  return response.json();
}

export async function updateAlbumTag(
  albumId: string,
  tagId: string,
  data: PhotoTagPayload,
): Promise<PhotoTag> {
  const response = await authFetch(
    `${API_BASE_URL}/api/albums/${albumId}/tags/${tagId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to update tag: ${response.statusText}`);
  }

  return response.json();
}

export async function deleteAlbumTag(
  albumId: string,
  tagId: string,
): Promise<void> {
  const response = await authFetch(
    `${API_BASE_URL}/api/albums/${albumId}/tags/${tagId}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to delete tag: ${response.statusText}`);
  }
}

export async function updatePhotoTags(
  albumId: string,
  photoId: string,
  tagIds: string[],
): Promise<Photo> {
  const response = await authFetch(
    `${API_BASE_URL}/api/albums/${albumId}/photos/${photoId}/tags`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag_ids: tagIds }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to update photo tags: ${response.statusText}`);
  }

  return response.json();
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
  authToken?: string | null,
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
        try {
          const errorData = JSON.parse(xhr.responseText);
          reject(
            uploadErrorFromBody(
              errorData,
              `Upload failed: ${xhr.status} ${xhr.statusText}`,
              xhr.status,
            ),
          );
        } catch {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        }
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
    if (authToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
    }
    xhr.timeout = timeoutMs;
    xhr.send(formData);
  });
}

const capabilityCache = new Map<
  string,
  { expiresAt: number; value: UploadCapabilities }
>();

async function getUploadCapabilities(
  url: string,
  authenticated: boolean,
): Promise<UploadCapabilities> {
  const cached = capabilityCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = authenticated
    ? await authFetch(url, { cache: "no-store" })
    : await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw await responseUploadError(
      response,
      "Unable to determine the upload limit.",
    );
  }
  const value: UploadCapabilities = await response.json();
  capabilityCache.set(url, { expiresAt: Date.now() + 60_000, value });
  return value;
}

async function sendChunkWithRetry(
  url: string,
  chunk: Blob,
  authenticated: boolean,
): Promise<void> {
  let lastError: UploadApiError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = authenticated
        ? await authFetch(url, {
            method: "POST",
            body: chunk,
            headers: { "Content-Type": "application/octet-stream" },
          })
        : await fetch(url, {
            method: "POST",
            body: chunk,
            headers: { "Content-Type": "application/octet-stream" },
          });
      if (response.ok) return;
      lastError = await responseUploadError(
        response,
        "A file chunk could not be uploaded.",
      );
      if (!lastError.retryable && response.status < 500) throw lastError;
    } catch (error) {
      lastError =
        error instanceof UploadApiError
          ? error
          : new UploadApiError("Network error during upload", "NETWORK_ERROR", true);
      if (!lastError.retryable) throw lastError;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw (
    lastError ??
    new UploadApiError("Upload interrupted", "UPLOAD_INTERRUPTED", true)
  );
}

/**
 * Upload a large file using chunked upload.
 * Splits the file into small chunks that can pass through proxy buffers.
 */
async function uploadLargeFileChunked(
  albumId: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<PhotoUploadResponse> {
  const resumeKey = `client-pix-upload:admin:${albumId}:${file.name}:${file.size}:${file.lastModified}`;
  let uploadId = window.localStorage.getItem(resumeKey);
  let chunkSize = 0;
  let chunksReceived = new Set<number>();

  if (uploadId) {
    const statusResponse = await authFetch(
      `${API_BASE_URL}/api/albums/${albumId}/upload/${uploadId}`,
      { cache: "no-store" },
    );
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      if (status.file_size === file.size) {
        chunkSize = status.chunk_size;
        chunksReceived = new Set(status.chunks_received);
      } else {
        uploadId = null;
      }
    } else {
      uploadId = null;
    }
  }

  if (!uploadId) {
    const initResponse = await authFetch(
      `${API_BASE_URL}/api/albums/${albumId}/upload/init?filename=${encodeURIComponent(
        file.name,
      )}&file_size=${file.size}`,
      { method: "POST" },
    );
    if (!initResponse.ok) {
      throw await responseUploadError(
        initResponse,
        "Failed to initialize upload.",
      );
    }
    const initialized = await initResponse.json();
    uploadId = initialized.upload_id;
    chunkSize = initialized.chunk_size;
    window.localStorage.setItem(resumeKey, initialized.upload_id);
  }

  // Upload chunks
  const totalChunks = Math.ceil(file.size / chunkSize);
  let uploadedBytes = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    if (!chunksReceived.has(chunkIndex)) {
      await sendChunkWithRetry(
        `${API_BASE_URL}/api/albums/${albumId}/upload/${uploadId}/chunk?chunk_index=${chunkIndex}`,
        chunk,
        true,
      );
    }

    uploadedBytes += chunk.size;
    onProgress?.(uploadedBytes, file.size);
  }

  // Complete the upload
  const completeResponse = await authFetch(
    `${API_BASE_URL}/api/albums/${albumId}/upload/${uploadId}/complete`,
    { method: "POST" },
  );

  if (!completeResponse.ok) {
    const errorText = await completeResponse.text();
    throw await responseUploadError(
      completeResponse,
      `Failed to complete upload: ${errorText}`,
    );
  }

  window.localStorage.removeItem(resumeKey);
  return completeResponse.json();
}

async function uploadLargeFileChunkedToShareLink(
  token: string,
  file: File,
  password?: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<PhotoUploadResponse> {
  const params = new URLSearchParams({
    filename: file.name,
    file_size: String(file.size),
  });
  if (password) params.set("password", password);

  const resumeKey = `client-pix-upload:share:${token}:${file.name}:${file.size}:${file.lastModified}`;
  let uploadId = window.localStorage.getItem(resumeKey);
  let chunkSize = 0;
  let chunksReceived = new Set<number>();
  if (uploadId) {
    const statusParams = new URLSearchParams();
    if (password) statusParams.set("password", password);
    const statusQuery = statusParams.toString();
    const statusResponse = await fetch(
      `${API_BASE_URL}/api/share/${token}/upload/${uploadId}${
        statusQuery ? `?${statusQuery}` : ""
      }`,
      { cache: "no-store" },
    );
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      if (status.file_size === file.size) {
        chunkSize = status.chunk_size;
        chunksReceived = new Set(status.chunks_received);
      } else {
        uploadId = null;
      }
    } else {
      uploadId = null;
    }
  }

  if (!uploadId) {
    const initResponse = await fetch(
      `${API_BASE_URL}/api/share/${token}/upload/init?${params}`,
      { method: "POST" },
    );
    if (!initResponse.ok) {
      throw await responseUploadError(
        initResponse,
        "Failed to initialize upload.",
      );
    }
    const initialized = await initResponse.json();
    uploadId = initialized.upload_id;
    chunkSize = initialized.chunk_size;
    window.localStorage.setItem(resumeKey, initialized.upload_id);
  }

  const totalChunks = Math.ceil(file.size / chunkSize);
  let uploadedBytes = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    const chunkParams = new URLSearchParams({
      chunk_index: String(chunkIndex),
    });
    if (password) chunkParams.set("password", password);

    if (!chunksReceived.has(chunkIndex)) {
      await sendChunkWithRetry(
        `${API_BASE_URL}/api/share/${token}/upload/${uploadId}/chunk?${chunkParams}`,
        chunk,
        false,
      );
    }

    uploadedBytes += chunk.size;
    onProgress?.(uploadedBytes, file.size);
  }

  const completeParams = new URLSearchParams();
  if (password) completeParams.set("password", password);
  const completeQs = completeParams.toString();
  const completeResponse = await fetch(
    `${API_BASE_URL}/api/share/${token}/upload/${uploadId}/complete${completeQs ? `?${completeQs}` : ""}`,
    { method: "POST" },
  );

  if (!completeResponse.ok) {
    const errorText = await completeResponse.text();
    throw await responseUploadError(
      completeResponse,
      `Failed to complete upload: ${errorText}`,
    );
  }

  window.localStorage.removeItem(resumeKey);
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
  onDuplicate?: (duplicateCount: number) => void,
  _batchSize: number = 1, // Default to 1 for better progress tracking
): Promise<PhotoUploadResponse> {
  const allPhotos: Photo[] = [];
  let totalUploaded = 0;
  let totalDuplicates = 0;
  let successfullyProcessed = 0;
  const failures: UploadFailure[] = [];
  const capabilities = await getUploadCapabilities(
    `${API_BASE_URL}/api/albums/${albumId}/upload-capabilities`,
    true,
  );

  // Calculate total size for progress
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  let uploadedSize = 0;

  // Process files one at a time for large files, or in batches for small files
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      if (file.size > capabilities.max_file_bytes) {
        throw new UploadApiError(
          `"${file.name}" is ${formatFileSize(file.size)}. The maximum file size is ${formatFileSize(capabilities.max_file_bytes)}.`,
          "FILE_TOO_LARGE",
        );
      }
      let result: PhotoUploadResponse;

      if (file.size > capabilities.resumable_threshold_bytes) {
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
          getAuthToken(),
        );
      }

      allPhotos.push(...result.photos);
      totalUploaded += result.uploaded_count;
      totalDuplicates += result.duplicate_count;
      if (result.duplicate_count > 0) {
        onDuplicate?.(totalDuplicates);
      }
      successfullyProcessed += 1;
      uploadedSize += file.size;
    } catch (error) {
      console.error(`File ${i + 1}/${files.length} error:`, error);
      const uploadError =
        error instanceof UploadApiError
          ? error
          : new UploadApiError(
              error instanceof Error ? error.message : "Upload failed",
            );
      failures.push({
        filename: file.name,
        code: uploadError.code,
        message: uploadError.message,
        retryable: uploadError.retryable,
      });
    }

    // Report file progress
    onProgress?.(i + 1, files.length);
  }

  // If nothing was uploaded at all, throw an error
  if (successfullyProcessed === 0 && files.length > 0) {
    throw new UploadApiError(
      failures[0]?.message ?? "Failed to upload any files. Please try again.",
      failures[0]?.code,
      failures[0]?.retryable,
    );
  }

  return {
    photos: allPhotos,
    uploaded_count: totalUploaded,
    duplicate_count: totalDuplicates,
    failed_files: failures,
  };
}

export async function deletePhoto(
  albumId: string,
  photoId: string,
): Promise<void> {
  const response = await authFetch(
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
  const response = await authFetch(
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
  const response = await authFetch(
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
  const response = await authFetch(
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
  sortDir?: SortDir,
): Promise<Photo[]> {
  try {
    const params = new URLSearchParams({ sort_by: sortBy });
    if (sortDir) params.set("sort_dir", sortDir);
    const response = await authFetch(
      `${API_BASE_URL}/api/albums/photos/all?${params}`,
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

// --- Download Job Types ---

export interface DownloadJobResponse {
  job_id: string;
  status: "queued" | "processing" | "ready" | "failed";
  progress: number;
  total_files: number;
  processed_files: number;
  zip_size: number;
  download_url: string | null;
  error: string | null;
}

// --- Download Job API ---

export async function prepareDownload(
  albumId: string,
  photoIds?: string[],
): Promise<DownloadJobResponse> {
  const response = await authFetch(`${API_BASE_URL}/api/downloads/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      album_id: albumId,
      photo_ids: photoIds || null,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to prepare download: ${response.statusText}`);
  }

  return response.json();
}

export async function prepareAllAlbumsDownload(): Promise<DownloadJobResponse> {
  const response = await authFetch(
    `${API_BASE_URL}/api/downloads/prepare-all-albums`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to prepare download: ${response.statusText}`);
  }

  return response.json();
}

export async function getDownloadStatus(
  jobId: string,
): Promise<DownloadJobResponse> {
  const response = await authFetch(
    `${API_BASE_URL}/api/downloads/status/${jobId}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to get download status: ${response.statusText}`);
  }

  return response.json();
}

export function getDownloadFileUrl(jobId: string, token?: string | null): string {
  const authToken = token ?? getAuthToken();
  let url = `${API_BASE_URL}/api/downloads/${jobId}/file`;
  if (authToken) {
    url += `?token=${encodeURIComponent(authToken)}`;
  }
  return url;
}

export async function prepareShareDownload(
  token: string,
  password?: string,
): Promise<DownloadJobResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/share/${token}/prepare-download`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password || null }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to prepare download: ${response.statusText}`);
  }

  return response.json();
}

export async function getShareDownloadStatus(
  token: string,
  jobId: string,
  password?: string,
): Promise<DownloadJobResponse> {
  const params = new URLSearchParams();
  if (password) params.set("password", password);
  const qs = params.toString();
  const response = await fetch(
    `${API_BASE_URL}/api/share/${token}/download-status/${jobId}${qs ? `?${qs}` : ""}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to get download status: ${response.statusText}`);
  }

  return response.json();
}

export function getShareDownloadFileUrl(
  token: string,
  jobId: string,
  password?: string,
): string {
  const params = new URLSearchParams();
  if (password) params.set("password", password);
  const qs = params.toString();
  return `${API_BASE_URL}/api/share/${token}/download-file/${jobId}${qs ? `?${qs}` : ""}`;
}

export function getDownloadUrl(albumId: string, photoId: string): string {
  // Use the download endpoint which sets proper Content-Disposition header
  const token = getAuthToken();
  const params = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${API_BASE_URL}/api/albums/${albumId}/photos/${photoId}/download${params}`;
}

export function getDownloadAllUrl(albumId: string): string {
  // Direct link to download all photos in an album as a zip
  const token = getAuthToken();
  const params = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${API_BASE_URL}/api/albums/${albumId}/download-all${params}`;
}

// --- Share Link Types ---

export interface ShareLink {
  id: string;
  album_id: string;
  token: string;
  custom_slug: string | null;
  share_url: string;
  is_password_protected: boolean;
  allows_uploads: boolean;
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
  allowsUploads: boolean = false,
): Promise<ShareLink> {
  const response = await authFetch(`${API_BASE_URL}/api/albums/${albumId}/share`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      password: password || null,
      custom_slug: customSlug || null,
      expires_at: expiresAt || null,
      allows_uploads: allowsUploads,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || "Failed to create share link");
  }

  return response.json();
}

export async function getShareLinks(albumId: string): Promise<ShareLink[]> {
  const response = await authFetch(`${API_BASE_URL}/api/albums/${albumId}/share`);

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
    allows_uploads?: boolean;
  },
): Promise<ShareLink> {
  const response = await authFetch(
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
  const response = await authFetch(
    `${API_BASE_URL}/api/albums/${albumId}/share/${shareLinkId}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to delete share link: ${response.statusText}`);
  }
}

export async function uploadSharePhotos(
  token: string,
  files: File[],
  password?: string,
  onProgress?: (uploaded: number, total: number) => void,
  onUploadProgress?: (loaded: number, total: number) => void,
  onDuplicate?: (duplicateCount: number) => void,
): Promise<PhotoUploadResponse> {
  const allPhotos: Photo[] = [];
  let totalUploaded = 0;
  let totalDuplicates = 0;
  let successfullyProcessed = 0;
  const failures: UploadFailure[] = [];
  const capabilityParams = new URLSearchParams();
  if (password) capabilityParams.set("password", password);
  const capabilityQuery = capabilityParams.toString();
  const capabilities = await getUploadCapabilities(
    `${API_BASE_URL}/api/share/${token}/upload-capabilities${
      capabilityQuery ? `?${capabilityQuery}` : ""
    }`,
    false,
  );
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  let uploadedSize = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      if (file.size > capabilities.max_file_bytes) {
        throw new UploadApiError(
          `"${file.name}" is ${formatFileSize(file.size)}. The maximum file size is ${formatFileSize(capabilities.max_file_bytes)}.`,
          "FILE_TOO_LARGE",
        );
      }
      let result: PhotoUploadResponse;

      if (file.size > capabilities.resumable_threshold_bytes) {
        result = await uploadLargeFileChunkedToShareLink(
          token,
          file,
          password,
          (loaded) => {
            onUploadProgress?.(uploadedSize + loaded, totalSize);
          },
        );
      } else {
        const formData = new FormData();
        formData.append("files", file);
        if (password) {
          formData.append("password", password);
        }

        result = await uploadFileWithProgress(
          `${API_BASE_URL}/api/share/${token}/upload`,
          formData,
          (loaded) => {
            onUploadProgress?.(uploadedSize + loaded, totalSize);
          },
          15 * 60 * 1000,
        );
      }

      allPhotos.push(...result.photos);
      totalUploaded += result.uploaded_count;
      totalDuplicates += result.duplicate_count;
      if (result.duplicate_count > 0) {
        onDuplicate?.(totalDuplicates);
      }
      successfullyProcessed += 1;
      uploadedSize += file.size;
    } catch (error) {
      console.error(`Shared upload file ${i + 1}/${files.length} error:`, error);
      const uploadError =
        error instanceof UploadApiError
          ? error
          : new UploadApiError(
              error instanceof Error ? error.message : "Upload failed",
            );
      failures.push({
        filename: file.name,
        code: uploadError.code,
        message: uploadError.message,
        retryable: uploadError.retryable,
      });
    }

    onProgress?.(i + 1, files.length);
  }

  if (successfullyProcessed === 0 && files.length > 0) {
    throw new UploadApiError(
      failures[0]?.message ?? "Failed to upload any files. Please try again.",
      failures[0]?.code,
      failures[0]?.retryable,
    );
  }

  return {
    photos: allPhotos,
    uploaded_count: totalUploaded,
    duplicate_count: totalDuplicates,
    failed_files: failures,
  };
}

// --- Storage API ---

export interface StorageInfo {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  used_percentage: number;
}

export interface UploadLimitSettings {
  admin_upload: {
    max_file_bytes: number;
    max_file_bytes_cap: number;
  };
  shared_upload: {
    max_file_bytes: number;
    max_file_bytes_cap: number;
  };
  resumable_threshold_bytes: number;
  chunk_size_bytes: number;
}

export async function getUploadLimitSettings(): Promise<UploadLimitSettings> {
  const response = await authFetch(
    `${API_BASE_URL}/api/system/settings/upload-limits`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw await responseUploadError(
      response,
      "Failed to load upload limits.",
    );
  }
  return response.json();
}

export async function updateUploadLimitSettings(
  maxUploadFileBytes: number,
  maxSharedUploadFileBytes: number,
): Promise<UploadLimitSettings> {
  const response = await authFetch(
    `${API_BASE_URL}/api/system/settings/upload-limits`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        max_upload_file_bytes: maxUploadFileBytes,
        max_shared_upload_file_bytes: maxSharedUploadFileBytes,
      }),
    },
  );
  if (!response.ok) {
    throw await responseUploadError(
      response,
      "Failed to update upload limits.",
    );
  }
  capabilityCache.clear();
  return response.json();
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
  const response = await authFetch(`${API_BASE_URL}/api/system/storage`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch storage info: ${response.statusText}`);
  }

  return response.json();
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const response = await authFetch(`${API_BASE_URL}/api/system/storage/albums`, {
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
  const response = await authFetch(`${API_BASE_URL}/api/system/temp-files`, {
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
  const response = await authFetch(`${API_BASE_URL}/api/system/cleanup/downloads`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to cleanup downloads: ${response.statusText}`);
  }

  return response.json();
}

export async function cleanupUploadTempFiles(): Promise<CleanupResult> {
  const response = await authFetch(`${API_BASE_URL}/api/system/cleanup/uploads`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to cleanup uploads: ${response.statusText}`);
  }

  return response.json();
}
