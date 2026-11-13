'use client';

import React from 'react';
import { VideoPlayer } from './VideoPlayer';
import { Terminal } from './Terminal';
import { VideoProject, TerminalLine } from '@/types/framecode';

interface RightPanelProps {
  video: VideoProject | null;
  terminalLines: TerminalLine[];
  isStreaming?: boolean;
  onRenderAndDownload?: () => void;
  isRenderingMp4?: boolean;
}

const RightPanelInner: React.FC<RightPanelProps> = ({
  video,
  terminalLines,
  isStreaming = false,
  onRenderAndDownload,
  isRenderingMp4 = false,
}) => {
  return (
    <div className="hidden lg:flex h-full w-[360px] min-[1440px]:w-[440px] shrink-0 flex-col border-l border-border bg-surface-1 p-3 gap-3 overflow-hidden select-none">
      {/* Top: Video Player */}
      <div className="shrink-0">
        <VideoPlayer
          key={video?.id || 'empty'}
          video={video}
          onRenderAndDownload={onRenderAndDownload}
          isRenderingMp4={isRenderingMp4}
        />
      </div>

      {/* Bottom: Read-only Terminal auto-scrolling */}
      <div className="flex-1 min-h-[160px] overflow-hidden">
        <Terminal lines={terminalLines} isStreaming={isStreaming} />
      </div>
    </div>
  );
};

export const RightPanel = React.memo(RightPanelInner);
