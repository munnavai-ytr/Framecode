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
      className={`w-full my-1.5 overflow-hidden rounded-[12px] border bg-surface-2/80 transition-colors hover:bg-surface-2 ${
        isError ? 'border-danger/50' : 'border-border'
      }`}
    >
      {/* Collapsed One-line Row */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs transition-colors min-h-[44px] select-none cursor-pointer"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Status Indicator */}
          <div className="flex h-4 w-4 shrink-0 items-center justify-center">
            {isRunning ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-text opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-text" />
              </span>
            ) : isDone ? (
              <Check className="h-3.5 w-3.5 text-success" strokeWidth={2.5} />
            ) : isError ? (
              <AlertCircle className="h-3.5 w-3.5 text-danger" strokeWidth={2.2} />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
            )}
          </div>

          {/* Label */}
          <span
            className={`truncate ${
              isError
                ? 'text-danger'
                : isRunning
                ? 'text-text font-medium'
                : isDone
                ? 'text-text'
                : 'text-muted'
            }`}
          >
            {task.label}
          </span>
        </div>

        {/* Right Arrow / Detail Pill */}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {task.detailTitle && (
            <span className="hidden sm:inline-block font-mono text-[11px] text-muted">
              {task.detailTitle}
            </span>
          )}
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted transition-transform duration-200 ${
              isExpanded ? 'rotate-90 text-text' : ''
            }`}
          />
        </div>
      </button>

      {/* Thin accent progress bar for running task */}
      {isRunning && (
        <div className="h-[2px] w-full bg-border overflow-hidden">
          <div
            className="h-full bg-accent-text transition-all duration-300"
            style={{ width: `${task.progress ?? 65}%` }}
          />
        </div>
      )}

      {/* Expanded Monospace Detail Area */}
      {isExpanded && (
        <div className="border-t border-border bg-term-bg p-3 text-xs">
          {(task.detailTitle || task.codeSnippet) && (
            <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
              <span className="font-mono">{task.detailTitle || (isError ? 'error.log' : 'details')}</span>
              {task.codeSnippet && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 hover:text-text transition-colors py-0.5 px-1.5 rounded cursor-pointer"
                  title="Copy"
                >
                  {copied ? (
                    <>
                      <CheckCheck className="h-3 w-3 text-success" />
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
            className={`font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-words p-2.5 bg-surface-1 rounded-[8px] border border-border/60 ${
              isError ? 'text-danger' : 'text-term-text'
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
