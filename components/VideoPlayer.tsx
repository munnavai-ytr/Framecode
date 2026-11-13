'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Download, RotateCcw, Check, Film, Loader2 } from 'lucide-react';
import { Player, PlayerRef } from '@remotion/player';
import { VideoProject } from '@/types/framecode';
import { compileRemotionCode } from '@/lib/codeCompiler';
import { prepareCode } from '@/lib/assetTokens';

interface VideoPlayerProps {
  video: VideoProject | null;
  compact?: boolean;
  onRenderAndDownload?: () => void;
  isRenderingMp4?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  video,
  compact = false,
  onRenderAndDownload,
  isRenderingMp4 = false,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [CompiledComponent, setCompiledComponent] = useState<React.ComponentType | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);

  const playerRef = useRef<PlayerRef>(null);
  const videoElemRef = useRef<HTMLVideoElement>(null);

  const durationSec =
    video?.durationSec ||
    Math.round((video?.videoConfig?.durationInFrames || 450) / (video?.videoConfig?.fps || 30));
  const fps = video?.videoConfig?.fps || 30;
  const durationInFrames = video?.videoConfig?.durationInFrames || durationSec * fps;

  const videoCode = video?.code;

  useEffect(() => {
    let active = true;
    if (!videoCode) {
      setTimeout(() => {
        if (!active) return;
        setCompiledComponent(null);
        setCompileError(null);
      }, 0);
      return;
    }

    prepareCode(videoCode)
      .then((prep) => {
        if (!active) return;
        const res = compileRemotionCode(prep);
        setCompiledComponent(() => res.component);
        setCompileError(res.error);
      })
      .catch((err) => {
        if (!active) return;
        setCompiledComponent(null);
        setCompileError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      active = false;
    };
  }, [videoCode]);

  useEffect(() => {
    const currentElem = playerRef.current;
    if (!currentElem) return;

    const onFrameUpdate = (e: { detail: { frame: number } }) => {
      const frame = e.detail?.frame ?? 0;
      setCurrentTimeSec(Math.round(frame / fps));
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    currentElem.addEventListener('frameupdate', onFrameUpdate);
    currentElem.addEventListener('play', onPlay);
    currentElem.addEventListener('pause', onPause);

    return () => {
      currentElem.removeEventListener('frameupdate', onFrameUpdate);
      currentElem.removeEventListener('play', onPlay);
      currentElem.removeEventListener('pause', onPause);
    };
  }, [CompiledComponent, fps]);

  useEffect(() => {
    const v = videoElemRef.current;
    if (!v) return;

    const onTimeUpdate = () => {
      setCurrentTimeSec(Math.round(v.currentTime));
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);

    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [video?.mp4BlobUrl]);

  const togglePlay = () => {
    if (video?.mp4BlobUrl && videoElemRef.current) {
      if (videoElemRef.current.paused) {
        videoElemRef.current.play();
      } else {
        videoElemRef.current.pause();
      }
      return;
    }

    if (playerRef.current) {
      if (playerRef.current.isPlaying()) {
        playerRef.current.pause();
      } else {
        playerRef.current.play();
      }
    } else {
      setIsPlaying((prev) => !prev);
    }
  };

  const handleReset = () => {
    if (video?.mp4BlobUrl && videoElemRef.current) {
      videoElemRef.current.currentTime = 0;
      videoElemRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (playerRef.current) {
      playerRef.current.seekTo(0);
      playerRef.current.pause();
      setIsPlaying(false);
    }
    setCurrentTimeSec(0);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSec = Math.floor(percentage * durationSec);
    setCurrentTimeSec(targetSec);

    if (video?.mp4BlobUrl && videoElemRef.current) {
      videoElemRef.current.currentTime = targetSec;
    } else if (playerRef.current) {
      playerRef.current.seekTo(Math.floor(percentage * durationInFrames));
    }
  };

  const handleDownload = () => {
    if (video?.mp4BlobUrl) {
      setDownloadSuccess(true);
      const a = document.createElement('a');
      a.href = video.mp4BlobUrl;
      const safeTitle = (video.title || 'framecode_render').toLowerCase().replace(/\s+/g, '_');
      a.download = `${safeTitle}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        setDownloadSuccess(false);
      }, 2500);
    } else if (onRenderAndDownload) {
      onRenderAndDownload();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progressPercent = durationSec > 0 ? (currentTimeSec / durationSec) * 100 : 0;

  if (!video) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center rounded-[12px] border border-border bg-surface-2 p-6 text-center">
        <Film className="h-8 w-8 text-faint mb-3" />
        <p className="text-sm font-medium text-text">No video rendered yet</p>
        <p className="text-xs text-muted mt-1 max-w-[220px]">
          Describe the video you want in chat to compile a 9:16 Remotion preview.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col rounded-[12px] border border-border bg-surface-2 overflow-hidden ${
        compact ? 'w-full max-w-[360px] mx-auto' : 'w-full'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5 bg-surface-2">
        <div className="flex items-center gap-2 truncate">
          <span className="font-mono text-[10px] text-muted uppercase tracking-wider">
            9:16 Video
          </span>
          <span className="text-border-strong">·</span>
          <span className="truncate text-xs font-medium text-text">
            {video.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {video.mp4BlobUrl && (
            <span className="font-mono text-[10px] text-success bg-surface-1 border border-border px-1.5 py-0.5 rounded">
              MP4 Ready
            </span>
          )}
          <span className="font-mono text-[10px] text-muted">
            {video.resolution ||
              `${video.videoConfig?.width || 720}x${video.videoConfig?.height || 1280}`}
          </span>
        </div>
      </div>

      {/* 9:16 Vertical Preview Container */}
      <div className="relative w-full bg-surface-1 flex items-center justify-center p-3">
        <div
          className={`relative mx-auto w-full aspect-[9/16] rounded-[8px] border border-border bg-term-bg overflow-hidden flex flex-col justify-between ${
            compact ? 'max-h-[380px]' : 'max-h-[360px]'
          }`}
        >
          {video.mp4BlobUrl ? (
            <div className="relative w-full h-full flex items-center justify-center bg-term-bg">
              <video
                ref={videoElemRef}
                src={video.mp4BlobUrl}
                playsInline
                loop
                className="w-full h-full object-contain"
                onClick={togglePlay}
              />
            </div>
          ) : CompiledComponent ? (
            <div className="relative w-full h-full bg-term-bg overflow-hidden">
              <Player
                ref={playerRef}
                component={CompiledComponent}
                compositionWidth={video.videoConfig?.width || 720}
                compositionHeight={video.videoConfig?.height || 1280}
                durationInFrames={durationInFrames}
                fps={fps}
                style={{ width: '100%', height: '100%' }}
                controls={false}
                loop
                autoPlay={false}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center my-auto p-4">
              <Film className="h-8 w-8 text-faint mb-2" />
              <p className="text-xs font-mono text-text">Compiling composition...</p>
              {compileError && (
                <p className="mt-2 text-[10px] font-mono text-danger max-w-[200px] break-all">
                  {compileError}
                </p>
              )}
            </div>
          )}

          {/* Top overlay badge */}
          <div className="absolute top-2 left-2 z-10 pointer-events-none">
            <span className="font-mono text-[9px] text-muted bg-surface-1/90 backdrop-blur-xs border border-border px-1.5 py-0.5 rounded">
              {video.mp4BlobUrl ? 'MP4' : 'REMOTION LIVE'}
            </span>
          </div>
        </div>
      </div>

      {/* Control Bar: Timeline, Play/Pause, Time Label, Download */}
      <div className="border-t border-border bg-surface-2 p-3 space-y-2.5">
        {/* Timeline Scrubber */}
        <div
          onClick={handleSeek}
          className="group relative h-2 w-full cursor-pointer rounded-full bg-surface-1 border border-border"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={durationSec}
          aria-valuenow={currentTimeSec}
          tabIndex={0}
        >
          <div
            className="h-full rounded-full bg-accent group-hover:bg-accent-text transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Buttons and Time */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Play/Pause Button */}
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-11 w-11 lg:h-9 lg:w-9 items-center justify-center rounded-[8px] border border-border bg-surface-1 text-text hover:bg-surface-3 transition-colors cursor-pointer"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 fill-current ml-0.5" />
              )}
            </button>

            {/* Reset Button */}
            <button
              type="button"
              onClick={handleReset}
              className="flex h-11 w-11 lg:h-9 lg:w-9 items-center justify-center rounded-[8px] border border-border bg-surface-1 text-muted hover:text-text hover:bg-surface-3 transition-colors cursor-pointer"
              aria-label="Restart video"
              title="Restart"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            {/* Time label: 0:12 / 0:30 */}
            <span className="font-mono text-xs tabular-nums text-muted ml-1">
              {formatTime(currentTimeSec)} / {formatTime(durationSec)}
            </span>
          </div>

          {/* Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={isRenderingMp4}
            className="flex h-11 lg:h-9 items-center gap-1.5 rounded-[8px] border border-border bg-surface-1 px-3 text-xs font-medium text-text hover:bg-surface-3 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isRenderingMp4 ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-text" />
                <span>Rendering...</span>
              </>
            ) : downloadSuccess ? (
              <>
                <Check className="h-3.5 w-3.5 text-success" />
                <span>Downloaded</span>
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5 text-muted" />
                <span>{video.mp4BlobUrl ? 'Download MP4' : 'Render MP4'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
