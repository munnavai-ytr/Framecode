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
        className="fixed inset-0 bg-bg/80 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Sheet Container */}
      <div className="relative z-10 flex h-[70dvh] max-h-[85dvh] w-full flex-col rounded-t-[16px] border-t border-border bg-surface-1 pb-[env(safe-area-inset-bottom)] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Handle / Header Bar */}
        <div className="relative flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3 min-h-[48px]">
          <div className="mx-auto h-1 w-10 rounded-full bg-border-strong" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-[8px] text-muted hover:text-text hover:bg-surface-3 transition-colors cursor-pointer"
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
