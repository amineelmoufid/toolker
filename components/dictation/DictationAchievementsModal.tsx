import React, { useState } from 'react';
import { DictationUserStats, AppLanguage } from '../../types';
import { DICTATION_BADGES } from '../../services/dictationStorage';
import { renderPhoneticSyllables } from './DictationCard';
import { fetchDictationAudio } from './DictationLesson';
import { playPcmBuffer } from '../../utils/audio';

interface DictationAchievementsModalProps {
  stats: DictationUserStats;
  onClose: () => void;
}

export const DictationAchievementsModal: React.FC<DictationAchievementsModalProps> = ({ stats, onClose }) => {
  const [activeTab, setActiveTab] = useState<'words' | 'badges'>('words');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguageFilter, setSelectedLanguageFilter] = useState<'All' | AppLanguage>('All');
  const [playingWord, setPlayingWord] = useState<string | null>(null);

  const masteredList = Object.values(stats.masteredWords || {}).sort((a, b) => b.masteredAt - a.masteredAt);

  const filteredWords = masteredList.filter(item => {
    const matchesSearch = item.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.definition.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.translation.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLang = selectedLanguageFilter === 'All' || item.language === selectedLanguageFilter;
    return matchesSearch && matchesLang;
  });

  const handlePlayAudio = async (text: string, id: string) => {
    try {
      setPlayingWord(id);
      const audioBuffer = await fetchDictationAudio(text, `achievement-${id}`);
      await playPcmBuffer(audioBuffer, () => {
        setPlayingWord(null);
      });
    } catch (e) {
      console.warn('Could not play audio for word', e);
      setPlayingWord(null);
    }
  };

  const unlockedBadgeCount = Object.keys(stats.badges || {}).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#e4dfd3] w-full max-w-4xl max-h-[90vh] rounded-2xl border-3 border-[#1c1d20] shadow-[8px_8px_0px_#18191c] flex flex-col overflow-hidden relative text-[#1c1d20]">
        
        {/* Top Header */}
        <div className="p-4 sm:p-6 border-b-2 border-[#1c1d20] bg-[#ebe6d8] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl sm:text-4xl">🏆</span>
            <div>
              <h2 className="text-lg sm:text-2xl font-bold font-sans uppercase tracking-tight text-[#1c1d20]">
                Word Bank & Achievements
              </h2>
              <p className="font-mono text-xs text-[#5c5950] font-bold">
                {stats.totalMasteredWords} MASTERED WORDS // {stats.currentStreak} DAY STREAK 🔥
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg border-2 border-[#1c1d20] bg-[#c5bfb0] hover:bg-[#cf573c] hover:text-white font-mono font-bold text-sm shadow-[2px_2px_0px_#1c1d20] transition-all flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Quick Stats Summary Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 sm:p-4 bg-[#d8d2c4] border-b-2 border-[#1c1d20]">
          <div className="bg-[#ebe6d8] p-2.5 rounded-lg border-2 border-[#1c1d20] text-center shadow-[2px_2px_0px_#1c1d20]">
            <span className="text-[10px] font-mono font-bold uppercase text-[#5c5950]">Total Mastered</span>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#3d7a4d]">
              {stats.totalMasteredWords}
            </div>
          </div>
          <div className="bg-[#ebe6d8] p-2.5 rounded-lg border-2 border-[#1c1d20] text-center shadow-[2px_2px_0px_#1c1d20]">
            <span className="text-[10px] font-mono font-bold uppercase text-[#5c5950]">Current Streak</span>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#cf573c]">
              {stats.currentStreak} {stats.currentStreak === 1 ? 'day' : 'days'}
            </div>
          </div>
          <div className="bg-[#ebe6d8] p-2.5 rounded-lg border-2 border-[#1c1d20] text-center shadow-[2px_2px_0px_#1c1d20]">
            <span className="text-[10px] font-mono font-bold uppercase text-[#5c5950]">Sessions Done</span>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#1c1d20]">
              {stats.totalSessionsCompleted}
            </div>
          </div>
          <div className="bg-[#ebe6d8] p-2.5 rounded-lg border-2 border-[#1c1d20] text-center shadow-[2px_2px_0px_#1c1d20]">
            <span className="text-[10px] font-mono font-bold uppercase text-[#5c5950]">Badges Earned</span>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#476171]">
              {unlockedBadgeCount} / {DICTATION_BADGES.length}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b-2 border-[#1c1d20] bg-[#e4dfd3] px-4 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('words')}
            className={`px-4 py-2 font-mono text-xs font-bold uppercase rounded-t-lg border-t-2 border-l-2 border-r-2 border-[#1c1d20] transition-all ${
              activeTab === 'words' 
                ? 'bg-[#ebe6d8] text-[#1c1d20] -mb-[2px] shadow-[0px_-2px_0px_#1c1d20]' 
                : 'bg-[#c5bfb0] text-[#5c5950] hover:bg-[#d8d2c4]'
            }`}
          >
            📖 Mastered Words ({masteredList.length})
          </button>
          <button
            onClick={() => setActiveTab('badges')}
            className={`px-4 py-2 font-mono text-xs font-bold uppercase rounded-t-lg border-t-2 border-l-2 border-r-2 border-[#1c1d20] transition-all ${
              activeTab === 'badges' 
                ? 'bg-[#ebe6d8] text-[#1c1d20] -mb-[2px] shadow-[0px_-2px_0px_#1c1d20]' 
                : 'bg-[#c5bfb0] text-[#5c5950] hover:bg-[#d8d2c4]'
            }`}
          >
            🏅 Achievements ({unlockedBadgeCount}/{DICTATION_BADGES.length})
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#ebe6d8]">
          
          {/* TAB 1: WORDS */}
          {activeTab === 'words' && (
            <div className="flex flex-col gap-4">
              
              {/* Search & Filters */}
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
                <input
                  type="text"
                  placeholder="Search your words, definitions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-[#fbf8f2] border-2 border-[#1c1d20] rounded-lg px-3 py-2 text-xs font-mono text-[#1c1d20] placeholder-[#7a776e] shadow-[2px_2px_0px_#1c1d20] focus:outline-none"
                />

                <div className="flex gap-1.5 shrink-0">
                  {(['All', 'English', 'French'] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setSelectedLanguageFilter(lang)}
                      className={`px-3 py-1.5 font-mono text-[10px] font-bold uppercase rounded border-2 border-[#1c1d20] transition-all ${
                        selectedLanguageFilter === lang 
                          ? 'bg-[#1c1d20] text-[#e4dfd3] shadow-[1px_1px_0px_#1c1d20]' 
                          : 'bg-[#ebe6d8] text-[#4d4a43] hover:bg-[#c5bfb0]'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              {filteredWords.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-[#7a776e] rounded-xl p-6">
                  <span className="text-4xl block mb-2">🌱</span>
                  <p className="font-mono text-sm font-bold text-[#5c5950] uppercase">
                    No mastered words found yet
                  </p>
                  <p className="text-xs text-[#7a776e] mt-1">
                    Complete dictation lessons to build your personal lexicon!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredWords.map((item) => (
                    <div 
                      key={item.id || item.word}
                      className="bg-[#16171a] text-[#ebe6d8] rounded-xl p-4 border-2 border-[#2b2d33] shadow-[3px_3px_0px_#1c1d20] flex flex-col justify-between transition-all hover:border-[#cf573c]"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-xl font-bold text-[#f29e7e] font-sans">
                                {item.word}
                              </h3>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-[#2e313a] text-[#cfcbbe] border border-[#3e424e]">
                                {item.level} // {item.language}
                              </span>
                            </div>
                            <div className="mt-1">
                              {renderPhoneticSyllables(item.pronunciation)}
                            </div>
                          </div>

                          <button
                            onClick={() => handlePlayAudio(item.word, item.id || item.word)}
                            disabled={playingWord === (item.id || item.word)}
                            title="Hear pronunciation"
                            className="w-8 h-8 rounded-lg bg-[#22242a] hover:bg-[#2e313d] border border-[#3e424e] flex items-center justify-center shrink-0 text-[#e89271] transition-all"
                          >
                            {playingWord === (item.id || item.word) ? (
                              <span className="w-2.5 h-2.5 rounded-full bg-[#e89271] animate-ping" />
                            ) : (
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                              </svg>
                            )}
                          </button>
                        </div>

                        <p className="text-xs text-[#cfcbbe] mt-2 leading-relaxed">
                          {item.definition}
                        </p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-[#292b33] flex items-center justify-between text-[10px] font-mono text-[#8d8f99]">
                        <span className="truncate max-w-[200px] text-[#e89271]/80">
                          {item.translation}
                        </span>
                        <span>
                          Practiced {item.timesPracticed}x
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* TAB 2: BADGES */}
          {activeTab === 'badges' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {DICTATION_BADGES.map((badge) => {
                const isUnlocked = !!stats.badges[badge.id];
                const unlockTimestamp = stats.badges[badge.id];
                const unlockDate = unlockTimestamp ? new Date(unlockTimestamp).toLocaleDateString() : null;

                return (
                  <div
                    key={badge.id}
                    className={`p-4 rounded-xl border-2 transition-all flex items-start gap-3.5 ${
                      isUnlocked 
                        ? 'bg-[#16171a] text-[#ebe6d8] border-[#3d7a4d] shadow-[4px_4px_0px_#3d7a4d]' 
                        : 'bg-[#d8d2c4] text-[#7a776e] border-[#7a776e] opacity-70'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 border ${
                      isUnlocked 
                        ? 'bg-[#22242a] border-[#3d7a4d] shadow-[0px_0px_10px_rgba(61,122,77,0.3)]' 
                        : 'bg-[#c5bfb0] border-[#7a776e]'
                    }`}>
                      {badge.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h4 className={`font-mono text-sm font-bold uppercase truncate ${isUnlocked ? 'text-[#e89271]' : 'text-[#4d4a43]'}`}>
                          {badge.title}
                        </h4>
                        {isUnlocked ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-[#3d7a4d] text-white shrink-0">
                            UNLOCKED ✓
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-[#7a776e] shrink-0">
                            🔒 LOCKED
                          </span>
                        )}
                      </div>

                      <p className="text-xs leading-normal mb-1.5 opacity-90">
                        {badge.description}
                      </p>

                      {unlockDate && (
                        <span className="text-[10px] font-mono text-[#3d7a4d] font-bold">
                          Achieved on {unlockDate}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Bottom Close Button */}
        <div className="p-3 bg-[#e4dfd3] border-t-2 border-[#1c1d20] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#1c1d20] text-[#ebe6d8] hover:bg-[#3d7a4d] hover:text-white rounded-lg border-2 border-[#1c1d20] font-mono text-xs font-bold uppercase shadow-[2px_2px_0px_#18191c] transition-all"
          >
            Close Word Bank
          </button>
        </div>

      </div>
    </div>
  );
};

export default DictationAchievementsModal;
