export type ProviderId = 'claude' | 'openrouter' | 'gemini';

export type LibraryCategory = 'video' | 'image' | 'pdf' | 'document' | 'file';

export interface LibraryItem {
  id: string;
  name: string;
  category: LibraryCategory;
  source: 'upload' | 'ai';
  mime: string;
  size: number;
  createdAt: string; // ISO string
  chatId?: string;
  width?: number;
  height?: number;
  duration?: number;
  hasThumb: boolean;
}

export interface Attachment {
  id: string; // library item id
  name: string;
  kind: 'image' | 'video' | 'other';
  mime: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface ModelOption {
  id: string;
  name: string;
  provider?: ProviderId;
  vision: boolean;
  jsonMode?: boolean;
  imageOutput?: boolean;
}

export interface ModelSelection {
  provider: ProviderId;
  modelId: string;
  modelName: string;
  vision: boolean;
  jsonMode?: boolean;
}

export interface ImageSelection {
  provider: ProviderId;
  modelId: string;
  modelName: string;
}

export interface TaskRow {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
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

export interface Memory {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  source: 'user' | 'ai';
  chatId?: string;
}

export interface MemoryOp {
  op: 'add' | 'update' | 'delete';
  id?: string;
  text?: string;
}

export type KeyStatusMap = Record<ProviderId, { connected: boolean; last4: string | null }>;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO string
  action?: 'open-settings';
  attachments?: Attachment[];
  tasks?: TaskRow[];
  video?: VideoProject | null;
  images?: { libraryId: string; name: string }[];
  memoryUpdates?: string[];
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
