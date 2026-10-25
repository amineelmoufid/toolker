import React, { useState } from 'react';
import { DictationItem, AppLanguage } from '../../types';
import { generateDictationLesson } from '../../services/geminiService';
import { fetchDictationAudio } from './DictationLesson';

interface DictationDashboardProps {
  onStartLesson: (items: DictationItem[], topic: string, level: string) => void;
}

const TOPICS = [
  "New Verbs (Regular & Irregular)",
  "New Subjects (Nouns)",
  "New Adjectives",
  "Adverbs of Frequency & Manner",
  "Idiomatic Expressions",
  "Phrasal Verbs / Compound Verbs",
  "Advanced Connectors & Conjunctions",
  "Prepositions of Place & Time"
];

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const LANGUAGES: AppLanguage[] = ["English", "French"];

const DictationDashboard: React.FC<DictationDashboardProps> = ({ onStartLesson }) => {
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('A2');
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>('English');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  const speculativeLessonRef = React.useRef<{
    topic: string, level: string, language: string,
    promise: Promise<DictationItem[]>
  } | null>(null);

  // Magic Step 1: Speculative Text Generation
  React.useEffect(() => {
    if (selectedTopic && selectedLevel && selectedLanguage) {
      speculativeLessonRef.current = {
        topic: selectedTopic,
        level: selectedLevel,
        language: selectedLanguage,
        promise: generateDictationLesson(selectedTopic, selectedLevel, selectedLanguage)
      };
    }
  }, [selectedTopic, selectedLevel, selectedLanguage]);

  const handleGenerate = async () => {
    if (!selectedTopic) {
      setError("Please select a target area first.");
      return;
    }
    setError('');
    setIsGenerating(true);

    try {
      let items: DictationItem[];
      
      const spec = speculativeLessonRef.current;
      if (spec && spec.topic === selectedTopic && spec.level === selectedLevel && spec.language === selectedLanguage) {
         items = await spec.promise;
      } else {
         items = await generateDictationLesson(selectedTopic, selectedLevel, selectedLanguage);
      }

      if (items.length > 0) {
        // Magic Step 2 & 3: Gatekeeper / Early Audio Preload
        try {
          // fetchDictationAudio returns instantly if cached, or opens the connection
          // and streams the audio. By the time we switch to the DictationLesson, 
          // the audio for the first word is already in RAM!
          await fetchDictationAudio(items[0].word, `0-word`);
        } catch (e) {
          console.warn("Audio pre-fetch failed, continuing to lesson anyway", e);
        }
        
        onStartLesson(items, selectedTopic, selectedLevel);
      } else {
        setError("Failed to generate vocabulary. Please try again.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate lesson.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-[#e4dfd3] p-5 sm:p-7 rounded-lg border-2 border-[#1c1d20] shadow-[5px_5px_0px_#18191c] relative">
      <div className="absolute top-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
      <div className="absolute top-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
      <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
      <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>

      {/* Target Language */}
      <div className="mb-6">
        <h2 className="font-mono text-sm font-bold text-[#1c1d20] uppercase tracking-wider mb-2">1. Target Language</h2>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map(lang => (
            <button
              key={lang}
              onClick={() => setSelectedLanguage(lang)}
              className={`px-6 py-2 font-mono text-xs font-bold uppercase border-2 border-[#1c1d20] rounded transition-all ${
                selectedLanguage === lang 
                  ? 'bg-[#1c1d20] text-[#e4dfd3] shadow-[2px_2px_0px_#1c1d20] translate-y-0.5' 
                  : 'bg-[#ebe6d8] text-[#4d4a43] hover:bg-[#c5bfb0] shadow-[2px_2px_0px_#1c1d20] hover:translate-y-0.5 hover:shadow-[1px_1px_0px_#1c1d20]'
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      {/* Target Level */}
      <div className="mb-6">
        <h2 className="font-mono text-sm font-bold text-[#1c1d20] uppercase tracking-wider mb-2">2. CEFR Level</h2>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map(lvl => (
            <button
              key={lvl}
              onClick={() => setSelectedLevel(lvl)}
              className={`px-4 py-2 font-mono text-xs font-bold uppercase border-2 border-[#1c1d20] rounded transition-all ${
                selectedLevel === lvl 
                  ? 'bg-[#3d7a4d] text-white shadow-[2px_2px_0px_#1c1d20] translate-y-0.5' 
                  : 'bg-[#ebe6d8] text-[#4d4a43] hover:bg-[#c5bfb0] shadow-[2px_2px_0px_#1c1d20] hover:translate-y-0.5 hover:shadow-[1px_1px_0px_#1c1d20]'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Target Area */}
      <div className="mb-8">
        <h2 className="font-mono text-sm font-bold text-[#1c1d20] uppercase tracking-wider mb-2">3. Lexical Focus</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TOPICS.map(t => (
            <button
              key={t}
              onClick={() => setSelectedTopic(t)}
              className={`p-3 text-left font-mono text-xs font-bold uppercase border-2 border-[#1c1d20] rounded transition-all flex items-center justify-between ${
                selectedTopic === t 
                  ? 'bg-[#cf573c] text-white shadow-[2px_2px_0px_#1c1d20] translate-y-0.5' 
                  : 'bg-[#ebe6d8] text-[#4d4a43] hover:bg-[#c5bfb0] shadow-[2px_2px_0px_#1c1d20] hover:translate-y-0.5 hover:shadow-[1px_1px_0px_#1c1d20]'
              }`}
            >
              <span>{t}</span>
              {selectedTopic === t && <span>✓</span>}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-[#cf573c]/20 border-2 border-[#cf573c] rounded p-3 text-xs font-mono text-[#1c1d20] font-bold shadow-[2px_2px_0px_#cf573c]">
          {error}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={isGenerating || !selectedTopic}
        className="w-full bg-[#1c1d20] text-[#e4dfd3] py-4 rounded border-2 border-[#1c1d20] shadow-[4px_4px_0px_#4d4a43] hover:bg-[#3d7a4d] hover:text-white disabled:opacity-50 font-mono text-sm font-bold uppercase tracking-widest transition-all active:translate-y-1 active:shadow-none"
      >
        {isGenerating ? 'GENERATING LESSON...' : 'START DICTATION LESSON'}
      </button>

    </div>
  );
};

export default DictationDashboard;
