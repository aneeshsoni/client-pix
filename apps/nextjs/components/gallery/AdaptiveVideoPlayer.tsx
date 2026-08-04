"use client";

import Hls from "hls.js";
import { Settings2 } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import type { VideoPlaybackInfo, VideoQuality } from "@/lib/api";

interface AdaptiveVideoPlayerProps {
  sourceUrl: string;
  photoId: string;
  loadPlayback: () => Promise<VideoPlaybackInfo>;
  className?: string;
  autoPlay?: boolean;
  playsInline?: boolean;
  onLoadedData?: () => void;
  onRetry?: () => Promise<void>;
}

type QualityChoice = "auto" | "source" | string;

function supportsHls(video: HTMLVideoElement): boolean {
  return (
    Hls.isSupported() ||
    Boolean(video.canPlayType("application/vnd.apple.mpegurl"))
  );
}

export const AdaptiveVideoPlayer = forwardRef<
  HTMLVideoElement,
  AdaptiveVideoPlayerProps
>(function AdaptiveVideoPlayer(
  {
    sourceUrl,
    photoId,
    loadPlayback,
    className,
    autoPlay = false,
    playsInline = true,
    onLoadedData,
    onRetry,
  },
  forwardedRef,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const loadPlaybackRef = useRef(loadPlayback);
  const [playback, setPlayback] = useState<VideoPlaybackInfo | null>(null);
  const [selectedQuality, setSelectedQuality] =
    useState<QualityChoice>("source");
  const [menuOpen, setMenuOpen] = useState(false);
  const [hlsAvailable, setHlsAvailable] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useImperativeHandle(forwardedRef, () => videoRef.current as HTMLVideoElement);

  useEffect(() => {
    loadPlaybackRef.current = loadPlayback;
  }, [loadPlayback]);

  useEffect(() => {
    setPlayback(null);
    setSelectedQuality("source");
    setMenuOpen(false);
    setHlsAvailable(false);
  }, [photoId]);

  useEffect(() => {
    let active = true;

    void loadPlaybackRef
      .current()
      .then((result) => {
        if (!active) return;
        setPlayback(result);
        const canUseHls = Boolean(
          result.manifest_url &&
            videoRef.current &&
            supportsHls(videoRef.current),
        );
        setHlsAvailable(canUseHls);
        if (canUseHls) setSelectedQuality("auto");
      })
      .catch(() => {
        // Source playback remains available when options cannot be loaded.
      });

    return () => {
      active = false;
    };
  }, [photoId, requestVersion]);

  useEffect(() => {
    if (playback?.status !== "pending" && playback?.status !== "processing") {
      return;
    }
    const timer = window.setTimeout(
      () => setRequestVersion((version) => version + 1),
      5000,
    );
    return () => window.clearTimeout(timer);
  }, [playback?.status, playback?.progress, requestVersion]);

  const fixedQualities = useMemo(() => {
    if (!playback) return [];
    const byLabel = new Map<string, VideoQuality>();
    byLabel.set(playback.source.label, playback.source);
    for (const quality of playback.qualities) {
      if (!byLabel.has(quality.label)) byLabel.set(quality.label, quality);
    }
    return [...byLabel.values()];
  }, [playback]);

  const selectedUrl = useMemo(() => {
    if (selectedQuality === "auto") return playback?.manifest_url || sourceUrl;
    if (selectedQuality === "source") return sourceUrl;
    return (
      playback?.qualities.find((quality) => quality.id === selectedQuality)
        ?.playlist_url || sourceUrl
    );
  }, [playback, selectedQuality, sourceUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const previousTime = Number.isFinite(video.currentTime)
      ? video.currentTime
      : 0;
    const wasPlaying = !video.paused;
    let hls: Hls | null = null;

    const restorePlayback = () => {
      if (previousTime > 0 && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(previousTime, video.duration);
      }
      if (wasPlaying || autoPlay) void video.play().catch(() => undefined);
    };

    if (selectedUrl.endsWith(".m3u8") && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(selectedUrl);
      hls.attachMedia(video);
      hls.once(Hls.Events.MANIFEST_PARSED, restorePlayback);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        hls?.destroy();
        hls = null;
        setHlsAvailable(false);
        setSelectedQuality("source");
        video.src = sourceUrl;
        video.load();
      });
    } else {
      video.src = selectedUrl;
      video.load();
      video.addEventListener("loadedmetadata", restorePlayback, { once: true });
    }

    return () => {
      hls?.destroy();
    };
  }, [autoPlay, selectedUrl, sourceUrl]);

  const showQualityMenu = hlsAvailable && fixedQualities.length > 0;
  const processing = playback?.status === "pending" || playback?.status === "processing";

  return (
    <div className="group/video relative h-full w-full" onClick={(event) => event.stopPropagation()}>
      <video
        ref={videoRef}
        controls
        className={className}
        playsInline={playsInline}
        onLoadedData={onLoadedData}
      />

      {processing && (
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/70 px-2 py-1 text-xs text-white">
          Optimizing video…
          {playback?.progress ? ` ${playback.progress}%` : ""}
        </div>
      )}

      {playback?.status === "failed" && onRetry && (
        <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded bg-black/80 px-3 py-2 text-xs text-white">
          <span className="line-clamp-2" title={playback.error || undefined}>
            Video optimization failed
            {playback.error ? `: ${playback.error}` : "."}
          </span>
          <button
            type="button"
            className="shrink-0 underline hover:no-underline disabled:opacity-60"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              void onRetry()
                .then(() => setRequestVersion((version) => version + 1))
                .catch((error) => {
                  setPlayback((current) =>
                    current
                      ? {
                          ...current,
                          error:
                            error instanceof Error
                              ? error.message
                              : "Retry failed",
                        }
                      : current,
                  );
                })
                .finally(() => setRetrying(false));
            }}
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {showQualityMenu && (
        <div className="absolute bottom-12 right-3 z-20">
          {menuOpen && (
            <div className="mb-2 min-w-36 overflow-hidden rounded-md border border-white/20 bg-black/90 py-1 text-sm text-white shadow-xl">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 px-3 py-2 hover:bg-white/15"
                onClick={() => {
                  setSelectedQuality("auto");
                  setMenuOpen(false);
                }}
              >
                Auto
                {selectedQuality === "auto" && <span aria-hidden>✓</span>}
              </button>
              {fixedQualities.map((quality) => {
                const value = quality.is_source ? "source" : quality.id;
                return (
                  <button
                    key={`${quality.id}-${quality.label}`}
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-3 py-2 hover:bg-white/15"
                    onClick={() => {
                      setSelectedQuality(value);
                      setMenuOpen(false);
                    }}
                  >
                    {quality.label}
                    {selectedQuality === value && <span aria-hidden>✓</span>}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            aria-label="Video quality"
            aria-expanded={menuOpen}
            title="Video quality"
            className="rounded-full bg-black/70 p-2 text-white shadow transition-colors hover:bg-black/90"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Settings2 className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
});
