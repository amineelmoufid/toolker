import React, { useState, useRef, useEffect } from 'react';
import { useRoom } from '../../contexts/RoomContext';
import { RoomShareButton } from '../common/RoomShareButton';
import { SectionNavigator } from '../common/SectionNavigator';
import { FOCUS_FLOW_HTML } from './focusFlowTemplate';

interface FocusReaderStudioProps {
  onBack: () => void;
}

declare global {
  interface Window {
    bootFocusFlow?: () => void;
    destroyFocusFlow?: () => void;
  }
}

const FocusReaderStudio: React.FC<FocusReaderStudioProps> = ({ onBack }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { isConnected, broadcastAction, lastAction, roomId, peerId } = useRoom();

  // Forward incoming partner room actions to Focus Reader DOM
  useEffect(() => {
    if (lastAction) {
      window.dispatchEvent(new CustomEvent('toolker:room-action', { detail: lastAction }));
    }
  }, [lastAction]);

  // Forward reader broadcasts to RoomContext
  useEffect(() => {
    const handleBroadcast = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (isConnected && customEvent.detail) {
        broadcastAction(customEvent.detail);
      }
    };
    window.addEventListener('toolker:broadcast-action', handleBroadcast);
    return () => window.removeEventListener('toolker:broadcast-action', handleBroadcast);
  }, [isConnected, broadcastAction]);

  // Expose room connection status to window for reader UI
  useEffect(() => {
    (window as any).__toolkerRoomState = {
      isConnected,
      roomId,
      peerId
    };
    window.dispatchEvent(new CustomEvent('toolker:room-status', {
      detail: { isConnected, roomId, peerId }
    }));
  }, [isConnected, roomId, peerId]);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Mount the FocusFlow template into native DOM
    containerRef.current.innerHTML = FOCUS_FLOW_HTML;

    // 2. Boot the engine
    if (typeof window.bootFocusFlow === 'function') {
      window.bootFocusFlow();
    } else {
      // Dynamic load script if not yet cached on window
      const scriptId = 'focus-flow-engine-script';
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = '/reader/app.js';
        script.async = true;
        document.body.appendChild(script);
      } else {
        // Script already in DOM, trigger boot
        setTimeout(() => {
          window.bootFocusFlow?.();
        }, 50);
      }
    }

    // 3. Cleanup on unmount (cancel speech audio, unmount listeners)
    return () => {
      try {
        window.destroyFocusFlow?.();
      } catch (e) {
        console.warn('FocusFlow cleanup error:', e);
      }
    };
  }, []);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className={`min-h-screen bg-[#d8d2c4] text-[#1c1d20] flex flex-col font-sans ${isFullscreen ? 'p-0' : 'p-2 sm:p-6 pb-20'}`}>
      
      {/* ── TOOLKER CHASSIS TOP BAR ── */}
      {!isFullscreen && (
        <header className="max-w-6xl w-full mx-auto mb-3 sm:mb-4 bg-[#e4dfd3] p-2.5 sm:p-4 rounded-lg border-2 border-[#1c1d20] shadow-[4px_4px_0px_#18191c] sm:shadow-[5px_5px_0px_#18191c] relative flex items-center justify-between gap-2 sm:gap-4 select-none">
          {/* Chassis Corner Rivets */}
          <div className="absolute top-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
          <div className="absolute top-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
          <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
          <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>

          {/* Left: Section Navigator */}
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <SectionNavigator activeMode="reader" />
          </div>

          {/* Center: Module Telemetry Title */}
          <div className="flex flex-col items-center text-center flex-1 min-w-0 px-1">
            <span className="font-mono text-[8.5px] sm:text-[10px] font-bold tracking-widest text-[#5c5950] uppercase mb-0.5 truncate max-w-full">
              PRECISION BIONIC CANVAS // SPEC-80
            </span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#3b82f6] animate-pulse shrink-0" />
              <h1 className="font-sans text-xs sm:text-lg font-bold text-[#1c1d20] tracking-tight uppercase truncate max-w-[160px] sm:max-w-md">
                Focus Reader &amp; Brain Gym
              </h1>
            </div>
          </div>

          {/* Right: Quick Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 mr-1">
            <RoomShareButton modeName="reader" />

            <button
              onClick={toggleFullscreen}
              title="Expand Canvas to Fullscreen"
              className="text-[10px] sm:text-xs font-mono font-bold uppercase bg-[#16171a] hover:bg-[#2c2d33] text-[#ebe6d8] border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] px-2 sm:px-3 py-1.5 sm:py-2 rounded-md transition-all active:translate-y-0.5 active:shadow-[0px_0px_0px_#18191c] flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
              <span className="hidden sm:inline">FULLSCREEN</span>
            </button>
          </div>
        </header>
      )}

      {/* ── NATIVE MOUNTED FOCUSFLOW CANVAS (NO IFRAME) ── */}
      <div 
        className={`w-full max-w-6xl mx-auto flex-1 transition-all duration-200 relative ${
          isFullscreen 
            ? 'fixed inset-0 z-50 rounded-none max-w-none border-0 bg-[#d8d2c4] overflow-auto' 
            : 'min-h-[calc(100vh-110px)] sm:min-h-[calc(100vh-140px)]'
        }`}
      >
        {/* Floating Exit Button in Fullscreen Mode */}
        {isFullscreen && (
          <button
            onClick={toggleFullscreen}
            title="Exit Fullscreen"
            className="absolute top-3 right-3 z-50 bg-[#16171a]/90 hover:bg-[#cf573c] text-white px-3 py-1.5 rounded-full border-2 border-[#ebe6d8]/40 shadow-lg font-mono text-xs font-bold uppercase backdrop-blur-sm transition-all flex items-center gap-1.5"
          >
            <span>✕ EXIT FULLSCREEN</span>
          </button>
        )}

        {/* The Native Mount Container */}
        <div 
          id="focusFlowAppRoot"
          ref={containerRef}
          className="focus-flow-root theme-light font-lexend w-full h-full min-h-[calc(100vh-120px)] sm:min-h-[calc(100vh-145px)]"
        />
      </div>

    </div>
  );
};

export default FocusReaderStudio;
