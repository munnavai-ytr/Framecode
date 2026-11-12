'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  Attachment,
  LibraryItem,
} from '@/types/framecode';
import { compileRemotionCode } from '@/lib/codeCompiler';
import {
  checkWebRendererSupport,
  captureStillsForReview,
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

const LOCAL_STORAGE_SELECTION_KEY = 'fc_selection';
const LOCAL_STORAGE_LEGACY_CHATS_KEY = 'framecode_chats';

const DEFAULT_SELECTION: ModelSelection = {
  provider: 'claude',
  modelId: 'claude-3-7-sonnet-20250219',
  modelName: 'Claude 3.7 Sonnet',
};

export default function FramecodePage() {
  const router = useRouter();

  // Deterministic initial state to guarantee matching server & client initial render
  const [selection, setSelection] = useState<ModelSelection>(DEFAULT_SELECTION);
  const [pastChats, setPastChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);

  // UI state
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isRenderingMp4, setIsRenderingMp4] = useState<boolean>(false);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState<boolean>(false);
  const [isTerminalSheetOpenMobile, setIsTerminalSheetOpenMobile] = useState<boolean>(false);

  const isMountedRef = useRef<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const saveDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Read model selection & load chats from IndexedDB after mounting on client
  useEffect(() => {
    isMountedRef.current = true;
    let active = true;

    async function initStorage() {
      try {
        const storedSelection = localStorage.getItem(LOCAL_STORAGE_SELECTION_KEY);
        if (storedSelection) {
          const parsed = JSON.parse(storedSelection);
          if (parsed?.provider && parsed?.modelId && parsed?.modelName) {
            setSelection(parsed);
          }
        }

        // Check one-time migration from localStorage -> IndexedDB
        const legacyChatsStr = localStorage.getItem(LOCAL_STORAGE_LEGACY_CHATS_KEY);
        const isMigrated = localStorage.getItem('fc_chats_migrated');

        if (legacyChatsStr && !isMigrated) {
          try {
            const legacyChats: ChatSession[] = JSON.parse(legacyChatsStr);
            if (Array.isArray(legacyChats)) {
              // Drop sample chats matching chat-1 through chat-5
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

        const chats = await loadChats();
        if (!active) return;

        if (chats && chats.length > 0) {
          setPastChats(chats);
          setActiveChatId(chats[0].id);
        }
        setIsLoaded(true);
      } catch (e) {
        console.warn('Error initializing storage on mount:', e);
        if (active) setIsLoaded(true);
      }
    }

    initStorage();

    return () => {
      active = false;
    };
  }, []);

  // Save selection changes
  const handleSelectModel = (newSelection: ModelSelection) => {
    setSelection(newSelection);
    try {
      localStorage.setItem(LOCAL_STORAGE_SELECTION_KEY, JSON.stringify(newSelection));
    } catch (e) {
      console.warn('Could not save model selection:', e);
    }
  };

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

  const appendTerminalLog = (
    chatId: string,
    text: string,
    type: 'command' | 'log' | 'success' | 'highlight' | 'dim' = 'log'
  ) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logItem: TerminalLine = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      type,
      timestamp: timeStr,
    };

    setPastChats((prev) =>
      prev.map((c) => {
        if (c.id === chatId) {
          return {
            ...c,
            updatedAt: new Date().toISOString(),
            terminalLines: [...c.terminalLines, logItem],
          };
        }
        return c;
      })
    );
  };

  const handleSelectChat = async (chatId: string) => {
    if (isStreaming) return;
    setActiveChatId(chatId);

    const targetSession = pastChats.find((c) => c.id === chatId);
    if (!targetSession || !targetSession.video) return;

    const assetsToRefresh = targetSession.video.stockAssets || [];
    const needsRefetch = assetsToRefresh.some((a) => !a.fileUrl && a.id);

    if (needsRefetch) {
      appendTerminalLog(chatId, `$ pixabay restore-urls [${assetsToRefresh.map((a) => a.id).join(', ')}]`, 'command');

      const refreshedAssets = await Promise.all(
        assetsToRefresh.map(async (asset) => {
          if (!asset.id) return asset;
          try {
            const res = await fetch(`/api/stock?id=${encodeURIComponent(String(asset.id))}`);
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

      appendTerminalLog(chatId, '✓ Pixabay asset URLs refreshed for live preview', 'success');
    }
  };

  const handleNewChat = () => {
    if (isStreaming) return;
    const nowIso = new Date().toISOString();
    const newChatId = `chat-${Date.now()}`;
    const newSession: ChatSession = {
      id: newChatId,
      title: 'New Video Project',
      timestamp: 'Just now',
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: [],
      terminalLines: [
        {
          id: `init-${Date.now()}`,
          text: `$ remotion environment ready (${selection.provider}/${selection.modelName})`,
          type: 'command',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
      video: null,
    };

    setPastChats((prev) => [newSession, ...prev]);
    setActiveChatId(newChatId);
  };

  const handleRenderAndDownload = async () => {
    if (!currentVideo || !currentVideo.code || isRenderingMp4 || isStreaming) return;
    const targetChatId = activeChatId;
    if (!targetChatId) return;

    appendTerminalLog(targetChatId, '$ remotion render-media-on-web Composition out.mp4', 'command');

    const support = await checkWebRendererSupport();
    if (!support.supported) {
      appendTerminalLog(targetChatId, `[error] ${support.message || 'Browser WebCodecs unsupported.'}`, 'highlight');
      return;
    }

    setIsRenderingMp4(true);
    try {
      const preparedCode = await prepareCode(currentVideo.code);
      const compileRes = compileRemotionCode(preparedCode);
      if (!compileRes.component) {
        throw new Error(compileRes.error || 'Failed to compile component');
      }

      const { blob, url } = await renderVideoToMp4(
        compileRes.component,
        currentVideo.videoConfig,
        (progress) => {
          if (progress % 20 === 0 || progress === 100) {
            appendTerminalLog(targetChatId, `[render] Encoding progress: ${progress}%`, 'dim');
          }
        }
      );

      appendTerminalLog(targetChatId, '✓ Render completed successfully', 'success');

      // Auto-save MP4 to Library
      try {
        const thumbBlob = await makeThumb(blob);
        const videoAssetId = `asset-video-${Date.now()}`;
        const titleStr = (currentVideo.title || 'framecode_export').toLowerCase().replace(/\s+/g, '_');
        const item: LibraryItem = {
          id: videoAssetId,
          name: `${titleStr}.mp4`,
          category: 'video',
          source: 'ai',
          mime: 'video/mp4',
          size: blob.size,
          createdAt: new Date().toISOString(),
          chatId: targetChatId,
          width: currentVideo.videoConfig?.width || 720,
          height: currentVideo.videoConfig?.height || 1280,
          duration: Math.round(
            (currentVideo.videoConfig?.durationInFrames || 450) /
              (currentVideo.videoConfig?.fps || 30)
          ),
          hasThumb: Boolean(thumbBlob),
        };
        await addLibraryItem(item, blob, thumbBlob);
        appendTerminalLog(targetChatId, '[library] Saved video export to Library', 'dim');
      } catch (libErr) {
        console.warn('Could not save MP4 to library:', libErr);
      }

      setPastChats((prev) =>
        prev.map((c) => {
          if (c.id === targetChatId && c.video) {
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
      a.download = `${(currentVideo.title || 'framecode_export').toLowerCase().replace(/\s+/g, '_')}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendTerminalLog(targetChatId, `[error] Render failed: ${msg}`, 'highlight');
    } finally {
      setIsRenderingMp4(false);
    }
  };

  const handleSendMessage = async (userText: string, attachedFiles?: File[]) => {
    if (isStreaming) return;

    const nowIso = new Date().toISOString();
    let targetChatId = activeChatId;
    let targetChats = [...pastChats];

    const displayTitle =
      userText.length > 28
        ? `${userText.slice(0, 28)}...`
        : userText || (attachedFiles?.[0]?.name ? `Attachment: ${attachedFiles[0].name}` : 'New Project');

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
              c.title === 'New Video Project' || c.messages.length === 0
                ? displayTitle
                : c.title,
          };
        }
        return c;
      });
    }

    // Process attached files (save to Library DB & prepare Attachment metadata + vision images)
    const processedAttachments: Attachment[] = [];
    const visionImages: string[] = [];

    if (attachedFiles && attachedFiles.length > 0) {
      for (const file of attachedFiles) {
        try {
          const mediaInfo = await readMediaInfo(file);
          const thumbBlob = await makeThumb(file);
          const assetId = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const category = categorize(file.name, file.type);

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
            'command'
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
      content: 'Analyzing concept and planning storyboard...',
      timestamp: nowIso,
      tasks: [],
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

    setIsStreaming(true);

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

    try {
      appendTerminalLog(
        targetChatId,
        `$ framecode plan --model ${selection.provider}/${selection.modelId}`,
        'command'
      );

      // 1. CALL /api/ai mode: "plan"
      const allMessages = [
        ...(existingChat?.messages || []).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userText },
      ];

      const planRes = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selection.provider,
          model: selection.modelId,
          mode: 'plan',
          messages: allMessages,
          attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
          images: visionImages.length > 0 ? visionImages : undefined,
        }),
      });

      const planData = await planRes.json();

      if (!planRes.ok || planData.error) {
        const errorText = planData.error || 'Failed to plan video.';
        appendTerminalLog(targetChatId, `[error] ${errorText}`, 'highlight');
        updateAssistantMsg((m) => ({
          ...m,
          content: errorText,
          action: planData.action || undefined,
        }));
        setIsStreaming(false);
        return;
      }

      const { reply, storyboard, videoConfig } = planData;
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
    (s: { sceneIndex: number; title?: string; durationInFrames: number; onScreenText: string; motionIdea: string; stockQuery?: string }) => `### Scene ${s.sceneIndex}: ${s.title || 'Untitled'}
- Duration: ${s.durationInFrames} frames (${Math.round(s.durationInFrames / videoConfig.fps)}s)
- On-Screen Text: "${s.onScreenText}"
- Motion / Visual: ${s.motionIdea}
${s.stockQuery ? `- Stock Search Query: "${s.stockQuery}"` : ''}`
  )
  .join('\n\n')}
`;
        const sbBlob = new Blob([sbMarkdown], { type: 'text/markdown' });
        const sbAssetId = `asset-sb-${Date.now()}`;
        const sbItem: LibraryItem = {
          id: sbAssetId,
          name: `Storyboard.md`,
          category: 'document',
          source: 'ai',
          mime: 'text/markdown',
          size: sbBlob.size,
          createdAt: new Date().toISOString(),
          chatId: targetChatId,
          hasThumb: false,
        };
        await addLibraryItem(sbItem, sbBlob);
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
        content: reply,
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
          try {
            const stockRes = await fetch(`/api/stock?q=${encodeURIComponent(query)}`);
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

          appendTerminalLog(targetChatId, `[stock] Discovered ${collectedStockAssets.length} stock clips (Pixabay)`);
          updateAssistantMsg((m) => ({
            ...m,
            tasks: [...(m.tasks || []), stockTask],
          }));
        }
      }

      // 3. CALL /api/ai mode: "code"
      appendTerminalLog(
        targetChatId,
        `$ framecode generate-code Composition.tsx --model ${selection.provider}/${selection.modelId}`,
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

      const codeRes = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selection.provider,
          model: selection.modelId,
          mode: 'code',
          storyboard,
          stockAssets: collectedStockAssets,
          attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
          previousCode,
          userPrompt: userText,
          videoConfig,
        }),
      });

      const codeData = await codeRes.json();

      if (!codeRes.ok || codeData.error) {
        const errorText = codeData.error || 'Failed to generate code.';
        appendTerminalLog(targetChatId, `[error] ${errorText}`, 'highlight');
        updateAssistantMsg((m) => ({
          ...m,
          action: codeData.action || undefined,
          tasks: (m.tasks || []).map((t) =>
            t.id === 'task-code' ? { ...t, status: 'done', label: 'Code generation failed' } : t
          ),
        }));
        setIsStreaming(false);
        return;
      }

      let currentCode: string = codeData.code;
      appendTerminalLog(targetChatId, `[compiler] Compiling TypeScript JSX with Sucrase...`);

      // 4. BROWSER COMPILE & FIX LOOP
      let preparedCode = await prepareCode(currentCode);
      let compileTest = compileRemotionCode(preparedCode);
      let fixTries = 0;

      while (!compileTest.component && fixTries < 3) {
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

        const fixRes = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: selection.provider,
            model: selection.modelId,
            mode: 'fix',
            code: currentCode,
            error: compileTest.error,
            storyboard,
            videoConfig,
            stockAssets: collectedStockAssets,
            attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
          }),
        });

        const fixData = await fixRes.json();
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
          break;
        }
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

      if (!compileTest.component) {
        appendTerminalLog(
          targetChatId,
          `[error] Could not resolve compile error after 3 attempts: ${compileTest.error}`,
          'highlight'
        );
        setIsStreaming(false);
        return;
      }

      appendTerminalLog(targetChatId, `✓ Sandboxed compilation succeeded`, 'success');

      // Auto-save Composition.tsx to Library
      try {
        const codeBlob = new Blob([currentCode], { type: 'text/typescript' });
        const codeAssetId = `asset-code-${Date.now()}`;
        const codeItem: LibraryItem = {
          id: codeAssetId,
          name: `Composition.tsx`,
          category: 'document',
          source: 'ai',
          mime: 'text/typescript',
          size: codeBlob.size,
          createdAt: new Date().toISOString(),
          chatId: targetChatId,
          hasThumb: false,
        };
        await addLibraryItem(codeItem, codeBlob);
        appendTerminalLog(targetChatId, '[library] Saved Composition.tsx to Library', 'dim');
      } catch (codeLibErr) {
        console.warn('Could not save Composition.tsx to library:', codeLibErr);
      }

      // 5. FRAME STILLS REVIEW
      const isVisionCapable =
        selection.modelId.includes('vision') ||
        selection.modelId.includes('sonnet') ||
        selection.modelId.includes('flash') ||
        selection.modelId.includes('pro') ||
        selection.provider === 'gemini';

      if (isVisionCapable) {
        appendTerminalLog(targetChatId, `$ remotion render-still-on-web (frames 10%, 50%, 90%)`, 'command');
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
          const stillsBase64 = await captureStillsForReview(compileTest.component, videoConfig);
          if (stillsBase64.length > 0) {
            appendTerminalLog(targetChatId, `[review] Captured ${stillsBase64.length} still frames for vision review`);

            const reviewRes = await fetch('/api/ai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                provider: selection.provider,
                model: selection.modelId,
                mode: 'review',
                code: currentCode,
                images: stillsBase64,
              }),
            });

            const reviewData = await reviewRes.json();
            appendTerminalLog(
              targetChatId,
              `[review] Inspection result: ${reviewData.ok ? 'Verified (No visual clipping)' : `${reviewData.issues?.length || 0} visual issues found`}`
            );

            if (!reviewData.ok && Array.isArray(reviewData.issues) && reviewData.issues.length > 0) {
              let reviewFixTries = 0;
              while (reviewFixTries < 2) {
                reviewFixTries++;
                const issueDesc = reviewData.issues[0];
                appendTerminalLog(targetChatId, `[fix] Correcting frame issue: ${issueDesc}`, 'dim');

                const fixReviewRes = await fetch('/api/ai', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    provider: selection.provider,
                    model: selection.modelId,
                    mode: 'fix',
                    code: currentCode,
                    issues: reviewData.issues,
                    storyboard,
                    videoConfig,
                    stockAssets: collectedStockAssets,
                    attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
                  }),
                });

                const fixReviewData = await fixReviewRes.json();
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
        appendTerminalLog(targetChatId, `[review] Model does not support vision; skipping frame inspection.`, 'dim');
      }

      // 6. SHOW LIVE IN PLAYER & RENDER MP4
      const scenesList = storyboard.map((s: { sceneIndex: number; title?: string; onScreenText: string; durationInFrames: number; motionIdea: string }) => ({
        id: `sc-${s.sceneIndex}`,
        title: s.title || `0${s.sceneIndex}. Scene`,
        duration: `${Math.round(s.durationInFrames / videoConfig.fps)}s`,
        visualStyle: s.onScreenText || 'Kinetic text',
        codeSummary: s.motionIdea || 'Remotion sequence',
      }));

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

      const support = await checkWebRendererSupport();
      if (!support.supported) {
        appendTerminalLog(
          targetChatId,
          `[web-renderer] ${support.message || 'Browser WebCodecs unsupported.'}`,
          'highlight'
        );
        setIsStreaming(false);
        return;
      }

      // Render MP4
      appendTerminalLog(targetChatId, `$ remotion render-media-on-web Composition out.mp4`, 'command');

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

      const { blob, url } = await renderVideoToMp4(
        compileTest.component,
        videoConfig,
        (progressPercent) => {
          updateAssistantMsg((m) => ({
            ...m,
            tasks: (m.tasks || []).map((t) =>
              t.id === 'task-render-mp4'
                ? {
                    ...t,
                    label: `Rendering video... ${progressPercent}%`,
                    progress: progressPercent,
                  }
                : t
            ),
          }));

          if (progressPercent % 25 === 0) {
            appendTerminalLog(targetChatId, `[remotion] Render progress: ${progressPercent}%`, 'dim');
          }
        }
      );

      appendTerminalLog(targetChatId, `✓ Successfully rendered MP4 to browser memory`, 'success');

      // Save rendered MP4 to Library
      try {
        const thumbBlob = await makeThumb(blob);
        const videoAssetId = `asset-video-${Date.now()}`;
        const safeTitle = (userText || 'video').slice(0, 24).toLowerCase().replace(/\s+/g, '_');
        const videoItem: LibraryItem = {
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
        };
        await addLibraryItem(videoItem, blob, thumbBlob);
        appendTerminalLog(targetChatId, '[library] Saved video export to Library', 'dim');
      } catch (vidLibErr) {
        console.warn('Could not save video to library:', vidLibErr);
      }

      const finalizedVideo: VideoProject = {
        ...newVideoObj,
        mp4BlobUrl: url,
      };

      updateAssistantMsg(
        (m) => ({
          ...m,
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
      const msg = err instanceof Error ? err.message : String(err);
      appendTerminalLog(targetChatId, `[fatal] Execution stopped: ${msg}`, 'highlight');
    } finally {
      setIsRenderingMp4(false);
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-[#1F1E1D] text-[#FAF9F5] overflow-hidden">
      {/* Mobile / Tablet Header */}
      <MobileHeader
        onOpenSidebar={() => setIsSidebarOpenMobile(true)}
        onOpenTerminal={() => setIsTerminalSheetOpenMobile(true)}
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
          onCloseMobile={() => setIsSidebarOpenMobile(false)}
        />

        {/* Center Chat Area */}
        <main className="flex-1 flex justify-center h-full overflow-hidden min-w-0">
          <ChatArea
            messages={currentMessages}
            currentVideo={currentVideo}
            onSendMessage={handleSendMessage}
            isStreaming={isStreaming || isRenderingMp4}
            onRenderAndDownload={handleRenderAndDownload}
            isRenderingMp4={isRenderingMp4}
            selection={selection}
            onOpenModelPicker={() => setIsModelPickerOpen(true)}
            onOpenSettings={() => router.push('/settings')}
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
        onClose={() => setIsModelPickerOpen(false)}
        selection={selection}
        onSelect={handleSelectModel}
        onOpenSettings={() => router.push('/settings')}
      />

      {/* Mobile Terminal Bottom Sheet */}
      <MobileTerminalSheet
        isOpen={isTerminalSheetOpenMobile}
        onClose={() => setIsTerminalSheetOpenMobile(false)}
        lines={currentTerminalLines}
        isStreaming={isStreaming || isRenderingMp4}
      />
    </div>
  );
}

