import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadPhotosToAlbum } from "@/lib/api";
import { authFetch, getAuthToken, refreshTokens } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  authFetch: vi.fn(),
  getAuthToken: vi.fn(),
  refreshTokens: vi.fn(),
}));

let outcomes: Array<number | "network">;
let sent: MockXHR[];
class MockXHR extends EventTarget {
  upload = new EventTarget();
  status = 0;
  statusText = "";
  responseText = "";
  timeout = 0;
  headers: Record<string, string> = {};
  open() {}
  setRequestHeader(key: string, value: string) { this.headers[key] = value; }
  send() {
    sent.push(this);
    const outcome = outcomes.shift();
    queueMicrotask(() => {
      if (outcome === "network") this.dispatchEvent(new Event("error"));
      else {
        this.status = outcome ?? 200;
        this.responseText = JSON.stringify(this.status === 200
          ? { photos: [], uploaded_count: 1, duplicate_count: 0 }
          : { detail: "Rejected" });
        this.dispatchEvent(new Event("load"));
      }
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  outcomes = [];
  sent = [];
  vi.stubGlobal("XMLHttpRequest", MockXHR);
  vi.mocked(getAuthToken).mockReturnValue("token");
  vi.mocked(authFetch).mockResolvedValue(new Response(JSON.stringify({
    max_file_bytes: 1_000_000, resumable_threshold_bytes: 500_000,
    chunk_size_bytes: 100_000, resumable_uploads: true,
  })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("upload recovery", () => {
  it("retries a transient connection failure", async () => {
    outcomes = ["network", 200];
    const result = uploadPhotosToAlbum("retry-network", [new File(["photo"], "a.jpg")]);
    await vi.runAllTimersAsync();
    expect((await result).uploaded_count).toBe(1);
    expect(sent).toHaveLength(2);
  });

  it("refreshes an expired token before retrying", async () => {
    outcomes = [401, 200];
    vi.mocked(refreshTokens).mockImplementation(async () => {
      vi.mocked(getAuthToken).mockReturnValue("new-token");
      return "new-token";
    });
    const result = uploadPhotosToAlbum("retry-auth", [new File(["photo"], "a.jpg")]);
    await vi.runAllTimersAsync();
    expect((await result).uploaded_count).toBe(1);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(sent[1].headers.Authorization).toBe("Bearer new-token");
  });

  it("bounds retries and identifies the failed file even with duplicate filenames", async () => {
    outcomes = [200, "network", "network", "network"];
    const result = uploadPhotosToAlbum("retry-exhausted", [
      new File(["one"], "a.jpg"), new File(["two"], "a.jpg"),
    ]);
    await vi.runAllTimersAsync();
    expect((await result).failed_files).toEqual([
      expect.objectContaining({ file_index: 1, code: "NETWORK_ERROR", retryable: true }),
    ]);
    expect(sent).toHaveLength(4);
  });

  it("does not retry permanent server rejections", async () => {
    outcomes = [200, 413];
    const result = uploadPhotosToAlbum("retry-rejected", [
      new File(["one"], "a.jpg"), new File(["two"], "b.jpg"),
    ]);
    await vi.runAllTimersAsync();
    expect((await result).failed_files?.[0].retryable).toBe(false);
    expect(sent).toHaveLength(2);
  });
});
