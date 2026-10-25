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
  const playerRef = useRef<any>(null);
  const isPlayingRef = useRef(false);
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

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) return;

      // Force destroy existing player to ensure new playerVars (like controls: 0) are perfectly applied
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.warn("Could not destroy old player", e);
        }
      }

      try {
        playerRef.current = new window.YT.Player(containerId.current, {
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
                setPlayerError("The owner of this video has disabled playback on external websites (Error 150).");
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
      initPlayer();
    } else {
      checkInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkInterval);
          initPlayer();
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

  // Expose imperative handle methods
  useImperativeHandle(ref, () => ({
    play: () => {
      if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
        playerRef.current.playVideo();
      }
    },
    pause: () => {
      if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
        playerRef.current.pauseVideo();
      }
    },
    togglePlay: () => {
      if (isPlayingRef.current) {
        playerRef.current?.pauseVideo();
      } else {
        playerRef.current?.playVideo();
      }
    },
    seekTo: (seconds: number) => {
      if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(seconds, true);
        lastReportedTimeRef.current = seconds;
        lastReportedPerfRef.current = performance.now();
        onTimeUpdate(seconds);
      }
    },
    setPlaybackRate: (rate: number) => {
      if (playerRef.current && typeof playerRef.current.setPlaybackRate === 'function') {
        playerRef.current.setPlaybackRate(rate);
      }
    },
    getCurrentTime: () => {
      return playerRef.current?.getCurrentTime() || 0;
    }
  }));

  return (
    <div className="w-full relative aspect-video bg-black overflow-hidden select-none group">
      
      {/* 1. Strict pointer-events isolation wrapper. 
          The API replaces the inner div, so this wrapper guarantees the iframe cannot be hovered, 
          which kills the Share, Watch Later, and 'More videos' popups. */}
      <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
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
        <div className="absolute inset-0 z-30 bg-[#121318]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white">
          <div className="w-12 h-12 rounded-full bg-red-900/40 border border-red-500/50 flex items-center justify-center mb-3">
            <span className="text-xl">⚠️</span>
          </div>
          <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider mb-1">
            Video Embedding Restricted
          </h3>
          <p className="font-mono text-xs text-[#a0a4b5] max-w-md leading-relaxed mb-4">
            {playerError}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#242633] hover:bg-[#323546] text-white border border-[#3e4256] px-4 py-2 rounded-xl font-mono text-xs font-bold uppercase flex items-center gap-1.5 transition-all"
            >
              <span>WATCH ON YOUTUBE</span>
              <span>↗</span>
            </a>
            {onOpenLibrary && (
              <button
                type="button"
                onClick={onOpenLibrary}
                className="bg-[#f0611e] hover:bg-[#ff712e] text-white px-4 py-2 rounded-xl font-mono text-xs font-bold uppercase transition-all shadow-md"
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
