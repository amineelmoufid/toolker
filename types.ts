export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  UNSET = 'UNSET'
}

export type AppLanguage = 'English' | 'French';

export interface TokenUsageInfo {
  textPromptTokens?: number;
  textCandidatesTokens?: number;
  textTotalTokens?: number;
  audioPromptTokens?: number;
  audioCandidatesTokens?: number;
  audioTotalTokens?: number;
  totalTokens: number;
  lastUpdated?: number;
}

export interface PracticeSession {
  sentence: string;
  referenceAudios: Record<string, string>; // Keyed by speed: 'word' | 'slow' | 'normal'
  timestamp: number;
  language: AppLanguage;
  generatingSpeeds?: Record<string, boolean>;
  tokenUsage?: TokenUsageInfo;
}

export interface AppConfig {
  customPrompt: string;
}

export interface UserSubmission {
  id?: string;
  userId: string;
  userName: string;
  audioBase64: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text?: string;
  audioBase64?: string;
  role: UserRole;
  timestamp: number;
}

export interface AppState {
  role: UserRole;
  userName: string;
  isAuthenticated: boolean;
}

export type AppMode = 'instrument' | 'shadowing' | 'dictation' | 'reader';

export interface SubtitleWord {
  text: string;
  start: number; // in seconds
  end: number;   // in seconds
}

export interface SubtitleLine {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: SubtitleWord[];
  translation?: string;
}

export interface ShadowingClip {
  id: string;
  title: string;
  youtubeId: string;
  thumbnail?: string;
  category?: string;
  subtitles: SubtitleLine[];
}

export interface DictationItem {
  id: string;
  word: string;
  sentence: string;
  translation: string;
}

export interface DictationLesson {
  topic: string;
  level: string;
  items: DictationItem[];
}