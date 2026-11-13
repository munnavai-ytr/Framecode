'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Key,
} from 'lucide-react';
import {
  ChatMessage,
  VideoProject,
  ModelSelection,
  ImageSelection,
  Attachment,
  ProviderId,
} from '@/types/framecode';
import { TaskRowItem } from './TaskRowItem';
import { VideoPlayer } from './VideoPlayer';
import { ProviderLogo } from './ProviderLogo';
import { ApiKeysSheet } from './ApiKeysSheet';
import { ModelPicker } from './ModelPicker';
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
  imageSelection: ImageSelection | null;
  selectionLoaded?: boolean;
  onSelectModel: (selection: ModelSelection) => void;
  onSelectImage: (imageSelection: ImageSelection | null) => void;
  onOpenSettings: () => void;
  onNavigate?: (href: string) => void;
}

interface FileChipPreview {
  file: File;
  previewUrl: string | null;
}

const ChatAreaInner: React.FC<ChatAreaProps> = ({
  messages,
  onSendMessage,
  onStop,
  isStreaming,
  onRenderAndDownload,
  isRenderingMp4 = false,
  selection,
  imageSelection,
  selectionLoaded = true,
  onSelectModel,
  onSelectImage,
  onOpenSettings,
  onNavigate,
}) => {
  const [inputText, setInputText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<FileChipPreview[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  const [isApiKeysOpen, setIsApiKeysOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [pickerProviderOverride, setPickerProviderOverride] = useState<ProviderId | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages.length, isStreaming]);

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

  const handleActivateProvider = useCallback(
    (provider: ProviderId) => {
      try {
        const savedStr = localStorage.getItem(`fc_last_model_${provider}`);
        if (savedStr) {
          const parsed = JSON.parse(savedStr);
          if (
            parsed?.provider === provider &&
            typeof parsed.modelId === 'string' &&
            typeof parsed.modelName === 'string' &&
            typeof parsed.vision === 'boolean'
          ) {
            onSelectModel(parsed as ModelSelection);
            setIsApiKeysOpen(false);
            setPickerProviderOverride(null);
            return;
          }
        }
      } catch {
        // Fallback to model picker
      }

      setIsApiKeysOpen(false);
      setPickerProviderOverride(provider);
      setIsModelPickerOpen(true);
    },
    [onSelectModel]
  );

  const isEmpty = messages.length === 0;
  const canSend = Boolean(inputText.trim() || attachedFiles.length > 0);

  return (
    <div className="flex h-full w-full flex-col justify-between bg-bg">
      {/* Scrollable Message Feed / Empty State */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex h-full w-full sm:max-w-[680px] lg:max-w-[720px] min-[1440px]:max-w-[780px] flex-col justify-between">
          {isEmpty ? (
            /* Empty State */
            <div className="my-auto flex flex-col items-center justify-center text-center py-12 px-2">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[12px] border border-border bg-surface-2">
                <Sparkles className="h-5 w-5 text-accent-text" />
              </div>
              <h1 className="text-xl md:text-2xl min-[1440px]:text-3xl font-semibold tracking-tight text-text">
                What should we build today?
              </h1>
              <p className="mt-2 text-base lg:text-sm text-muted max-w-md">
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
                      /* User message */
                      <div className="max-w-[85%] rounded-[12px] border border-border bg-surface-2 px-4 py-3 text-base lg:text-sm leading-relaxed text-text select-text space-y-2">
                        {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}

                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {msg.attachments.map((att) => (
                              <UserAttachmentChip key={att.id} attachment={att} />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* AI message */
                      <div className="w-full text-base lg:text-sm leading-relaxed text-text select-text">
                        <div className="mb-2 text-text space-y-2">
                          <AssistantMarkdown content={msg.content} />

                          {msg.action === 'open-settings' && (
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={onOpenSettings}
                                className="inline-flex min-h-[44px] lg:min-h-[34px] items-center space-x-2 px-3 py-1.5 rounded-lg border border-accent bg-accent-soft text-accent-text hover:bg-accent/20 text-xs font-medium transition cursor-pointer"
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
                            className="mt-2 inline-flex min-h-[44px] lg:min-h-[34px] items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted hover:text-text hover:border-border-strong transition cursor-pointer"
                          >
                            <Brain className="w-3.5 h-3.5 text-accent-text shrink-0" />
                            <span className="font-medium text-text">Memory updated</span>
                            <span className="truncate max-w-[260px] sm:max-w-[420px]">
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
      <div className="border-t border-border bg-bg p-3 md:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-4">
        <div className="mx-auto w-full sm:max-w-[680px] lg:max-w-[720px] min-[1440px]:max-w-[780px] space-y-2">
          {/* Error alert banner */}
          {errorMessage && (
            <div className="flex items-center justify-between px-3 py-2 bg-danger/10 border border-danger/40 rounded-lg text-xs text-danger">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="flex h-8 w-8 items-center justify-center text-danger hover:text-text cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-col rounded-[16px] border border-border bg-surface-2 p-2.5 focus-within:border-border-strong transition-colors">
            {/* Attached file chips above textarea */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-2 pt-1 pb-2 border-b border-border/60 mb-1.5">
                {attachedFiles.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center space-x-2 px-2 py-1 rounded-lg bg-surface-1 border border-border text-xs text-text"
                  >
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="w-12 h-12 object-cover rounded-md"
                      />
                    ) : item.file.type.startsWith('video/') ? (
                      <Film className="w-4 h-4 text-accent-text" />
                    ) : (
                      <FileText className="w-4 h-4 text-muted" />
                    )}

                    <div className="flex flex-col min-w-0 max-w-[140px]">
                      <span className="truncate text-xs font-medium">{item.file.name}</span>
                      <span className="text-[10px] text-muted">
                        {formatFileSize(item.file.size)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFileChip(idx)}
                      className="flex h-8 w-8 items-center justify-center text-muted hover:text-text transition cursor-pointer"
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
              className="w-full resize-none bg-transparent px-2.5 py-1.5 text-base lg:text-sm text-text placeholder-muted focus:outline-none max-h-[160px] leading-relaxed select-text"
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

            {/* Bottom row: '+' upload, unified provider/model pill + sheets, send/stop button */}
            <div className="flex items-center justify-between pt-2 px-1 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {/* '+' Upload Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming}
                  className="flex h-11 w-11 lg:h-10 lg:w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-1 hover:bg-surface-3 hover:border-border-strong text-text transition cursor-pointer disabled:opacity-50"
                  title="Attach files (max 6 files, 200 MB limit)"
                  aria-label="Attach files"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {/* Unified Two-Target Provider & Model Switcher + Anchored Sheets */}
                <div className="relative inline-flex items-center">
                  {!selectionLoaded ? (
                    <div className="h-11 lg:h-10 w-36 rounded-full border border-border bg-surface-1 animate-pulse" />
                  ) : (
                    <div
                      data-switcher-pill
                      className="flex h-11 lg:h-10 items-center rounded-full border border-border bg-surface-1 overflow-hidden hover:border-border-strong transition-colors"
                    >
                      {/* Left tap target: provider logo / key icon -> API keys sheet */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsModelPickerOpen(false);
                          setIsApiKeysOpen((prev) => !prev);
                        }}
                        aria-label="API keys"
                        title="Switch provider or manage API keys"
                        className="flex h-full min-w-[44px] lg:min-w-[40px] items-center justify-center px-2.5 border-r border-border hover:bg-surface-3 transition-colors cursor-pointer"
                      >
                        {selection ? (
                          <ProviderLogo provider={selection.provider} size={16} />
                        ) : (
                          <Key className="w-4 h-4 text-muted" />
                        )}
                      </button>

                      {/* Right tap target: model name + chevron -> Choose a model sheet */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsApiKeysOpen(false);
                          setPickerProviderOverride(null);
                          setIsModelPickerOpen((prev) => !prev);
                        }}
                        aria-label="Choose a model"
                        className="flex h-full min-w-[44px] items-center gap-1.5 px-3 hover:bg-surface-3 transition-colors text-xs text-text cursor-pointer"
                      >
                        <span
                          className={`hidden min-[360px]:inline font-medium truncate max-w-[130px] sm:max-w-[180px] ${
                            selection ? 'text-text' : 'text-muted'
                          }`}
                        >
                          {selection ? selection.modelName : 'Select model'}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
                      </button>
                    </div>
                  )}

                  {/* Anchored Popover / Bottom Sheets */}
                  <ApiKeysSheet
                    isOpen={isApiKeysOpen}
                    onClose={() => setIsApiKeysOpen(false)}
                    activeProvider={selection?.provider ?? null}
                    onActivateProvider={handleActivateProvider}
                    onOpenSettings={onOpenSettings}
                  />

                  <ModelPicker
                    isOpen={isModelPickerOpen}
                    onClose={() => {
                      setIsModelPickerOpen(false);
                      setPickerProviderOverride(null);
                    }}
                    selection={selection}
                    imageSelection={imageSelection}
                    activeProviderOverride={pickerProviderOverride}
                    onSelect={onSelectModel}
                    onSelectImage={onSelectImage}
                    onOpenApiKeys={() => {
                      setIsModelPickerOpen(false);
                      setIsApiKeysOpen(true);
                    }}
                  />
                </div>
              </div>

              {/* Send / Stop Button */}
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  aria-label="Stop"
                  className="flex h-11 w-11 lg:h-10 lg:w-10 shrink-0 items-center justify-center rounded-full bg-accent hover:bg-accent-hover active:bg-accent-pressed text-white transition-colors cursor-pointer"
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
                  className={`flex h-11 w-11 lg:h-10 lg:w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                    canSend
                      ? 'bg-accent hover:bg-accent-hover active:bg-accent-pressed text-white cursor-pointer'
                      : 'bg-surface-3 text-faint cursor-not-allowed'
                  }`}
                >
                  <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          {/* Subtext info */}
          <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-faint select-none">
            <span>Enter sends · Shift+Enter for newline · + to attach</span>
            <span>Remotion 9:16 Canvas</span>
          </div>
        </div>
      </div>

      {/* Full-size Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/85 backdrop-blur-xs"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-surface-2 border border-border rounded-2xl max-w-3xl w-full p-4 space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-sm font-medium text-text truncate">
                {previewImage.name}
              </span>
              <div className="flex items-center space-x-2">
                <a
                  href={previewImage.url}
                  download={previewImage.name}
                  className="inline-flex min-h-[36px] items-center space-x-1.5 px-3 py-1 rounded-lg border border-border bg-surface-1 hover:bg-surface-3 text-xs font-medium text-text transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-text hover:bg-surface-3 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center bg-surface-1 rounded-xl overflow-hidden max-h-[75vh] p-2">
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
    <div className="text-base lg:text-sm leading-relaxed text-text space-y-2.5 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-text">{children}</strong>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-text underline underline-offset-2 hover:text-text"
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return <code className="font-mono text-xs text-term-text">{children}</code>;
            }
            return (
              <code className="font-mono text-xs bg-surface-2 border border-border px-1.5 py-0.5 rounded text-text">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="font-mono text-xs bg-term-bg border border-border rounded-lg p-3 overflow-x-auto leading-relaxed">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded-lg border border-border">
              <table className="w-full text-left text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-surface-2">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-border px-3 py-2 font-semibold text-text">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/60 px-3 py-2 text-muted">
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent pl-3 text-muted italic">
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
      <div className="w-[240px] h-[240px] rounded-xl border border-border bg-surface-2 animate-pulse" />
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(imgUrl)}
      className="group relative max-w-[320px] rounded-xl border border-border bg-surface-2 overflow-hidden hover:border-accent transition cursor-pointer"
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
    <div className="flex items-center space-x-2 p-1.5 rounded-lg bg-surface-1 border border-border text-xs text-text">
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={attachment.name}
          className="w-[56px] h-[56px] object-cover rounded-md"
        />
      ) : attachment.kind === 'video' ? (
        <div className="w-[56px] h-[56px] bg-surface-2 rounded-md flex flex-col items-center justify-center">
          <Film className="w-5 h-5 text-accent-text" />
        </div>
      ) : (
        <div className="w-[56px] h-[56px] bg-surface-2 rounded-md flex flex-col items-center justify-center">
          <File className="w-5 h-5 text-muted" />
        </div>
      )}

      <div className="flex flex-col min-w-0 max-w-[120px]">
        <span className="truncate text-xs font-medium">{attachment.name}</span>
        <span className="text-[10px] text-muted">{formatFileSize(attachment.size)}</span>
      </div>
    </div>
  );
}
