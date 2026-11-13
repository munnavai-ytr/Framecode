'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowUp,
  Square,
  Sparkles,
  Settings,
  ChevronDown,
  Plus,
  X,
  FileText,
  Film,
  File,
  AlertCircle,
  Brain,
  Download,
} from 'lucide-react';
import { ChatMessage, VideoProject, ModelSelection, Attachment } from '@/types/framecode';
import { TaskRowItem } from './TaskRowItem';
import { VideoPlayer } from './VideoPlayer';
import { ProviderLogo } from './ProviderLogo';
import { MAX_FILE_SIZE_BYTES, getFileTooLargeMessage, formatFileSize } from '@/lib/files';
import { getThumb, getBlob } from '@/lib/db';

interface ChatAreaProps {
  messages: ChatMessage[];
  currentVideo: VideoProject | null;
  onSendMessage: (text: string, files?: File[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  onRenderAndDownload?: () => void;
  isRenderingMp4?: boolean;
  selection: ModelSelection | null;
  selectionLoaded?: boolean;
  onOpenModelPicker: () => void;
  onOpenSettings: () => void;
  onNavigate?: (href: string) => void;
}

interface FileChipPreview {
  file: File;
  previewUrl: string | null;
}

const ChatAreaInner: React.FC<ChatAreaProps> = ({
  messages,
  currentVideo,
  onSendMessage,
  onStop,
  isStreaming,
  onRenderAndDownload,
  isRenderingMp4 = false,
  selection,
  selectionLoaded = true,
  onOpenModelPicker,
  onOpenSettings,
  onNavigate,
}) => {
  const [inputText, setInputText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<FileChipPreview[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

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
      if (!isStreaming) {
        handleSubmit();
      }
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
  const canSend = Boolean(inputText.trim() || attachedFiles.length > 0);

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
                What should we build today?
              </h1>
              <p className="mt-2 text-sm text-[#A8A59E] max-w-md">
                Chat normally, brainstorm ideas, or ask Framecode to create a 9:16 Remotion video or custom graphic.
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
                      /* AI message: plain text with Markdown (Claude style) */
                      <div className="w-full text-sm leading-relaxed text-[#FAF9F5] select-text">
                        <div className="mb-2 text-[#FAF9F5] space-y-2">
                          <AssistantMarkdown content={msg.content} />

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

                        {/* Memory Updated Subtle Row */}
                        {msg.memoryUpdates && msg.memoryUpdates.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate ? onNavigate('/settings#memory') : onOpenSettings()
                            }
                            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[#3A3835] bg-[#2A2927]/70 px-3 py-1.5 text-xs text-[#A8A59E] hover:text-[#FAF9F5] hover:border-[#484542] transition cursor-pointer"
                          >
                            <Brain className="w-3.5 h-3.5 text-[#D97757] shrink-0" />
                            <span className="font-medium text-[#FAF9F5]">Memory updated</span>
                            <span className="truncate max-w-[280px] sm:max-w-[420px]">
                              · {msg.memoryUpdates.join(' · ')}
                            </span>
                          </button>
                        )}

                        {/* Generated Images */}
                        {msg.images && msg.images.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-3">
                            {msg.images.map((img) => (
                              <GeneratedImageCard
                                key={img.libraryId}
                                libraryId={img.libraryId}
                                name={img.name}
                                onOpen={(url) => setPreviewImage({ url, name: img.name })}
                              />
                            ))}
                          </div>
                        )}

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
                className="text-red-400 hover:text-white cursor-pointer"
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
                      className="p-1 text-[#A8A59E] hover:text-[#FAF9F5] transition cursor-pointer"
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
              placeholder="Ask anything, or describe a video or image to create..."
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

            {/* Bottom row: '+' upload far left, model chip, send/stop button far right */}
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
                {!selectionLoaded ? (
                  <div className="h-7 w-32 rounded-lg border border-[#3A3835] bg-[#1F1E1D] animate-pulse" />
                ) : (
                  <button
                    type="button"
                    onClick={onOpenModelPicker}
                    className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border border-[#3A3835] bg-[#1F1E1D] hover:bg-[#3A3835]/50 text-xs text-[#FAF9F5] transition cursor-pointer"
                  >
                    {selection ? (
                      <>
                        <ProviderLogo provider={selection.provider} className="w-3.5 h-3.5" />
                        <span className="font-medium truncate max-w-[120px] sm:max-w-[180px]">
                          {selection.modelName}
                        </span>
                      </>
                    ) : (
                      <span className="font-medium text-[#A8A59E]">Select model</span>
                    )}
                    <ChevronDown className="w-3.5 h-3.5 text-[#A8A59E]" />
                  </button>
                )}
              </div>

              {/* Send / Stop Button */}
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  aria-label="Stop"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#D97757] text-white hover:bg-[#C5684A] transition-colors cursor-pointer"
                  title="Stop generation"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSend}
                  aria-label="Send message"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] transition-colors ${
                    canSend
                      ? 'bg-[#D97757] text-white hover:bg-[#C5684A] cursor-pointer'
                      : 'bg-[#3A3835] text-[#A8A59E]/40 cursor-not-allowed'
                  }`}
                >
                  <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          {/* Subtext info */}
          <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-[#A8A59E]/70 select-none">
            <span>Enter sends · Shift+Enter for newline · + to attach</span>
            <span>Remotion 9:16 Canvas</span>
          </div>
        </div>
      </div>

      {/* Full-size Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-[#2A2927] border border-[#3A3835] rounded-2xl max-w-3xl w-full p-4 space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#3A3835]">
              <span className="text-sm font-medium text-[#FAF9F5] truncate">
                {previewImage.name}
              </span>
              <div className="flex items-center space-x-2">
                <a
                  href={previewImage.url}
                  download={previewImage.name}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg border border-[#3A3835] bg-[#1F1E1D] hover:bg-[#33322F] text-xs font-medium text-[#FAF9F5] transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="p-1 rounded-lg text-[#A8A59E] hover:text-[#FAF9F5] hover:bg-[#3A3835] transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center bg-[#1F1E1D] rounded-xl overflow-hidden max-h-[75vh] p-2">
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-h-[70vh] max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ChatArea = React.memo(ChatAreaInner);

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed text-[#FAF9F5] space-y-2.5 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-[#FAF9F5]">{children}</strong>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#D97757] underline underline-offset-2 hover:text-[#E58A6C]"
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return <code className="font-mono text-xs text-[#FAF9F5]">{children}</code>;
            }
            return (
              <code className="font-mono text-xs bg-[#2A2927] border border-[#3A3835] px-1.5 py-0.5 rounded text-[#FAF9F5]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="font-mono text-xs bg-[#2A2927] border border-[#3A3835] rounded-lg p-3 overflow-x-auto leading-relaxed">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded-lg border border-[#3A3835]">
              <table className="w-full text-left text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[#2A2927]">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-[#3A3835] px-3 py-2 font-semibold text-[#FAF9F5]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-[#3A3835]/60 px-3 py-2 text-[#A8A59E]">
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#D97757] pl-3 text-[#A8A59E] italic">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function GeneratedImageCard({
  libraryId,
  name,
  onOpen,
}: {
  libraryId: string;
  name: string;
  onOpen: (url: string) => void;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    getBlob(libraryId).then((blob) => {
      if (active && blob) {
        createdUrl = URL.createObjectURL(blob);
        setImgUrl(createdUrl);
      }
    });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [libraryId]);

  if (!imgUrl) {
    return (
      <div className="w-[240px] h-[240px] rounded-xl border border-[#3A3835] bg-[#2A2927] animate-pulse" />
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(imgUrl)}
      className="group relative max-w-[320px] rounded-xl border border-[#3A3835] bg-[#2A2927] overflow-hidden hover:border-[#D97757] transition cursor-pointer"
      title={`Preview ${name}`}
    >
      <img
        src={imgUrl}
        alt={name}
        className="max-w-[320px] max-h-[360px] object-contain block"
      />
    </button>
  );
}

function UserAttachmentChip({ attachment }: { attachment: Attachment }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    if (attachment.kind === 'image') {
      getThumb(attachment.id).then((blob) => {
        if (active && blob) {
          createdUrl = URL.createObjectURL(blob);
          setThumbUrl(createdUrl);
        }
      });
    }
    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
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
