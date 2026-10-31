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
  isSyncing?: boolean;
  syncError?: string | null;
  onOpenLibrary?: () => void;
  onExportToReader?: () => void;
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
  onReplayLine,
  isSyncing = false,
  syncError = null,
  onOpenLibrary,
  onExportToReader
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // If subtitles array is empty, show loading or error buffer
  if (!subtitles || subtitles.length === 0) {
    return (
      <div 
        ref={containerRef}
        className="flex-1 w-full flex flex-col items-center justify-center p-6 text-center"
      >
        <div className="w-full max-w-lg bg-[#16171a] rounded-lg border-2 border-[#1c1d20] shadow-[inset_2px_2px_5px_rgba(0,0,0,0.8)] p-6 sm:p-8 flex flex-col items-center justify-center">
          {syncError ? (
            <>
              <div className="w-12 h-12 rounded-full bg-red-950/40 border border-red-500/40 flex items-center justify-center mb-3">
                <span className="text-xl">⚠️</span>
              </div>
              <h3 className="font-mono text-xs sm:text-sm font-bold text-[#ebe6d8] uppercase tracking-wider mb-2">
                No Subtitles Detected
              </h3>
              <p className="font-mono text-[11px] text-[#a09c91] max-w-md leading-relaxed mb-4">
                {syncError}
              </p>
              {onOpenLibrary && (
                <button
                  type="button"
                  onClick={onOpenLibrary}
                  className="bg-[#cf573c] hover:bg-[#a83f2a] text-[#ebe6d8] border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] px-4 py-2 rounded-md font-mono text-xs font-bold uppercase transition-all active:translate-y-0.5 active:shadow-[0px_0px_0px_#18191c]"
                >
                  CHOOSE ANOTHER CLIP 🎬
                </button>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-[#cf573c] animate-ping" />
                <span className="font-mono text-xs sm:text-sm font-bold text-[#ebe6d8] uppercase tracking-wider">
                  {isSyncing ? "EXTRACTING SUBTITLES VIA CLOUD RUNNER..." : "AWAITING VIDEO SUBTITLES..."}
                </span>
              </div>
              <p className="font-mono text-[11px] sm:text-xs text-[#a09c91] max-w-md leading-relaxed mb-4">
                Synchronizing authentic speech dialogue with word-level accuracy. Timed cues will appear automatically.
              </p>
              <div className="w-48 h-1.5 bg-[#24252a] rounded-full overflow-hidden">
                <div className="h-full bg-[#cf573c] animate-pulse w-full rounded-full" />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

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
            {/* 1-Click Export Subtitles to Reader */}
            {onExportToReader && (
              <button
                type="button"
                onClick={onExportToReader}
                title="Export all extracted subtitles to Reader (1-Click)"
                className="text-[8.5px] sm:text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded border border-[#3e4049] bg-[#24252a] text-[#a09c91] hover:text-[#ebe6d8] hover:border-[#386b52] hover:bg-[#1a2e22] transition-all active:scale-95 flex items-center gap-1"
              >
                <span>📖</span>
                <span><span className="hidden sm:inline">EXPORT TO </span>READER</span>
              </button>
            )}

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
