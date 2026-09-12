import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CollectionAlbumClient from "@/app/collection/[token]/albums/[albumId]/CollectionAlbumClient";
import SharePageClient from "@/app/share/[token]/SharePageClient";

const { startDownload } = vi.hoisted(() => ({ startDownload: vi.fn() }));
vi.mock("@/hooks/use-download-job", () => ({ useDownloadJob: () => ({
  startShareDownload: startDownload, status: "idle", progress: 0, error: null,
}) }));
vi.mock("@/components/gallery", () => ({
  VirtualizedPhotoGrid: ({ onPhotoOpen }: { onPhotoOpen: (index: number) => void }) =>
    <button onClick={() => onPhotoOpen(0)}>Open photo</button>,
}));
const album = {
  id: "album-1", title: "Wedding", description: "Our photos", photo_count: 1,
  allows_uploads: true, tags: [], requires_password: false,
  photos: [{ id: "photo-1", width: 800, height: 600, original_filename: "portrait.jpg",
    captured_at: "2026-01-01", created_at: "2026-02-01", is_video: false, tags: [] }],
};
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); sessionStorage.clear(); });

it("uses collection access, sorting and scoped downloads without uploads", async () => {
  sessionStorage.setItem("client-pix-collection-password:collection-token", "secret");
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(album)));
  vi.stubGlobal("fetch", fetchMock);
  render(<CollectionAlbumClient token="collection-token" albumId="album-1" />);
  await screen.findByRole("heading", { name: "Wedding" });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/collection-share/collection-token/albums/album-1/access?sort_by=captured");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ password: "secret" });
  expect(document.querySelector('input[type="file"]')).toBeNull();
  expect(screen.getByRole("link", { name: "Back to collection" })).toHaveAttribute("href", "/collection/collection-token");
  fireEvent.click(screen.getByRole("button", { name: /uploaded/i }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("sort_by=uploaded"))).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Download Album" }));
  expect(startDownload).toHaveBeenCalledWith("collection-token", "secret", "album-1");
  fireEvent.click(screen.getByRole("button", { name: "Open photo" }));
  expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href",
    "/api/files/collection/collection-token/album/album-1/photo/photo-1?variant=original&password=secret&download=true");
});

it("keeps traditional share links on their existing endpoints", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(
    url.endsWith("/info") ? { is_password_protected: false } : { ...album, allows_uploads: false },
  )));
  vi.stubGlobal("fetch", fetchMock);
  render(<SharePageClient token="share-token" />);
  await screen.findByRole("heading", { name: "Wedding" });
  fireEvent.click(screen.getByRole("button", { name: "Download All" }));
  expect(startDownload).toHaveBeenCalledWith("share-token", undefined, undefined);
  expect(screen.queryByText("Back to collection")).not.toBeInTheDocument();
});
