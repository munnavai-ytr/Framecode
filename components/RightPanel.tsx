'use client';

import React from 'react';
import { VideoPlayer } from './VideoPlayer';
import { Terminal } from './Terminal';
import { VideoProject, TerminalLine } from '@/types/framecode';

interface RightPanelProps {
  video: VideoProject | null;
  terminalLines: TerminalLine[];
  isStreaming?: boolean;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  video,
  terminalLines,
  isStreaming = false,
}) => {
  return (
    <div className="hidden lg:flex h-full w-[400px] shrink-0 flex-col border-l border-[#3A3835] bg-[#1F1E1D] p-3 gap-3 overflow-hidden select-none">
      {/* Top: Video Player */}
      <div className="shrink-0">
        <VideoPlayer key={video?.id || 'empty'} video={video} />
      </div>

      {/* Bottom: Read-only Terminal auto-scrolling */}
      <div className="flex-1 min-h-[160px] overflow-hidden">
        <Terminal lines={terminalLines} isStreaming={isStreaming} />
      </div>
    </div>
  );
};
