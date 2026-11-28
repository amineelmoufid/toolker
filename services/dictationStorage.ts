import { DictationItem, DictationUserStats, WordMasteryRecord, DictationAchievementBadge, AppLanguage } from '../types';
import { db } from './firebase';
import { ref, set, get, onValue } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

const STORAGE_KEY = 'toolker_dictation_stats_v1';

export const DICTATION_BADGES: DictationAchievementBadge[] = [
  {
    id: 'first_word',
    title: 'First Step',
    description: 'Master your very first vocabulary word.',
    icon: '🎯',
    target: 1,
    unlockedAt: null
  },
  {
    id: 'five_words',
    title: 'Lexical Spark',
    description: 'Master 5 unique vocabulary words.',
    icon: '⚡',
    target: 5,
    unlockedAt: null
  },
  {
    id: 'ten_challenge',
    title: '10-Word Challenger',
    description: 'Successfully complete a 10-Word Challenge session.',
    icon: '🏆',
    target: 1,
    unlockedAt: null
  },
  {
    id: 'flawless',
    title: 'Flawless Execution',
    description: 'Complete a challenge with 100% accuracy and zero hints used.',
    icon: '💎',
    target: 1,
    unlockedAt: null
  },
  {
    id: 'streak_3',
    title: 'On Fire',
    description: 'Practice 3 consecutive days.',
    icon: '🔥',
    target: 3,
    unlockedAt: null
  },
  {
    id: 'polyglot',
    title: 'Bilingual Mind',
    description: 'Master vocabulary words in both English and French.',
    icon: '🌍',
    target: 2,
    unlockedAt: null
  },
  {
    id: 'level_b2',
    title: 'Upper Intermediate',
    description: 'Master a B2 level word.',
    icon: '🎓',
    target: 1,
    unlockedAt: null
  },
  {
    id: 'level_c',
    title: 'Mastery Pioneer',
    description: 'Master a high-level C1 or C2 word.',
    icon: '👑',
    target: 1,
    unlockedAt: null
  },
  {
    id: 'twenty_five_words',
    title: 'Word Collector',
    description: 'Master 25 unique vocabulary words.',
    icon: '📚',
    target: 25,
    unlockedAt: null
  },
  {
    id: 'century_club',
    title: 'Century Club',
    description: 'Master 100 vocabulary words.',
    icon: '💯',
    target: 100,
    unlockedAt: null
  }
];

export const getDefaultStats = (): DictationUserStats => ({
  totalMasteredWords: 0,
  totalSessionsCompleted: 0,
  perfectSessions: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastPracticeDate: '',
  masteredWords: {},
  badges: {}
});

export const getDictationStats = (): DictationUserStats => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultStats();
    const parsed = JSON.parse(raw);
    return {
      ...getDefaultStats(),
      ...parsed,
      masteredWords: parsed.masteredWords || {},
      badges: parsed.badges || {}
    };
  } catch (e) {
    console.error('Error loading dictation stats from localStorage', e);
    return getDefaultStats();
  }
};

export const saveDictationStats = (stats: DictationUserStats): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Error saving dictation stats to localStorage', e);
  }
};

const getTodayString = (): string => {
  return new Date().toISOString().split('T')[0];
};

const calculateStreak = (lastDateStr: string, currentStreak: number): number => {
  const today = getTodayString();
  if (!lastDateStr) return 1;
  if (lastDateStr === today) return currentStreak || 1;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (lastDateStr === yesterdayStr) {
    return (currentStreak || 0) + 1;
  }
  // Streak broken
  return 1;
};

/**
 * Checks all badge criteria and returns any newly unlocked badges
 */
export const checkBadgeUnlocks = (stats: DictationUserStats): DictationAchievementBadge[] => {
  const newlyUnlocked: DictationAchievementBadge[] = [];
  const words = Object.values(stats.masteredWords);
  const uniqueCount = words.length;

  const hasEnglish = words.some(w => w.language === 'English');
  const hasFrench = words.some(w => w.language === 'French');
  const hasB2 = words.some(w => w.level === 'B2');
  const hasC = words.some(w => w.level === 'C1' || w.level === 'C2');

  const check = (badgeId: string, condition: boolean) => {
    if (condition && !stats.badges[badgeId]) {
      stats.badges[badgeId] = Date.now();
      const badgeObj = DICTATION_BADGES.find(b => b.id === badgeId);
      if (badgeObj) newlyUnlocked.push({ ...badgeObj, unlockedAt: stats.badges[badgeId] });
    }
  };

  check('first_word', uniqueCount >= 1);
  check('five_words', uniqueCount >= 5);
  check('twenty_five_words', uniqueCount >= 25);
  check('century_club', uniqueCount >= 100);
  check('ten_challenge', stats.totalSessionsCompleted >= 1);
  check('flawless', stats.perfectSessions >= 1);
  check('streak_3', stats.currentStreak >= 3);
  check('polyglot', hasEnglish && hasFrench);
  check('level_b2', hasB2);
  check('level_c', hasC);

  return newlyUnlocked;
};

/**
 * Records mastery of a single word during dictation
 */
export const recordWordMastery = (
  item: DictationItem,
  hintsUsed: boolean
): { stats: DictationUserStats; newBadges: DictationAchievementBadge[]; isNewWord: boolean } => {
  const stats = getDictationStats();
  const langKey = item.language || 'English';
  const wordKey = `${langKey.toLowerCase()}_${item.word.toLowerCase()}`;

  const isNewWord = !stats.masteredWords[wordKey];
  const existing = stats.masteredWords[wordKey];

  stats.masteredWords[wordKey] = {
    id: item.id,
    word: item.word,
    pronunciation: item.pronunciation || '',
    definition: item.definition || item.translation,
    translation: item.translation,
    sentence: item.sentence,
    level: item.level || 'A1',
    topic: item.topic || 'General',
    language: item.language || 'English',
    masteredAt: Date.now(),
    timesPracticed: (existing?.timesPracticed || 0) + 1,
    isPerfect: existing ? (existing.isPerfect && !hintsUsed) : !hintsUsed
  };

  stats.totalMasteredWords = Object.keys(stats.masteredWords).length;

  // Streak update
  const today = getTodayString();
  const newStreak = calculateStreak(stats.lastPracticeDate, stats.currentStreak);
  stats.currentStreak = newStreak;
  if (newStreak > stats.longestStreak) stats.longestStreak = newStreak;
  stats.lastPracticeDate = today;

  const newBadges = checkBadgeUnlocks(stats);
  saveDictationStats(stats);

  return { stats, newBadges, isNewWord };
};

/**
 * Records completion of an entire dictation session / challenge
 */
export const recordSessionCompletion = (
  hintsUsedTotal: number
): { stats: DictationUserStats; newBadges: DictationAchievementBadge[] } => {
  const stats = getDictationStats();
  stats.totalSessionsCompleted += 1;
  if (hintsUsedTotal === 0) {
    stats.perfectSessions += 1;
  }

  const newBadges = checkBadgeUnlocks(stats);
  saveDictationStats(stats);
  return { stats, newBadges };
};

/**
 * Sync user achievements with Firebase Realtime Database
 */
export const syncDictationStatsToFirebase = async (userId: string, stats: DictationUserStats) => {
  if (!userId) return;
  try {
    const userStatsRef = ref(db, `users/${userId}/dictationStats`);
    await set(userStatsRef, stats);
  } catch (err) {
    console.warn('Could not sync dictation stats to Firebase', err);
  }
};

/**
 * Subscribe to user achievements from Firebase Realtime Database
 */
export const subscribeToFirebaseDictationStats = (
  userId: string,
  onRemoteUpdate: (stats: DictationUserStats) => void
) => {
  if (!userId) return () => {};
  const userStatsRef = ref(db, `users/${userId}/dictationStats`);
  return onValue(userStatsRef, (snap) => {
    const val = snap.val();
    if (val) {
      const merged: DictationUserStats = {
        ...getDefaultStats(),
        ...val,
        masteredWords: val.masteredWords || {},
        badges: val.badges || {}
      };
      saveDictationStats(merged);
      onRemoteUpdate(merged);
    }
  });
};
