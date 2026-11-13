'use client';

import React, { useState } from 'react';
import { Check, ChevronRight, Copy, CheckCheck, AlertCircle } from 'lucide-react';
import { TaskRow } from '@/types/framecode';

interface TaskRowItemProps {
  task: TaskRow;
}

const TaskRowItemInner: React.FC<TaskRowItemProps> = ({ task }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.codeSnippet) {
      navigator.clipboard.writeText(task.codeSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isRunning = task.status === 'running';
  const isDone = task.status === 'done';
  const isError = task.status === 'error';

  return (
    <div
      className={`w-full my-1.5 overflow-hidden rounded-[12px] border bg-[#2A2927]/60 transition-colors hover:bg-[#2A2927] ${
        isError ? 'border-red-900/50' : 'border-[#3A3835]'
      }`}
    >
      {/* Collapsed One-line Row */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs transition-colors min-h-[40px] select-none cursor-pointer"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Status Indicator: orange when running, grey check when done, red alert on error */}
          <div className="flex h-4 w-4 shrink-0 items-center justify-center">
            {isRunning ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D97757] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D97757]" />
              </span>
            ) : isDone ? (
              <Check className="h-3.5 w-3.5 text-[#A8A59E]" strokeWidth={2.5} />
            ) : isError ? (
              <AlertCircle className="h-3.5 w-3.5 text-red-400" strokeWidth={2.2} />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-[#3A3835]" />
            )}
          </div>

          {/* Label */}
          <span
            className={`truncate ${
              isError
                ? 'text-red-300'
                : isRunning
                ? 'text-[#FAF9F5] font-medium'
                : isDone
                ? 'text-[#FAF9F5]'
                : 'text-[#A8A59E]'
            }`}
          >
            {task.label}
          </span>
        </div>

        {/* Right Arrow / Detail Pill */}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {task.detailTitle && (
            <span className="hidden sm:inline-block font-mono text-[11px] text-[#A8A59E]/80">
              {task.detailTitle}
            </span>
          )}
          <ChevronRight
            className={`h-3.5 w-3.5 text-[#A8A59E] transition-transform duration-200 ${
              isExpanded ? 'rotate-90 text-[#FAF9F5]' : ''
            }`}
          />
        </div>
      </button>

      {/* Thin orange progress bar for running task */}
      {isRunning && (
        <div className="h-[2px] w-full bg-[#3A3835] overflow-hidden">
          <div
            className="h-full bg-[#D97757] transition-all duration-300"
            style={{ width: `${task.progress ?? 65}%` }}
          />
        </div>
      )}

      {/* Expanded Monospace Detail Area */}
      {isExpanded && (
        <div className="border-t border-[#3A3835] bg-[#1F1E1D] p-3 text-xs">
          {(task.detailTitle || task.codeSnippet) && (
            <div className="mb-2 flex items-center justify-between text-[11px] text-[#A8A59E]">
              <span className="font-mono">{task.detailTitle || (isError ? 'error.log' : 'details')}</span>
              {task.codeSnippet && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 hover:text-[#FAF9F5] transition-colors py-0.5 px-1.5 rounded cursor-pointer"
                  title="Copy"
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
              )}
            </div>
          )}
          <pre
            className={`font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-words p-2 bg-[#2A2927]/40 rounded-[8px] border border-[#3A3835]/50 ${
              isError ? 'text-red-300' : 'text-[#FAF9F5]/90'
            }`}
          >
            <code>
              {task.codeSnippet ||
                (isError
                  ? '// Task did not finish.'
                  : '// Task generated and verified by Framecode compiler')}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
};

export const TaskRowItem = React.memo(TaskRowItemInner);
