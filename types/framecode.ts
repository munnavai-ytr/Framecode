export type ProviderId = 'claude' | 'openrouter' | 'gemini';

export interface ModelOption {
  id: string;
  name: string;
  provider?: ProviderId;
  vision: boolean;
  jsonMode?: boolean;
}

export interface ModelSelection {
  provider: ProviderId;
  modelId: string;
  modelName: string;
}

export interface TaskRow {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done';
  progress?: number; // 0 - 100
  detailTitle?: string;
  codeSnippet?: string;
}

export interface StoryboardScene {
  sceneIndex: number;
  title?: string;
  durationInFrames: number;
  onScreenText: string;
  motionIdea: string;
  stockQuery?: string;
}

export interface VideoProject {
  id: string;
  title: string;
  aspectRatio: '9:16';
  durationSec: number;
  currentSec: number;
  fps: number;
  resolution: string; // e.g. "720x1280"
  code: string;
  videoConfig: {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
  };
  storyboard?: StoryboardScene[];
  stockAssets?: Array<{
    id: string | number;
    type: 'video' | 'photo';
    previewUrl: string;
    fileUrl: string;
    duration?: number;
    width: number;
    height: number;
  }>;
  mp4BlobUrl?: string | null;
  scenes?: {
    id: string;
    title: string;
    duration: string;
    visualStyle: string;
    codeSummary: string;
  }[];
  primaryCodeSnippet: string;
}

export interface TerminalLine {
  id: string;
  text: string;
  type?: 'command' | 'log' | 'success' | 'highlight' | 'dim';
  timestamp?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO string
  action?: 'open-settings';
  tasks?: TaskRow[];
  video?: VideoProject | null;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  timestamp?: string;
  messages: ChatMessage[];
  terminalLines: TerminalLine[];
  video: VideoProject | null;
  latestCode?: string;
}
