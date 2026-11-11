'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ChatArea } from '@/components/ChatArea';
import { RightPanel } from '@/components/RightPanel';
import { MobileHeader } from '@/components/MobileHeader';
import { MobileTerminalSheet } from '@/components/MobileTerminalSheet';
import { INITIAL_PAST_CHATS } from '@/data/dummyChats';
import { ChatSession, ChatMessage, TaskRow, TerminalLine, VideoProject } from '@/types/framecode';
import { compileRemotionCode } from '@/lib/codeCompiler';
import { checkWebRendererSupport, captureStillsForReview, renderVideoToMp4 } from '@/lib/videoRenderer';

const LOCAL_STORAGE_KEY = 'framecode_chats';

export default function FramecodePage() {
  const [pastChats, setPastChats] = useState<ChatSession[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          const parsed: ChatSession[] = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn('Could not read past chats from localStorage:', e);
      }
    }
    return INITIAL_PAST_CHATS;
  });

  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          const parsed: ChatSession[] = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed[0].id;
          }
        }
      } catch {}
    }
    return 'chat-1';
  });

  // UI state
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isRenderingMp4, setIsRenderingMp4] = useState<boolean>(false);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState<boolean>(false);
  const [isTerminalSheetOpenMobile, setIsTerminalSheetOpenMobile] = useState<boolean>(false);

  const isMountedRef = useRef<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;
  }, []);


  // Save past chats (text, code & stock IDs only, no temporary URLs or video blobs) to localStorage
  useEffect(() => {
    if (!isMountedRef.current) return;
    try {
      const cleanForStorage = pastChats.map((chat) => ({
        ...chat,
        messages: chat.messages.map((m) => ({
          ...m,
          video: m.video
            ? {
                ...m.video,
                mp4BlobUrl: null, // do not store heavy blob URLs
                stockAssets: m.video.stockAssets
                  ? m.video.stockAssets.map((asset) => ({
                      ...asset,
                      fileUrl: '', // clear temporary hotlinks
                      previewUrl: '',
                    }))
                  : [],
              }
            : null,
        })),
        video: chat.video
          ? {
              ...chat.video,
              mp4BlobUrl: null,
              stockAssets: chat.video.stockAssets
                ? chat.video.stockAssets.map((asset) => ({
                    ...asset,
                    fileUrl: '',
                    previewUrl: '',
                  }))
                : [],
            }
          : null,
      }));
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleanForStorage));
    } catch (e) {
      console.warn('Could not save chats to localStorage:', e);
    }
  }, [pastChats]);

  // Active chat session state
  const activeChat = pastChats.find((c) => c.id === activeChatId) || null;
  const currentMessages = activeChat ? activeChat.messages : [];
  const currentTerminalLines = activeChat ? activeChat.terminalLines : [];
  const currentVideo = activeChat ? activeChat.video : null;

  // Helper to add terminal log
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
            terminalLines: [...c.terminalLines, logItem],
          };
        }
        return c;
      })
    );
  };

  // Switch chat and restore live preview with fresh Pixabay URLs
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

  // Start a new chat
  const handleNewChat = () => {
    if (isStreaming) return;
    const newChatId = `chat-${Date.now()}`;
    const newSession: ChatSession = {
      id: newChatId,
      title: 'New Video Project',
      timestamp: 'Just now',
      messages: [],
      terminalLines: [
        {
          id: `init-${Date.now()}`,
          text: '$ remotion v4.0.542 environment ready',
          type: 'command',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
      video: null,
    };

    setPastChats((prev) => [newSession, ...prev]);
    setActiveChatId(newChatId);
  };

  // Trigger MP4 rendering on demand if user clicks download before MP4 is generated
  const handleRenderAndDownload = async () => {
    if (!currentVideo || !currentVideo.code || isRenderingMp4 || isStreaming) return;
    const targetChatId = activeChatId;
    if (!targetChatId) return;

    appendTerminalLog(targetChatId, '$ remotion render-media-on-web Composition out.mp4', 'command');
    appendTerminalLog(targetChatId, '[hint] Keep this tab open while rendering', 'dim');

    const support = await checkWebRendererSupport();
    if (!support.supported) {
      appendTerminalLog(targetChatId, `[error] ${support.message || 'Please use the latest Chrome.'}`, 'highlight');
      alert(support.message || 'Please use the latest Chrome.');
      return;
    }

    setIsRenderingMp4(true);
    try {
      const compileRes = compileRemotionCode(currentVideo.code);
      if (!compileRes.component) {
        throw new Error(compileRes.error || 'Failed to compile component');
      }

      const { url } = await renderVideoToMp4(
        compileRes.component,
        currentVideo.videoConfig,
        (progress) => {
          if (progress % 20 === 0 || progress === 100) {
            appendTerminalLog(targetChatId, `[render] Encoding progress: ${progress}%`, 'dim');
          }
        }
      );

      appendTerminalLog(targetChatId, '✓ Render completed successfully', 'success');

      // Update state with mp4BlobUrl
      setPastChats((prev) =>
        prev.map((c) => {
          if (c.id === targetChatId && c.video) {
            return {
              ...c,
              video: {
                ...c.video,
                mp4BlobUrl: url,
              },
            };
          }
          return c;
        })
      );

      // Trigger download
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

  // Main Real AI Client Flow
  const handleSendMessage = async (userText: string) => {
    if (isStreaming) return;

    let targetChatId = activeChatId;
    let targetChats = [...pastChats];

    // Ensure active chat session exists
    if (!targetChatId) {
      targetChatId = `chat-${Date.now()}`;
      const newSession: ChatSession = {
        id: targetChatId,
        title: userText.length > 28 ? `${userText.slice(0, 28)}...` : userText,
        timestamp: 'Just now',
        messages: [],
        terminalLines: [],
        video: null,
      };
      targetChats = [newSession, ...targetChats];
      setActiveChatId(targetChatId);
    } else {
      // Update title if it was default
      targetChats = targetChats.map((c) => {
        if (c.id === targetChatId && (c.title === 'New Video Project' || c.messages.length === 0)) {
          return {
            ...c,
            title: userText.length > 28 ? `${userText.slice(0, 28)}...` : userText,
          };
        }
        return c;
      });
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText,
      timestamp: timeStr,
    };

    const assistantMsgId = `assistant-${Date.now()}`;
    const initialAssistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: 'Analyzing concept and planning storyboard...',
      timestamp: timeStr,
      tasks: [],
    };

    const existingChat = targetChats.find((c) => c.id === targetChatId);
    const previousCode = existingChat?.latestCode || existingChat?.video?.code || '';

    // Append user & initial assistant message
    setPastChats(
      targetChats.map((c) => {
        if (c.id === targetChatId) {
          return {
            ...c,
            messages: [...c.messages, userMessage, initialAssistantMessage],
          };
        }
        return c;
      })
    );

    setIsStreaming(true);

    // Helper to update the active assistant message tasks or content
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
      appendTerminalLog(targetChatId, `$ framecode plan --model gemini-2.5-flash`, 'command');

      // -------------------------------------------------------------
      // 1. CALL /api/ai "plan"
      // -------------------------------------------------------------
      const allMessages = [
        ...(existingChat?.messages || []).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userText },
      ];

      const planRes = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'plan',
          messages: allMessages,
        }),
      });

      const planData = await planRes.json();

      if (!planRes.ok || planData.error) {
        const errorText = planData.error || 'Failed to plan video.';
        appendTerminalLog(targetChatId, `[error] ${errorText}`, 'highlight');
        updateAssistantMsg((m) => ({
          ...m,
          content: errorText,
        }));
        setIsStreaming(false);
        return;
      }

      const { reply, storyboard, videoConfig } = planData;
      appendTerminalLog(
        targetChatId,
        `[planner] Planned ${storyboard.length} scenes (${videoConfig.durationInFrames} frames @ ${videoConfig.fps}fps)`
      );

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

      // -------------------------------------------------------------
      // 2. STOCK MEDIA QUERIES
      // -------------------------------------------------------------
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
            }
          } catch (e) {
            console.warn('Failed stock fetch:', e);
          }
        }

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

      // -------------------------------------------------------------
      // 3. CALL /api/ai "code"
      // -------------------------------------------------------------
      appendTerminalLog(targetChatId, `$ framecode generate-code Composition.tsx`, 'command');
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
          mode: 'code',
          storyboard,
          stockAssets: collectedStockAssets,
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
          tasks: (m.tasks || []).map((t) => (t.id === 'task-code' ? { ...t, status: 'done', label: 'Code generation failed' } : t)),
        }));
        setIsStreaming(false);
        return;
      }

      let currentCode: string = codeData.code;
      appendTerminalLog(targetChatId, `[compiler] Compiling TypeScript JSX with Sucrase...`);

      // -------------------------------------------------------------
      // 4. BROWSER COMPILE & FIX LOOP (MAX 3 TRIES)
      // -------------------------------------------------------------
      let compileTest = compileRemotionCode(currentCode);
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
            mode: 'fix',
            code: currentCode,
            error: compileTest.error,
            storyboard,
            videoConfig,
          }),
        });

        const fixData = await fixRes.json();
        if (fixData.code) {
          currentCode = fixData.code;
          compileTest = compileRemotionCode(currentCode);
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

      // Mark the original code task as done
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

      // -------------------------------------------------------------
      // 5. RENDER 3 STILLS & REVIEW (MAX 2 TRIES)
      // -------------------------------------------------------------
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
                  mode: 'fix',
                  code: currentCode,
                  issues: reviewData.issues,
                  storyboard,
                  videoConfig,
                }),
              });

              const fixReviewData = await fixReviewRes.json();
              if (fixReviewData.code) {
                const recompiled = compileRemotionCode(fixReviewData.code);
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

      // Mark review task as done
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

      // -------------------------------------------------------------
      // 6. SHOW LIVE IN @REMOTION/PLAYER & RENDER MP4
      // -------------------------------------------------------------
      const scenesList = storyboard.map((s: { sceneIndex: number; title?: string; onScreenText: string; durationInFrames: number; motionIdea: string }) => ({
        id: `sc-${s.sceneIndex}`,
        title: s.title || `0${s.sceneIndex}. Scene`,
        duration: `${Math.round(s.durationInFrames / videoConfig.fps)}s`,
        visualStyle: s.onScreenText || 'Kinetic text',
        codeSummary: s.motionIdea || 'Remotion sequence',
      }));

      const newVideoObj: VideoProject = {
        id: `vid-${Date.now()}`,
        title: userText.length > 24 ? userText.slice(0, 24) : userText,
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

      // Update state with live composition immediately
      updateAssistantMsg(
        (m) => ({
          ...m,
          video: newVideoObj,
        }),
        newVideoObj,
        currentCode
      );

      // Check WebCodecs / Browser WebRenderer capability
      const support = await checkWebRendererSupport();
      if (!support.supported) {
        appendTerminalLog(
          targetChatId,
          `[web-renderer] ${support.message || 'Please use the latest Chrome.'}`,
          'highlight'
        );

        const skipRenderTask: TaskRow = {
          id: 'task-render-unsupported',
          label: support.message || 'Please use the latest Chrome.',
          status: 'done',
        };

        updateAssistantMsg((m) => ({
          ...m,
          tasks: [...(m.tasks || []), skipRenderTask],
        }));
        setIsStreaming(false);
        return;
      }

      // Render MP4 in browser
      appendTerminalLog(targetChatId, `$ remotion render-media-on-web Composition out.mp4`, 'command');
      appendTerminalLog(targetChatId, `[hint] Keep this tab open while rendering`, 'dim');

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

      const { url } = await renderVideoToMp4(
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
      {/* Mobile / Tablet Header (< 1024px) */}
      <MobileHeader
        onOpenSidebar={() => setIsSidebarOpenMobile(true)}
        onOpenTerminal={() => setIsTerminalSheetOpenMobile(true)}
        isStreaming={isStreaming || isRenderingMp4}
      />

      {/* Main 3-Zone Desktop Layout / 1-Column Mobile Layout */}
      <div className="flex flex-1 w-full overflow-hidden">
        {/* Left Sidebar (260px fixed width, hidden on < 1024px) */}
        <Sidebar
          pastChats={pastChats}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          isOpenMobile={isSidebarOpenMobile}
          onCloseMobile={() => setIsSidebarOpenMobile(false)}
        />

        {/* Center Chat Area (max-w 720px centered in remaining space) */}
        <main className="flex-1 flex justify-center h-full overflow-hidden min-w-0">
          <ChatArea
            messages={currentMessages}
            currentVideo={currentVideo}
            onSendMessage={handleSendMessage}
            isStreaming={isStreaming || isRenderingMp4}
            onRenderAndDownload={handleRenderAndDownload}
            isRenderingMp4={isRenderingMp4}
          />
        </main>

        {/* Right Panel (400px fixed width, hidden on < 1024px) */}
        <RightPanel
          video={currentVideo}
          terminalLines={currentTerminalLines}
          isStreaming={isStreaming || isRenderingMp4}
          onRenderAndDownload={handleRenderAndDownload}
          isRenderingMp4={isRenderingMp4}
        />
      </div>

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
