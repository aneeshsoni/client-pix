"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DownloadJobResponse,
  getDownloadFileUrl,
  getDownloadStatus,
  getShareDownloadFileUrl,
  getShareDownloadStatus,
  prepareDownload,
  prepareShareDownload,
} from "@/lib/api";

export type DownloadStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "downloading"
  | "failed";

interface UseDownloadJobReturn {
  startDownload: (albumId: string, photoIds?: string[]) => Promise<void>;
  startShareDownload: (token: string, password?: string) => Promise<void>;
  progress: number;
  status: DownloadStatus;
  error: string | null;
  cancel: () => void;
}

export function useDownloadJob(): UseDownloadJobReturn {
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const triggerBrowserDownload = useCallback((url: string) => {
    setStatus("downloading");
    window.location.href = url;
    // Reset after a short delay (browser takes over)
    setTimeout(() => {
      setStatus("idle");
      setProgress(0);
    }, 2000);
  }, []);

  const pollForCompletion = useCallback(
    (
      pollFn: () => Promise<DownloadJobResponse>,
      getUrl: () => string,
    ) => {
      pollingRef.current = setInterval(async () => {
        if (cancelledRef.current) {
          cleanup();
          return;
        }

        try {
          const job = await pollFn();
          setProgress(job.progress);

          if (job.status === "ready") {
            cleanup();
            triggerBrowserDownload(getUrl());
          } else if (job.status === "failed") {
            cleanup();
            setStatus("failed");
            setError(job.error || "Download preparation failed");
          }
        } catch {
          cleanup();
          setStatus("failed");
          setError("Failed to check download status");
        }
      }, 1000);
    },
    [cleanup, triggerBrowserDownload],
  );

  const startDownload = useCallback(
    async (albumId: string, photoIds?: string[]) => {
      cleanup();
      cancelledRef.current = false;
      setStatus("preparing");
      setProgress(0);
      setError(null);

      try {
        const job = await prepareDownload(albumId, photoIds);

        if (job.status === "ready") {
          triggerBrowserDownload(getDownloadFileUrl(job.job_id));
          return;
        }

        if (job.status === "failed") {
          setStatus("failed");
          setError(job.error || "Download preparation failed");
          return;
        }

        // Start polling
        setProgress(job.progress);
        pollForCompletion(
          () => getDownloadStatus(job.job_id),
          () => getDownloadFileUrl(job.job_id),
        );
      } catch (e) {
        setStatus("failed");
        setError(e instanceof Error ? e.message : "Failed to start download");
      }
    },
    [cleanup, triggerBrowserDownload, pollForCompletion],
  );

  const startShareDownload = useCallback(
    async (token: string, password?: string) => {
      cleanup();
      cancelledRef.current = false;
      setStatus("preparing");
      setProgress(0);
      setError(null);

      try {
        const job = await prepareShareDownload(token, password);

        if (job.status === "ready") {
          triggerBrowserDownload(
            getShareDownloadFileUrl(token, job.job_id, password),
          );
          return;
        }

        if (job.status === "failed") {
          setStatus("failed");
          setError(job.error || "Download preparation failed");
          return;
        }

        // Start polling
        setProgress(job.progress);
        pollForCompletion(
          () => getShareDownloadStatus(token, job.job_id, password),
          () => getShareDownloadFileUrl(token, job.job_id, password),
        );
      } catch (e) {
        setStatus("failed");
        setError(e instanceof Error ? e.message : "Failed to start download");
      }
    },
    [cleanup, triggerBrowserDownload, pollForCompletion],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    cleanup();
    setStatus("idle");
    setProgress(0);
    setError(null);
  }, [cleanup]);

  return {
    startDownload,
    startShareDownload,
    progress,
    status,
    error,
    cancel,
  };
}
