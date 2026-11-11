'use client';

import React, { useState, useEffect } from 'react';
import { Play, Pause, Download, RotateCcw, Check, Film } from 'lucide-react';
import { VideoProject } from '@/types/framecode';

interface VideoPlayerProps {
  video: VideoProject | null;
  compact?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, compact = false }) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(video?.currentSec ?? 12);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);

  const duration = video?.durationSec ?? 30;



  // Playback timer simulation
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isPlaying, duration]);

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleReset = () => {
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    setCurrentTime(Math.floor(percentage * duration));
  };

  const handleDownload = () => {
    setDownloadSuccess(true);
    // Create an exported sample dummy file
    const content = `// Framecode Video Export\n// Title: ${video?.title || 'Rendered Video'}\n// Aspect Ratio: 9:16 (1080x1920)\n// Duration: ${duration}s @ 30fps\n\n${video?.primaryCodeSnippet || '// Video rendered with Remotion'}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(video?.title || 'framecode_export').toLowerCase().replace(/\s+/g, '_')}.mp4.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setTimeout(() => {
      setDownloadSuccess(false);
    }, 2400);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Active scene index
  const activeSceneIndex = video?.scenes?.length
    ? Math.min(
        Math.floor((currentTime / duration) * video.scenes.length),
        video.scenes.length - 1
      )
    : 0;
  const activeScene = video?.scenes?.[activeSceneIndex];

  if (!video) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center rounded-[12px] border border-[#3A3835] bg-[#2A2927] p-6 text-center">
        <Film className="h-8 w-8 text-[#A8A59E]/40 mb-3" />
        <p className="text-sm font-medium text-[#FAF9F5]">No video rendered yet</p>
        <p className="text-xs text-[#A8A59E] mt-1 max-w-[220px]">
          Describe the video you want in chat to compile a 9:16 Remotion preview.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col rounded-[12px] border border-[#3A3835] bg-[#2A2927] overflow-hidden ${compact ? 'w-full max-w-[340px] mx-auto' : 'w-full'}`}>
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#3A3835] px-3.5 py-2.5 bg-[#2A2927]">
        <div className="flex items-center gap-2 truncate">
          <span className="font-mono text-[10px] text-[#A8A59E] uppercase tracking-wider">
            9:16 Video
          </span>
          <span className="text-[#3A3835]">·</span>
          <span className="truncate text-xs font-medium text-[#FAF9F5]">
            {video.title}
          </span>
        </div>
        <span className="font-mono text-[10px] text-[#A8A59E]">
          {video.resolution}
        </span>
      </div>

      {/* 9:16 Vertical Preview Container */}
      <div className="relative w-full bg-[#1F1E1D] flex items-center justify-center p-3">
        <div
          className={`relative mx-auto w-full aspect-[9/16] rounded-[8px] border border-[#3A3835] bg-[#232220] overflow-hidden flex flex-col justify-between p-4 ${
            compact ? 'max-h-[360px]' : 'max-h-[340px]'
          }`}
        >
          {/* Top Canvas Badges */}
          <div className="flex items-center justify-between text-[10px] font-mono text-[#A8A59E]">
            <span className="bg-[#1F1E1D] border border-[#3A3835] px-1.5 py-0.5 rounded">
              {video.fps} FPS
            </span>
            <span className="bg-[#1F1E1D] border border-[#3A3835] px-1.5 py-0.5 rounded">
              SCENE {activeSceneIndex + 1}/{video.scenes?.length || 4}
            </span>
          </div>

          {/* Center Graphic / Scene Visual Simulation */}
          <div className="flex flex-col items-center justify-center text-center my-auto px-2">
            <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-[#3A3835] bg-[#1F1E1D]">
              {isPlaying ? (
                <div className="h-6 w-6 rounded-full border-2 border-[#D97757] border-t-transparent animate-spin" />
              ) : (
                <Film className="h-6 w-6 text-[#A8A59E]" />
              )}
            </div>

            <p className="font-mono text-xs uppercase tracking-wider text-[#FAF9F5] font-semibold">
              {activeScene?.title || video.title}
            </p>
            <p className="mt-1 font-mono text-[10px] text-[#A8A59E]">
              {activeScene?.codeSummary || 'Remotion CSS Spring Physics'}
            </p>

            {/* Subtle animated bar */}
            <div className="mt-4 flex items-center gap-1">
              {[40, 75, 55, 90, 60, 30].map((h, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-[#3A3835] transition-all duration-300"
                  style={{
                    height: isPlaying ? `${(h * ((currentTime % 5) + 2)) / 5}px` : `${h / 2}px`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Bottom Scene Bar inside Canvas */}
          <div className="rounded border border-[#3A3835] bg-[#1F1E1D]/90 p-2 text-[10px] font-mono text-[#A8A59E]">
            <div className="flex justify-between items-center">
              <span>{activeScene?.visualStyle || 'Kinetic Typography'}</span>
              <span>{formatTime(currentTime)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar: Timeline, Play/Pause, Time Label, Download */}
      <div className="border-t border-[#3A3835] bg-[#2A2927] p-3 space-y-2.5">
        {/* Timeline Scrubber */}
        <div
          onClick={handleSeek}
          className="group relative h-2 w-full cursor-pointer rounded-full bg-[#1F1E1D] border border-[#3A3835]"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          tabIndex={0}
        >
          <div
            className="h-full rounded-full bg-[#A8A59E] group-hover:bg-[#FAF9F5] transition-all"
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
              className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#3A3835] bg-[#1F1E1D] text-[#FAF9F5] hover:bg-[#33322F] transition-colors"
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
              className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#3A3835] bg-[#1F1E1D] text-[#A8A59E] hover:text-[#FAF9F5] hover:bg-[#33322F] transition-colors"
              aria-label="Restart video"
              title="Restart"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            {/* Time label: 0:12 / 0:30 */}
            <span className="font-mono text-xs tabular-nums text-[#A8A59E] ml-1">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            className="flex h-9 items-center gap-1.5 rounded-[8px] border border-[#3A3835] bg-[#1F1E1D] px-3 text-xs font-medium text-[#FAF9F5] hover:bg-[#33322F] transition-colors"
          >
            {downloadSuccess ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#A8A59E]" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5 text-[#A8A59E]" />
                <span>Download</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
