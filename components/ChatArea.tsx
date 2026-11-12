'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Sparkles, Settings, ChevronDown } from 'lucide-react';
import { ChatMessage, VideoProject, ModelSelection } from '@/types/framecode';
import { TaskRowItem } from './TaskRowItem';
import { VideoPlayer } from './VideoPlayer';
import { ProviderLogo } from './ProviderLogo';

interface ChatAreaProps {
  messages: ChatMessage[];
  currentVideo: VideoProject | null;
  onSendMessage: (text: string) => void;
  isStreaming: boolean;
  onRenderAndDownload?: () => void;
  isRenderingMp4?: boolean;
  selection: ModelSelection;
  onOpenModelPicker: () => void;
  onOpenSettings: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  currentVideo,
  onSendMessage,
  isStreaming,
  onRenderAndDownload,
  isRenderingMp4 = false,
  selection,
  onOpenModelPicker,
  onOpenSettings,
}) => {
  const [inputText, setInputText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages.length, isStreaming]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isStreaming) return;
    onSendMessage(trimmed);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full w-full flex-col justify-between overflow-hidden bg-[#1F1E1D]">
      {/* Scrollable Message Feed / Empty State */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto flex h-full max-w-[720px] flex-col justify-between">
          {isEmpty ? (
            /* Empty State */
            <div className="my-auto flex flex-col items-center justify-center text-center py-12 px-2">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#3A3835] bg-[#2A2927]">
                <Sparkles className="h-5 w-5 text-[#FAF9F5]" />
              </div>
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-[#FAF9F5]">
                What video should we make?
              </h1>
              <p className="mt-2 text-sm text-[#A8A59E] max-w-md">
                Describe a visual concept, storyboard, or motion graphics idea. Framecode writes Remotion React code and renders a 9:16 vertical reel.
              </p>
            </div>
          ) : (
            /* Message List */
            <div className="space-y-6 pb-6">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    {isUser ? (
                      /* User message: subtle surface bubble */
                      <div className="max-w-[85%] rounded-[12px] border border-[#3A3835] bg-[#2A2927] px-4 py-3 text-sm leading-relaxed text-[#FAF9F5] select-text">
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    ) : (
                      /* AI message: plain text with no bubble (Claude style) */
                      <div className="w-full text-sm leading-relaxed text-[#FAF9F5] select-text">
                        <div className="mb-2 text-[#FAF9F5]">
                          <p className="whitespace-pre-wrap">{msg.content}</p>

                          {msg.action === 'open-settings' && (
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={onOpenSettings}
                                className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-[#D97757] bg-[#D97757]/10 text-[#D97757] hover:bg-[#D97757]/20 text-xs font-medium transition cursor-pointer"
                              >
                                <Settings className="w-3.5 h-3.5" />
                                <span>Open Settings</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Task Rows */}
                        {msg.tasks && msg.tasks.length > 0 && (
                          <div className="mt-3 w-full space-y-1">
                            {msg.tasks.map((task) => (
                              <TaskRowItem key={task.id} task={task} />
                            ))}
                          </div>
                        )}

                        {/* Inline Video Player on Tablet & Mobile (below 1024px) */}
                        {msg.video && (
                          <div className="mt-4 block lg:hidden w-full">
                            <VideoPlayer
                              key={msg.video.id}
                              video={msg.video}
                              compact
                              onRenderAndDownload={onRenderAndDownload}
                              isRenderingMp4={isRenderingMp4}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input Box Area */}
      <div className="border-t border-[#3A3835] bg-[#1F1E1D] p-3 md:p-4">
        <div className="mx-auto max-w-[720px] w-full">
          <div className="flex flex-col rounded-[12px] border border-[#3A3835] bg-[#2A2927] p-2 focus-within:border-[#484542] transition-colors">
            {/* Top row: Auto-growing Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Describe the video you want..."
              className="w-full resize-none bg-transparent px-2.5 py-1.5 text-sm text-[#FAF9F5] placeholder-[#A8A59E] focus:outline-none max-h-[160px] leading-relaxed select-text"
              style={{ minHeight: '38px' }}
            />

            {/* Bottom row: Model chip bottom-left, Send button bottom-right */}
            <div className="flex items-center justify-between pt-2 px-1">
              <button
                type="button"
                onClick={onOpenModelPicker}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border border-[#3A3835] bg-[#1F1E1D] hover:bg-[#3A3835]/50 text-xs text-[#FAF9F5] transition cursor-pointer"
              >
                <ProviderLogo provider={selection.provider} className="w-3.5 h-3.5" />
                <span className="font-medium truncate max-w-[140px] sm:max-w-[200px]">
                  {selection.modelName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#A8A59E]" />
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!inputText.trim() || isStreaming}
                aria-label="Send message"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] transition-colors ${
                  inputText.trim() && !isStreaming
                    ? 'bg-[#D97757] text-white hover:bg-[#C5684A] cursor-pointer'
                    : 'bg-[#3A3835] text-[#A8A59E]/40 cursor-not-allowed'
                }`}
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* Subtext info */}
          <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-[#A8A59E]/70 select-none">
            <span>Enter sends · Shift+Enter for newline</span>
            <span>Remotion 9:16 Canvas</span>
          </div>
        </div>
      </div>
    </div>
  );
};
