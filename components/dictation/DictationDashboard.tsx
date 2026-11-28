import React, { useState, useEffect } from 'react';
import { DictationItem, AppLanguage } from '../../types';
import { getCuratedDictationItems } from '../../data/dictation';
import { generateDictationLesson } from '../../services/geminiService';
import { fetchDictationAudio } from './DictationLesson';
import { getDictationStats } from '../../services/dictationStorage';

interface DictationDashboardProps {
  onStartLesson: (items: DictationItem[], topic: string, level: string) => void;
  onOpenAchievements?: () => void;
}

export const TOPICS = [
  "New Adjectives",
  "New Verbs (Regular & Irregular)",
  "New Subjects (Nouns)",
  "Adverbs of Frequency & Manner",
  "Idiomatic Expressions",
  "Phrasal Verbs / Compound Verbs",
  "Advanced Connectors & Conjunctions",
  "Prepositions of Place & Time"
];

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const LANGUAGES: AppLanguage[] = ["English", "French"];

const DictationDashboard: React.FC<DictationDashboardProps> = ({ onStartLesson, onOpenAchievements }) => {
  const [selectedTopic, setSelectedTopic] = useState<string>('New Adjectives');
  const [selectedLevel, setSelectedLevel] = useState<string>('B1');
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>('English');
  const [useAiGenerator, setUseAiGenerator] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const stats = getDictationStats();

  // Preview curated items based on current selection
  const curatedPreview = React.useMemo(() => {
    return getCuratedDictationItems({
      language: selectedLanguage,
      level: selectedLevel,
      topic: selectedTopic,
      count: 10
    });
  }, [selectedLanguage, selectedLevel, selectedTopic]);

  // Speculative early audio preload for first word
  useEffect(() => {
    if (curatedPreview.length > 0) {
      try {
        fetchDictationAudio(curatedPreview[0].word, `0-word`).catch(() => {});
      } catch (_) {}
    }
  }, [curatedPreview]);

  const handleStart = async () => {
    if (!selectedTopic) {
      setError("Please select a lexical focus first.");
      return;
    }
    setError('');

    if (useAiGenerator) {
      setIsLoading(true);
      try {
        const aiItems = await generateDictationLesson(selectedTopic, selectedLevel, selectedLanguage);
        if (aiItems && aiItems.length > 0) {
          onStartLesson(aiItems, selectedTopic, selectedLevel);
        } else {
          // Fallback to curated
          onStartLesson(curatedPreview, selectedTopic, selectedLevel);
        }
      } catch (err: any) {
        console.warn("AI generation error, falling back to curated library", err);
        onStartLesson(curatedPreview, selectedTopic, selectedLevel);
      } finally {
        setIsLoading(false);
      }
    } else {
      // 100% Curated, pre-existing words with intuitive phonetic pronunciation!
      onStartLesson(curatedPreview, selectedTopic, selectedLevel);
    }
  };

  return (
    <div className="bg-[#e4dfd3] p-5 sm:p-7 rounded-2xl border-2 border-[#1c1d20] shadow-[5px_5px_0px_#18191c] relative">
      <div className="absolute top-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
      <div className="absolute top-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
      <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
      <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>

      {/* Header with Achievements Callout */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 pb-4 border-b-2 border-[#1c1d20]/20">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold font-sans uppercase tracking-tight text-[#1c1d20]">
            Curated Dictation Library
          </h2>
          <p className="font-mono text-xs text-[#5c5950] mt-0.5">
            Pre-curated words with intuitive phonetic respelling (e.g. <span className="font-bold text-[#cf573c]">spuh-SIF-ik</span>)
          </p>
        </div>

        {onOpenAchievements && (
          <button
            onClick={onOpenAchievements}
            className="flex items-center gap-2 bg-[#1c1d20] hover:bg-[#3d7a4d] text-[#e4dfd3] px-3.5 py-1.5 rounded-lg border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] font-mono text-xs font-bold uppercase transition-all shrink-0 active:translate-y-0.5"
          >
            <span>🏆</span>
            <span>Word Bank ({stats.totalMasteredWords})</span>
          </button>
        )}
      </div>

      {/* 1. Target Language */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-mono text-xs sm:text-sm font-bold text-[#1c1d20] uppercase tracking-wider">
            1. Target Language
          </h3>
          <span className="font-mono text-[10px] text-[#7a776e] uppercase">
            Curated Lexicon
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map(lang => (
            <button
              key={lang}
              onClick={() => setSelectedLanguage(lang)}
              className={`px-6 py-2.5 font-mono text-xs font-bold uppercase border-2 border-[#1c1d20] rounded-lg transition-all ${
                selectedLanguage === lang 
                  ? 'bg-[#1c1d20] text-[#e4dfd3] shadow-[2px_2px_0px_#1c1d20] translate-y-0.5' 
                  : 'bg-[#ebe6d8] text-[#4d4a43] hover:bg-[#c5bfb0] shadow-[2px_2px_0px_#1c1d20] hover:translate-y-0.5'
              }`}
            >
              {lang === 'English' ? '🇬🇧 English' : '🇫🇷 French'}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Target Level */}
      <div className="mb-6">
        <h3 className="font-mono text-xs sm:text-sm font-bold text-[#1c1d20] uppercase tracking-wider mb-2">
          2. CEFR Level
        </h3>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map(lvl => (
            <button
              key={lvl}
              onClick={() => setSelectedLevel(lvl)}
              className={`px-4 sm:px-5 py-2 font-mono text-xs font-bold uppercase border-2 border-[#1c1d20] rounded-lg transition-all ${
                selectedLevel === lvl 
                  ? 'bg-[#3d7a4d] text-white shadow-[2px_2px_0px_#1c1d20] translate-y-0.5' 
                  : 'bg-[#ebe6d8] text-[#4d4a43] hover:bg-[#c5bfb0] shadow-[2px_2px_0px_#1c1d20] hover:translate-y-0.5'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Lexical Focus */}
      <div className="mb-6">
        <h3 className="font-mono text-xs sm:text-sm font-bold text-[#1c1d20] uppercase tracking-wider mb-2">
          3. Lexical Focus Category
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {TOPICS.map(t => {
            const isSelected = selectedTopic === t;
            return (
              <button
                key={t}
                onClick={() => setSelectedTopic(t)}
                className={`p-3 text-left font-mono text-xs font-bold uppercase border-2 border-[#1c1d20] rounded-lg transition-all flex items-center justify-between ${
                  isSelected 
                    ? 'bg-[#cf573c] text-white shadow-[2px_2px_0px_#1c1d20] translate-y-0.5' 
                    : 'bg-[#ebe6d8] text-[#4d4a43] hover:bg-[#c5bfb0] shadow-[2px_2px_0px_#1c1d20] hover:translate-y-0.5'
                }`}
              >
                <span className="truncate pr-2">{t}</span>
                {isSelected && <span className="shrink-0 font-bold">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Challenge Preview Box */}
      <div className="mb-6 bg-[#16171a] text-[#ebe6d8] p-4 rounded-xl border-2 border-[#2b2d33] shadow-[3px_3px_0px_#1c1d20]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#3d7a4d] animate-pulse" />
            <span className="font-mono text-xs font-bold uppercase text-[#e89271]">
              10-Word Challenge Ready (Pre-Loaded)
            </span>
          </div>
          <span className="font-mono text-[11px] text-[#8d8f99]">
            {curatedPreview.length} words queued
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          {curatedPreview.slice(0, 6).map((item, idx) => (
            <span 
              key={idx}
              className="bg-[#22242a] text-[#ebe6d8] border border-[#31343f] px-2.5 py-1 rounded text-[11px] font-mono flex items-center gap-1.5"
            >
              <span className="text-[#e89271] font-bold">{item.word}</span>
              {item.pronunciation && (
                <span className="text-[#8d8f99] text-[10px]">({item.pronunciation})</span>
              )}
            </span>
          ))}
          {curatedPreview.length > 6 && (
            <span className="text-[11px] font-mono text-[#8d8f99] self-center pl-1">
              +{curatedPreview.length - 6} more
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-[#cf573c]/20 border-2 border-[#cf573c] rounded p-3 text-xs font-mono text-[#1c1d20] font-bold shadow-[2px_2px_0px_#cf573c]">
          {error}
        </div>
      )}

      {/* Main Start Button */}
      <button
        onClick={handleStart}
        disabled={isLoading || !selectedTopic}
        className="w-full bg-[#1c1d20] text-[#e4dfd3] py-4 rounded-xl border-2 border-[#1c1d20] shadow-[4px_4px_0px_#4d4a43] hover:bg-[#3d7a4d] hover:text-white disabled:opacity-50 font-mono text-sm font-bold uppercase tracking-widest transition-all active:translate-y-1 active:shadow-none mb-3"
      >
        {isLoading ? 'PREPARING LESSON...' : 'START 10-WORD CHALLENGE 🚀'}
      </button>

      {/* Optional Mode Switch */}
      <div className="flex items-center justify-center gap-2 pt-2 text-[11px] font-mono text-[#5c5950]">
        <span>Mode:</span>
        <button
          onClick={() => setUseAiGenerator(!useAiGenerator)}
          className="underline hover:text-[#1c1d20] transition-colors"
        >
          {useAiGenerator ? '🤖 AI Dynamic Generation (Click to switch to Curated Offline Bank)' : '📚 Offline Curated Bank (Instant, Pre-categorized)'}
        </button>
      </div>

    </div>
  );
};

export default DictationDashboard;
