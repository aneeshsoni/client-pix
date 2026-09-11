import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WindowDropUpload } from "@/components/gallery/WindowDropUpload";
import { toast } from "sonner";
import { EMPTY_FILE_DROP_MESSAGE } from "@/lib/drop-files";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function fileTransfer(file: File) {
  return {
    types: ["Files"],
    files: [file],
    dropEffect: "none",
  };
}

describe("WindowDropUpload", () => {
  it("accepts file items when the browser supplies no file list or Files type", () => {
    const onFiles = vi.fn();
    const file = new File(["image"], "portrait.jpg", { type: "image/jpeg" });
    const getAsFile = vi.fn(() => file);
    const dataTransfer = {
      types: [],
      files: [],
      items: [{ kind: "file", getAsFile }],
    };
    render(<WindowDropUpload destination="Portraits" onFiles={onFiles} />);
    fireEvent.dragEnter(window, { dataTransfer });
    expect(screen.getByText("Drop to upload")).toBeInTheDocument();
    expect(getAsFile).not.toHaveBeenCalled();
    fireEvent.drop(window, { dataTransfer });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("explains when the browser does not expose a dropped file", () => {
    const onFiles = vi.fn();
    render(<WindowDropUpload destination="Portraits" onFiles={onFiles} />);
    fireEvent.drop(window, {
      dataTransfer: {
        types: ["Files"],
        files: [],
        items: [{ kind: "file", getAsFile: () => null }],
      },
    });
    expect(onFiles).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(EMPTY_FILE_DROP_MESSAGE);
  });

  it("ignores ordinary text and link drags", () => {
    const onFiles = vi.fn();
    render(<WindowDropUpload destination="Portraits" onFiles={onFiles} />);
    const dataTransfer = { types: ["text/uri-list"], files: [], items: [] };
    fireEvent.dragEnter(window, { dataTransfer });
    fireEvent.drop(window, { dataTransfer });
    expect(screen.queryByText("Drop to upload")).not.toBeInTheDocument();
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("shows a destination overlay and sends dropped files to the uploader", async () => {
    const onFiles = vi.fn();
    const file = new File(["image"], "portrait.jpg", {
      type: "image/jpeg",
    });
    const dataTransfer = fileTransfer(file);

    render(
      <WindowDropUpload destination="Portraits" onFiles={onFiles} />,
    );

    fireEvent.dragEnter(window, { dataTransfer });
    expect(screen.getByText("Drop to upload")).toBeInTheDocument();
    expect(
      screen.getByText("Add these photos and videos to Portraits"),
    ).toBeInTheDocument();

    fireEvent.drop(window, { dataTransfer });
    await waitFor(() => expect(onFiles).toHaveBeenCalledWith([file]));
    expect(screen.queryByText("Drop to upload")).not.toBeInTheDocument();
  });

  it("does not offer or start uploads while disabled", () => {
    const onFiles = vi.fn();
    const file = new File(["image"], "portrait.jpg", {
      type: "image/jpeg",
    });
    const dataTransfer = fileTransfer(file);

    render(
      <WindowDropUpload
        destination="Portraits"
        disabled
        onFiles={onFiles}
      />,
    );

    fireEvent.dragEnter(window, { dataTransfer });
    fireEvent.drop(window, { dataTransfer });
    expect(screen.queryByText("Drop to upload")).not.toBeInTheDocument();
    expect(onFiles).not.toHaveBeenCalled();
  });
});
