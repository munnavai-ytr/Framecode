'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Terminal as TerminalIcon, Copy, CheckCheck } from 'lucide-react';
import { TerminalLine } from '@/types/framecode';

interface TerminalProps {
  lines: TerminalLine[];
  isStreaming?: boolean;
}

const TerminalInner: React.FC<TerminalProps> = ({ lines, isStreaming = false }) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Auto-scroll to the bottom whenever lines change
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines.length, isStreaming]);

  const handleCopyLogs = () => {
    const text = lines.map((l) => `${l.timestamp ? `[${l.timestamp}] ` : ''}${l.text}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[12px] border border-[#3A3835] bg-[#1F1E1D]">
      {/* Top Bar / Title */}
      <div className="flex items-center justify-between border-b border-[#3A3835] bg-[#2A2927] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-3.5 w-3.5 text-[#A8A59E]" />
          <span className="text-xs font-medium text-[#FAF9F5]">AI terminal - view only</span>
          {isStreaming && (
            <span className="flex h-2 w-2 relative">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D97757] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D97757]" />
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleCopyLogs}
          className="flex items-center gap-1 text-[11px] text-[#A8A59E] hover:text-[#FAF9F5] transition-colors py-0.5 px-2 rounded hover:bg-[#1F1E1D]"
          title="Copy terminal logs"
        >
          {copied ? (
            <>
              <CheckCheck className="h-3 w-3 text-[#A8A59E]" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Terminal Monospace Content - Read-only, No input field */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3.5 font-terminal text-[11px] leading-relaxed text-[#A8A59E] select-text"
      >
        <div className="space-y-1">
          {lines.map((line) => {
            const isCommand = line.type === 'command' || line.text.startsWith('$');
            const isSuccess = line.type === 'success' || line.text.startsWith('✓');
            const isHighlight = line.type === 'highlight';

            return (
              <div key={line.id} className="flex items-start gap-2 break-all">
                {line.timestamp && (
                  <span className="shrink-0 text-[#A8A59E]/50 select-none">
                    {line.timestamp}
                  </span>
                )}
                <span
                  className={
                    isCommand
                      ? 'text-[#FAF9F5] font-semibold'
                      : isSuccess
                      ? 'text-[#FAF9F5]'
                      : isHighlight
                      ? 'text-[#D97757]'
                      : 'text-[#A8A59E]'
                  }
                >
                  {line.text}
                </span>
              </div>
            );
          })}

          {/* Cursor pulse if actively streaming logs */}
          {isStreaming && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[#D97757] animate-pulse">_</span>
            </div>
          )}

          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
};

export const Terminal = React.memo(TerminalInner);
