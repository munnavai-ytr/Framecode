'use client';

import React from 'react';
import { X } from 'lucide-react';
import { Terminal } from './Terminal';
import { TerminalLine } from '@/types/framecode';

interface MobileTerminalSheetProps {
  isOpen: boolean;
  onClose: () => void;
  lines: TerminalLine[];
  isStreaming?: boolean;
}

export const MobileTerminalSheet: React.FC<MobileTerminalSheetProps> = ({
  isOpen,
  onClose,
  lines,
  isStreaming = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Sheet Container */}
      <div className="relative z-10 flex h-[70vh] w-full flex-col rounded-t-[16px] border-t border-[#3A3835] bg-[#1F1E1D] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Handle / Header Bar */}
        <div className="flex items-center justify-between border-b border-[#3A3835] bg-[#2A2927] px-4 py-2">
          <div className="mx-auto h-1 w-10 rounded-full bg-[#3A3835]" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-2 flex h-8 w-8 items-center justify-center rounded-[8px] text-[#A8A59E] hover:text-[#FAF9F5] hover:bg-[#33322F]"
            aria-label="Close terminal sheet"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Embedded Terminal Component */}
        <div className="flex-1 p-2 overflow-hidden">
          <Terminal lines={lines} isStreaming={isStreaming} />
        </div>
      </div>
    </div>
  );
};
