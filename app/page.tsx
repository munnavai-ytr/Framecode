'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { ChatArea } from '@/components/ChatArea';
import { RightPanel } from '@/components/RightPanel';
import { MobileHeader } from '@/components/MobileHeader';
import { MobileTerminalSheet } from '@/components/MobileTerminalSheet';
import { ModelPicker } from '@/components/ModelPicker';
import {
  ChatSession,
  ChatMessage,
  TaskRow,
  TerminalLine,
  VideoProject,
  ModelSelection,
  ImageSelection,
  Attachment,
  LibraryItem,
  MemoryOp,
} from '@/types/framecode';
import { compileRemotionCode } from '@/lib/codeCompiler';
import {
  checkWebRendererSupport,
  captureStillsForReview,
  renderSingleStillToPng,
  renderVideoToMp4,
} from '@/lib/videoRenderer';
import { loadChats, saveChat, addLibraryItem } from '@/lib/db';
import {
  categorize,
  readMediaInfo,
  makeThumb,
  downscaleImageForVision,
  formatFileSize,
} from '@/lib/files';
import { prepareCode } from '@/lib/assetTokens';
import { useKeyStatus } from '@/lib/keyStatus';
import {
  isMemoryEnabled,
  loadMemories,
  buildMemoryContext,
  applyMemoryOps,
} from '@/lib/memory';

const LOCAL_STORAGE_SELECTION_KEY = 'fc_selection';
const LOCAL_STORAGE_IMAGE_SELECTION_KEY = 'fc_image_selection';
const LOCAL_STORAGE_LEGACY_CHATS_KEY = 'framecode_chats';

const ASPECT_RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '3:4': { width: 1080, height: 1440 },
  '4:3': { width: 1440, height: 1080 },
};

function sanitizeLoadedChats(chats: ChatSession[]): ChatSession[] {
  return chats.map((chat) => ({
    ...chat,
    messages: (chat.messages || []).map((msg) => ({
      ...msg,
      isStreaming: false,
      tasks: msg.tasks?.map((t) =>
        t.status === 'running'
          ? {
              ...t,
              status: 'error',
              label: t.label.endsWith(' (interrupted)') ? t.label : `${t.label} (interrupted)`,
            }
          : t
      ),
    })),
  }));
}

function createFetchSignal(userSignal: AbortSignal, timeoutMs = 70000): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('TimeoutError', 'TimeoutError'));
  }, timeoutMs);

  const onUserAbort = () => {
    controller.abort(userSignal.reason || new DOMException('Aborted', 'AbortError'));
  };

  if (userSignal.aborted) {
    onUserAbort();
  } else {
    userSignal.addEventListener('abort', onUserAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      userSignal.removeEventListener('abort', onUserAbort);
    },
  };
}

function base64ToBlob(base64: string, mime: string): Blob {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  const binStr = atob(clean);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export default function FramecodePage() {
  const router = useRouter();
  const { status: keyStatus } = useKeyStatus();

  const [selection, setSelection] = useState<ModelSelection | null>(null);
  const [imageSelection, setImageSelection] = useState<ImageSelection | null>(null);
  const [selectionLoaded, setSelectionLoaded] = useState<boolean>(false);

  const [pastChats, setPastChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);

  // UI state
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isRenderingMp4, setIsRenderingMp4] = useState<boolean>(false);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState<boolean>(false);
  const [isTerminalSheetOpenMobile, setIsTerminalSheetOpenMobile] = useState<boolean>(false);
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const saveDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for stable callbacks, abort control, and buffered state flushing
  const isStreamingRef = useRef<boolean>(false);
  const isRenderingMp4Ref = useRef<boolean>(false);
  const pastChatsRef = useRef<ChatSession[]>([]);
  const activeChatIdRef = useRef<string | null>(null);
  const selectionRef = useRef<ModelSelection | null>(null);
  const imageSelectionRef = useRef<ImageSelection | null>(null);
  const keyStatusRef = useRef(keyStatus);

  const abortControllerRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef<boolean>(false);
  const activeRunRef = useRef<{ chatId: string; assistantMsgId: string } | null>(null);

  const pendingLogsRef = useRef<Map<string, TerminalLine[]>>(new Map());
  const pendingProgressRef = useRef<{
    chatId: string;
    msgId: string;
    taskId: string;
    label: string;
    progress: number;
  } | null>(null);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    isRenderingMp4Ref.current = isRenderingMp4;
  }, [isRenderingMp4]);

  useEffect(() => {
    pastChatsRef.current = pastChats;
  }, [pastChats]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    imageSelectionRef.current = imageSelection;
  }, [imageSelection]);

  useEffect(() => {
    keyStatusRef.current = keyStatus;
  }, [keyStatus]);

  // Read model selection & load chats from IndexedDB after mounting on client
  useEffect(() => {
    isMountedRef.current = true;
    let active = true;

    async function initStorage() {
      try {
        const storedSelection = localStorage.getItem(LOCAL_STORAGE_SELECTION_KEY);
        if (storedSelection) {
          try {
            const parsed = JSON.parse(storedSelection);
            if (
              parsed?.provider &&
              ['claude', 'openrouter', 'gemini'].includes(parsed.provider) &&
              parsed?.modelId &&
              typeof parsed.modelId === 'string' &&
              parsed?.modelName &&
              typeof parsed.modelName === 'string' &&
              typeof parsed.vision === 'boolean'
            ) {
              setSelection(parsed);
            } else {
              setSelection(null);
            }
          } catch {
            setSelection(null);
          }
        }

        const storedImageSelection = localStorage.getItem(LOCAL_STORAGE_IMAGE_SELECTION_KEY);
        if (storedImageSelection) {
          try {
            const parsedImg = JSON.parse(storedImageSelection);
            if (
              parsedImg?.provider &&
              ['claude', 'openrouter', 'gemini'].includes(parsedImg.provider) &&
              parsedImg?.modelId &&
              typeof parsedImg.modelId === 'string'
            ) {
              setImageSelection(parsedImg);
            }
          } catch {
            setImageSelection(null);
          }
        }

        if (active) setSelectionLoaded(true);

        // One-time migration from localStorage -> IndexedDB
        const legacyChatsStr = localStorage.getItem(LOCAL_STORAGE_LEGACY_CHATS_KEY);
        const isMigrated = localStorage.getItem('fc_chats_migrated');

        if (legacyChatsStr && !isMigrated) {
          try {
            const legacyChats: ChatSession[] = JSON.parse(legacyChatsStr);
            if (Array.isArray(legacyChats)) {
              const realChats = legacyChats.filter((c) => !/^chat-[1-5]$/.test(c.id));
              for (const chat of realChats) {
                await saveChat(chat);
              }
            }
            localStorage.removeItem(LOCAL_STORAGE_LEGACY_CHATS_KEY);
            localStorage.setItem('fc_chats_migrated', 'true');
          } catch (mErr) {
            console.warn('Migration warning:', mErr);
          }
        }

        const rawChats = await loadChats();
        if (!active) return;

        const chats = sanitizeLoadedChats(rawChats || []);
        if (chats.length > 0) {
          setPastChats(chats);
          setActiveChatId(chats[0].id);
        }
        setIsLoaded(true);
      } catch (e) {
        console.warn('Error initializing storage on mount:', e);
        if (active) {
          setSelectionLoaded(true);
          setIsLoaded(true);
        }
      }
    }

    initStorage();

    return () => {
      active = false;
    };
  }, []);

  // Save selection changes
  const handleSelectModel = useCallback((newSelection: ModelSelection) => {
    setSelection(newSelection);
    try {
      localStorage.setItem(LOCAL_STORAGE_SELECTION_KEY, JSON.stringify(newSelection));
    } catch (e) {
      console.warn('Could not save model selection:', e);
    }
  }, []);

  // Debounced auto-save past chats to IndexedDB
  useEffect(() => {
    if (!isMountedRef.current || !isLoaded) return;

    if (saveDebounceTimerRef.current) {
      clearTimeout(saveDebounceTimerRef.current);
    }

    saveDebounceTimerRef.current = setTimeout(async () => {
      try {
        for (const chat of pastChats) {
          await saveChat(chat);
        }
      } catch (e) {
        console.warn('Error saving chats to IndexedDB:', e);
      }
    }, 500);

    return () => {
      if (saveDebounceTimerRef.current) {
        clearTimeout(saveDebounceTimerRef.current);
      }
    };
  }, [pastChats, isLoaded]);

  // Active chat session state
  const activeChat = pastChats.find((c) => c.id === activeChatId) || null;
  const currentMessages = activeChat ? activeChat.messages : [];
  const currentTerminalLines = activeChat ? activeChat.terminalLines : [];
  const currentVideo = activeChat ? activeChat.video : null;

  // Flush buffered logs and progress updates into React state
  const flushBuffers = useCallback(() => {
    const logsSnapshot = pendingLogsRef.current;
    const progressSnapshot = pendingProgressRef.current;

    if (logsSnapshot.size === 0 && !progressSnapshot) return;

    pendingLogsRef.current = new Map();
    pendingProgressRef.current = null;

    setPastChats((prev) =>
      prev.map((c) => {
        const queuedLogs = logsSnapshot.get(c.id);
        const hasProgress = progressSnapshot && progressSnapshot.chatId === c.id;

        if (!queuedLogs && !hasProgress) return c;

        let nextMessages = c.messages;
        if (hasProgress && progressSnapshot) {
          nextMessages = c.messages.map((m) =>
            m.id === progressSnapshot.msgId
              ? {
                  ...m,
                  tasks: (m.tasks || []).map((t) =>
                    t.id === progressSnapshot.taskId && t.status === 'running'
                      ? {
                          ...t,
                          label: progressSnapshot.label,
                          progress: progressSnapshot.progress,
                        }
                      : t
                  ),
                }
              : m
          );
        }

        return {
          ...c,
          updatedAt: new Date().toISOString(),
          terminalLines: queuedLogs ? [...c.terminalLines, ...queuedLogs] : c.terminalLines,
          messages: nextMessages,
        };
      })
    );
  }, []);

  const stopFlushInterval = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flushBuffers();
  }, [flushBuffers]);

  const startFlushInterval = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setInterval(() => {
      flushBuffers();
    }, 250);
  }, [flushBuffers]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
      }
    };
  }, []);

  const appendTerminalLog = useCallback(
    (
      chatId: string,
      text: string,
      type: 'command' | 'log' | 'success' | 'highlight' | 'dim' = 'log',
      immediate = false
    ) => {
      const timeStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const logItem: TerminalLine = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text,
        type,
        timestamp: timeStr,
      };

      const existing = pendingLogsRef.current.get(chatId) || [];
      pendingLogsRef.current.set(chatId, [...existing, logItem]);

      if (immediate || !flushTimerRef.current) {
        flushBuffers();
      }
    },
    [flushBuffers]
  );

  const settleRunningRows = useCallback(
    (chatId: string, assistantMsgId: string, suffix: 'stopped' | 'interrupted' | 'error') => {
      setPastChats((prev) =>
        prev.map((c) => {
          if (c.id !== chatId) return c;
          return {
            ...c,
            updatedAt: new Date().toISOString(),
            messages: c.messages.map((m) => {
              if (m.id !== assistantMsgId) return m;
              return {
                ...m,
                isStreaming: false,
                tasks: (m.tasks || []).map((t) =>
                  t.status === 'running'
                    ? {
                        ...t,
                        status: 'error',
                        label: t.label.endsWith(` (${suffix})`) ? t.label : `${t.label} (${suffix})`,
                      }
                    : t
                ),
              };
            }),
          };
        })
      );
    },
    []
  );

  const handleStop = useCallback(() => {
    stopRequestedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    stopFlushInterval();

    const run = activeRunRef.current;
    if (run) {
      const { chatId, assistantMsgId } = run;
      setPastChats((prev) =>
        prev.map((c) => {
          if (c.id !== chatId) return c;
          return {
            ...c,
            updatedAt: new Date().toISOString(),
            messages: c.messages.map((m) => {
              if (m.id !== assistantMsgId) return m;
              const isPlaceholder =
                m.content === 'Thinking...' ||
                m.content === 'Analyzing concept and planning storyboard...';
              return {
                ...m,
                isStreaming: false,
                content: isPlaceholder
                  ? 'Stopped.'
                  : m.content.endsWith('Stopped.')
                  ? m.content
                  : `${m.content}\n\nStopped.`,
                tasks: (m.tasks || []).map((t) =>
                  t.status === 'running'
                    ? {
                        ...t,
                        status: 'error',
                        label: t.label.endsWith(' (stopped)') ? t.label : `${t.label} (stopped)`,
                      }
                    : t
                ),
              };
            }),
          };
        })
      );
      appendTerminalLog(chatId, '[stopped] Cancelled by user', 'highlight', true);
    }

    activeRunRef.current = null;
    setIsRenderingMp4(false);
    setIsStreaming(false);
  }, [appendTerminalLog, stopFlushInterval]);

  const guardedNavigate = useCallback(
    (href: string) => {
      if (isStreamingRef.current || isRenderingMp4Ref.current) {
        setPendingNavHref(href);
        return;
      }
      router.push(href);
    },
    [router]
  );

  const handleConfirmLeaveAndStop = useCallback(() => {
    const dest = pendingNavHref;
    setPendingNavHref(null);
    handleStop();
    if (dest) {
      router.push(dest);
    }
  }, [pendingNavHref, handleStop, router]);

  const handleSelectChat = useCallback(
    async (chatId: string) => {
      if (isStreamingRef.current || isRenderingMp4Ref.current) return;
      setActiveChatId(chatId);

      const targetSession = pastChatsRef.current.find((c) => c.id === chatId);
      if (!targetSession || !targetSession.video) return;

      const assetsToRefresh = targetSession.video.stockAssets || [];
      const needsRefetch = assetsToRefresh.some((a) => !a.fileUrl && a.id);

      if (needsRefetch) {
        appendTerminalLog(
          chatId,
          `$ pixabay restore-urls [${assetsToRefresh.map((a) => a.id).join(', ')}]`,
          'command',
          true
        );

        const refreshedAssets = await Promise.all(
          assetsToRefresh.map(async (asset) => {
            if (!asset.id) return asset;
            try {
              const assetKind = asset.type === 'photo' ? 'image' : 'video';
              const res = await fetch(
                `/api/stock?kind=${encodeURIComponent(assetKind)}&id=${encodeURIComponent(
                  String(asset.id)
                )}`
              );
              if (res.ok) {
                const data = await res.json();
                if (data.result?.fileUrl) {
                  return {
                    ...asset,
                    fileUrl: data.result.fileUrl,
                    previewUrl: data.result.previewUrl || asset.previewUrl,
                  };
                }
              }
            } catch (e) {
              console.warn(`Failed to refresh stock URL for id ${asset.id}:`, e);
            }
            return asset;
          })
        );

        setPastChats((prev) =>
          prev.map((c) => {
            if (c.id === chatId && c.video) {
              const updatedVideo: VideoProject = {
                ...c.video,
                stockAssets: refreshedAssets,
              };
              return {
                ...c,
                updatedAt: new Date().toISOString(),
                video: updatedVideo,
                messages: c.messages.map((m) =>
                  m.video ? { ...m, video: { ...m.video, stockAssets: refreshedAssets } } : m
                ),
              };
            }
            return c;
          })
        );

        appendTerminalLog(chatId, '✓ Pixabay asset URLs refreshed for live preview', 'success', true);
      }
    },
    [appendTerminalLog]
  );

  const handleNewChat = useCallback(() => {
    if (isStreamingRef.current || isRenderingMp4Ref.current) return;
    const nowIso = new Date().toISOString();
    const newChatId = `chat-${Date.now()}`;
    const sel = selectionRef.current;
    const newSession: ChatSession = {
      id: newChatId,
      title: 'New Chat',
      timestamp: 'Just now',
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: [],
      terminalLines: [
        {
          id: `init-${Date.now()}`,
          text: sel
            ? `$ remotion environment ready (${sel.provider}/${sel.modelName})`
            : '$ remotion environment ready (no model selected)',
          type: 'command',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
      video: null,
    };

    setPastChats((prev) => [newSession, ...prev]);
    setActiveChatId(newChatId);
  }, []);

  const handleRenderAndDownload = useCallback(async () => {
    const activeId = activeChatIdRef.current;
    const activeSession = pastChatsRef.current.find((c) => c.id === activeId);
    const vid = activeSession?.video;
    if (!vid || !vid.code || isRenderingMp4Ref.current || isStreamingRef.current || !activeId) {
      return;
    }

    appendTerminalLog(
      activeId,
      '$ remotion render-media-on-web Composition out.mp4',
      'command',
      true
    );

    const support = await checkWebRendererSupport();
    if (!support.supported) {
      appendTerminalLog(
        activeId,
        `[error] ${support.message || 'Browser WebCodecs unsupported.'}`,
        'highlight',
        true
      );
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    stopRequestedRef.current = false;
    setIsRenderingMp4(true);
    startFlushInterval();

    try {
      const preparedCode = await prepareCode(vid.code);
      const compileRes = compileRemotionCode(preparedCode);
      if (!compileRes.component) {
        throw new Error(compileRes.error || 'Failed to compile component');
      }

      const { blob, url } = await renderVideoToMp4(
        compileRes.component,
        vid.videoConfig,
        (progress) => {
          if (progress % 20 === 0 || progress === 100) {
            appendTerminalLog(activeId, `[render] Encoding progress: ${progress}%`, 'dim');
          }
        },
        controller.signal
      );

      appendTerminalLog(activeId, '✓ Render completed successfully', 'success', true);

      try {
        const thumbBlob = await makeThumb(blob, 'video');
        const videoAssetId = `asset-video-${Date.now()}`;
        const titleStr = (vid.title || 'framecode_export').toLowerCase().replace(/\s+/g, '_');
        const item: LibraryItem = {
          id: videoAssetId,
          name: `${titleStr}.mp4`,
          category: 'video',
          source: 'ai',
          mime: 'video/mp4',
          size: blob.size,
          createdAt: new Date().toISOString(),
          chatId: activeId,
          width: vid.videoConfig?.width || 720,
          height: vid.videoConfig?.height || 1280,
          duration: Math.round(
            (vid.videoConfig?.durationInFrames || 450) / (vid.videoConfig?.fps || 30)
          ),
          hasThumb: Boolean(thumbBlob),
        };
        await addLibraryItem(item, blob, thumbBlob);
        appendTerminalLog(activeId, '[library] Saved video export to Library', 'dim', true);
      } catch (libErr) {
        console.warn('Could not save MP4 to library:', libErr);
      }

      setPastChats((prev) =>
        prev.map((c) => {
          if (c.id === activeId && c.video) {
            return {
              ...c,
              updatedAt: new Date().toISOString(),
              video: {
                ...c.video,
                mp4BlobUrl: url,
              },
            };
          }
          return c;
        })
      );

      const a = document.createElement('a');
      a.href = url;
      a.download = `${(vid.title || 'framecode_export').toLowerCase().replace(/\s+/g, '_')}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      if (!stopRequestedRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        appendTerminalLog(activeId, `[error] Render failed: ${msg}`, 'highlight', true);
      }
    } finally {
      stopFlushInterval();
      abortControllerRef.current = null;
      setIsRenderingMp4(false);
    }
  }, [appendTerminalLog, startFlushInterval, stopFlushInterval]);

  const handleSendMessage = useCallback(
    async (userText: string, attachedFiles?: File[]) => {
      if (isStreamingRef.current || isRenderingMp4Ref.current) return;

      const sel = selectionRef.current;
      const nowIso = new Date().toISOString();
      let targetChatId = activeChatIdRef.current;
      let targetChats = [...pastChatsRef.current];

      const displayTitle =
        userText.length > 28
          ? `${userText.slice(0, 28)}...`
          : userText || (attachedFiles?.[0]?.name ? `Attachment: ${attachedFiles[0].name}` : 'New Chat');

      if (!targetChatId) {
        targetChatId = `chat-${Date.now()}`;
        const newSession: ChatSession = {
          id: targetChatId,
          title: displayTitle,
          timestamp: 'Just now',
          createdAt: nowIso,
          updatedAt: nowIso,
          messages: [],
          terminalLines: [],
          video: null,
        };
        targetChats = [newSession, ...targetChats];
        setActiveChatId(targetChatId);
      } else {
        targetChats = targetChats.map((c) => {
          if (c.id === targetChatId) {
            return {
              ...c,
              updatedAt: nowIso,
              title:
                c.title === 'New Video Project' || c.title === 'New Chat' || c.messages.length === 0
                  ? displayTitle
                  : c.title,
            };
          }
          return c;
        });
      }

      if (!sel) {
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: userText,
          timestamp: nowIso,
        };

        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: 'Choose a model and add your API key to start.',
          timestamp: nowIso,
          action: 'open-settings',
        };

        setPastChats(
          targetChats.map((c) => {
            if (c.id === targetChatId) {
              return {
                ...c,
                updatedAt: nowIso,
                messages: [...c.messages, userMessage, assistantMessage],
              };
            }
            return c;
          })
        );
        return;
      }

      // Process attached files
      const processedAttachments: Attachment[] = [];
      const visionImages: string[] = [];

      if (attachedFiles && attachedFiles.length > 0) {
        for (const file of attachedFiles) {
          try {
            const mediaInfo = await readMediaInfo(file);
            const category = categorize(file.name, file.type);
            const thumbBlob =
              category === 'video' || category === 'image'
                ? await makeThumb(file, category === 'video' ? 'video' : 'image')
                : null;
            const assetId = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

            const item: LibraryItem = {
              id: assetId,
              name: file.name,
              category,
              source: 'upload',
              mime: file.type || 'application/octet-stream',
              size: file.size,
              createdAt: new Date().toISOString(),
              chatId: targetChatId,
              width: mediaInfo.width,
              height: mediaInfo.height,
              duration: mediaInfo.duration,
              hasThumb: Boolean(thumbBlob),
            };

            await addLibraryItem(item, file, thumbBlob);

            const attachmentKind: 'image' | 'video' | 'other' =
              category === 'image' ? 'image' : category === 'video' ? 'video' : 'other';

            processedAttachments.push({
              id: assetId,
              name: file.name,
              kind: attachmentKind,
              mime: file.type || 'application/octet-stream',
              size: file.size,
              width: mediaInfo.width,
              height: mediaInfo.height,
              duration: mediaInfo.duration,
            });

            appendTerminalLog(
              targetChatId,
              `$ upload ${file.name} (${formatFileSize(file.size)}) saved to Library`,
              'command',
              true
            );

            if (file.type.startsWith('image/')) {
              try {
                const b64 = await downscaleImageForVision(file);
                if (b64) {
                  visionImages.push(b64);
                }
              } catch (vErr) {
                console.warn('Failed to downscale image for vision:', vErr);
              }
            }
          } catch (fErr) {
            console.warn(`Error processing file ${file.name}:`, fErr);
          }
        }
      }

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userText,
        timestamp: nowIso,
        attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
      };

      const assistantMsgId = `assistant-${Date.now()}`;
      const initialAssistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: 'Thinking...',
        timestamp: nowIso,
        tasks: [],
        isStreaming: true,
      };

      const existingChat = targetChats.find((c) => c.id === targetChatId);
      const previousCode = existingChat?.latestCode || existingChat?.video?.code || '';

      setPastChats(
        targetChats.map((c) => {
          if (c.id === targetChatId) {
            return {
              ...c,
              updatedAt: nowIso,
              messages: [...c.messages, userMessage, initialAssistantMessage],
            };
          }
          return c;
        })
      );

      const userController = new AbortController();
      abortControllerRef.current = userController;
      stopRequestedRef.current = false;
      activeRunRef.current = { chatId: targetChatId, assistantMsgId };

      setIsStreaming(true);
      startFlushInterval();

      const updateAssistantMsg = (
        updater: (msg: ChatMessage) => ChatMessage,
        videoUpdate?: VideoProject | null,
        codeUpdate?: string
      ) => {
        setPastChats((prev) =>
          prev.map((c) => {
            if (c.id === targetChatId) {
              return {
                ...c,
                updatedAt: new Date().toISOString(),
                messages: c.messages.map((m) => (m.id === assistantMsgId ? updater(m) : m)),
                ...(videoUpdate !== undefined ? { video: videoUpdate } : {}),
                ...(codeUpdate !== undefined ? { latestCode: codeUpdate } : {}),
              };
            }
            return c;
          })
        );
      };

      const fetchAiJson = async (payload: Record<string, unknown>) => {
        const { signal, cleanup } = createFetchSignal(userController.signal, 70000);
        try {
          const res = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          return { res, data };
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'TimeoutError') {
            throw new Error('The model took too long to respond. Try again or pick another model.');
          }
          throw err;
        } finally {
          cleanup();
        }
      };

      try {
        appendTerminalLog(
          targetChatId,
          `$ framecode plan --model ${sel.provider}/${sel.modelId}`,
          'command'
        );

        // Load memories if enabled
        let memoryContext: Array<{ id: string; text: string }> | undefined;
        const memEnabled = isMemoryEnabled();
        if (memEnabled) {
          try {
            const allMems = await loadMemories();
            if (allMems.length > 0) {
              memoryContext = buildMemoryContext(allMems);
            }
          } catch (memErr) {
            console.warn('Could not read memories:', memErr);
          }
        }

        // Compact last 20 messages for plan context
        const historySlice = (existingChat?.messages || []).slice(-19);
        const planMessages = [
          ...historySlice.map((m) => {
            if (m.role === 'assistant' && m.video) {
              return { role: m.role, content: `[Created a video: ${m.video.title}]` };
            }
            if (m.role === 'assistant' && m.images && m.images.length > 0) {
              return { role: m.role, content: `[Created an image]` };
            }
            return { role: m.role, content: m.content };
          }),
          { role: 'user', content: userText },
        ];

        const { res: planRes, data: planData } = await fetchAiJson({
          provider: sel.provider,
          model: sel.modelId,
          jsonMode: sel.jsonMode,
          mode: 'plan',
          messages: planMessages,
          attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
          images: visionImages.length > 0 ? visionImages : undefined,
          memories: memoryContext,
        });

        if (stopRequestedRef.current || userController.signal.aborted) return;

        if (!planRes.ok || planData.error) {
          const errorText = planData.error || 'Failed to plan response.';
          appendTerminalLog(targetChatId, `[error] ${errorText}`, 'highlight', true);
          updateAssistantMsg((m) => ({
            ...m,
            content: errorText,
            action: planData.action || undefined,
            isStreaming: false,
          }));
          return;
        }

        // Apply memory updates if enabled and returned
        let appliedMemoryUpdates: string[] = [];
        if (memEnabled && Array.isArray(planData.memoryOps) && planData.memoryOps.length > 0) {
          try {
            appliedMemoryUpdates = await applyMemoryOps(planData.memoryOps as MemoryOp[], targetChatId);
            if (appliedMemoryUpdates.length > 0) {
              appendTerminalLog(
                targetChatId,
                `[memory] ${appliedMemoryUpdates.join(' | ')}`,
                'dim'
              );
            }
          } catch (mErr) {
            console.warn('Memory apply error:', mErr);
          }
        }

        const replyText: string = typeof planData.reply === 'string' ? planData.reply : '';
        let intent: 'chat' | 'video' | 'image' =
          planData.intent === 'video' || planData.intent === 'image' ? planData.intent : 'chat';

        const storyboard = planData.storyboard;
        const videoConfig = planData.videoConfig;

        if (
          intent === 'video' &&
          (!Array.isArray(storyboard) ||
            storyboard.length === 0 ||
            !videoConfig ||
            typeof videoConfig.width !== 'number' ||
            typeof videoConfig.height !== 'number')
        ) {
          appendTerminalLog(targetChatId, '[planner] no storyboard returned', 'dim');
          intent = 'chat';
        }

        // -----------------------------------------------------------
        // INTENT: CHAT
        // -----------------------------------------------------------
        if (intent === 'chat') {
          appendTerminalLog(targetChatId, '[chat] Reply ready', 'success');
          updateAssistantMsg((m) => ({
            ...m,
            content: replyText || 'Done.',
            memoryUpdates: appliedMemoryUpdates.length > 0 ? appliedMemoryUpdates : undefined,
            isStreaming: false,
          }));
          return;
        }

        // -----------------------------------------------------------
        // INTENT: IMAGE
        // -----------------------------------------------------------
        if (intent === 'image') {
          const aspectRatio: string = planData.aspectRatio || '1:1';
          const imagePrompt: string = planData.imagePrompt || userText;
          const imgSel = imageSelectionRef.current;
          const canUseImageModel = Boolean(
            imgSel && keyStatusRef.current[imgSel.provider]?.connected
          );

          updateAssistantMsg((m) => ({
            ...m,
            content: replyText || 'Creating your image...',
            memoryUpdates: appliedMemoryUpdates.length > 0 ? appliedMemoryUpdates : undefined,
          }));

          if (canUseImageModel && imgSel) {
            appendTerminalLog(
              targetChatId,
              `$ framecode generate-image --model ${imgSel.provider}/${imgSel.modelId} --ratio ${aspectRatio}`,
              'command'
            );

            const imgTask: TaskRow = {
              id: 'task-image',
              label: `Generating image (${aspectRatio})...`,
              status: 'running',
              progress: 50,
            };

            updateAssistantMsg((m) => ({
              ...m,
              tasks: [...(m.tasks || []), imgTask],
            }));

            const { res: imgRes, data: imgData } = await fetchAiJson({
              provider: imgSel.provider,
              model: imgSel.modelId,
              mode: 'image',
              prompt: imagePrompt,
              aspectRatio,
            });

            if (stopRequestedRef.current || userController.signal.aborted) return;

            if (!imgRes.ok || imgData.error || !imgData.data) {
              const errMsg = imgData.error || 'Failed to generate image.';
              appendTerminalLog(targetChatId, `[error] ${errMsg}`, 'highlight', true);
              updateAssistantMsg((m) => ({
                ...m,
                tasks: (m.tasks || []).map((t) =>
                  t.id === 'task-image'
                    ? { ...t, status: 'error', label: 'Image generation failed', codeSnippet: errMsg }
                    : t
                ),
                isStreaming: false,
              }));
              return;
            }

            const mime: string = imgData.mime || 'image/png';
            const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
            const blob = base64ToBlob(imgData.data, mime);
            const mediaInfo = await readMediaInfo(blob);
            const thumbBlob = await makeThumb(blob, 'image');
            const libId = `asset-img-${Date.now()}`;
            const fileName = `image_${Date.now()}.${ext}`;

            await addLibraryItem(
              {
                id: libId,
                name: fileName,
                category: 'image',
                source: 'ai',
                mime,
                size: blob.size,
                createdAt: new Date().toISOString(),
                chatId: targetChatId,
                width: mediaInfo.width,
                height: mediaInfo.height,
                hasThumb: Boolean(thumbBlob),
              },
              blob,
              thumbBlob
            );

            appendTerminalLog(targetChatId, `✓ Saved ${fileName} to Library`, 'success', true);

            updateAssistantMsg((m) => ({
              ...m,
              images: [...(m.images || []), { libraryId: libId, name: fileName }],
              tasks: (m.tasks || []).map((t) =>
                t.id === 'task-image' ? { ...t, status: 'done', label: `Generated ${fileName}` } : t
              ),
              isStreaming: false,
            }));
            return;
          }

          // Fallback branch (b): Design single-frame graphic with code -> renderStillOnWeb PNG
          const dims = ASPECT_RATIO_DIMENSIONS[aspectRatio] || ASPECT_RATIO_DIMENSIONS['1:1'];
          appendTerminalLog(
            targetChatId,
            `$ framecode design-still --ratio ${aspectRatio} (${dims.width}x${dims.height})`,
            'command'
          );

          const stillCodeTask: TaskRow = {
            id: 'task-still-code',
            label: 'Designing graphic in Remotion...',
            status: 'running',
            progress: 40,
          };

          updateAssistantMsg((m) => ({
            ...m,
            tasks: [...(m.tasks || []), stillCodeTask],
          }));

          const { res: codeRes, data: codeData } = await fetchAiJson({
            provider: sel.provider,
            model: sel.modelId,
            jsonMode: sel.jsonMode,
            mode: 'code',
            kind: 'still',
            aspectRatio,
            imagePrompt,
            userPrompt: userText,
            attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
            videoConfig: {
              width: dims.width,
              height: dims.height,
              fps: 30,
              durationInFrames: 1,
            },
          });

          if (stopRequestedRef.current || userController.signal.aborted) return;

          if (!codeRes.ok || codeData.error || !codeData.code) {
            const errMsg = codeData.error || 'Failed to generate graphic code.';
            appendTerminalLog(targetChatId, `[error] ${errMsg}`, 'highlight', true);
            updateAssistantMsg((m) => ({
              ...m,
              action: codeData.action || undefined,
              tasks: (m.tasks || []).map((t) =>
                t.id === 'task-still-code'
                  ? { ...t, status: 'error', label: 'Graphic generation failed', codeSnippet: errMsg }
                  : t
              ),
              isStreaming: false,
            }));
            return;
          }

          let currentCode: string = codeData.code;
          let preparedCode = await prepareCode(currentCode);
          let compileTest = compileRemotionCode(preparedCode);
          let fixTries = 0;

          while (!compileTest.component && fixTries < 3) {
            if (stopRequestedRef.current || userController.signal.aborted) return;
            fixTries++;
            appendTerminalLog(
              targetChatId,
              `[error] Compile error (try ${fixTries}/3): ${compileTest.error}`,
              'highlight'
            );

            const fixTask: TaskRow = {
              id: `task-still-fix-${fixTries}`,
              label: `Fixing code error (attempt ${fixTries}/3)...`,
              status: 'running',
            };
            updateAssistantMsg((m) => ({
              ...m,
              tasks: [...(m.tasks || []), fixTask],
            }));

            const { data: fixData } = await fetchAiJson({
              provider: sel.provider,
              model: sel.modelId,
              jsonMode: sel.jsonMode,
              mode: 'fix',
              kind: 'still',
              code: currentCode,
              error: compileTest.error,
              videoConfig: {
                width: dims.width,
                height: dims.height,
                fps: 30,
                durationInFrames: 1,
              },
              attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
            });

            if (stopRequestedRef.current || userController.signal.aborted) return;

            if (fixData.code) {
              currentCode = fixData.code;
              preparedCode = await prepareCode(currentCode);
              compileTest = compileRemotionCode(preparedCode);
              updateAssistantMsg((m) => ({
                ...m,
                tasks: (m.tasks || []).map((t) =>
                  t.id === `task-still-fix-${fixTries}`
                    ? {
                        ...t,
                        status: 'done',
                        label: `Fixed: ${fixData.fixSummary || 'Resolved syntax error'}`,
                      }
                    : t
                ),
              }));
            } else {
              updateAssistantMsg((m) => ({
                ...m,
                tasks: (m.tasks || []).map((t) =>
                  t.id === `task-still-fix-${fixTries}`
                    ? { ...t, status: 'error', label: 'Fix attempt failed' }
                    : t
                ),
              }));
              break;
            }
          }

          if (!compileTest.component) {
            appendTerminalLog(
              targetChatId,
              `[error] Could not compile graphic: ${compileTest.error}`,
              'highlight',
              true
            );
            updateAssistantMsg((m) => ({
              ...m,
              tasks: (m.tasks || []).map((t) =>
                t.id === 'task-still-code'
                  ? {
                      ...t,
                      status: 'error',
                      label: 'Graphic compilation failed',
                      codeSnippet: compileTest.error || undefined,
                    }
                  : t
              ),
              isStreaming: false,
            }));
            return;
          }

          updateAssistantMsg((m) => ({
            ...m,
            tasks: (m.tasks || []).map((t) =>
              t.id === 'task-still-code'
                ? {
                    ...t,
                    status: 'done',
                    label: 'Designed Graphic.tsx',
                    detailTitle: 'Graphic.tsx',
                    codeSnippet: currentCode,
                  }
                : t
            ),
          }));

          const renderStillTask: TaskRow = {
            id: 'task-render-still',
            label: 'Rendering PNG...',
            status: 'running',
            progress: 70,
          };
          updateAssistantMsg((m) => ({
            ...m,
            tasks: [...(m.tasks || []), renderStillTask],
          }));

          const { blob, url } = await renderSingleStillToPng(
            compileTest.component,
            dims,
            userController.signal
          );
          URL.revokeObjectURL(url);

          if (stopRequestedRef.current || userController.signal.aborted) return;

          const thumbBlob = await makeThumb(blob, 'image');
          const libId = `asset-still-${Date.now()}`;
          const fileName = `graphic_${Date.now()}.png`;

          await addLibraryItem(
            {
              id: libId,
              name: fileName,
              category: 'image',
              source: 'ai',
              mime: 'image/png',
              size: blob.size,
              createdAt: new Date().toISOString(),
              chatId: targetChatId,
              width: dims.width,
              height: dims.height,
              hasThumb: Boolean(thumbBlob),
            },
            blob,
            thumbBlob
          );

          appendTerminalLog(targetChatId, `✓ Rendered ${fileName} and saved to Library`, 'success', true);

          updateAssistantMsg((m) => ({
            ...m,
            images: [...(m.images || []), { libraryId: libId, name: fileName }],
            tasks: (m.tasks || []).map((t) =>
              t.id === 'task-render-still'
                ? { ...t, status: 'done', label: `Rendered ${fileName}` }
                : t
            ),
            isStreaming: false,
          }));
          return;
        }

        // -----------------------------------------------------------
        // INTENT: VIDEO
        // -----------------------------------------------------------
        appendTerminalLog(
          targetChatId,
          `[planner] Planned ${storyboard.length} scenes (${videoConfig.durationInFrames} frames @ ${videoConfig.fps}fps)`
        );

        // Save Storyboard.md to Library
        try {
          const sbMarkdown = `# Storyboard: ${existingChat?.title || userText || 'Video Project'}
Date: ${new Date().toLocaleString()}
Duration: ${Math.round(videoConfig.durationInFrames / videoConfig.fps)}s (${videoConfig.durationInFrames} frames @ ${videoConfig.fps}fps)

## Scenes
${storyboard
  .map(
    (s: {
      sceneIndex: number;
      title?: string;
      durationInFrames: number;
      onScreenText: string;
      motionIdea: string;
      stockQuery?: string;
    }) => `### Scene ${s.sceneIndex}: ${s.title || 'Untitled'}
- Duration: ${s.durationInFrames} frames (${Math.round(s.durationInFrames / videoConfig.fps)}s)
- On-Screen Text: "${s.onScreenText}"
- Motion / Visual: ${s.motionIdea}
${s.stockQuery ? `- Stock Search Query: "${s.stockQuery}"` : ''}`
  )
  .join('\n\n')}
`;
          const sbBlob = new Blob([sbMarkdown], { type: 'text/markdown' });
          const sbAssetId = `asset-sb-${Date.now()}`;
          await addLibraryItem(
            {
              id: sbAssetId,
              name: `Storyboard.md`,
              category: 'document',
              source: 'ai',
              mime: 'text/markdown',
              size: sbBlob.size,
              createdAt: new Date().toISOString(),
              chatId: targetChatId,
              hasThumb: false,
            },
            sbBlob
          );
          appendTerminalLog(targetChatId, '[library] Saved Storyboard.md to Library', 'dim');
        } catch (sbErr) {
          console.warn('Could not save storyboard to library:', sbErr);
        }

        const storyboardTask: TaskRow = {
          id: 'task-storyboard',
          label: `Wrote storyboard - ${storyboard.length} scenes`,
          status: 'done',
          detailTitle: 'storyboard.json',
          codeSnippet: JSON.stringify(storyboard, null, 2),
        };

        updateAssistantMsg((m) => ({
          ...m,
          content: replyText,
          memoryUpdates: appliedMemoryUpdates.length > 0 ? appliedMemoryUpdates : undefined,
          tasks: [storyboardTask],
        }));

        // 2. STOCK MEDIA QUERIES
        const stockQueries: string[] = Array.from(
          new Set(
            storyboard
              .map((s: { stockQuery?: string }) => s.stockQuery?.trim())
              .filter((q: string | undefined): q is string => Boolean(q && q.length > 1))
          )
        );

        const collectedStockAssets: Array<{
          id: string | number;
          type: 'video' | 'photo';
          previewUrl: string;
          fileUrl: string;
          duration?: number;
          width: number;
          height: number;
        }> = [];

        if (stockQueries.length > 0) {
          appendTerminalLog(targetChatId, `$ pixabay search [${stockQueries.join(', ')}]`, 'command');
          for (const query of stockQueries) {
            if (stopRequestedRef.current || userController.signal.aborted) return;
            try {
              const stockRes = await fetch(`/api/stock?q=${encodeURIComponent(query)}`, {
                signal: userController.signal,
              });
              if (stockRes.ok) {
                const stockData = await stockRes.json();
                if (Array.isArray(stockData.results)) {
                  collectedStockAssets.push(...stockData.results);
                }
              } else if (stockRes.status === 503) {
                appendTerminalLog(
                  targetChatId,
                  `[stock] Stock search skipped (PIXABAY_API_KEY not configured on server)`,
                  'dim'
                );
                break;
              }
            } catch (e) {
              if (userController.signal.aborted) return;
              console.warn('Failed stock fetch:', e);
            }
          }

          if (collectedStockAssets.length > 0) {
            const stockTask: TaskRow = {
              id: 'task-stock',
              label: `Found ${collectedStockAssets.length} stock clips (Pixabay)`,
              status: 'done',
              detailTitle: 'stock-assets.json',
              codeSnippet: JSON.stringify(collectedStockAssets, null, 2),
            };

            appendTerminalLog(
              targetChatId,
              `[stock] Discovered ${collectedStockAssets.length} stock clips (Pixabay)`
            );
            updateAssistantMsg((m) => ({
              ...m,
              tasks: [...(m.tasks || []), stockTask],
            }));
          }
        }

        if (stopRequestedRef.current || userController.signal.aborted) return;

        // 3. CALL /api/ai mode: "code"
        appendTerminalLog(
          targetChatId,
          `$ framecode generate-code Composition.tsx --model ${sel.provider}/${sel.modelId}`,
          'command'
        );
        const codeTask: TaskRow = {
          id: 'task-code',
          label: 'Wrote Composition.tsx',
          status: 'running',
          progress: 50,
        };

        updateAssistantMsg((m) => ({
          ...m,
          tasks: [...(m.tasks || []), codeTask],
        }));

        const { res: codeRes, data: codeData } = await fetchAiJson({
          provider: sel.provider,
          model: sel.modelId,
          jsonMode: sel.jsonMode,
          mode: 'code',
          kind: 'video',
          storyboard,
          stockAssets: collectedStockAssets,
          attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
          previousCode,
          userPrompt: userText,
          videoConfig,
        });

        if (stopRequestedRef.current || userController.signal.aborted) return;

        if (!codeRes.ok || codeData.error || !codeData.code) {
          const errorText = codeData.error || 'Failed to generate code.';
          appendTerminalLog(targetChatId, `[error] ${errorText}`, 'highlight', true);
          updateAssistantMsg((m) => ({
            ...m,
            action: codeData.action || undefined,
            tasks: (m.tasks || []).map((t) =>
              t.id === 'task-code'
                ? { ...t, status: 'error', label: 'Code generation failed', codeSnippet: errorText }
                : t
            ),
            isStreaming: false,
          }));
          return;
        }

        let currentCode: string = codeData.code;
        appendTerminalLog(targetChatId, `[compiler] Compiling TypeScript JSX with Sucrase...`);

        // 4. BROWSER COMPILE & FIX LOOP
        let preparedCode = await prepareCode(currentCode);
        let compileTest = compileRemotionCode(preparedCode);
        let fixTries = 0;

        while (!compileTest.component && fixTries < 3) {
          if (stopRequestedRef.current || userController.signal.aborted) return;
          fixTries++;
          appendTerminalLog(
            targetChatId,
            `[error] Compile error (try ${fixTries}/3): ${compileTest.error}`,
            'highlight'
          );

          const fixTask: TaskRow = {
            id: `task-fix-${fixTries}`,
            label: `Fixing code error (attempt ${fixTries}/3)...`,
            status: 'running',
          };

          updateAssistantMsg((m) => ({
            ...m,
            tasks: [...(m.tasks || []), fixTask],
          }));

          const { data: fixData } = await fetchAiJson({
            provider: sel.provider,
            model: sel.modelId,
            jsonMode: sel.jsonMode,
            mode: 'fix',
            kind: 'video',
            code: currentCode,
            error: compileTest.error,
            storyboard,
            videoConfig,
            stockAssets: collectedStockAssets,
            attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
          });

          if (stopRequestedRef.current || userController.signal.aborted) return;

          if (fixData.code) {
            currentCode = fixData.code;
            preparedCode = await prepareCode(currentCode);
            compileTest = compileRemotionCode(preparedCode);
            appendTerminalLog(
              targetChatId,
              `[fix] Applied fix: ${fixData.fixSummary || 'Refactored TSX structure'}`,
              'dim'
            );

            updateAssistantMsg((m) => ({
              ...m,
              tasks: (m.tasks || []).map((t) =>
                t.id === `task-fix-${fixTries}`
                  ? {
                      ...t,
                      status: 'done',
                      label: `Fixed: ${fixData.fixSummary || 'Resolved syntax error'}`,
                    }
                  : t
              ),
            }));
          } else {
            updateAssistantMsg((m) => ({
              ...m,
              tasks: (m.tasks || []).map((t) =>
                t.id === `task-fix-${fixTries}`
                  ? { ...t, status: 'error', label: 'Fix attempt failed' }
                  : t
              ),
            }));
            break;
          }
        }

        if (!compileTest.component) {
          appendTerminalLog(
            targetChatId,
            `[error] Could not resolve compile error after 3 attempts: ${compileTest.error}`,
            'highlight',
            true
          );
          updateAssistantMsg((m) => ({
            ...m,
            tasks: (m.tasks || []).map((t) =>
              t.id === 'task-code'
                ? {
                    ...t,
                    status: 'error',
                    label: 'Compilation failed',
                    codeSnippet: compileTest.error || undefined,
                  }
                : t
            ),
            isStreaming: false,
          }));
          return;
        }

        updateAssistantMsg((m) => ({
          ...m,
          tasks: (m.tasks || []).map((t) =>
            t.id === 'task-code'
              ? {
                  ...t,
                  status: 'done',
                  detailTitle: 'Composition.tsx',
                  codeSnippet: currentCode,
                }
              : t
          ),
        }));

        appendTerminalLog(targetChatId, `✓ Sandboxed compilation succeeded`, 'success');

        // Auto-save Composition.tsx to Library
        try {
          const codeBlob = new Blob([currentCode], { type: 'text/typescript' });
          const codeAssetId = `asset-code-${Date.now()}`;
          await addLibraryItem(
            {
              id: codeAssetId,
              name: `Composition.tsx`,
              category: 'document',
              source: 'ai',
              mime: 'text/typescript',
              size: codeBlob.size,
              createdAt: new Date().toISOString(),
              chatId: targetChatId,
              hasThumb: false,
            },
            codeBlob
          );
          appendTerminalLog(targetChatId, '[library] Saved Composition.tsx to Library', 'dim');
        } catch (codeLibErr) {
          console.warn('Could not save Composition.tsx to library:', codeLibErr);
        }

        if (stopRequestedRef.current || userController.signal.aborted) return;

        // 5. FRAME STILLS REVIEW
        if (sel.vision) {
          appendTerminalLog(
            targetChatId,
            `$ remotion render-still-on-web (frames 10%, 50%, 90%)`,
            'command'
          );
          const reviewTask: TaskRow = {
            id: 'task-review',
            label: 'Checking frames',
            status: 'running',
          };

          updateAssistantMsg((m) => ({
            ...m,
            tasks: [...(m.tasks || []), reviewTask],
          }));

          try {
            const stillsBase64 = await captureStillsForReview(
              compileTest.component,
              videoConfig,
              userController.signal
            );
            if (stopRequestedRef.current || userController.signal.aborted) return;

            if (stillsBase64.length > 0) {
              appendTerminalLog(
                targetChatId,
                `[review] Captured ${stillsBase64.length} still frames for vision review`
              );

              const { data: reviewData } = await fetchAiJson({
                provider: sel.provider,
                model: sel.modelId,
                jsonMode: sel.jsonMode,
                mode: 'review',
                code: currentCode,
                images: stillsBase64,
              });

              if (stopRequestedRef.current || userController.signal.aborted) return;

              appendTerminalLog(
                targetChatId,
                `[review] Inspection result: ${
                  reviewData.ok
                    ? 'Verified (No visual clipping)'
                    : `${reviewData.issues?.length || 0} visual issues found`
                }`
              );

              if (!reviewData.ok && Array.isArray(reviewData.issues) && reviewData.issues.length > 0) {
                let reviewFixTries = 0;
                while (reviewFixTries < 2) {
                  if (stopRequestedRef.current || userController.signal.aborted) return;
                  reviewFixTries++;
                  const issueDesc = reviewData.issues[0];
                  appendTerminalLog(targetChatId, `[fix] Correcting frame issue: ${issueDesc}`, 'dim');

                  const { data: fixReviewData } = await fetchAiJson({
                    provider: sel.provider,
                    model: sel.modelId,
                    jsonMode: sel.jsonMode,
                    mode: 'fix',
                    kind: 'video',
                    code: currentCode,
                    issues: reviewData.issues,
                    storyboard,
                    videoConfig,
                    stockAssets: collectedStockAssets,
                    attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
                  });

                  if (stopRequestedRef.current || userController.signal.aborted) return;

                  if (fixReviewData.code) {
                    const recompiledPrep = await prepareCode(fixReviewData.code);
                    const recompiled = compileRemotionCode(recompiledPrep);
                    if (recompiled.component) {
                      currentCode = fixReviewData.code;
                      compileTest = recompiled;
                      appendTerminalLog(
                        targetChatId,
                        `✓ Fixed visual issue: ${fixReviewData.fixSummary || issueDesc}`,
                        'success'
                      );

                      updateAssistantMsg((m) => ({
                        ...m,
                        tasks: (m.tasks || []).map((t) =>
                          t.id === 'task-review'
                            ? {
                                ...t,
                                label: `Fixed: ${fixReviewData.fixSummary || issueDesc}`,
                              }
                            : t
                        ),
                      }));
                      break;
                    }
                  }
                }
              }
            }
          } catch (err) {
            if (stopRequestedRef.current || userController.signal.aborted) return;
            console.warn('Frame review error:', err);
          }

          updateAssistantMsg((m) => ({
            ...m,
            tasks: (m.tasks || []).map((t) =>
              t.id === 'task-review'
                ? {
                    ...t,
                    status: 'done',
                    label: t.label === 'Checking frames' ? 'Frames verified' : t.label,
                  }
                : t
            ),
          }));
        } else {
          appendTerminalLog(
            targetChatId,
            `[review] Model does not support vision; skipping frame inspection.`,
            'dim'
          );
        }

        if (stopRequestedRef.current || userController.signal.aborted) return;

        // 6. SHOW LIVE IN PLAYER & RENDER MP4
        const scenesList = storyboard.map(
          (s: {
            sceneIndex: number;
            title?: string;
            onScreenText: string;
            durationInFrames: number;
            motionIdea: string;
          }) => ({
            id: `sc-${s.sceneIndex}`,
            title: s.title || `0${s.sceneIndex}. Scene`,
            duration: `${Math.round(s.durationInFrames / videoConfig.fps)}s`,
            visualStyle: s.onScreenText || 'Kinetic text',
            codeSummary: s.motionIdea || 'Remotion sequence',
          })
        );

        const newVideoObj: VideoProject = {
          id: `vid-${Date.now()}`,
          title: userText.length > 24 ? userText.slice(0, 24) : userText || 'Video Project',
          aspectRatio: '9:16',
          durationSec: Math.round(videoConfig.durationInFrames / videoConfig.fps),
          currentSec: 0,
          fps: videoConfig.fps,
          resolution: `${videoConfig.width}x${videoConfig.height}`,
          code: currentCode,
          videoConfig,
          storyboard,
          stockAssets: collectedStockAssets,
          scenes: scenesList,
          primaryCodeSnippet: currentCode,
          mp4BlobUrl: null,
        };

        appendTerminalLog(targetChatId, `✓ Composition mounted live in @remotion/player`, 'success');

        updateAssistantMsg(
          (m) => ({
            ...m,
            video: newVideoObj,
          }),
          newVideoObj,
          currentCode
        );

        const support = await checkWebRendererSupport(videoConfig.width, videoConfig.height);
        if (!support.supported) {
          appendTerminalLog(
            targetChatId,
            `[web-renderer] ${support.message || 'Browser WebCodecs unsupported.'}`,
            'highlight',
            true
          );
          updateAssistantMsg((m) => ({ ...m, isStreaming: false }));
          return;
        }

        // Render MP4
        appendTerminalLog(
          targetChatId,
          `$ remotion render-media-on-web Composition out.mp4`,
          'command'
        );

        const renderTask: TaskRow = {
          id: 'task-render-mp4',
          label: 'Rendering video... 0%',
          status: 'running',
          progress: 0,
          detailTitle: 'render.log',
        };

        updateAssistantMsg((m) => ({
          ...m,
          tasks: [...(m.tasks || []), renderTask],
        }));

        setIsRenderingMp4(true);

        if (!compileTest.component) {
          throw new Error('Component is not compiled');
        }

        let lastLoggedPct = -1;
        const { blob, url } = await renderVideoToMp4(
          compileTest.component,
          videoConfig,
          (progressPercent) => {
            pendingProgressRef.current = {
              chatId: targetChatId!,
              msgId: assistantMsgId,
              taskId: 'task-render-mp4',
              label: `Rendering video... ${progressPercent}%`,
              progress: progressPercent,
            };

            if (progressPercent % 25 === 0 && progressPercent !== lastLoggedPct) {
              lastLoggedPct = progressPercent;
              appendTerminalLog(targetChatId!, `[remotion] Render progress: ${progressPercent}%`, 'dim');
            }
          },
          userController.signal
        );

        if (stopRequestedRef.current || userController.signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }

        appendTerminalLog(targetChatId, `✓ Successfully rendered MP4 to browser memory`, 'success');

        // Save rendered MP4 to Library
        try {
          const thumbBlob = await makeThumb(blob, 'video');
          const videoAssetId = `asset-video-${Date.now()}`;
          const safeTitle = (userText || 'video').slice(0, 24).toLowerCase().replace(/\s+/g, '_');
          await addLibraryItem(
            {
              id: videoAssetId,
              name: `${safeTitle}.mp4`,
              category: 'video',
              source: 'ai',
              mime: 'video/mp4',
              size: blob.size,
              createdAt: new Date().toISOString(),
              chatId: targetChatId,
              width: videoConfig.width,
              height: videoConfig.height,
              duration: Math.round(videoConfig.durationInFrames / videoConfig.fps),
              hasThumb: Boolean(thumbBlob),
            },
            blob,
            thumbBlob
          );
          appendTerminalLog(targetChatId, '[library] Saved video export to Library', 'dim');
        } catch (vidLibErr) {
          console.warn('Could not save video to library:', vidLibErr);
        }

        const finalizedVideo: VideoProject = {
          ...newVideoObj,
          mp4BlobUrl: url,
        };

        pendingProgressRef.current = null;

        updateAssistantMsg(
          (m) => ({
            ...m,
            isStreaming: false,
            tasks: (m.tasks || []).map((t) =>
              t.id === 'task-render-mp4'
                ? {
                    ...t,
                    label: 'Rendering video... 100%',
                    status: 'done',
                    progress: 100,
                    codeSnippet: `[remotion] Rendered ${videoConfig.durationInFrames} frames in browser.\n[remotion] Output format: H.264 MP4 (${videoConfig.width}x${videoConfig.height})`,
                  }
                : t
            ),
            video: finalizedVideo,
          }),
          finalizedVideo,
          currentCode
        );
      } catch (err: unknown) {
        if (stopRequestedRef.current || userController.signal.aborted) {
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        appendTerminalLog(targetChatId, `[fatal] Execution stopped: ${msg}`, 'highlight', true);
        settleRunningRows(targetChatId, assistantMsgId, 'error');
        updateAssistantMsg((m) => ({
          ...m,
          isStreaming: false,
          content:
            m.content === 'Thinking...' ||
            m.content === 'Analyzing concept and planning storyboard...'
              ? msg
              : `${m.content}\n\n${msg}`,
        }));
      } finally {
        stopFlushInterval();
        if (activeRunRef.current?.assistantMsgId === assistantMsgId && !stopRequestedRef.current) {
          settleRunningRows(targetChatId, assistantMsgId, 'error');
        }
        activeRunRef.current = null;
        abortControllerRef.current = null;
        setIsRenderingMp4(false);
        setIsStreaming(false);
      }
    },
    [appendTerminalLog, settleRunningRows, startFlushInterval, stopFlushInterval]
  );

  const handleOpenSettings = useCallback(() => {
    guardedNavigate('/settings');
  }, [guardedNavigate]);

  const handleOpenModelPicker = useCallback(() => {
    setIsModelPickerOpen(true);
  }, []);

  const handleCloseModelPicker = useCallback(() => {
    setIsModelPickerOpen(false);
  }, []);

  const handleOpenSidebarMobile = useCallback(() => {
    setIsSidebarOpenMobile(true);
  }, []);

  const handleCloseSidebarMobile = useCallback(() => {
    setIsSidebarOpenMobile(false);
  }, []);

  const handleOpenTerminalMobile = useCallback(() => {
    setIsTerminalSheetOpenMobile(true);
  }, []);

  const handleCloseTerminalMobile = useCallback(() => {
    setIsTerminalSheetOpenMobile(false);
  }, []);

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-[#1F1E1D] text-[#FAF9F5] overflow-hidden">
      {/* Mobile / Tablet Header */}
      <MobileHeader
        onOpenSidebar={handleOpenSidebarMobile}
        onOpenTerminal={handleOpenTerminalMobile}
        isStreaming={isStreaming || isRenderingMp4}
      />

      {/* Main Layout */}
      <div className="flex flex-1 w-full overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          pastChats={pastChats}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          isOpenMobile={isSidebarOpenMobile}
          onCloseMobile={handleCloseSidebarMobile}
          onNavigate={guardedNavigate}
        />

        {/* Center Chat Area */}
        <main className="flex-1 flex justify-center h-full overflow-hidden min-w-0">
          <ChatArea
            messages={currentMessages}
            currentVideo={currentVideo}
            onSendMessage={handleSendMessage}
            onStop={handleStop}
            isStreaming={isStreaming || isRenderingMp4}
            onRenderAndDownload={handleRenderAndDownload}
            isRenderingMp4={isRenderingMp4}
            selection={selection}
            selectionLoaded={selectionLoaded}
            onOpenModelPicker={handleOpenModelPicker}
            onOpenSettings={handleOpenSettings}
            onNavigate={guardedNavigate}
          />
        </main>

        {/* Right Panel */}
        <RightPanel
          video={currentVideo}
          terminalLines={currentTerminalLines}
          isStreaming={isStreaming || isRenderingMp4}
          onRenderAndDownload={handleRenderAndDownload}
          isRenderingMp4={isRenderingMp4}
        />
      </div>

      {/* Model Picker Popover / Sheet */}
      <ModelPicker
        isOpen={isModelPickerOpen}
        onClose={handleCloseModelPicker}
        selection={selection}
        onSelect={handleSelectModel}
        onOpenSettings={handleOpenSettings}
      />

      {/* Mobile Terminal Bottom Sheet */}
      <MobileTerminalSheet
        isOpen={isTerminalSheetOpenMobile}
        onClose={handleCloseTerminalMobile}
        lines={currentTerminalLines}
        isStreaming={isStreaming || isRenderingMp4}
      />

      {/* Guarded Navigation Confirmation Modal */}
      {pendingNavHref && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[#2A2927] border border-[#3A3835] rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-[#FAF9F5]">
              A task is still running. Leave and stop it?
            </h3>
            <p className="text-xs text-[#A8A59E]">
              Leaving now will cancel the current generation or render.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingNavHref(null)}
                className="px-3.5 py-1.5 rounded-lg border border-[#3A3835] bg-[#1F1E1D] text-xs font-medium text-[#FAF9F5] hover:bg-[#33322F] transition cursor-pointer"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={handleConfirmLeaveAndStop}
                className="px-3.5 py-1.5 rounded-lg bg-[#D97757] hover:bg-[#C5684A] text-xs font-medium text-white transition cursor-pointer"
              >
                Leave and stop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
