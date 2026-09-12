import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NewAlbumModal } from "@/components/gallery/NewAlbumModal";
import { createAlbum, uploadPhotosToAlbum, type Album } from "@/lib/api";

vi.mock("@/lib/api", () => ({ createAlbum: vi.fn(), uploadPhotosToAlbum: vi.fn() }));

it("keeps failed files and retries in the already-created album", async () => {
  const album = { id: "album-1", title: "Trip" } as Album;
  vi.mocked(createAlbum).mockResolvedValue(album);
  vi.mocked(uploadPhotosToAlbum)
    .mockResolvedValueOnce({ photos: [], uploaded_count: 1, duplicate_count: 0,
      failed_files: [{ file_index: 1, filename: "b.jpg", code: "NETWORK_ERROR", message: "Network error", retryable: true }],
    })
    .mockResolvedValueOnce({ photos: [], uploaded_count: 1, duplicate_count: 0 });
  const onOpenChange = vi.fn();
  render(<NewAlbumModal open onOpenChange={onOpenChange} />);
  fireEvent.change(screen.getByPlaceholderText("Add your album title here..."), { target: { value: "Trip" } });
  const first = new File(["a"], "a.jpg", { type: "image/jpeg" });
  const second = new File(["b"], "b.jpg", { type: "image/jpeg" });
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [first, second] } });
  fireEvent.click(screen.getByRole("button", { name: "Create Album" }));
  await screen.findByText("1 files failed. Network error");
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(screen.queryByText("Please wait while files are being uploaded...")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry Upload" }));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(createAlbum).toHaveBeenCalledTimes(1);
  expect(vi.mocked(uploadPhotosToAlbum).mock.calls[1][1]).toEqual([second]);
});
