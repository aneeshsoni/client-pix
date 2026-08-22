import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WindowDropUpload } from "@/components/gallery/WindowDropUpload";

function fileTransfer(file: File) {
  return {
    types: ["Files"],
    files: [file],
    dropEffect: "none",
  };
}

describe("WindowDropUpload", () => {
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
