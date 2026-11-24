import React, { useState, useEffect, useRef } from 'react';
import { DictationItem, AppMode } from '../../types';
import DictationDashboard from './DictationDashboard';
import DictationLesson from './DictationLesson';
import { SectionNavigator } from '../common/SectionNavigator';
import { RoomShareButton } from '../common/RoomShareButton';
import { useRoom } from '../../contexts/RoomContext';

interface DictationStudioProps {
  onBack: () => void;
  onNavigate?: (mode: AppMode) => void;
}

export type DictationFlowState = 'dashboard' | 'lesson' | 'summary';

const DictationStudio: React.FC<DictationStudioProps> = ({ onBack, onNavigate }) => {
  const [flowState, setFlowState] = useState<DictationFlowState>('dashboard');
  const [lessonItems, setLessonItems] = useState<DictationItem[]>([]);
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const { roomId, isConnected, syncDictation, syncedDictation } = useRoom();

  const showToast = (msg: string, duration = 3500) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, duration);
  };

  // Synchronize incoming lesson from room partner
  useEffect(() => {
    if (syncedDictation && syncedDictation.items && syncedDictation.items.length > 0) {
      setLessonItems(syncedDictation.items);
      setTopic(syncedDictation.topic || 'Lesson');
      setLevel(syncedDictation.level || 'Custom');
      setFlowState('lesson');
      showToast(`🎯 SYNCED LESSON: ${syncedDictation.topic} (${syncedDictation.level})`);
    }
  }, [syncedDictation]);

  const handleStartLesson = (items: DictationItem[], selectedTopic: string, selectedLevel: string) => {
    setLessonItems(items);
    setTopic(selectedTopic);
    setLevel(selectedLevel);
    setFlowState('lesson');
    
    if (roomId) {
      syncDictation({ topic: selectedTopic, level: selectedLevel, items });
    }
  };

  const handleFinishLesson = () => {
    setFlowState('summary');
  };

  const handleReturnToDashboard = () => {
    setFlowState('dashboard');
    setLessonItems([]);
  };

  return (
    <div className="min-h-screen bg-[#d8d2c4] text-[#1c1d20] flex flex-col items-center justify-start overflow-y-auto font-sans p-3 sm:p-6 pb-32 relative">
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 z-50 bg-[#16171a] text-[#ebe6d8] border-2 border-[#cf573c] px-4 sm:px-5 py-2 sm:py-2.5 rounded-full font-mono text-[11px] sm:text-xs font-bold uppercase shadow-[4px_4px_0px_#18191c] flex items-center gap-2 transition-all">
          <span className="w-2.5 h-2.5 rounded-full bg-[#cf573c] animate-pulse shrink-0" />
          <span className="truncate max-w-[280px] sm:max-w-none">{toastMessage}</span>
        </div>
      )}

      <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
        
        {/* TOP BAR */}
        <header className="bg-[#e4dfd3] p-2.5 sm:p-3 rounded-lg border-2 border-[#1c1d20] shadow-[3px_3px_0px_#18191c] sm:shadow-[5px_5px_0px_#18191c] relative flex items-center justify-between gap-2">
          <div className="absolute top-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
          <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
          
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <SectionNavigator activeMode="dictation" onSelectMode={onNavigate} />
          </div>

          <div className="flex flex-col items-center text-center flex-1 min-w-0 px-1">
             <span className="font-mono text-[9px] sm:text-[10px] font-bold tracking-widest text-[#5c5950] uppercase mb-0.5 truncate max-w-full">
                AI TYPING LAB // {flowState === 'dashboard' ? 'CURRICULUM' : `${topic} - ${level}`}
             </span>
             <h1 className="font-sans text-sm sm:text-lg font-bold text-[#1c1d20] tracking-tight uppercase truncate">
               Guided Dictation
             </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 mr-1">
            <RoomShareButton 
              modeName="dictation"
              onClipSync={() => lessonItems.length > 0 && syncDictation({ topic, level, items: lessonItems })}
            />

            {flowState === 'lesson' && (
              <button
                onClick={handleReturnToDashboard}
                title="Return to Curriculum Dashboard"
                className="text-[10px] sm:text-xs font-mono font-bold uppercase bg-[#476171] hover:bg-[#374c59] text-[#fbf8f2] border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-md transition-all active:translate-y-0.5 active:shadow-none"
              >
                TOPICS 📚
              </button>
            )}
          </div>
        </header>

        {flowState === 'dashboard' && (
          <DictationDashboard onStartLesson={handleStartLesson} />
        )}

        {flowState === 'lesson' && (
          <DictationLesson 
            items={lessonItems} 
            onFinish={handleFinishLesson} 
          />
        )}

        {flowState === 'summary' && (
          <div className="bg-[#e4dfd3] p-6 rounded-lg border-2 border-[#1c1d20] shadow-[5px_5px_0px_#18191c] relative flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
            <div className="absolute top-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
            <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>
            <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0]">+</div>

            <h2 className="text-3xl font-mono font-bold text-[#3d7a4d] mb-2 uppercase tracking-wide">Done!</h2>
            <p className="font-mono text-sm font-bold text-[#5c5950] mb-8 uppercase">Session Complete</p>

            <div className="w-full max-w-xl text-left mb-6">
              <h3 className="font-mono text-xs font-bold text-[#1c1d20] mb-3 uppercase tracking-wider">YOUR NEW WORDS</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {lessonItems.map((item, i) => (
                  <div key={i} className="bg-[#ebe6d8] p-3 rounded border-2 border-[#1c1d20] shadow-[2px_2px_0px_#1c1d20] flex flex-col">
                    <span className="font-sans font-bold text-base text-[#1c1d20]">{item.word}</span>
                    <span className="font-mono text-xs text-[#5c5950] mt-1">{item.translation}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleReturnToDashboard}
              className="bg-[#3d7a4d] hover:bg-[#2e5e3a] text-white px-8 py-3 rounded border-2 border-[#1c1d20] shadow-[4px_4px_0px_#18191c] font-mono text-sm font-bold uppercase transition-all active:translate-y-1 active:shadow-[0px_0px_0px_#18191c]"
            >
              CHOOSE NEXT TOPIC 🚀
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default DictationStudio;
