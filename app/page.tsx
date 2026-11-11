'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ChatArea } from '@/components/ChatArea';
import { RightPanel } from '@/components/RightPanel';
import { MobileHeader } from '@/components/MobileHeader';
import { MobileTerminalSheet } from '@/components/MobileTerminalSheet';
import { INITIAL_PAST_CHATS } from '@/data/dummyChats';
import { ChatSession, ChatMessage, TaskRow, TerminalLine, VideoProject } from '@/types/framecode';

export default function FramecodePage() {
  const [pastChats, setPastChats] = useState<ChatSession[]>(INITIAL_PAST_CHATS);
  const [activeChatId, setActiveChatId] = useState<string | null>('chat-1');

  // Active chat session state
  const activeChat = pastChats.find((c) => c.id === activeChatId) || null;
  const currentMessages = activeChat ? activeChat.messages : [];
  const currentTerminalLines = activeChat ? activeChat.terminalLines : [];
  const currentVideo = activeChat ? activeChat.video : null;

  // UI state
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState<boolean>(false);
  const [isTerminalSheetOpenMobile, setIsTerminalSheetOpenMobile] = useState<boolean>(false);

  // Switch chat
  const handleSelectChat = (chatId: string) => {
    if (isStreaming) return;
    setActiveChatId(chatId);
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
          text: '$ remotion v4.0.120 initialized in sandbox',
          type: 'command',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
      video: null,
    };

    setPastChats((prev) => [newSession, ...prev]);
    setActiveChatId(newChatId);
  };

  // Send message and simulate the demo flow with timers
  const handleSendMessage = (text: string) => {
    if (isStreaming) return;

    let targetChatId = activeChatId;
    let targetChats = [...pastChats];

    // If currently no active chat or empty title, initialize or update title
    if (!targetChatId) {
      targetChatId = `chat-${Date.now()}`;
      const newSession: ChatSession = {
        id: targetChatId,
        title: text.length > 28 ? `${text.slice(0, 28)}...` : text,
        timestamp: 'Just now',
        messages: [],
        terminalLines: [],
        video: null,
      };
      targetChats = [newSession, ...targetChats];
      setActiveChatId(targetChatId);
    } else {
      // Update chat title if it was default
      targetChats = targetChats.map((c) => {
        if (c.id === targetChatId && (c.title === 'New Video Project' || c.messages.length === 0)) {
          return {
            ...c,
            title: text.length > 28 ? `${text.slice(0, 28)}...` : text,
          };
        }
        return c;
      });
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsgId = `user-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: timeStr,
    };

    // Append user message immediately
    const assistantMsgId = `assistant-${Date.now()}`;
    let updatedChats = targetChats.map((c) => {
      if (c.id === targetChatId) {
        return {
          ...c,
          messages: [...c.messages, userMessage],
        };
      }
      return c;
    });
    setPastChats(updatedChats);
    setIsStreaming(true);

    // Initial tasks
    const initialTasks: TaskRow[] = [
      {
        id: 't-step-1',
        label: 'Wrote storyboard - 4 scenes',
        status: 'running',
        progress: 45,
        detailTitle: 'storyboard.json',
        codeSnippet: `{\n  "concept": "${text}",\n  "ratio": "9:16",\n  "fps": 30,\n  "durationInFrames": 900,\n  "scenes": [\n    { "id": "hook", "duration": "6s", "style": "kinetic_text" },\n    { "id": "feature_1", "duration": "8s", "style": "split_preview" },\n    { "id": "feature_2", "duration": "8s", "style": "vector_flow" },\n    { "id": "cta", "duration": "8s", "style": "brand_lockup" }\n  ]\n}`,
      },
    ];

    // Timer Step 1: AI starts responding + Task 1 running + terminal output
    setTimeout(() => {
      const log1: TerminalLine = {
        id: `log-${Date.now()}-1`,
        text: `$ npx remotion init --template vertical-9x16`,
        type: 'command',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
      const log2: TerminalLine = {
        id: `log-${Date.now()}-2`,
        text: `[framecode] Parsed prompt: "${text}"`,
        type: 'log',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: `I've planned a 4-scene 9:16 video composition using Remotion with spring physics and kinetic typography. Writing React code and compiling assets:`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        tasks: initialTasks,
      };

      setPastChats((prev) =>
        prev.map((c) => {
          if (c.id === targetChatId) {
            return {
              ...c,
              messages: [...c.messages, assistantMessage],
              terminalLines: [...c.terminalLines, log1, log2],
            };
          }
          return c;
        })
      );
    }, 450);

    // Timer Step 2: Task 1 finishes, Task 2 starts + terminal logs
    setTimeout(() => {
      const log3: TerminalLine = {
        id: `log-${Date.now()}-3`,
        text: `[remotion] Compiling src/Scene1.tsx & src/Scene2.tsx with esbuild`,
        type: 'log',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      setPastChats((prev) =>
        prev.map((c) => {
          if (c.id === targetChatId) {
            const updatedMessages = c.messages.map((m) => {
              if (m.id === assistantMsgId) {
                const updatedTasks: TaskRow[] = [
                  {
                    ...m.tasks![0],
                    status: 'done',
                    progress: 100,
                  },
                  {
                    id: 't-step-2',
                    label: 'Wrote Scene1.tsx & Scene2.tsx',
                    status: 'running',
                    progress: 60,
                    detailTitle: 'src/scenes/Scene1.tsx',
                    codeSnippet: `import { spring, useCurrentFrame, useVideoConfig } from 'remotion';\n\nexport const Scene1 = () => {\n  const frame = useCurrentFrame();\n  const { fps } = useVideoConfig();\n  const scale = spring({ frame, fps, config: { damping: 12 } });\n  return (\n    <div className="flex h-full w-full items-center justify-center p-6 text-center">\n      <h1 style={{ transform: \`scale(\${scale})\` }} className="text-3xl font-bold">\n        ${text.toUpperCase().slice(0, 24)}\n      </h1>\n    </div>\n  );\n};`,
                  },
                ];
                return { ...m, tasks: updatedTasks };
              }
              return m;
            });

            return {
              ...c,
              messages: updatedMessages,
              terminalLines: [...c.terminalLines, log3],
            };
          }
          return c;
        })
      );
    }, 1400);

    // Timer Step 3: Task 2 finishes, Task 3 (rendering) starts + terminal logs
    setTimeout(() => {
      const log4: TerminalLine = {
        id: `log-${Date.now()}-4`,
        text: `$ npx remotion render src/Root.tsx VideoComposition out.mp4`,
        type: 'command',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
      const log5: TerminalLine = {
        id: `log-${Date.now()}-5`,
        text: `[remotion] Rendering 900 frames @ 1080x1920 (30fps)...`,
        type: 'log',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      setPastChats((prev) =>
        prev.map((c) => {
          if (c.id === targetChatId) {
            const updatedMessages = c.messages.map((m) => {
              if (m.id === assistantMsgId) {
                const updatedTasks: TaskRow[] = [
                  m.tasks![0],
                  {
                    ...m.tasks![1],
                    status: 'done',
                    progress: 100,
                  },
                  {
                    id: 't-step-3',
                    label: 'Rendering video... 62%',
                    status: 'running',
                    progress: 62,
                    detailTitle: 'render.log',
                    codeSnippet: `[remotion] Frame 0 to 558 rendered in 1.8s\n[remotion] Bitrate: 18 Mbps\n[remotion] Resolution: 1080x1920 (9:16)`,
                  },
                ];
                return { ...m, tasks: updatedTasks };
              }
              return m;
            });

            return {
              ...c,
              messages: updatedMessages,
              terminalLines: [...c.terminalLines, log4, log5],
            };
          }
          return c;
        })
      );
    }, 2400);

    // Timer Step 4: Progress updates to 90%
    setTimeout(() => {
      const log6: TerminalLine = {
        id: `log-${Date.now()}-6`,
        text: `[remotion] Frame 558 to 900 rendered in 1.1s. Mixing audio.`,
        type: 'dim',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      setPastChats((prev) =>
        prev.map((c) => {
          if (c.id === targetChatId) {
            const updatedMessages = c.messages.map((m) => {
              if (m.id === assistantMsgId) {
                const updatedTasks: TaskRow[] = [
                  m.tasks![0],
                  m.tasks![1],
                  {
                    ...m.tasks![2],
                    label: 'Rendering video... 92%',
                    progress: 92,
                  },
                ];
                return { ...m, tasks: updatedTasks };
              }
              return m;
            });

            return {
              ...c,
              messages: updatedMessages,
              terminalLines: [...c.terminalLines, log6],
            };
          }
          return c;
        })
      );
    }, 3300);

    // Timer Step 5: Video complete! Rendered video card appears and updates player
    setTimeout(() => {
      const newVideo: VideoProject = {
        id: `vid-${Date.now()}`,
        title: text.length > 24 ? text.slice(0, 24) : text,
        aspectRatio: '9:16',
        durationSec: 30,
        currentSec: 0,
        fps: 30,
        resolution: '1080x1920',
        scenes: [
          { id: 'sc-n-1', title: '01. Hook & Title', duration: '0:06', visualStyle: 'Kinetic Spring', codeSummary: 'Scale spring damping 12' },
          { id: 'sc-n-2', title: '02. Feature Showcase', duration: '0:08', visualStyle: 'Split Code Diff', codeSummary: 'SVG morphing transition' },
          { id: 'sc-n-3', title: '03. Motion Graphics', duration: '0:08', visualStyle: 'Macro Focus', codeSummary: 'Interpolated blur + rot' },
          { id: 'sc-n-4', title: '04. Minimalist Outro', duration: '0:08', visualStyle: 'Clean Callout', codeSummary: 'Staggered font reveal' },
        ],
        primaryCodeSnippet: `<Composition\n  id="DynamicReel"\n  component={DynamicReelComponent}\n  durationInFrames={900}\n  fps={30}\n  width={1080}\n  height={1920}\n/>`,
      };

      const log7: TerminalLine = {
        id: `log-${Date.now()}-7`,
        text: `✓ Successfully rendered video to ./out/render.mp4 (1080x1920, 12.8 MB)`,
        type: 'success',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      setPastChats((prev) =>
        prev.map((c) => {
          if (c.id === targetChatId) {
            const updatedMessages = c.messages.map((m) => {
              if (m.id === assistantMsgId) {
                const finalTasks: TaskRow[] = [
                  m.tasks![0],
                  m.tasks![1],
                  {
                    ...m.tasks![2],
                    label: 'Rendering video... 100%',
                    status: 'done',
                    progress: 100,
                  },
                ];

                return {
                  ...m,
                  content: `Your video has been generated and rendered to out.mp4. You can preview the 9:16 composition in the player, inspect the code scenes, or download the export:`,
                  tasks: finalTasks,
                  video: newVideo,
                };
              }
              return m;
            });

            return {
              ...c,
              messages: updatedMessages,
              terminalLines: [...c.terminalLines, log7],
              video: newVideo,
            };
          }
          return c;
        })
      );

      setIsStreaming(false);
    }, 4200);
  };

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-[#1F1E1D] text-[#FAF9F5] overflow-hidden">
      {/* Mobile / Tablet Header (< 1024px) */}
      <MobileHeader
        onOpenSidebar={() => setIsSidebarOpenMobile(true)}
        onOpenTerminal={() => setIsTerminalSheetOpenMobile(true)}
        isStreaming={isStreaming}
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
            isStreaming={isStreaming}
          />
        </main>

        {/* Right Panel (400px fixed width, hidden on < 1024px) */}
        <RightPanel
          video={currentVideo}
          terminalLines={currentTerminalLines}
          isStreaming={isStreaming}
        />
      </div>

      {/* Mobile Terminal Bottom Sheet */}
      <MobileTerminalSheet
        isOpen={isTerminalSheetOpenMobile}
        onClose={() => setIsTerminalSheetOpenMobile(false)}
        lines={currentTerminalLines}
        isStreaming={isStreaming}
      />
    </div>
  );
}
