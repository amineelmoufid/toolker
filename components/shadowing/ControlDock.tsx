import React, { useState, useRef, useEffect } from 'react';

interface ControlDockProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrevLine: () => void;
  onNextLine: () => void;
  playbackMode: 'slow' | 'normal';
  onSelectMode: (mode: 'slow' | 'normal') => void;
  autoPause: boolean;
  onToggleAutoPause: () => void;
  onOpenShadowModal: () => void;
  // Hold-to-record props
  onStartHoldRecord: () => void;
  onStopHoldRecord: (shouldSend: boolean) => void;
  onCancelHoldRecord: () => void;
  isRecordingShadow: boolean;
  recordingDuration: number;
  // Dictation mode props
  isDictationMode?: boolean;
  onToggleDictationMode?: () => void;
  // Partner audio props
  hasPartnerAudio?: boolean;
  hasUnreadPartnerAudio?: boolean;
  isPlayingPartnerAudio?: boolean;
  onTogglePlayPartnerAudio?: () => void;
}

// Mobile Micro-Haptic Vibration Utility
const triggerHaptic = (pattern: number | number[]) => {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (_) {}
  }
};

const ControlDock: React.FC<ControlDockProps> = ({
  isPlaying,
  onTogglePlay,
  onPrevLine,
  onNextLine,
  playbackMode,
  onSelectMode,
  autoPause,
  onToggleAutoPause,
  onOpenShadowModal,
  onStartHoldRecord,
  onStopHoldRecord,
  onCancelHoldRecord,
  isRecordingShadow,
  recordingDuration,
  isDictationMode,
  onToggleDictationMode,
  hasPartnerAudio,
  hasUnreadPartnerAudio,
  isPlayingPartnerAudio,
  onTogglePlayPartnerAudio
}) => {
  const [isCancelArmed, setIsCancelArmed] = useState(false);
  const startYRef = useRef<number>(0);
  const pointerIdRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const isHeldRef = useRef(false);
  const wasCancelArmedRef = useRef(false);

  // Escape key cancels hold recording
  useEffect(() => {
    if (!isRecordingShadow) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        triggerHaptic(25);
        onCancelHoldRecord();
        isHeldRef.current = false;
        setIsCancelArmed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecordingShadow, onCancelHoldRecord]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // Capture pointer so moving cursor anywhere keeps triggering events on this button
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerIdRef.current = e.pointerId;
    } catch (err) {
      console.warn("Pointer capture failed", err);
    }

    startYRef.current = e.clientY;
    setIsCancelArmed(false);
    wasCancelArmedRef.current = false;
    isHeldRef.current = false;

    // Threshold (150ms) to distinguish tap from hold
    holdTimerRef.current = window.setTimeout(() => {
      isHeldRef.current = true;
      triggerHaptic(18); // Gentle buzz on hold record onset
      onStartHoldRecord();
    }, 150);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isHeldRef.current && !isRecordingShadow) return;

    // Slide up by 45px or more activates cancel zone
    const deltaY = e.clientY - startYRef.current;
    if (deltaY < -45) {
      if (!wasCancelArmedRef.current) {
        triggerHaptic(35); // Firmer buzz when entering cancel zone
        wasCancelArmedRef.current = true;
      }
      setIsCancelArmed(true);
    } else {
      if (wasCancelArmedRef.current) {
        triggerHaptic(12); // Light tick when moving back down to safe zone
        wasCancelArmedRef.current = false;
      }
      setIsCancelArmed(false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== null) {
      try {
        e.currentTarget.releasePointerCapture(pointerIdRef.current);
      } catch (err) {}
      pointerIdRef.current = null;
    }

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (!isHeldRef.current && !isRecordingShadow) {
      // Quick tap -> open full modal
      triggerHaptic(10);
      onOpenShadowModal();
      return;
    }

    // It was a hold!
    if (isCancelArmed) {
      triggerHaptic(25);
      onCancelHoldRecord();
    } else {
      triggerHaptic([15, 30, 15]); // Success double-tick on send
      onStopHoldRecord(true);
    }
    isHeldRef.current = false;
    setIsCancelArmed(false);
    wasCancelArmedRef.current = false;
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== null) {
      try {
        e.currentTarget.releasePointerCapture(pointerIdRef.current);
      } catch (err) {}
      pointerIdRef.current = null;
    }
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (isHeldRef.current || isRecordingShadow) {
      triggerHaptic(25);
      onCancelHoldRecord();
    }
    isHeldRef.current = false;
    setIsCancelArmed(false);
    wasCancelArmedRef.current = false;
  };

  return (
    <div className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-6 left-1/2 -translate-x-1/2 w-[94%] max-w-sm sm:max-w-md z-40 flex flex-col items-center">
      
      {/* Dynamic Recording HUD Banner */}
      {isRecordingShadow && (
        <div 
          className={`absolute -top-16 sm:-top-14 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 py-2.5 rounded-full border-2 shadow-[4px_4px_0px_#18191c] flex items-center justify-between text-xs font-mono font-bold uppercase transition-all duration-150 select-none z-50 ${
            isCancelArmed 
              ? 'bg-[#b91c1c] text-white border-[#1c1d20] shadow-[0_0_15px_rgba(239,68,68,0.7)] scale-105' 
              : 'bg-[#16171a] text-[#ebe6d8] border-[#cf573c]'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${isCancelArmed ? 'bg-white animate-ping' : 'bg-[#cf573c] animate-pulse'}`} />
            <span>
              {isCancelArmed ? '✕ RELEASE TO CANCEL' : `● REC 0:0${recordingDuration}`}
            </span>
          </div>
          
          <div className="text-[10px] tracking-wider text-right">
            {isCancelArmed ? (
              <span className="text-white/90">SLIDE DOWN TO RESUME</span>
            ) : (
              <span className="text-[#a8a497]">RELEASE TO SEND • ↑ CANCEL</span>
            )}
          </div>
        </div>
      )}

      {/* ── MOBILE SECONDARY ROW (< sm): Tempo & Auto-Pause ── */}
      <div className="flex sm:hidden items-center justify-between w-full max-w-[340px] px-3.5 py-1 mb-1.5 bg-[#e4dfd3]/95 backdrop-blur-sm border-2 border-[#1c1d20] rounded-full shadow-[3px_3px_0px_#18191c] text-xs font-mono font-bold select-none">
        {/* Tempo Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-[#6b6659] tracking-wider uppercase">TEMPO:</span>
          <div className="flex bg-[#d8d2c4] p-0.5 rounded-full border border-[#a8a497]">
            <button
              onClick={() => { triggerHaptic(10); onSelectMode('slow'); }}
              title="Slow Mode (0.75x)"
              className={`px-2 py-0.5 text-[9px] rounded-full transition-colors ${playbackMode === 'slow' ? 'bg-[#1c1d20] text-white shadow-inner font-bold' : 'text-[#4d4a43]'}`}
            >
              0.75×
            </button>
            <button
              onClick={() => { triggerHaptic(10); onSelectMode('normal'); }}
              title="Normal Mode (1.0x)"
              className={`px-2 py-0.5 text-[9px] rounded-full transition-colors ${playbackMode === 'normal' ? 'bg-[#1c1d20] text-white shadow-inner font-bold' : 'text-[#4d4a43]'}`}
            >
              1.0×
            </button>
          </div>
        </div>

        <div className="h-3.5 w-[1px] bg-[#a8a497]" />

        {/* Auto-Pause Toggle */}
        <button
          onClick={() => { triggerHaptic(10); onToggleAutoPause(); }}
          title={autoPause ? "Auto-Pause: ON" : "Auto-Pause: OFF"}
          className="flex items-center gap-1.5 py-0.5 active:scale-95 transition-transform"
        >
          <span className="text-[9px] text-[#6b6659] tracking-wider uppercase">AUTO-PAUSE:</span>
          <span className={`text-[9.5px] px-2 py-0.5 rounded-full font-bold uppercase transition-colors ${autoPause ? 'bg-[#cf573c] text-white shadow-sm' : 'bg-[#c5bfb0] text-[#4d4a43]'}`}>
            {autoPause ? 'ON' : 'OFF'}
          </span>
        </button>

        {/* Dictation Mode Toggle on Mobile */}
        {onToggleDictationMode && (
          <>
            <div className="h-3.5 w-[1px] bg-[#a8a497]" />
            <button
              onClick={() => { triggerHaptic(10); onToggleDictationMode(); }}
              title={isDictationMode ? "Dictation: ON (Typing)" : "Dictation: OFF"}
              className="flex items-center gap-1.5 py-0.5 active:scale-95 transition-transform"
            >
              <span className="text-[9px] text-[#6b6659] tracking-wider uppercase">TYPE:</span>
              <span className={`text-[9.5px] px-2 py-0.5 rounded-full font-bold uppercase transition-colors ${isDictationMode ? 'bg-[#3d7a4d] text-white shadow-sm' : 'bg-[#c5bfb0] text-[#4d4a43]'}`}>
                {isDictationMode ? 'ON' : 'OFF'}
              </span>
            </button>
          </>
        )}
      </div>

      {/* ── PRIMARY THUMB ISLAND ── */}
      <div className="w-full bg-[#e4dfd3] border-2 border-[#1c1d20] rounded-full px-3 sm:px-6 py-2 sm:py-3 shadow-[5px_5px_0px_#18191c] flex items-center justify-between text-[#1c1d20] select-none gap-1 sm:gap-2">
        
        {/* Desktop-Only Secondary Controls (Hidden on Mobile, Clean Single-Row on Desktop) */}
        <div className="hidden sm:flex items-center gap-2">
          {/* 1. Playback Mode Selector */}
          <div className="flex bg-[#d8d2c4] p-1 rounded-full border border-[#a8a497]">
            <button
              onClick={() => onSelectMode('slow')}
              title="Slow Mode (0.75x)"
              className={`p-1.5 rounded-full transition-colors ${playbackMode === 'slow' ? 'bg-[#1c1d20] text-white shadow-inner' : 'text-[#4d4a43] hover:bg-[#c5bfb0]'}`}
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="4" />
              </svg>
            </button>
            
            <button
              onClick={() => onSelectMode('normal')}
              title="Normal Mode (1.0x)"
              className={`p-1.5 rounded-full transition-colors ${playbackMode === 'normal' ? 'bg-[#1c1d20] text-white shadow-inner' : 'text-[#4d4a43] hover:bg-[#c5bfb0]'}`}
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>
          </div>

          {/* 2. Auto-Pause Toggle */}
          <button
            onClick={onToggleAutoPause}
            title={autoPause ? "Auto-Pause: ON" : "Auto-Pause: OFF"}
            className="flex items-center justify-center p-2 rounded hover:bg-[#c5bfb0] transition-colors group"
          >
            <svg className="w-10 h-6" viewBox="0 0 32 18" fill="none">
               <rect 
                 x="0" y="0" width="32" height="18" rx="9" 
                 fill={autoPause ? '#cf573c' : '#a8a497'} 
                 className="transition-colors duration-300 ease-in-out" 
               />
               <g className="transition-transform duration-300 ease-in-out" style={{ transform: `translateX(${autoPause ? '14px' : '0px'})` }}>
                 <circle cx="9" cy="9" r="7" fill="#1c1d20" />
                 <line x1="7.5" y1="6.5" x2="7.5" y2="11.5" stroke="#e4dfd3" strokeWidth="1.5" strokeLinecap="round" />
                 <line x1="10.5" y1="6.5" x2="10.5" y2="11.5" stroke="#e4dfd3" strokeWidth="1.5" strokeLinecap="round" />
               </g>
            </svg>
          </button>

          {/* 3. Dictation / Blur Mode Toggle */}
          {onToggleDictationMode && (
            <button
              onClick={() => { triggerHaptic(10); onToggleDictationMode(); }}
              title={isDictationMode ? "Dictation Typing Mode: ON" : "Dictation Typing Mode: OFF"}
              className={`p-1.5 rounded-full border transition-all active:scale-95 flex items-center justify-center ${
                isDictationMode
                  ? 'bg-[#3d7a4d] text-white border-[#3d7a4d] shadow-[0_0_8px_rgba(61,122,77,0.7)]'
                  : 'bg-[#d8d2c4] text-[#4d4a43] border-[#a8a497] hover:bg-[#c5bfb0]'
              }`}
            >
              <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M6 12h.001M10 12h.001M14 12h.001M18 12h.001M8 16h8" />
              </svg>
            </button>
          )}
        </div>

        {/* 3. Previous Line (<) - Enlarged for Mobile Thumb Target */}
        <button
          onClick={() => { triggerHaptic(10); onPrevLine(); }}
          title="Previous Sentence (<)"
          className="w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-[#c5bfb0] active:scale-90 transition-all text-[#1c1d20]"
        >
          <svg className="w-6 h-6 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* 4. Play / Pause Button (Center Hero Button) */}
        <button
          onClick={() => { triggerHaptic(12); onTogglePlay(); }}
          title={isPlaying ? "Pause" : "Play"}
          className="w-13 h-13 sm:w-12 sm:h-12 min-w-[50px] min-h-[50px] rounded-full bg-[#1c1d20] text-[#e4dfd3] flex items-center justify-center shadow-[inset_1px_1px_3px_rgba(0,0,0,0.8)] border-2 border-[#1c1d20] hover:bg-[#cf573c] hover:border-[#cf573c] active:scale-95 transition-all"
        >
          {isPlaying ? (
            <svg className="w-6 h-6 sm:w-6 sm:h-6 fill-current" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-6 h-6 sm:w-6 sm:h-6 fill-current translate-x-0.5" viewBox="0 0 24 24">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>

        {/* 5. Next Line (>) - Enlarged for Mobile Thumb Target */}
        <button
          onClick={() => { triggerHaptic(10); onNextLine(); }}
          title="Next Sentence (>)"
          className="w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-[#c5bfb0] active:scale-90 transition-all text-[#1c1d20]"
        >
          <svg className="w-6 h-6 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* 6. Shadow Microphone Button & Floating Partner Play Icon */}
        <div className="relative flex items-center">
          <button
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onContextMenu={(e) => e.preventDefault()}
            title="Hold to Record & Send | Click to Open Lab"
            className={`relative flex flex-col items-center justify-center min-w-[56px] h-11 sm:h-auto sm:min-w-0 p-1.5 px-3 rounded-full transition-all group select-none touch-none ${
              isRecordingShadow
                ? isCancelArmed
                  ? 'bg-red-700 text-white scale-110 shadow-[0_0_14px_rgba(220,38,38,0.95)]'
                  : 'bg-[#cf573c] text-white scale-110 shadow-[0_0_14px_rgba(207,87,60,0.95)]'
                : 'hover:bg-[#c5bfb0] text-[#cf573c]'
            }`}
          >
            <svg className={`w-5 h-5 sm:w-5 sm:h-5 transition-transform ${isRecordingShadow ? 'scale-110 animate-pulse' : 'group-hover:scale-110'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <span className={`text-[8.5px] sm:text-[8.5px] font-mono font-bold uppercase mt-0.5 tracking-tight ${isRecordingShadow ? 'text-white' : 'text-[#cf573c]'}`}>
              {isRecordingShadow ? (isCancelArmed ? 'CANCEL' : 'REC') : 'SHADOW'}
            </span>
          </button>

          {/* Floating Partner Play Button - Enlarged to 44px active touch target on mobile */}
          {hasPartnerAudio && (
            <button
              onClick={() => { triggerHaptic(12); onTogglePlayPartnerAudio?.(); }}
              title={isPlayingPartnerAudio ? "Stop Partner Audio" : "Play Partner's Shadow Recording"}
              className={`absolute -top-3.5 -right-3.5 sm:-top-3 sm:-right-4 w-9 h-9 sm:w-8 sm:h-8 rounded-full border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] flex items-center justify-center transition-all z-30 active:scale-95 active:shadow-none ${
                isPlayingPartnerAudio
                  ? 'bg-[#3b82f6] text-white shadow-[0_0_12px_rgba(59,130,246,0.9)] scale-110'
                  : 'bg-[#3d7a4d] hover:bg-[#346942] text-white animate-bounce-short'
              }`}
            >
              {isPlayingPartnerAudio ? (
                <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5 fill-current" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1.5" />
                </svg>
              ) : (
                <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}

              {/* '1' Unread Notification Badge */}
              {hasUnreadPartnerAudio && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#cf573c] text-[#fbf8f2] text-[9px] font-mono font-bold flex items-center justify-center border border-[#1c1d20] shadow-[1px_1px_0px_#18191c] animate-pulse pointer-events-none">
                  1
                </span>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

export default ControlDock;
