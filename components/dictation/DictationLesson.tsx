import React, { useState, useEffect, useRef } from 'react';
import { DictationItem, DictationAchievementBadge } from '../../types';
import GuidedInput from './GuidedInput';
import DictationCard from './DictationCard';
import ShadowMicButton from './ShadowMicButton';
import { getApiKey } from '../../services/geminiService';
import { streamSpeechLive } from '../../services/liveAudioService';
import { playPcmBuffer } from '../../utils/audio';
import { recordWordMastery, recordSessionCompletion } from '../../services/dictationStorage';

interface DictationLessonProps {
  items: DictationItem[];
  onFinish: () => void;
  onBadgeEarned?: (badge: DictationAchievementBadge) => void;
}

export const globalAudioCache: Record<string, Uint8Array> = {};
export const globalAudioPromises: Record<string, Promise<Uint8Array>> = {};

export const fetchDictationAudio = (text: string, cacheKey: string): Promise<Uint8Array> => {
  if (globalAudioCache[cacheKey]) return Promise.resolve(globalAudioCache[cacheKey]);
  if (globalAudioPromises[cacheKey]) return globalAudioPromises[cacheKey];
  
  const apiKey = getApiKey();
  const promise = new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    streamSpeechLive(
      text, apiKey,
      (chunk) => chunks.push(chunk),
      () => {
        const totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const c of chunks) {
          combined.set(c, offset);
          offset += c.length;
        }
        globalAudioCache[cacheKey] = combined;
        resolve(combined);
      }
    ).catch((err) => {
      delete globalAudioPromises[cacheKey]; // allow retry
      reject(err);
    });
  });
  
  globalAudioPromises[cacheKey] = promise;
  return promise;
};

const DictationLesson: React.FC<DictationLessonProps> = ({ items, onFinish, onBadgeEarned }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<'word' | 'sentence'>('word');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  const [showWordHelp, setShowWordHelp] = useState(false);
  const [showSentenceHelp, setShowSentenceHelp] = useState(false);
  const [peekSpelling, setPeekSpelling] = useState(false);
  const [achievementToast, setAchievementToast] = useState<DictationAchievementBadge | null>(null);

  const totalHintsUsedRef = useRef<number>(0);
  const toastTimeoutRef = useRef<number | null>(null);

  const currentItem = items[currentIndex] || items[0];

  const fetchAudio = (idx: number, targetPhase: 'word' | 'sentence'): Promise<Uint8Array> => {
    const key = `${idx}-${targetPhase}`;
    const targetText = targetPhase === 'word' ? items[idx]?.word : items[idx]?.sentence;
    if (!targetText) return Promise.reject(new Error("No target text"));
    return fetchDictationAudio(targetText, key);
  };

  const preloadNext = (idx: number, currentPhase: 'word' | 'sentence') => {
    if (currentPhase === 'word') {
      fetchAudio(idx, 'sentence').catch(() => {});
    } else {
      if (idx + 1 < items.length) {
        fetchAudio(idx + 1, 'word').catch(() => {});
      }
    }
  };

  const loadAndPlayAudio = async (targetPhase: 'word' | 'sentence', idx: number = currentIndex) => {
    setIsPlayingAudio(true);
    preloadNext(idx, targetPhase);
    try {
      const combined = await fetchAudio(idx, targetPhase);
      await playPcmBuffer(combined, () => {
        setIsPlayingAudio(false);
      });
    } catch (e) {
      console.warn("Failed to stream live audio", e);
      setIsPlayingAudio(false);
    }
  };

  useEffect(() => {
    setShowWordHelp(false);
    setShowSentenceHelp(false);
    setPeekSpelling(false);
    setPhase('word');
    loadAndPlayAudio('word');
  }, [currentIndex]);

  const showAchievementNotification = (badge: DictationAchievementBadge) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setAchievementToast(badge);
    if (onBadgeEarned) onBadgeEarned(badge);
    toastTimeoutRef.current = window.setTimeout(() => {
      setAchievementToast(null);
    }, 4500);
  };

  const handleWordCorrect = () => {
    if (phase === 'word') {
      // Record word mastery in achievements storage!
      const { newBadges } = recordWordMastery(currentItem, showWordHelp);
      if (newBadges.length > 0) {
        showAchievementNotification(newBadges[0]);
      }

      setTimeout(() => {
        setPhase('sentence');
        loadAndPlayAudio('sentence');
      }, 500);
    }
  };

  const handleSentenceCorrect = () => {
    setTimeout(() => {
      if (currentIndex < items.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setPhase('word');
      } else {
        // Completed all words in this challenge!
        const { newBadges } = recordSessionCompletion(totalHintsUsedRef.current);
        if (newBadges.length > 0) {
          showAchievementNotification(newBadges[0]);
        }
        onFinish();
      }
    }, 1200);
  };

  const isWordPhase = phase === 'word';
  const isSentencePhase = phase === 'sentence';

  return (
    <div className="w-full flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300 relative">
      
      {/* Floating Achievement Banner */}
      {achievementToast && (
        <div className="fixed top-20 z-50 bg-[#16171a] text-[#ebe6d8] border-2 border-[#3d7a4d] px-5 py-3 rounded-2xl shadow-[6px_6px_0px_#18191c] flex items-center gap-3 animate-bounce">
          <span className="text-3xl">{achievementToast.icon}</span>
          <div>
            <div className="text-[10px] font-mono font-bold uppercase text-[#3d7a4d]">
              ACHIEVEMENT UNLOCKED!
            </div>
            <div className="font-sans font-bold text-sm text-[#f29e7e]">
              {achievementToast.title}
            </div>
            <div className="text-[11px] text-[#cfcbbe]">
              {achievementToast.description}
            </div>
          </div>
        </div>
      )}

      {/* HIGH-FIDELITY CHALLENGE CARD (Matches User Image >= 95% Fidelity) */}
      <DictationCard
        item={currentItem}
        currentIndex={currentIndex}
        totalCount={items.length}
        isPlayingAudio={isPlayingAudio && isWordPhase}
        onPlayAudio={() => loadAndPlayAudio('word')}
        showWordHint={peekSpelling || showWordHelp}
        onToggleWordHint={() => setPeekSpelling(!peekSpelling)}
      />

      {/* INTERACTIVE INPUT WORKSPACE */}
      <div className="w-full max-w-2xl bg-[#e4dfd3] p-5 sm:p-7 rounded-2xl border-2 border-[#1c1d20] shadow-[5px_5px_0px_#18191c] relative flex flex-col items-center gap-5">
        <div className="absolute top-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
        <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
        <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>

        {/* Phase Indicator */}
        <div className="flex items-center justify-between w-full border-b border-[#c5bfb0] pb-2">
          <span className="font-mono text-xs font-bold uppercase text-[#5c5950] tracking-wider">
            STEP {isWordPhase ? '1: SPELL THE WORD' : '2: IN CONTEXT SENTENCE'}
          </span>
          <span className="font-mono text-xs font-bold text-[#cf573c] bg-[#1c1d20] px-2 py-0.5 rounded shadow-[1px_1px_0px_#cf573c]">
            {currentItem.translation}
          </span>
        </div>

        {/* WORD INPUT ROW */}
        <div className="w-full flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => loadAndPlayAudio('word')}
            disabled={isPlayingAudio}
            title="Hear word again (Read)"
            className={`w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 flex items-center justify-center border-2 border-[#1c1d20] rounded-xl shadow-[2px_2px_0px_#1c1d20] transition-all active:translate-y-0.5 active:shadow-none ${
              isPlayingAudio && isWordPhase ? 'bg-[#c5bfb0]' : 'bg-[#ebe6d8] hover:bg-[#c5bfb0]'
            }`}
          >
            {isPlayingAudio && isWordPhase ? (
              <svg className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
            ) : (
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
            )}
          </button>

          {/* Shadowing Record Button */}
          <ShadowMicButton variant="input" targetText={currentItem.word} />

          <div className="flex-1 overflow-x-auto">
            <GuidedInput 
              targetText={currentItem.word} 
              onSuccess={handleWordCorrect} 
              showHelp={showWordHelp}
              disabled={isSentencePhase}
              forceComplete={isSentencePhase}
            />
          </div>

          <button
            onClick={() => {
              setShowWordHelp(true);
              totalHintsUsedRef.current += 1;
            }}
            disabled={isSentencePhase}
            className="w-9 h-9 sm:w-11 sm:h-11 flex-shrink-0 flex items-center justify-center border-2 border-[#1c1d20] rounded-xl bg-[#ebe6d8] hover:bg-[#cf573c] hover:text-white shadow-[2px_2px_0px_#1c1d20] transition-all active:translate-y-0.5 active:shadow-none text-[#7a776e] disabled:opacity-40"
            title="Auto-fill hint"
          >
            <span className="font-mono font-bold text-xs">?</span>
          </button>
        </div>

        {/* SENTENCE INPUT ROW */}
        <div className={`w-full flex items-center gap-2 sm:gap-3 transition-all duration-500 ${isSentencePhase ? 'opacity-100 translate-y-0' : 'opacity-35 pointer-events-none translate-y-1'}`}>
          <button
            onClick={() => loadAndPlayAudio('sentence')}
            disabled={isPlayingAudio || !isSentencePhase}
            title="Hear sentence again"
            className={`w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 flex items-center justify-center border-2 border-[#1c1d20] rounded-xl shadow-[2px_2px_0px_#1c1d20] transition-all active:translate-y-0.5 active:shadow-none ${
              isPlayingAudio && isSentencePhase ? 'bg-[#c5bfb0]' : 'bg-[#ebe6d8] hover:bg-[#c5bfb0]'
            }`}
          >
            {isPlayingAudio && isSentencePhase ? (
              <svg className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
            ) : (
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
            )}
          </button>

          <div className="flex-1 overflow-x-auto">
            <GuidedInput 
              targetText={currentItem.sentence} 
              onSuccess={handleSentenceCorrect} 
              showHelp={showSentenceHelp}
              disabled={!isSentencePhase}
            />
          </div>

          <button
            onClick={() => {
              setShowSentenceHelp(true);
              totalHintsUsedRef.current += 1;
            }}
            disabled={!isSentencePhase}
            className="w-9 h-9 sm:w-11 sm:h-11 flex-shrink-0 flex items-center justify-center border-2 border-[#1c1d20] rounded-xl bg-[#ebe6d8] hover:bg-[#cf573c] hover:text-white shadow-[2px_2px_0px_#1c1d20] transition-all active:translate-y-0.5 active:shadow-none text-[#7a776e] disabled:opacity-40"
            title="Auto-fill hint"
          >
            <span className="font-mono font-bold text-xs">?</span>
          </button>
        </div>

      </div>

    </div>
  );
};

export default DictationLesson;
