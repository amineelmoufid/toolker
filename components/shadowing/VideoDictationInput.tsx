import React, { useState, useEffect, useRef } from 'react';

export type DictationMaskMode = 'asterisks' | 'blur';

interface VideoDictationInputProps {
  targetText: string;
  maskMode: DictationMaskMode;
  onSuccess: () => void;
  onReplayRequest?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const VideoDictationInput: React.FC<VideoDictationInputProps> = ({
  targetText,
  maskMode,
  onSuccess,
  onReplayRequest,
  disabled = false,
  autoFocus = true
}) => {
  const [typedChars, setTypedChars] = useState<string[]>([]);
  const [wrongChar, setWrongChar] = useState<{ index: number; char: string } | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clean raw character tokens (letters and digits require typing; spaces & punctuation auto-fill)
  const isTypeable = (char: string) => /[a-zA-Z0-9]/.test(char);

  // Reset when targetText changes
  useEffect(() => {
    setTypedChars([]);
    setWrongChar(null);
    setIsCompleted(false);

    if (autoFocus && !disabled) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [targetText, disabled, autoFocus]);

  // Keep input focused unless disabled
  const handleFocusInput = () => {
    if (!disabled && !isCompleted) {
      inputRef.current?.focus();
    }
  };

  // Find index of the next typeable character that hasn't been correctly typed yet
  const getNextTypeableIndex = (currentTyped: string[]) => {
    const chars = targetText.split('');
    for (let i = 0; i < chars.length; i++) {
      if (!isTypeable(chars[i])) continue;
      if (!currentTyped[i] || currentTyped[i].toLowerCase() !== chars[i].toLowerCase()) {
        return i;
      }
    }
    return -1; // All filled!
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled || isCompleted) return;

    // Handle Replay shortcut (Ctrl+Space or Alt+R)
    if ((e.ctrlKey && e.code === 'Space') || (e.altKey && e.key.toLowerCase() === 'r')) {
      e.preventDefault();
      onReplayRequest?.();
      return;
    }

    // Handle Backspace: remove the most recently typed typeable character
    if (e.key === 'Backspace') {
      e.preventDefault();
      setWrongChar(null);

      // Find the last typed character index
      const chars = targetText.split('');
      for (let i = chars.length - 1; i >= 0; i--) {
        if (isTypeable(chars[i]) && typedChars[i]) {
          const next = [...typedChars];
          delete next[i];
          setTypedChars(next);
          break;
        }
      }
      return;
    }

    // Handle Tab: Hint / Peek next character
    if (e.key === 'Tab') {
      e.preventDefault();
      revealNextHint();
      return;
    }

    // Capture standard single-character keystrokes
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const nextIdx = getNextTypeableIndex(typedChars);
      if (nextIdx === -1) return;

      const expectedChar = targetText[nextIdx];
      const typedKey = e.key;

      if (typedKey.toLowerCase() === expectedChar.toLowerCase()) {
        // Correct letter!
        const next = [...typedChars];
        next[nextIdx] = expectedChar;
        setTypedChars(next);
        setWrongChar(null);

        // Check if full sentence is now completed
        if (getNextTypeableIndex(next) === -1) {
          setIsCompleted(true);
          onSuccess();
        }
      } else {
        // Wrong letter
        setWrongChar({ index: nextIdx, char: typedKey });
        // Auto-clear wrong flash after 450ms
        setTimeout(() => {
          setWrongChar((prev) => (prev?.index === nextIdx ? null : prev));
        }, 450);
      }
    }
  };

  // Provide a hint: automatically reveals the next character
  const revealNextHint = () => {
    if (disabled || isCompleted) return;
    const nextIdx = getNextTypeableIndex(typedChars);
    if (nextIdx !== -1) {
      const next = [...typedChars];
      next[nextIdx] = targetText[nextIdx];
      setTypedChars(next);
      setWrongChar(null);

      if (getNextTypeableIndex(next) === -1) {
        setIsCompleted(true);
        onSuccess();
      }
    }
  };

  const nextActiveIdx = getNextTypeableIndex(typedChars);
  const characters = targetText.split('');

  // Calculate typed progress percentage
  const totalTypeable = characters.filter(isTypeable).length;
  const typedCount = characters.filter((c, i) => isTypeable(c) && typedChars[i]?.toLowerCase() === c.toLowerCase()).length;
  const progressPct = totalTypeable > 0 ? Math.round((typedCount / totalTypeable) * 100) : 100;

  return (
    <div
      ref={containerRef}
      onClick={handleFocusInput}
      className={`w-full flex flex-col items-center select-none cursor-text transition-all duration-200 ${
        isCompleted ? 'bg-[#3d7a4d]/10' : ''
      }`}
    >
      {/* Hidden Native Input to catch hardware and mobile keyboard events */}
      <input
        ref={inputRef}
        type="text"
        onKeyDown={handleKeyDown}
        disabled={disabled || isCompleted}
        className="opacity-0 absolute -left-[9999px] pointer-events-none"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {/* Render Character Grid with Words & Spaces */}
      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2.5 font-mono text-base sm:text-lg md:text-xl font-bold tracking-wide leading-relaxed py-2 max-w-full">
        {characters.map((char, index) => {
          const isSpace = char === ' ';
          const isPunct = !isSpace && !isTypeable(char);
          const isCorrect = typedChars[index]?.toLowerCase() === char.toLowerCase();
          const isCurrentActive = index === nextActiveIdx && !isCompleted;
          const isWrongAtThisPos = wrongChar?.index === index;

          if (isSpace) {
            return <span key={index} className="w-2 sm:w-3 inline-block" />;
          }

          if (isPunct) {
            return (
              <span key={index} className="text-[#a09c91] px-0.5 select-none font-bold">
                {char}
              </span>
            );
          }

          // Render Word Character Slot
          return (
            <div
              key={index}
              className={`relative flex flex-col items-center min-w-[14px] sm:min-w-[18px] transition-all ${
                isCurrentActive ? 'scale-105' : ''
              }`}
            >
              {/* Character Text display */}
              <span
                className={`h-7 sm:h-8 flex items-center justify-center transition-all ${
                  isCorrect
                    ? 'text-[#3d7a4d] font-extrabold text-shadow-sm'
                    : isWrongAtThisPos
                    ? 'text-[#cf573c] font-black animate-shake'
                    : maskMode === 'asterisks'
                    ? isCurrentActive
                      ? 'text-[#cf573c] animate-pulse font-extrabold'
                      : 'text-[#7a776e]'
                    : 'text-[#ebe6d8] filter blur-[3.5px] opacity-60'
                }`}
              >
                {isCorrect
                  ? char
                  : isWrongAtThisPos
                  ? wrongChar.char.toUpperCase()
                  : maskMode === 'asterisks'
                  ? '*'
                  : char}
              </span>

              {/* Slot Underline Pill */}
              <div
                className={`h-1 w-full rounded-full transition-all duration-150 ${
                  isCorrect
                    ? 'bg-[#3d7a4d] h-1.5'
                    : isWrongAtThisPos
                    ? 'bg-[#cf573c] h-1.5'
                    : isCurrentActive
                    ? 'bg-[#cf573c] h-1.5 shadow-[0_0_8px_rgba(207,87,60,0.8)]'
                    : 'bg-[#4d4a43]'
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Progress & Quick Assist Bar */}
      <div className="w-full mt-3 pt-2.5 border-t border-[#2b2c32] flex items-center justify-between gap-2 px-1 text-[10px] sm:text-[11px] font-mono select-none">
        <div className="flex items-center gap-2">
          <span className="text-[#7a776e]">
            PROGRESS: <strong className="text-[#ebe6d8]">{typedCount}/{totalTypeable}</strong> ({progressPct}%)
          </span>
          {isCompleted && (
            <span className="text-[#3d7a4d] font-bold uppercase tracking-wider flex items-center gap-1 animate-pulse">
              ✓ COMPLETED!
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReplayRequest?.();
            }}
            title="Replay Audio (Ctrl+Space)"
            className="px-2 py-0.5 bg-[#24252a] hover:bg-[#34353d] text-[#c5bfb0] hover:text-white rounded border border-[#3e4049] transition-all flex items-center gap-1 active:scale-95"
          >
            <span>↺</span>
            <span className="hidden sm:inline">REPLAY</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              revealNextHint();
            }}
            title="Reveal next letter (Tab)"
            className="px-2 py-0.5 bg-[#24252a] hover:bg-[#34353d] text-[#cf573c] hover:text-[#e0684e] rounded border border-[#3e4049] transition-all flex items-center gap-1 active:scale-95"
          >
            <span>👁️</span>
            <span className="hidden sm:inline">HINT (TAB)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoDictationInput;
