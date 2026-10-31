import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface YouTubePlayerRef {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => number;
}

interface YouTubePlayerProps {
  videoId: string;
  onTimeUpdate: (currentTime: number) => void;
  onStateChange: (isPlaying: boolean) => void;
  onDurationChange?: (duration: number) => void;
  playbackRate?: number;
  onOpenLibrary?: () => void;
  initialTime?: number;
}

const YouTubePlayer = forwardRef<YouTubePlayerRef, YouTubePlayerProps>(({
  videoId,
  onTimeUpdate,
  onStateChange,
  onDurationChange,
  playbackRate = 1,
  onOpenLibrary,
  initialTime = 0
}, ref) => {
  const containerId = useRef(`yt-player-${Math.random().toString(36).substring(2, 9)}`);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const isPlayingRef = useRef(false);
  const isFallbackHostRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Load YouTube IFrame API script once
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Initialize or re-create player when videoId changes
  useEffect(() => {
    let checkInterval: any = null;
    setPlayerError(null);

    const checkAndEmitDuration = (event: any) => {
      if (onDurationChange && event.target && typeof event.target.getDuration === 'function') {
        const duration = event.target.getDuration();
        if (duration > 0) {
          onDurationChange(duration);
        }
      }
    };

    const initPlayer = (useNocookie = false) => {
      if (!window.YT || !window.YT.Player) return;

      // Ensure DOM container exists
      if (wrapperRef.current && !document.getElementById(containerId.current)) {
        wrapperRef.current.innerHTML = `<div id="${containerId.current}"></div>`;
      }

      // Force destroy existing player to ensure new playerVars (like controls: 0) are perfectly applied
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.warn("Could not destroy old player", e);
        }
      }

      // Re-create inner div if destroy removed it
      if (wrapperRef.current && !document.getElementById(containerId.current)) {
        wrapperRef.current.innerHTML = `<div id="${containerId.current}"></div>`;
      }

      try {
        const host = useNocookie ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com';

        playerRef.current = new window.YT.Player(containerId.current, {
          host,
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            origin: window.location.origin,
            widget_referrer: window.location.origin,
            start: Math.floor(initialTime),
            autoplay: 1,       // Auto-play to skip the initial red play button screen
            controls: 0,       // Force hide native timeline and buttons
            disablekb: 1,      // Disable YouTube keyboard shortcuts
            fs: 0,             // Hide fullscreen button
            iv_load_policy: 3, // Hide annotations
            rel: 0,            // Hide related videos at end
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            cc_load_policy: 0
          },
          events: {
            onReady: (event: any) => {
              try {
                event.target.setPlaybackRate(playbackRate);
                event.target.playVideo(); // Aggressively start playing
                checkAndEmitDuration(event);
              } catch (e) {}
            },
            onStateChange: (event: any) => {
              checkAndEmitDuration(event);
              
              // YT.PlayerState.PLAYING is 1, PAUSED is 2, ENDED is 0, BUFFERING is 3
              const playing = event.data === 1;
              isPlayingRef.current = playing;
              onStateChange(playing);

              if (playing) {
                startTracking();
              } else {
                stopTracking();
                if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
                  onTimeUpdate(playerRef.current.getCurrentTime());
                }
              }
            },
            onError: (event: any) => {
              console.warn("YouTube Player error event:", event.data);
              if (event.data === 101 || event.data === 150) {
                setPlayerError("RESTRICTED_150");
              } else if (event.data === 100) {
                setPlayerError("This YouTube video could not be found or has been removed.");
              } else {
                setPlayerError("Video playback error. Please try another clip or open directly in YouTube.");
              }
            }
          }
        });
      } catch (err) {
        console.error("Failed to instantiate YT.Player:", err);
      }
    };

    if (window.YT && window.YT.Player) {
      initPlayer(false);
    } else {
      checkInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkInterval);
          initPlayer(false);
        }
      }, 100);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      stopTracking();
    };
  }, [videoId]);

  // Sync playback rate changes
  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.setPlaybackRate === 'function') {
      try {
        playerRef.current.setPlaybackRate(playbackRate);
      } catch (e) {}
    }
  }, [playbackRate]);

  const lastReportedTimeRef = useRef<number>(0);
  const lastReportedPerfRef = useRef<number>(0);

  // High-frequency time sync loop with continuous microsecond interpolation
  const startTracking = () => {
    stopTracking();
    if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
      lastReportedTimeRef.current = playerRef.current.getCurrentTime() || 0;
      lastReportedPerfRef.current = performance.now();
    }

    const loop = () => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        const rawTime = playerRef.current.getCurrentTime() || 0;
        const now = performance.now();

        // Detect if YouTube player posted a new time update over postMessage
        if (Math.abs(rawTime - lastReportedTimeRef.current) > 0.008) {
          lastReportedTimeRef.current = rawTime;
          lastReportedPerfRef.current = now;
        }

        // Interpolate smoothly forward between the 250ms postMessage ticks
        const elapsed = (now - lastReportedPerfRef.current) / 1000;
        const clampedElapsed = Math.min(Math.max(elapsed, 0), 0.35);
        const continuousTime = lastReportedTimeRef.current + (clampedElapsed * (playbackRate || 1));

        onTimeUpdate(continuousTime);
      }
      if (isPlayingRef.current) {
        animFrameRef.current = requestAnimationFrame(loop);
      }
    };
    animFrameRef.current = requestAnimationFrame(loop);
  };

  const stopTracking = () => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
      const raw = playerRef.current.getCurrentTime() || 0;
      lastReportedTimeRef.current = raw;
      lastReportedPerfRef.current = performance.now();
      onTimeUpdate(raw);
    }
  };

  // Launch external synced companion pop-up when iframe embedding is blocked
  const launchSyncedPopup = () => {
    const currentSec = Math.floor(lastReportedTimeRef.current || initialTime || 0);
    const width = 580;
    const height = 380;
    const left = Math.max(0, (window.screen.width || 1200) - width - 30);
    const top = 60;
    const popup = window.open(
      `https://www.youtube.com/watch?v=${videoId}&t=${currentSec}`,
      'toolker_yt_synced',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,status=no`
    );
    if (popup) {
      popup.focus();
    }
  };

  // Expose imperative handle methods
  useImperativeHandle(ref, () => ({
    play: () => {
      if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
        try { playerRef.current.playVideo(); } catch (_) {}
      } else {
        isPlayingRef.current = true;
        onStateChange(true);
      }
    },
    pause: () => {
      if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
        try { playerRef.current.pauseVideo(); } catch (_) {}
      } else {
        isPlayingRef.current = false;
        onStateChange(false);
      }
    },
    togglePlay: () => {
      if (playerRef.current && typeof playerRef.current.playVideo === 'function' && typeof playerRef.current.pauseVideo === 'function') {
        if (isPlayingRef.current) {
          playerRef.current.pauseVideo();
        } else {
          playerRef.current.playVideo();
        }
      } else {
        const nextState = !isPlayingRef.current;
        isPlayingRef.current = nextState;
        onStateChange(nextState);
      }
    },
    seekTo: (seconds: number) => {
      lastReportedTimeRef.current = seconds;
      lastReportedPerfRef.current = performance.now();
      onTimeUpdate(seconds);
      if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        try { playerRef.current.seekTo(seconds, true); } catch (_) {}
      }
    },
    setPlaybackRate: (rate: number) => {
      if (playerRef.current && typeof playerRef.current.setPlaybackRate === 'function') {
        try { playerRef.current.setPlaybackRate(rate); } catch (_) {}
      }
    },
    getCurrentTime: () => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        try {
          return playerRef.current.getCurrentTime() || lastReportedTimeRef.current;
        } catch (_) {}
      }
      return lastReportedTimeRef.current;
    }
  }));

  return (
    <div className="w-full relative aspect-video bg-black overflow-hidden select-none group">
      
      {/* 1. Strict pointer-events isolation wrapper with wrapperRef */}
      <div ref={wrapperRef} className="absolute inset-0 w-full h-full pointer-events-none z-0">
        <div id={containerId.current} />
      </div>
      
      {/* Removed cinematic bars per user request */}
      
      {/* 3. Invisible overlay to block native YouTube hover elements and capture clicks */}
      <div 
        className="absolute inset-0 w-full h-full z-20 cursor-pointer" 
        onClick={() => {
          if (isPlayingRef.current) {
            playerRef.current?.pauseVideo();
          } else {
            playerRef.current?.playVideo();
          }
        }}
      />
      
      {/* Error Fallback Banner */}
      {playerError && (
        <div className="absolute inset-0 z-30 bg-[#141518]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-[#ebe6d8]">
          <div className="w-14 h-14 rounded-2xl bg-[#cf573c]/20 border-2 border-[#cf573c] flex items-center justify-center mb-3 shadow-[2px_2px_0px_#18191c]">
            <span className="text-2xl">⚠️</span>
          </div>

          <h3 className="font-mono text-sm md:text-base font-bold text-[#ebe6d8] uppercase tracking-wider mb-1">
            {playerError === 'RESTRICTED_150' ? 'VIDEO EMBEDDING RESTRICTED (ERROR 150)' : 'VIDEO PLAYBACK RESTRICTED'}
          </h3>

          <p className="font-mono text-xs text-[#a0a4b5] max-w-lg leading-relaxed mb-5">
            {playerError === 'RESTRICTED_150'
              ? "The creator or copyright owner (e.g. BBC, VEVO, Warner) has disabled playback in third-party embedded players. All subtitles and dialogue are extracted and 100% ready for shadowing!"
              : playerError}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {playerError === 'RESTRICTED_150' && (
              <button
                type="button"
                onClick={launchSyncedPopup}
                className="bg-[#386b52] hover:bg-[#2e5743] text-white border-2 border-[#1c1d20] shadow-[2px_2px_0px_#1c1d20] px-4 py-2.5 rounded-xl font-mono text-xs font-bold uppercase flex items-center gap-2 transition-all active:translate-y-0.5 active:shadow-none"
              >
                <span>⚡ LAUNCH SYNCED POP-UP</span>
              </button>
            )}

            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#242633] hover:bg-[#323546] text-white border-2 border-[#1c1d20] shadow-[2px_2px_0px_#1c1d20] px-4 py-2.5 rounded-xl font-mono text-xs font-bold uppercase flex items-center gap-1.5 transition-all active:translate-y-0.5 active:shadow-none"
            >
              <span>WATCH ON YOUTUBE</span>
              <span>↗</span>
            </a>

            {onOpenLibrary && (
              <button
                type="button"
                onClick={onOpenLibrary}
                className="bg-[#cf573c] hover:bg-[#b84830] text-white border-2 border-[#1c1d20] shadow-[2px_2px_0px_#1c1d20] px-4 py-2.5 rounded-xl font-mono text-xs font-bold uppercase transition-all active:translate-y-0.5 active:shadow-none"
              >
                CHOOSE ANOTHER CLIP 🎬
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default YouTubePlayer;
