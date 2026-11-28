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
  isInRoom?: boolean;
  // Hold-to-record props
  onStartHoldRecord: () => void;
  onStopHoldRecord: (shouldSend: boolean) => void;
  onCancelHoldRecord: () => void;
  isRecordingShadow: boolean;
  recordingDuration: number;
  // Dictation mode props
  isDictationMode?: boolean;
  onToggleDictationMode?: () => void;
  // Local audio props
  hasLocalAudio?: boolean;
  isPlayingLocalAudio?: boolean;
  onTogglePlayLocalAudio?: () => void;
  // Partner audio props
  hasPartnerAudio?: boolean;
  hasUnreadPartnerAudio?: boolean;
  isPlayingPartnerAudio?: boolean;
  onTogglePlayPartnerAudio?: () => void;
  // Multi-user Recording & Listening UX Enhancements
  isVideoPlayLocked?: boolean;
  isPartnerRecording?: boolean;
  isPartnerListeningToMyAudio?: boolean;
  partnerAudioProgress?: number;
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
  isInRoom = false,
  onStartHoldRecord,
  onStopHoldRecord,
  onCancelHoldRecord,
  isRecordingShadow,
  recordingDuration,
  isDictationMode,
  onToggleDictationMode,
  hasLocalAudio,
  isPlayingLocalAudio,
  onTogglePlayLocalAudio,
  hasPartnerAudio,
  hasUnreadPartnerAudio,
  isPlayingPartnerAudio,
  onTogglePlayPartnerAudio,
  isVideoPlayLocked = false,
  isPartnerRecording = false,
  isPartnerListeningToMyAudio = false,
  partnerAudioProgress = 0
}) => {
  const [isCancelArmed, setIsCancelArmed] = useState(false);
  const startYRef = useRef<number>(0);
  const pointerIdRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const isHeldRef = useRef(false);
  const wasCancelArmedRef = useRef(false);
  const justStoppedRef = useRef(false);

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

    if (isRecordingShadow) {
      // If already recording, tapping it stops and sends!
      justStoppedRef.current = true;
      triggerHaptic([15, 30, 15]);
      onStopHoldRecord(true);
      return;
    }

    justStoppedRef.current = false;

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

    // Threshold (150ms) to distinguish instant tap from hold-to-talk
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

    if (justStoppedRef.current) {
      justStoppedRef.current = false;
      return;
    }

    if (!isHeldRef.current) {
      // Quick tap when idle -> start recording immediately
      if (!isRecordingShadow) {
        triggerHaptic(18);
        onStartHoldRecord();
      }
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

      {/* ── SECONDARY INSTRUMENT ROW (Universal: Mobile & Desktop): Tempo, Line-by-Line & Type ── */}
      <div className="flex items-center justify-between w-full max-w-[360px] sm:max-w-md px-3 sm:px-4 py-1 sm:py-1.5 mb-1.5 bg-[#e4dfd3]/95 backdrop-blur-sm border-2 border-[#1c1d20] rounded-full shadow-[3px_3px_0px_#18191c] text-xs font-mono font-bold select-none">
        {/* Tempo Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] sm:text-[10px] text-[#6b6659] tracking-wider uppercase">TEMPO:</span>
          <div className="flex bg-[#d8d2c4] p-0.5 rounded-full border border-[#a8a497]">
            <button
              onClick={() => { triggerHaptic(10); onSelectMode('slow'); }}
              title="Slow Mode (0.75x)"
              className={`px-2 py-0.5 text-[9px] sm:text-[10px] rounded-full transition-colors ${playbackMode === 'slow' ? 'bg-[#1c1d20] text-white shadow-inner font-bold' : 'text-[#4d4a43] hover:text-[#1c1d20]'}`}
            >
              0.75×
            </button>
            <button
              onClick={() => { triggerHaptic(10); onSelectMode('normal'); }}
              title="Normal Mode (1.0x)"
              className={`px-2 py-0.5 text-[9px] sm:text-[10px] rounded-full transition-colors ${playbackMode === 'normal' ? 'bg-[#1c1d20] text-white shadow-inner font-bold' : 'text-[#4d4a43] hover:text-[#1c1d20]'}`}
            >
              1.0×
            </button>
          </div>
        </div>

        <div className="h-3.5 w-[1px] bg-[#a8a497]" />

        {/* Line-by-Line (Caption-by-Caption) Toggle Button */}
        <button
          onClick={() => { triggerHaptic(10); onToggleAutoPause(); }}
          title={autoPause ? "Line-by-Line Mode: ON (Stops after each caption)" : "Line-by-Line Mode: OFF (Continuous video)"}
          className="flex items-center gap-1.5 py-0.5 active:scale-95 transition-transform"
        >
          <span className="text-[9px] sm:text-[10px] text-[#6b6659] tracking-wider uppercase flex items-center gap-1">
            LINE-BY-LINE:
            {isInRoom && <span className="text-[10px]" title="Synced for all users in room">🤝</span>}
          </span>
          <span className={`text-[9.5px] sm:text-[10.5px] px-2.5 py-0.5 rounded-full font-bold uppercase transition-colors shadow-sm ${autoPause ? 'bg-[#cf573c] text-white' : 'bg-[#c5bfb0] text-[#4d4a43] hover:bg-[#b8b2a3]'}`}>
            {autoPause ? 'ON' : 'OFF'}
          </span>
        </button>

        {/* Dictation Mode Toggle */}
        {onToggleDictationMode && (
          <>
            <div className="h-3.5 w-[1px] bg-[#a8a497]" />
            <button
              onClick={() => { triggerHaptic(10); onToggleDictationMode(); }}
              title={isDictationMode ? "Dictation: ON (Typing)" : "Dictation: OFF"}
              className="flex items-center gap-1.5 py-0.5 active:scale-95 transition-transform"
            >
              <span className="text-[9px] sm:text-[10px] text-[#6b6659] tracking-wider uppercase">TYPE:</span>
              <span className={`text-[9.5px] sm:text-[10.5px] px-2 py-0.5 rounded-full font-bold uppercase transition-colors shadow-sm ${isDictationMode ? 'bg-[#3d7a4d] text-white' : 'bg-[#c5bfb0] text-[#4d4a43] hover:bg-[#b8b2a3]'}`}>
                {isDictationMode ? 'ON' : 'OFF'}
              </span>
            </button>
          </>
        )}
      </div>

      {/* ── PRIMARY THUMB ISLAND ── */}
      <div className="w-full bg-[#e4dfd3] border-2 border-[#1c1d20] rounded-full px-4 sm:px-8 py-2 sm:py-3 shadow-[5px_5px_0px_#18191c] flex items-center justify-between text-[#1c1d20] select-none gap-2 sm:gap-4">

        
        {/* 1. Previous Line (<) - Enlarged Thumb Target */}
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
        <div className="relative">
          <button
            onClick={() => {
              if (isVideoPlayLocked) {
                triggerHaptic([30, 40, 30]);
                onTogglePlay(); // parent handles lock toast notification
                return;
              }
              triggerHaptic(12);
              onTogglePlay();
            }}
            title={isVideoPlayLocked ? "Recording in progress (video locked)" : isPlaying ? "Pause" : "Play"}
            className={`w-13 h-13 sm:w-12 sm:h-12 min-w-[50px] min-h-[50px] rounded-full flex items-center justify-center shadow-[inset_1px_1px_3px_rgba(0,0,0,0.8)] border-2 transition-all ${
              isVideoPlayLocked
                ? 'bg-[#1c1d20]/50 border-[#1c1d20]/70 text-[#a09c91] cursor-not-allowed opacity-75'
                : 'bg-[#1c1d20] text-[#e4dfd3] border-[#1c1d20] hover:bg-[#cf573c] hover:border-[#cf573c] active:scale-95'
            }`}
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

          {/* Locked Badge during recording */}
          {isVideoPlayLocked && (
            <span 
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#eab308] text-[#1c1d20] flex items-center justify-center border border-[#1c1d20] shadow-[1px_1px_0px_#18191c] pointer-events-none"
              title="Video locked during recording"
            >
              <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
            </span>
          )}
        </div>

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

        {/* 6. Shadow Microphone Button & Floating Audio Play Icons */}
        <div className="relative flex items-center">
          {/* Replay My Recording Button (Left Shoulder) */}
          {hasLocalAudio && (
            <button
              onClick={() => { triggerHaptic(12); onTogglePlayLocalAudio?.(); }}
              title={isPlayingLocalAudio ? "Stop My Shadow Recording" : "Replay My Shadow Recording"}
              className={`absolute -top-3.5 -left-3.5 sm:-top-3 sm:-left-4 w-9 h-9 sm:w-8 sm:h-8 rounded-full border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] flex items-center justify-center transition-all z-30 active:scale-95 active:shadow-none ${
                isPlayingLocalAudio
                  ? 'bg-[#eab308] text-[#1c1d20] shadow-[0_0_12px_rgba(234,179,8,0.9)] scale-110 font-bold'
                  : 'bg-[#4a473e] hover:bg-[#1c1d20] text-[#e4dfd3]'
              }`}
            >
              {isPlayingLocalAudio ? (
                <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5 fill-current" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1.5" />
                </svg>
              ) : (
                <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </button>
          )}

          <button
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onContextMenu={(e) => e.preventDefault()}
            title={isRecordingShadow ? "Click to Stop & Send" : "Click to Record / Hold to Speak"}
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
              {isRecordingShadow ? (isCancelArmed ? 'CANCEL' : 'STOP') : 'SHADOW'}
            </span>
          </button>

          {/* Floating Partner Play Button with Micro-Dot & Circled Timeline */}
          {(hasPartnerAudio || isPartnerRecording || isPartnerListeningToMyAudio) && (
            <div className="absolute -top-3.5 -right-3.5 sm:-top-3 sm:-right-4 z-30">
              <button
                onClick={() => { triggerHaptic(12); onTogglePlayPartnerAudio?.(); }}
                disabled={isPartnerRecording && !hasPartnerAudio}
                title={
                  isPartnerRecording 
                    ? "Partner is currently speaking..." 
                    : isPartnerListeningToMyAudio 
                      ? "Partner is listening to your recording!" 
                      : isPlayingPartnerAudio 
                        ? "Stop Partner Audio" 
                        : "Play Partner's Shadow Recording"
                }
                className={`relative w-9 h-9 sm:w-8 sm:h-8 rounded-full border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] flex items-center justify-center transition-all active:scale-95 active:shadow-none ${
                  isPartnerListeningToMyAudio
                    ? 'bg-[#eab308] text-[#1c1d20] shadow-[0_0_12px_rgba(234,179,8,0.9)] scale-105'
                    : isPlayingPartnerAudio
                      ? 'bg-[#3b82f6] text-white shadow-[0_0_12px_rgba(59,130,246,0.9)] scale-110'
                      : isPartnerRecording
                        ? 'bg-[#2b5536] text-white'
                        : 'bg-[#3d7a4d] hover:bg-[#346942] text-white animate-bounce-short'
                }`}
              >
                {/* SVG Circled Timeline Progress Ring (r=18, Circumference = 2 * PI * 18 = 113.1) */}
                {(isPlayingPartnerAudio || isPartnerListeningToMyAudio) && (
                  <svg 
                    className="absolute -inset-1.5 w-[calc(100%+12px)] h-[calc(100%+12px)] -rotate-90 pointer-events-none"
                    viewBox="0 0 44 44"
                  >
                    {/* Background Track Ring */}
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      stroke="#1c1d20"
                      strokeWidth="3"
                      className="opacity-30"
                    />
                    {/* Animated Progress Timeline Ring */}
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      stroke={isPartnerListeningToMyAudio ? "#eab308" : "#38bdf8"}
                      strokeWidth="3.2"
                      strokeDasharray="113.1"
                      strokeDashoffset={113.1 * (1 - Math.min(1, Math.max(0, partnerAudioProgress || 0)))}
                      strokeLinecap="round"
                      className="transition-[stroke-dashoffset] duration-75"
                    />
                  </svg>
                )}

                {/* Inner Icon */}
                {isPartnerListeningToMyAudio ? (
                  // Headphones / listening icon
                  <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5 fill-current animate-pulse" viewBox="0 0 24 24">
                    <path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5v-1a7 7 0 1 1 14 0v1h-2a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"/>
                  </svg>
                ) : isPlayingPartnerAudio ? (
                  <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5 fill-current" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1.5" />
                  </svg>
                ) : isPartnerRecording ? (
                  // Small mic indicating partner speaking
                  <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5 stroke-current animate-pulse" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}

                {/* Floating Micro-Dot (Notice partner is in recording!) */}
                {isPartnerRecording && (
                  <span 
                    className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center pointer-events-none z-40"
                    title="Partner is recording"
                  >
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-80" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#ef4444] border border-[#1c1d20] shadow-[0_0_8px_rgba(239,68,68,1)]" />
                  </span>
                )}

                {/* '1' Unread Notification Badge */}
                {hasUnreadPartnerAudio && !isPartnerRecording && !isPartnerListeningToMyAudio && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#cf573c] text-[#fbf8f2] text-[9px] font-mono font-bold flex items-center justify-center border border-[#1c1d20] shadow-[1px_1px_0px_#18191c] animate-pulse pointer-events-none">
                    1
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default ControlDock;
