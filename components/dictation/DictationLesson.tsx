import React, { useState, useEffect } from 'react';
import { DictationItem } from '../../types';
import GuidedInput from './GuidedInput';
import { getApiKey } from '../../services/geminiService';
import { streamSpeechLive } from '../../services/liveAudioService';
import { playPcmBuffer } from '../../utils/audio';

interface DictationLessonProps {
  items: DictationItem[];
  onFinish: () => void;
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

const DictationLesson: React.FC<DictationLessonProps> = ({ items, onFinish }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<'word' | 'sentence'>('word');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  const [showWordHelp, setShowWordHelp] = useState(false);
  const [showSentenceHelp, setShowSentenceHelp] = useState(false);
  
  const currentItem = items[currentIndex];

  const fetchAudio = (idx: number, targetPhase: 'word' | 'sentence'): Promise<Uint8Array> => {
    const key = `${idx}-${targetPhase}`;
    const targetText = targetPhase === 'word' ? items[idx].word : items[idx].sentence;
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
    // Kick off prefetching for the next item immediately
    preloadNext(idx, targetPhase);
    try {
      const combined = await fetchAudio(idx, targetPhase);
      await playPcmBuffer(combined, () => {
        setIsPlayingAudio(false);
      });
    } catch (e) {
      console.error("Failed to stream live audio", e);
      setIsPlayingAudio(false);
    }
  };

  useEffect(() => {
    setShowWordHelp(false);
    setShowSentenceHelp(false);
    loadAndPlayAudio('word');
  }, [currentIndex]);

  const handleWordCorrect = () => {
    if (phase === 'word') {
      setTimeout(() => {
        setPhase('sentence');
        loadAndPlayAudio('sentence');
      }, 500);
    }
  };

  const handleSentenceCorrect = () => {
    // Both correct!
    setTimeout(() => {
      if (currentIndex < items.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setPhase('word');
      } else {
        onFinish();
      }
    }, 1500);
  };

  const isWordPhase = phase === 'word';
  const isSentencePhase = phase === 'sentence';
  const bothCompleted = isSentencePhase && showSentenceHelp; // Note: actual completion tracked by the GuidedInput, but this is an approximation. We will rely on handleSentenceCorrect for the actual transition.

  const progressPercentage = ((currentIndex + (isSentencePhase ? 0.5 : 0)) / items.length) * 100;

  return (
    <div className="bg-[#e4dfd3] p-5 sm:p-8 rounded-lg border-2 border-[#1c1d20] shadow-[5px_5px_0px_#18191c] relative flex flex-col items-center animate-in fade-in zoom-in duration-300">
      <div className="absolute top-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
      <div className="absolute top-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
      <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
      <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>

      {/* Progress Bar */}
      <div className="w-full mb-8 flex items-center gap-4">
        <span className="font-mono text-[10px] font-bold text-[#7a776e]">&lt;</span>
        <div className="flex-1 h-2 bg-[#ebe6d8] border border-[#1c1d20] rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#3d7a4d] transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <span className="font-mono text-[10px] font-bold text-[#7a776e] uppercase">
          {currentIndex + 1} / {items.length}
        </span>
      </div>

      {/* Translation Hint */}
      <div className="mb-10 text-center">
        <span className="font-mono text-xs font-bold text-[#cf573c] uppercase tracking-wider bg-[#1c1d20] px-3 py-1 rounded shadow-[2px_2px_0px_#cf573c]">
          {currentItem.translation}
        </span>
      </div>

      {/* Input Area */}
      <div className="w-full flex flex-col items-center justify-center gap-4">
        
        {/* WORD INPUT ROW */}
        <div className="flex items-center gap-2 sm:gap-3 w-full max-w-lg">
          <button
            onClick={() => loadAndPlayAudio('word')}
            disabled={isPlayingAudio}
            className={`w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 flex items-center justify-center border-2 border-[#1c1d20] rounded-lg shadow-[2px_2px_0px_#1c1d20] transition-all active:translate-y-0.5 active:shadow-none ${
              isPlayingAudio && isWordPhase ? 'bg-[#c5bfb0]' : 'bg-[#ebe6d8] hover:bg-[#c5bfb0]'
            }`}
          >
            {isPlayingAudio && isWordPhase ? (
              <svg className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
            ) : (
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
            )}
          </button>

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
            onClick={() => setShowWordHelp(true)}
            disabled={isSentencePhase}
            className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 flex items-center justify-center border-2 border-[#1c1d20] rounded-full bg-[#ebe6d8] hover:bg-[#cf573c] hover:text-white shadow-[2px_2px_0px_#1c1d20] transition-all active:translate-y-0.5 active:shadow-none text-[#7a776e] disabled:opacity-50"
            title="Show Hint"
          >
            <span className="font-mono font-bold text-xs">?</span>
          </button>
        </div>

        {/* SENTENCE INPUT ROW */}
        <div className={`flex items-center gap-2 sm:gap-3 w-full max-w-2xl transition-all duration-500 ${isSentencePhase ? 'opacity-100 translate-y-0' : 'opacity-30 pointer-events-none translate-y-2'}`}>
          <button
            onClick={() => loadAndPlayAudio('sentence')}
            disabled={isPlayingAudio || !isSentencePhase}
            className={`w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 flex items-center justify-center border-2 border-[#1c1d20] rounded-lg shadow-[2px_2px_0px_#1c1d20] transition-all active:translate-y-0.5 active:shadow-none ${
              isPlayingAudio && isSentencePhase ? 'bg-[#c5bfb0]' : 'bg-[#ebe6d8] hover:bg-[#c5bfb0]'
            }`}
          >
            {isPlayingAudio && isSentencePhase ? (
              <svg className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
            ) : (
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
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
            onClick={() => setShowSentenceHelp(true)}
            disabled={!isSentencePhase}
            className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 flex items-center justify-center border-2 border-[#1c1d20] rounded-full bg-[#ebe6d8] hover:bg-[#cf573c] hover:text-white shadow-[2px_2px_0px_#1c1d20] transition-all active:translate-y-0.5 active:shadow-none text-[#7a776e] disabled:opacity-50"
            title="Show Hint"
          >
            <span className="font-mono font-bold text-xs">?</span>
          </button>
        </div>
      </div>

    </div>
  );
};

export default DictationLesson;
