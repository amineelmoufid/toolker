import React, { useRef } from 'react';
import { SubtitleLine } from '../../types';
import VideoDictationInput, { DictationMaskMode } from './VideoDictationInput';

interface SubtitleStageProps {
  subtitles: SubtitleLine[];
  currentTime: number;
  onSelectLine: (line: SubtitleLine) => void;
  // Dictation mode props
  isDictationMode: boolean;
  onToggleDictationMode: () => void;
  maskMode: DictationMaskMode;
  onToggleMaskMode: () => void;
  showTranslation: boolean;
  onToggleTranslation: () => void;
  onLineCompleted: (line: SubtitleLine) => void;
  onReplayLine: () => void;
}

const SubtitleStage: React.FC<SubtitleStageProps> = ({
  subtitles,
  currentTime,
  onSelectLine,
  isDictationMode,
  onToggleDictationMode,
  maskMode,
  onToggleMaskMode,
  showTranslation,
  onToggleTranslation,
  onLineCompleted,
  onReplayLine
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 1. Determine active line:
  const activeLineIdx = subtitles.findIndex((line, idx) => {
    const nextLine = subtitles[idx + 1];
    const thresholdEnd = nextLine ? Math.min(line.end + 0.6, nextLine.start) : line.end + 1.2;
    return currentTime >= line.start - 0.12 && currentTime < thresholdEnd;
  });

  // If before first line or in a gap between lines, keep the current contextual line:
  let effectiveIdx = activeLineIdx;
  if (effectiveIdx === -1 && subtitles.length > 0) {
    if (currentTime < subtitles[0].start) {
      effectiveIdx = 0; // Show first sentence awaiting onset
    } else {
      // Keep displaying the line that just completed until the next starts
      for (let i = subtitles.length - 1; i >= 0; i--) {
        if (currentTime >= subtitles[i].start) {
          effectiveIdx = i;
          break;
        }
      }
    }
  }

  const currentIndex = effectiveIdx !== -1 ? effectiveIdx : (subtitles.length > 0 ? 0 : -1);
  const activeLine = currentIndex !== -1 ? subtitles[currentIndex] : null;

  // Upcoming lines after the active line
  const upcomingLines = currentIndex !== -1 ? subtitles.slice(currentIndex + 1, currentIndex + 4) : [];

  const isFrenchText = (txt: string) => /[éèêëàâôûùçîïœæ]|\b(le|la|les|un|une|des|du|dans|avec|pour|pas|ne|vous|nous|cette|est|sont)\b/i.test(txt);
  const activeIsFrench = activeLine ? isFrenchText(activeLine.text) : false;
  const translationFlag = activeIsFrench ? '🇬🇧' : '🇫🇷';

  return (
    <div 
      ref={containerRef}
      className="flex-1 w-full flex flex-col gap-3.5 sm:gap-6"
    >
      {/* 1. ACTIVE SUBTITLE CONTAINER PILL (Brutalist Terminal) */}
      <div className={`w-full relative bg-[#16171a] rounded-lg border-2 ${isDictationMode ? 'border-[#3d7a4d]' : 'border-[#1c1d20]'} shadow-[inset_2px_2px_5px_rgba(0,0,0,0.8)] flex flex-col p-3.5 sm:p-6 min-h-[140px] sm:min-h-[175px] transition-colors duration-300`}>
        
        {/* Terminal Header */}
        <div className="flex flex-wrap items-center justify-between w-full mb-2.5 sm:mb-4 gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${isDictationMode ? 'bg-[#3d7a4d]' : 'bg-[#cf573c]'} animate-pulse`} />
            <span className={`font-mono text-[8.5px] sm:text-[9px] font-bold tracking-widest ${isDictationMode ? 'text-[#3d7a4d]' : 'text-[#cf573c]'} uppercase`}>
              {isDictationMode ? 'DICTATION TYPING BUFFER' : 'TARGET SENTENCE BUFFER'}
            </span>
          </div>

          {/* Dictation Mode Controls Strip */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* Dictation Mode Toggle */}
            <button
              type="button"
              onClick={onToggleDictationMode}
              title={isDictationMode ? "Switch to Karaoke Subtitles" : "Activate Dictation & Typing Mode"}
              className={`text-[8.5px] sm:text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded border transition-all active:scale-95 flex items-center gap-1 ${
                isDictationMode
                  ? 'bg-[#3d7a4d] text-white border-[#3d7a4d] shadow-[0_0_8px_rgba(61,122,77,0.7)]'
                  : 'bg-[#24252a] text-[#a09c91] border-[#3e4049] hover:text-[#ebe6d8]'
              }`}
            >
              <span>⌨️</span>
              <span>DICTATION {isDictationMode ? 'ON' : 'OFF'}</span>
            </button>

            {/* Mask Style Toggle (Asterisks vs Blur) */}
            {isDictationMode && (
              <button
                type="button"
                onClick={onToggleMaskMode}
                title="Switch between Asterisks (*) and Blur Style"
                className="text-[8.5px] sm:text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded border border-[#3e4049] bg-[#24252a] text-[#ebe6d8] hover:border-[#cf573c] transition-all active:scale-95"
              >
                {maskMode === 'asterisks' ? '* ASTERISKS' : '░ BLUR'}
              </button>
            )}

            {/* Translation Toggle */}
            <button
              type="button"
              onClick={onToggleTranslation}
              title={showTranslation ? "Masquer la traduction" : "Afficher la traduction"}
              className={`text-[8.5px] sm:text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded border transition-all active:scale-95 flex items-center gap-1 ${
                showTranslation
                  ? 'bg-[#cf573c]/20 text-[#cf573c] border-[#cf573c]/50'
                  : 'bg-[#24252a] text-[#7a776e] border-[#3e4049]'
              }`}
            >
              <span>{translationFlag}</span>
              <span className="hidden xs:inline">TRANSLATION</span>
            </button>
          </div>
        </div>

        {/* Terminal Body */}
        {activeLine ? (
          isDictationMode ? (
            <div className="w-full flex-1 flex flex-col justify-center">
              <VideoDictationInput
                targetText={activeLine.text}
                maskMode={maskMode}
                onSuccess={() => onLineCompleted(activeLine)}
                onReplayRequest={onReplayLine}
              />

              {activeLine.translation && showTranslation && (
                <div className="mt-3.5 flex items-center justify-center animate-in fade-in duration-200">
                  <span className="font-sans text-xs sm:text-sm font-medium text-[#cf573c] bg-[#1c1d20] px-3.5 py-1.5 rounded-md border border-[#cf573c]/50 shadow-[2px_2px_0px_#cf573c] tracking-normal">
                    {translationFlag} {activeLine.translation}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div 
              onClick={() => onSelectLine(activeLine)}
              className="w-full flex-1 flex flex-col justify-center cursor-pointer group"
              title="Tap to replay this sentence"
            >
              <div className="flex flex-wrap justify-center items-center gap-x-1 gap-y-1 sm:gap-y-1.5 font-mono text-base sm:text-xl font-bold tracking-wide leading-relaxed sm:leading-loose">
                {activeLine.words && activeLine.words.length > 0 ? (
                  activeLine.words.map((w, idx) => {
                    const nextWord = activeLine.words![idx + 1];
                    const wordEnd = nextWord 
                      ? nextWord.start 
                      : w.end + 0.35;
                    const isWordActive = currentTime >= (w.start - 0.08) && currentTime < wordEnd;

                    return (
                      <span
                        key={idx}
                        className={`transition-colors duration-75 inline-block px-1.5 sm:px-2 py-0.5 rounded-sm ${
                          isWordActive
                            ? 'bg-[#cf573c] text-white shadow-[0_0_8px_rgba(207,87,60,0.8)]'
                            : 'text-[#ebe8de] bg-transparent'
                        }`}
                      >
                        {w.text}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-[#ebe8de] px-1.5 sm:px-2 py-0.5">{activeLine.text}</span>
                )}
              </div>

              {activeLine.translation && showTranslation && (
                <div className="mt-2.5 sm:mt-4 text-[11px] sm:text-xs text-[#cf573c] font-sans font-medium text-center w-full leading-normal">
                  {translationFlag} {activeLine.translation}
                </div>
              )}
            </div>
          )
        ) : (
          <div className="w-full flex-1 flex items-center justify-center text-center">
            <span className="font-mono text-[9px] sm:text-[10px] text-[#4d4a43] tracking-wider uppercase">
              &gt; AWAITING SPEECH SEGMENT...
            </span>
          </div>
        )}
      </div>

      {/* 2. UPCOMING SUBTITLE LINES */}
      <div className="w-full px-1.5 sm:px-2 space-y-2.5 sm:space-y-4">
        {upcomingLines.map((line, idx) => {
          const opacityClasses = [
            'text-[#7a776e] hover:text-[#4d4a43]',
            'text-[#c5bfb0] hover:text-[#7a776e]',
            'text-[#d8d2c4] hover:text-[#c5bfb0]'
          ];

          return (
            <div
              key={line.id}
              onClick={() => onSelectLine(line)}
              className={`cursor-pointer transition-all duration-150 font-mono text-xs sm:text-sm font-bold tracking-wide flex items-center justify-between group border-l-2 border-transparent hover:border-[#cf573c] pl-2 ${
                opacityClasses[idx] || 'text-[#d8d2c4]'
              }`}
              title="Click to jump video to this line"
            >
              <div className="flex flex-col">
                <p className="leading-relaxed group-hover:translate-x-1 transition-transform">
                  {line.text}
                </p>
                {line.translation && showTranslation && (
                  <span className="text-[10px] font-sans text-[#a09c91] font-normal">
                    {isFrenchText(line.text) ? '🇬🇧' : '🇫🇷'} {line.translation}
                  </span>
                )}
              </div>
              <span className="text-[8.5px] sm:text-[9px] font-mono font-bold text-[#cf573c] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                ▶ JUMP
              </span>
            </div>
          );
        })}

        {upcomingLines.length === 0 && (
          <div className="pt-2 sm:pt-4 text-center text-[9px] sm:text-[10px] font-mono text-[#c5bfb0] uppercase tracking-wider">
            END OF CLIP DATA
          </div>
        )}
      </div>
    </div>
  );
};

export default SubtitleStage;
