export interface TaskRow {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done';
  progress?: number; // 0 - 100
  detailTitle?: string;
  codeSnippet?: string;
}

export interface VideoProject {
  id: string;
  title: string;
  aspectRatio: '9:16';
  durationSec: number;
  currentSec: number;
  fps: number;
  resolution: string; // e.g. "1080x1920"
  scenes: {
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
  timestamp: string;
  tasks?: TaskRow[];
  video?: VideoProject | null;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: string;
  messages: ChatMessage[];
  terminalLines: TerminalLine[];
  video: VideoProject | null;
}
