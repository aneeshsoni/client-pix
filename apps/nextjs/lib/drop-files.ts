export const EMPTY_FILE_DROP_MESSAGE =
  "Your browser did not provide files from this drop. For macOS Photos, click the upload button and choose Photos under Media in the file picker, or export the photos to a folder first.";

export function isFileTransfer(transfer: DataTransfer | null): boolean {
  if (!transfer) return false;
  return (
    Array.from(transfer.types || []).includes("Files") ||
    Array.from(transfer.items || []).some((item) => item.kind === "file") ||
    transfer.files?.length > 0
  );
}

// Read synchronously during drop: the browser protects this data afterward.
export function getDroppedFiles(transfer: DataTransfer | null): File[] {
  if (!transfer) return [];
  const files = Array.from(transfer.files || []);
  if (files.length > 0) return files;

  return Array.from(transfer.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}
