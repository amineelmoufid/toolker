import React, { useState, useEffect, useRef } from 'react';

interface GuidedInputProps {
  targetText: string;
  onSuccess: () => void;
  showHelp: boolean;
  disabled?: boolean;
  forceComplete?: boolean;
}

const GuidedInput: React.FC<GuidedInputProps> = ({ targetText, onSuccess, showHelp, disabled, forceComplete }) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  const cleanString = (str: string) => str.replace(/[.,!?'"]/g, '').toLowerCase().trim();
  const targetClean = cleanString(targetText);

  useEffect(() => {
    if (!forceComplete) {
      setInputValue('');
      if (!disabled) {
        inputRef.current?.focus();
      }
    }
  }, [targetText, disabled, forceComplete]);

  useEffect(() => {
    if (showHelp || forceComplete) {
      setInputValue(targetText);
      if (showHelp) onSuccess();
    }
  }, [showHelp, forceComplete]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || forceComplete) return;
    const val = e.target.value;
    setInputValue(val);
    
    if (cleanString(val) === targetClean) {
      onSuccess();
    }
  };

  const handleContainerClick = () => {
    if (!disabled && !forceComplete) {
      inputRef.current?.focus();
    }
  };

  const renderVisuals = () => {
    const characters = targetText.split('');
    const typedChars = inputValue.split('');

    return (
      <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-3 font-mono text-base sm:text-lg lg:text-xl font-bold uppercase tracking-wider">
        {characters.map((char, index) => {
          const isSpace = char === ' ';
          const isPunctuation = /[.,!?'"]/.test(char);
          const typedChar = typedChars[index];
          
          if (isSpace) {
            return <span key={index} className="w-2 sm:w-3"></span>;
          }

          if (isPunctuation) {
            return <span key={index} className="text-[#7a776e]">{char}</span>;
          }

          const isCompleted = forceComplete || showHelp || (typedChar && typedChar.toLowerCase() === char.toLowerCase());
          const displayChar = isCompleted ? char : typedChar ? typedChar : '';
          const isWrong = typedChar && typedChar.toLowerCase() !== char.toLowerCase() && !showHelp && !forceComplete;

          return (
            <div key={index} className="relative flex flex-col items-center">
              <span className={`h-6 sm:h-8 flex items-end justify-center ${isWrong ? 'text-[#cf573c]' : isCompleted ? 'text-[#3d7a4d]' : 'text-[#1c1d20]'}`}>
                {displayChar}
              </span>
              <div className={`h-1 w-3 sm:w-4 mt-1 ${isCompleted ? 'bg-[#3d7a4d]' : isWrong ? 'bg-[#cf573c]' : 'bg-[#7a776e]'}`}></div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div 
      className={`relative w-full ${disabled || forceComplete ? 'cursor-default opacity-80' : 'cursor-text bg-[#c5bfb0] shadow-[inset_2px_2px_5px_rgba(0,0,0,0.5)]'} border-2 border-[#1c1d20] rounded-lg p-3 sm:p-5 overflow-hidden min-h-[80px] sm:min-h-[100px] flex items-center justify-center transition-all duration-300 ${forceComplete ? 'bg-[#3d7a4d]/10 border-[#3d7a4d]' : ''}`}
      onClick={handleContainerClick}
    >
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleChange}
        disabled={disabled || forceComplete}
        className="absolute opacity-0 pointer-events-none -left-[9999px]"
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
      />
      {renderVisuals()}
    </div>
  );
};

export default GuidedInput;
