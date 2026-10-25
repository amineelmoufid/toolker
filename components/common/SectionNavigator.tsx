import React from 'react';
import { AppMode } from '../../types';

interface SectionNavigatorProps {
  activeMode: AppMode;
  onSelectMode?: (mode: AppMode) => void;
}

export const SectionNavigator: React.FC<SectionNavigatorProps> = ({ activeMode, onSelectMode }) => {
  const handleNav = (mode: AppMode) => {
    if (onSelectMode) {
      onSelectMode(mode);
    } else {
      if (mode === 'instrument') {
        window.location.hash = '';
      } else {
        window.location.hash = `#${mode}`;
      }
    }
  };

  const sections: { mode: AppMode; title: string; icon: React.ReactNode }[] = [
    {
      mode: 'instrument',
      title: 'Module 01 // Audio Deck (Speech Synthesis)',
      icon: (
        <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )
    },
    {
      mode: 'shadowing',
      title: 'Module 02 // YouTube Studio (Shadowing Lab)',
      icon: (
        <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="2.5" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="17" y1="2" x2="17" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <line x1="2" y1="7" x2="7" y2="7" />
          <line x1="2" y1="17" x2="7" y2="17" />
          <line x1="17" y1="17" x2="22" y2="17" />
          <line x1="17" y1="7" x2="22" y2="7" />
        </svg>
      )
    },
    {
      mode: 'dictation',
      title: 'Module 03 // Typing Lab (Dictation Studio)',
      icon: (
        <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
        </svg>
      )
    },
    {
      mode: 'reader',
      title: 'Module 04 // Precision Bionic Canvas (Focus Reader)',
      icon: (
        <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      )
    }
  ];

  return (
    <nav className="flex items-center bg-[#16171a] p-1 rounded-md border-2 border-[#2b2c32] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.8)] gap-1 shrink-0 select-none" aria-label="Section navigation">
      {sections.map(({ mode, title, icon }) => {
        const isActive = activeMode === mode;
        return (
          <button
            key={mode}
            onClick={() => handleNav(mode)}
            title={title}
            aria-label={title}
            className={`p-1.5 sm:p-2 rounded font-mono transition-all flex items-center justify-center cursor-pointer ${
              isActive
                ? 'bg-[#cf573c] text-white border border-[#1c1d20] shadow-[2px_2px_0px_#18191c] scale-105 z-10'
                : 'text-[#8a8477] hover:text-[#ebe6d8] hover:bg-[#25272e] border border-transparent active:scale-95'
            }`}
          >
            {icon}
          </button>
        );
      })}
    </nav>
  );
};
