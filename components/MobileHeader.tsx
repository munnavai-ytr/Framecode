'use client';

import React from 'react';
import { Menu, Terminal as TerminalIcon } from 'lucide-react';

interface MobileHeaderProps {
  onOpenSidebar: () => void;
  onOpenTerminal: () => void;
  isStreaming?: boolean;
}

const MobileHeaderInner: React.FC<MobileHeaderProps> = ({
  onOpenSidebar,
  onOpenTerminal,
  isStreaming = false,
}) => {
  return (
    <header className="flex lg:hidden h-14 w-full items-center justify-between border-b border-border bg-surface-1 px-3 shrink-0">
      {/* Menu Button - 44px touch target */}
      <button
        type="button"
        onClick={onOpenSidebar}
        className="flex h-11 w-11 items-center justify-center rounded-[8px] text-muted hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors cursor-pointer"
        aria-label="Open sidebar navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Brand Title */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight text-text">
          Framecode
        </span>
      </div>

      {/* Terminal Button - 44px touch target */}
      <button
        type="button"
        onClick={onOpenTerminal}
        className="flex h-11 items-center gap-1.5 rounded-[8px] border border-border bg-surface-2 px-3 text-xs font-medium text-text hover:bg-surface-3 active:bg-surface-3 transition-colors cursor-pointer"
        aria-label="Open AI terminal"
      >
        <TerminalIcon className="h-4 w-4 text-muted" />
        <span>Terminal</span>
        {isStreaming && (
          <span className="relative flex h-2 w-2 ml-0.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-text opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-text" />
          </span>
        )}
      </button>
    </header>
  );
};

export const MobileHeader = React.memo(MobileHeaderInner);
