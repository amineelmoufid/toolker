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
  pronunciation?: string;    // intuitive respelling, e.g. "spuh-SIF-ik"
  definition?: string;       // e.g. "Clearly defined or exact."
  sentence: string;
  translation: string;
  level?: string;            // 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  topic?: string;
  language?: AppLanguage;    // 'English' | 'French'
  icon?: string;             // e.g. '🎯'
}

export interface DictationLesson {
  topic: string;
  level: string;
  items: DictationItem[];
  language?: AppLanguage;
}

export interface WordMasteryRecord {
  id: string;
  word: string;
  pronunciation: string;
  definition: string;
  translation: string;
  sentence: string;
  level: string;
  topic: string;
  language: AppLanguage;
  masteredAt: number;
  timesPracticed: number;
  isPerfect: boolean;
}

export interface DictationAchievementBadge {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  unlockedAt: number | null;
}

export interface DictationUserStats {
  totalMasteredWords: number;
  totalSessionsCompleted: number;
  perfectSessions: number;
  currentStreak: number;
  longestStreak: number;
  lastPracticeDate: string;
  masteredWords: Record<string, WordMasteryRecord>; // key: `${lang}_${word.toLowerCase()}`
  badges: Record<string, number>; // badgeId -> timestamp
}