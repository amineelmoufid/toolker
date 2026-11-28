import React from 'react';
import { DictationItem } from '../../types';
import ShadowMicButton from './ShadowMicButton';

interface DictationCardProps {
  item: DictationItem;
  currentIndex: number;
  totalCount: number;
  isPlayingAudio?: boolean;
  onPlayAudio?: () => void;
  showWordHint?: boolean;
  onToggleWordHint?: () => void;
}

/**
 * Formats phonetic syllables, highlighting capitalized stressed syllables (e.g. "spuh-SIF-ik")
 */
export const renderPhoneticSyllables = (pronunciation?: string) => {
  if (!pronunciation) return null;

  // Split by hyphens or spaces to style stressed syllables
  const parts = pronunciation.split(/([ -])/);

  return (
    <span className="font-mono tracking-wide text-sm sm:text-base">
      {parts.map((part, idx) => {
        const isUppercase = part.length > 1 && part === part.toUpperCase() && /[A-Z]/.test(part);
        if (isUppercase) {
          return (
            <span 
              key={idx} 
              className="font-extrabold text-[#f29e7e] bg-[#f29e7e]/15 px-1 py-0.5 rounded border border-[#f29e7e]/40 shadow-sm"
              title="Stressed syllable"
            >
              {part}
            </span>
          );
        }
        return (
          <span key={idx} className="text-[#ebe6d8]/90 font-medium">
            {part}
          </span>
        );
      })}
    </span>
  );
};

export const DictationCard: React.FC<DictationCardProps> = ({
  item,
  currentIndex,
  totalCount = 10,
  isPlayingAudio = false,
  onPlayAudio,
  showWordHint = false,
  onToggleWordHint
}) => {
  const currentStep = currentIndex + 1;
  const formattedStepNumber = currentStep.toString().padStart(2, '0');
  const formattedTotalNumber = totalCount.toString().padStart(2, '0');

  // Word definition or translation
  const displayDefinition = item.definition || item.translation || 'Listen carefully and spell the word.';
  const displayIcon = item.icon || '🎯';

  return (
    <div className="w-full max-w-2xl bg-[#16171a] text-[#ebe6d8] rounded-2xl p-5 sm:p-7 border-2 border-[#2b2d33] shadow-[0px_10px_30px_rgba(0,0,0,0.5),0px_2px_0px_#cf573c] relative overflow-hidden transition-all duration-300">
      
      {/* Subtle background glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#cf573c]/10 rounded-full blur-3xl pointer-events-none" />

      {/* TOP BAR */}
      <div className="flex items-center justify-between gap-3 mb-5 sm:mb-7">
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          <div className="border border-[#e89271] text-[#e89271] px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-mono font-bold tracking-wider uppercase bg-[#e89271]/5 shadow-[0px_0px_8px_rgba(232,146,113,0.15)] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e89271] animate-pulse" />
            {totalCount}-WORD CHALLENGE
          </div>
          <span className="font-mono text-[10px] sm:text-xs font-semibold tracking-wider text-[#9a9ba3] uppercase">
            CAN YOU GET {totalCount}/{totalCount}?
          </span>
        </div>

        {/* Counter Top-Right */}
        <div className="font-mono text-xs sm:text-sm font-bold tracking-wider text-[#a4a5af] bg-[#22242a] px-2.5 py-1 rounded-md border border-[#2e313a] shrink-0">
          <span className="text-[#e89271]">{formattedStepNumber}</span> / {formattedTotalNumber}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex items-start justify-between gap-4 mb-4 sm:mb-6">
        <div className="flex-1 min-w-0 pr-2">
          
          {/* Main Word */}
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#f29e7e] font-sans drop-shadow-sm truncate">
              {showWordHint ? item.word : (
                <span className="tracking-widest">
                  {item.word.split('').map((_, i) => (i === 0 ? item.word[0] : '•')).join('')}
                </span>
              )}
            </h2>

            {/* Audio speaker button (Read) */}
            {onPlayAudio && (
              <button
                onClick={onPlayAudio}
                disabled={isPlayingAudio}
                title="Play pronunciation (Listen)"
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-[#393b45] flex items-center justify-center transition-all ${
                  isPlayingAudio 
                    ? 'bg-[#e89271] text-[#16171a] scale-105 shadow-[0px_0px_12px_rgba(232,146,113,0.5)]' 
                    : 'bg-[#22242a] text-[#ebe6d8] hover:bg-[#2c2f38] hover:border-[#e89271]/60'
                }`}
              >
                {isPlayingAudio ? (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>
            )}

            {/* Shadowing button: Records user and immediately plays back so they hear how they said it */}
            <ShadowMicButton variant="card" targetText={item.word} />

            {/* Hint reveal toggle */}
            {onToggleWordHint && (
              <button
                onClick={onToggleWordHint}
                title={showWordHint ? "Hide word spelling" : "Peek word spelling"}
                className="text-[10px] sm:text-xs font-mono uppercase px-2 py-1 rounded bg-[#22242a] text-[#8e909a] hover:text-[#ebe6d8] hover:bg-[#2a2d36] border border-[#30333d] transition-all"
              >
                {showWordHint ? "Hide 👁️" : "Peek 👁️"}
              </button>
            )}
          </div>

          {/* Definition / Meaning */}
          <p className="text-sm sm:text-base font-normal text-[#cfcbbe] tracking-normal leading-relaxed">
            {displayDefinition}
          </p>
        </div>

        {/* Right Icon Badge (Dartboard / Target) */}
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#22242a] border border-[#31343f] shadow-inner flex items-center justify-center shrink-0 text-xl sm:text-2xl select-none">
          {displayIcon}
        </div>
      </div>

      {/* HORIZONTAL DIVIDER LINE */}
      <div className="w-full h-[1px] bg-gradient-to-r from-[#cf573c]/50 via-[#cf573c]/80 to-transparent my-3 sm:my-4" />

      {/* PRONUNCIATION LINE & COUNTER */}
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase font-bold text-[#7d7f8a] tracking-wider shrink-0">
            SAY IT:
          </span>
          <div className="flex items-center gap-2">
            {renderPhoneticSyllables(item.pronunciation)}
          </div>
        </div>

        <div className="font-mono text-[11px] sm:text-xs font-bold text-[#8d8f99] uppercase tracking-widest shrink-0">
          {currentStep} OF {totalCount}
        </div>
      </div>

      {/* SEGMENTED PROGRESS BAR */}
      <div className="w-full flex items-center gap-1.5 sm:gap-2">
        {Array.from({ length: totalCount }).map((_, idx) => {
          const isDone = idx < currentStep;
          const isCurrent = idx === currentStep - 1;
          return (
            <div
              key={idx}
              className={`h-1.5 rounded-full flex-1 transition-all duration-300 ${
                isCurrent 
                  ? 'bg-[#f29e7e] shadow-[0px_0px_8px_#f29e7e]' 
                  : isDone 
                    ? 'bg-[#c87a5f]' 
                    : 'bg-[#292b33]'
              }`}
            />
          );
        })}
      </div>

    </div>
  );
};

export default DictationCard;
