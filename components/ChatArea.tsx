'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Sparkles,
  Settings,
  ChevronDown,
  Plus,
  X,
  FileText,
  Film,
  File,
  AlertCircle,
} from 'lucide-react';
import { ChatMessage, VideoProject, ModelSelection, Attachment } from '@/types/framecode';
import { TaskRowItem } from './TaskRowItem';
import { VideoPlayer } from './VideoPlayer';
import { ProviderLogo } from './ProviderLogo';
import { MAX_FILE_SIZE_BYTES, getFileTooLargeMessage, formatFileSize } from '@/lib/files';
import { getThumb } from '@/lib/db';

interface ChatAreaProps {
  messages: ChatMessage[];
  currentVideo: VideoProject | null;
  onSendMessage: (text: string, files?: File[]) => void;
  isStreaming: boolean;
  onRenderAndDownload?: () => void;
  isRenderingMp4?: boolean;
  selection: ModelSelection;
  onOpenModelPicker: () => void;
  onOpenSettings: () => void;
}

interface FileChipPreview {
  file: File;
  previewUrl: string | null;
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
  const [attachedFiles, setAttachedFiles] = useState<FileChipPreview[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages.length, isStreaming]);

  // Clean up blob URLs when attachedFiles change or unmount
  useEffect(() => {
    return () => {
      attachedFiles.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [attachedFiles]);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    setErrorMessage(null);
    let sizeError: string | null = null;
    const validFiles: FileChipPreview[] = [];

    for (const file of selected) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        sizeError = getFileTooLargeMessage(file.name);
        break;
      }
      let previewUrl: string | null = null;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }
      validFiles.push({ file, previewUrl });
    }

    if (sizeError) {
      setErrorMessage(sizeError);
    } else {
      setAttachedFiles((prev) => {
        const combined = [...prev, ...validFiles];
        if (combined.length > 6) {
          setErrorMessage('Maximum 6 files per message.');
          return combined.slice(0, 6);
        }
        return combined;
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFileChip = (index: number) => {
    setAttachedFiles((prev) => {
      const target = prev[index];
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
    setErrorMessage(null);
  };

  const handleSubmit = () => {
    const trimmed = inputText.trim();
    const filesToSend = attachedFiles.map((item) => item.file);

    if ((!trimmed && filesToSend.length === 0) || isStreaming) return;

    onSendMessage(trimmed, filesToSend);

    setInputText('');
    setAttachedFiles([]);
    setErrorMessage(null);

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
                      <div className="max-w-[85%] rounded-[12px] border border-[#3A3835] bg-[#2A2927] px-4 py-3 text-sm leading-relaxed text-[#FAF9F5] select-text space-y-2">
                        {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}

                        {/* Render user attachment chips */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {msg.attachments.map((att) => (
                              <UserAttachmentChip key={att.id} attachment={att} />
                            ))}
                          </div>
                        )}
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
        <div className="mx-auto max-w-[720px] w-full space-y-2">
          {/* Error alert banner */}
          {errorMessage && (
            <div className="flex items-center justify-between px-3 py-2 bg-red-950/40 border border-red-900/50 rounded-lg text-xs text-red-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-red-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-col rounded-[12px] border border-[#3A3835] bg-[#2A2927] p-2 focus-within:border-[#484542] transition-colors">
            {/* Attached file chips above textarea */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-2.5 pt-1.5 pb-2 border-b border-[#3A3835]/60 mb-1">
                {attachedFiles.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center space-x-2 px-2 py-1 rounded-lg bg-[#1F1E1D] border border-[#3A3835] text-xs text-[#FAF9F5]"
                  >
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="w-14 h-14 object-cover rounded-md"
                      />
                    ) : item.file.type.startsWith('video/') ? (
                      <Film className="w-4 h-4 text-[#D97757]" />
                    ) : (
                      <FileText className="w-4 h-4 text-[#A8A59E]" />
                    )}

                    <div className="flex flex-col min-w-0 max-w-[140px]">
                      <span className="truncate text-xs font-medium">{item.file.name}</span>
                      <span className="text-[10px] text-[#A8A59E]">
                        {formatFileSize(item.file.size)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFileChip(idx)}
                      className="p-1 text-[#A8A59E] hover:text-[#FAF9F5] transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Top row: Auto-growing Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Describe the video you want or attach files..."
              className="w-full resize-none bg-transparent px-2.5 py-1.5 text-sm text-[#FAF9F5] placeholder-[#A8A59E] focus:outline-none max-h-[160px] leading-relaxed select-text"
              style={{ minHeight: '38px' }}
            />

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Bottom row: '+' upload far left, model chip, send button far right */}
            <div className="flex items-center justify-between pt-2 px-1">
              <div className="flex items-center space-x-2">
                {/* '+' Upload Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#3A3835] bg-[#1F1E1D] hover:bg-[#3A3835]/60 text-[#FAF9F5] transition cursor-pointer disabled:opacity-50"
                  title="Attach files (max 6 files, 200 MB limit)"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {/* Model Picker Chip */}
                <button
                  type="button"
                  onClick={onOpenModelPicker}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border border-[#3A3835] bg-[#1F1E1D] hover:bg-[#3A3835]/50 text-xs text-[#FAF9F5] transition cursor-pointer"
                >
                  <ProviderLogo provider={selection.provider} className="w-3.5 h-3.5" />
                  <span className="font-medium truncate max-w-[120px] sm:max-w-[180px]">
                    {selection.modelName}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#A8A59E]" />
                </button>
              </div>

              {/* Send Button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={(!inputText.trim() && attachedFiles.length === 0) || isStreaming}
                aria-label="Send message"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] transition-colors ${
                  (inputText.trim() || attachedFiles.length > 0) && !isStreaming
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
            <span>Enter sends · Shift+Enter for newline · + to attach</span>
            <span>Remotion 9:16 Canvas</span>
          </div>
        </div>
      </div>
    </div>
  );
};

function UserAttachmentChip({ attachment }: { attachment: Attachment }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (attachment.kind === 'image') {
      getThumb(attachment.id).then((blob) => {
        if (active && blob) {
          setThumbUrl(URL.createObjectURL(blob));
        }
      });
    }
    return () => {
      active = false;
      if (thumbUrl) {
        URL.revokeObjectURL(thumbUrl);
      }
    };
  }, [attachment.id, attachment.kind]);

  return (
    <div className="flex items-center space-x-2 p-1.5 rounded-lg bg-[#1F1E1D] border border-[#3A3835] text-xs text-[#FAF9F5]">
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={attachment.name}
          className="w-[56px] h-[56px] object-cover rounded-md"
        />
      ) : attachment.kind === 'video' ? (
        <div className="w-[56px] h-[56px] bg-[#2A2927] rounded-md flex flex-col items-center justify-center">
          <Film className="w-5 h-5 text-[#D97757]" />
        </div>
      ) : (
        <div className="w-[56px] h-[56px] bg-[#2A2927] rounded-md flex flex-col items-center justify-center">
          <File className="w-5 h-5 text-[#A8A59E]" />
        </div>
      )}

      <div className="flex flex-col min-w-0 max-w-[120px]">
        <span className="truncate text-xs font-medium">{attachment.name}</span>
        <span className="text-[10px] text-[#A8A59E]">{formatFileSize(attachment.size)}</span>
      </div>
    </div>
  );
}
