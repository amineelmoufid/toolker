import React, { useState, useRef, useEffect } from 'react';
import { ShadowingClip, SubtitleLine } from '../../types';
import { PRESET_CLIPS } from './mockClips';
import YouTubePlayer, { YouTubePlayerRef } from './YouTubePlayer';
import SubtitleStage from './SubtitleStage';
import ControlDock from './ControlDock';
import ShadowRecorderModal from './ShadowRecorderModal';
import VideoLibraryModal from './VideoLibraryModal';
import CustomTimeline from './CustomTimeline';
import { useRoom } from '../../contexts/RoomContext';
import { RoomShareButton } from '../common/RoomShareButton';
import { SectionNavigator } from '../common/SectionNavigator';
import { blobToBase64, playStandardAudio, stopAllAudio } from '../../utils/audio';

interface ShadowingStudioProps {
  onBack: () => void;
}

const ShadowingStudio: React.FC<ShadowingStudioProps> = ({ onBack }) => {
  // Initialize state from local storage if available
  const [currentClip, setCurrentClip] = useState<ShadowingClip | null>(() => {
    try {
      const storedSession = localStorage.getItem('toolker_last_session');
      if (storedSession) {
        const parsed = JSON.parse(storedSession);
        if (parsed.clip && parsed.clip.youtubeId && parsed.clip.youtubeId !== 'qB254u2N5gQ') {
          return parsed.clip;
        }
      }
    } catch (e) {}

    // Fallback to first saved clip if it exists
    try {
      const storedClips = localStorage.getItem('toolker_saved_clips') || localStorage.getItem('toolker_custom_clips');
      if (storedClips) {
        const parsedClips = JSON.parse(storedClips);
        const validClip = parsedClips.find((c: any) => c.youtubeId && c.youtubeId !== 'qB254u2N5gQ');
        if (validClip) return validClip;
      }
    } catch (e) {}

    return PRESET_CLIPS.length > 0 ? PRESET_CLIPS[0] : null;
  });
  
  const [currentTime, setCurrentTime] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('toolker_last_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.currentTime === 'number') return parsed.currentTime;
      }
    } catch (e) {}
    return 0;
  });

  const [duration, setDuration] = useState<number>(0);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackMode, setPlaybackMode] = useState<'slow' | 'normal'>('normal');
  const [autoPause, setAutoPause] = useState<boolean>(false);
  
  // Dictation / Typing Mode States
  const [isDictationMode, setIsDictationMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('toolker_yt_dictation_mode') === 'true';
    } catch (e) {
      return false;
    }
  });

  const [maskMode, setMaskMode] = useState<'asterisks' | 'blur'>(() => {
    try {
      const stored = localStorage.getItem('toolker_yt_mask_mode');
      return (stored === 'blur' || stored === 'asterisks') ? stored : 'asterisks';
    } catch (e) {
      return 'asterisks';
    }
  });

  const [showTranslation, setShowTranslation] = useState<boolean>(() => {
    try {
      return localStorage.getItem('toolker_yt_show_translation') !== 'false';
    } catch (e) {
      return true;
    }
  });
  
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(currentClip === null);
  const [activeShadowLine, setActiveShadowLine] = useState<SubtitleLine | null>(null);
  const [isAutoHealingSubtitles, setIsAutoHealingSubtitles] = useState<boolean>(false);
  const [subtitlesError, setSubtitlesError] = useState<string | null>(null);

  // Auto-heal subtitles if currentClip has empty or missing subtitles
  useEffect(() => {
    if (!currentClip || !currentClip.youtubeId) return;

    if (currentClip.subtitles && currentClip.subtitles.length > 0) {
      setIsAutoHealingSubtitles(false);
      setSubtitlesError(null);
      return;
    }

    let isMounted = true;
    let pollInterval: any = null;
    let attempts = 0;
    const maxAttempts = 60;
    const ytId = currentClip.youtubeId;

    setIsAutoHealingSubtitles(true);
    setSubtitlesError(null);

    const applySubtitles = (subs: SubtitleLine[]) => {
      if (!isMounted || !subs || subs.length === 0) return;
      setCurrentClip(prev => {
        if (!prev || prev.youtubeId !== ytId) return prev;
        const updated = { ...prev, subtitles: subs };
        try {
          const stored = localStorage.getItem('toolker_last_session');
          if (stored) {
            const parsed = JSON.parse(stored);
            localStorage.setItem('toolker_last_session', JSON.stringify({ ...parsed, clip: updated }));
          }
          const storedClips = localStorage.getItem('toolker_custom_clips');
          if (storedClips) {
            const parsedList = JSON.parse(storedClips);
            const updatedList = parsedList.map((c: any) => c.youtubeId === ytId ? { ...c, subtitles: subs } : c);
            localStorage.setItem('toolker_custom_clips', JSON.stringify(updatedList));
          }
        } catch (_) {}
        return updated;
      });
      setIsAutoHealingSubtitles(false);
      setSubtitlesError(null);
      showToast(`✓ Subtitles Loaded (${subs.length} cues)`);
    };

    const runExtraction = async () => {
      // 1. Direct static check
      try {
        const staticRes = await fetch(`/transcripts/${ytId}.json?_t=${Date.now()}`);
        const contentType = staticRes.headers.get('content-type') || '';
        if (staticRes.ok && contentType.includes('application/json')) {
          const staticData = await staticRes.json();
          if (staticData.ok && Array.isArray(staticData.subtitles) && staticData.subtitles.length > 0) {
            applySubtitles(staticData.subtitles);
            return;
          }
        }
      } catch (_) {}

      // 2. Direct API check
      try {
        const checkRes = await fetch(`/api/extract?v=${ytId}&_t=${Date.now()}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.ok && Array.isArray(checkData.subtitles) && checkData.subtitles.length > 0) {
            applySubtitles(checkData.subtitles);
            return;
          }
        }
      } catch (_) {}

      // 3. Trigger cloud extractor
      try {
        await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: ytId })
        });
      } catch (_) {}

      // 4. Poll every 2 seconds
      pollInterval = setInterval(async () => {
        if (!isMounted) {
          clearInterval(pollInterval);
          return;
        }
        attempts++;
        try {
          const pollRes = await fetch(`/api/extract?v=${ytId}&_t=${Date.now()}`);
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.ok && Array.isArray(pollData.subtitles) && pollData.subtitles.length > 0) {
              clearInterval(pollInterval);
              applySubtitles(pollData.subtitles);
              return;
            }
          }
        } catch (_) {}

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          if (isMounted) {
            setIsAutoHealingSubtitles(false);
            setSubtitlesError("No subtitles available on YouTube for this video.");
          }
        }
      }, 2000);
    };

    runExtraction();

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [currentClip?.youtubeId, currentClip?.subtitles?.length]);

  const playerRef = useRef<YouTubePlayerRef | null>(null);
  const lastSavedTimeRef = useRef<number>(0);
  const lastActiveLineRef = useRef<SubtitleLine | null>(null);

  const { peerId, roomId, isConnected, createRoom, syncClip, broadcastAction, lastAction, syncedClip } = useRoom();

  // Synchronize clip from room partner (via Firebase & PeerJS)
  useEffect(() => {
    if (syncedClip) {
      setCurrentClip(prev => {
        if (prev?.id === syncedClip.id && prev?.youtubeId === syncedClip.youtubeId) return prev;
        return syncedClip;
      });
      showToast(`🎬 SYNCED VIDEO: ${syncedClip.title || 'Clip Loaded'}`);
    }
  }, [syncedClip]);

  // If in room and we already have a clip, ensure room is synced
  useEffect(() => {
    if (roomId && currentClip && isConnected) {
      syncClip(currentClip);
    }
  }, [roomId]);

  // Hold-to-record Shadow state
  const [isRecordingShadow, setIsRecordingShadow] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [latestLocalAudio, setLatestLocalAudio] = useState<string | null>(null);
  const [latestPartnerAudio, setLatestPartnerAudio] = useState<string | null>(null);
  const [isPlayingPartnerAudio, setIsPlayingPartnerAudio] = useState(false);
  const [hasUnreadPartnerAudio, setHasUnreadPartnerAudio] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (msg: string, duration = 3000) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, duration);
  };

  // Listen to remote AUDIO_SYNC broadcasts from room partner - DO NOT play immediately, pop up button instead
  useEffect(() => {
    if (lastAction?.type === 'AUDIO_SYNC' && lastAction.payload) {
      const remoteAudio = lastAction.payload;
      setLatestPartnerAudio(remoteAudio);
      setIsPlayingPartnerAudio(false);
      setHasUnreadPartnerAudio(true);
      showToast("🎙️ PARTNER SHADOWED // CLICK ▶ TO LISTEN", 4000);
    }
  }, [lastAction]);

  const handleTogglePlayPartnerAudio = () => {
    if (!latestPartnerAudio) return;
    setHasUnreadPartnerAudio(false); // Disappears immediately when played!
    if (isPlayingPartnerAudio) {
      stopAllAudio();
      setIsPlayingPartnerAudio(false);
    } else {
      stopAllAudio();
      setIsPlayingPartnerAudio(true);
      playStandardAudio(latestPartnerAudio, () => {
        setIsPlayingPartnerAudio(false);
      });
    }
  };

  // Clean up media streams and timers
  useEffect(() => {
    return () => {
      stopAllAudio();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);


  // Persist session to local storage (throttled to 2 seconds for performance)
  useEffect(() => {
    const now = Date.now();
    if (now - lastSavedTimeRef.current > 2000) {
      try {
        localStorage.setItem('toolker_last_session', JSON.stringify({
          clip: currentClip,
          currentTime: currentTime
        }));
        lastSavedTimeRef.current = now;
      } catch (e) {}
    }
  }, [currentClip, currentTime]);

  // Auto-pause logic (also auto-pauses at line end if Dictation mode is active)
  useEffect(() => {
    if (!isPlaying || !currentClip?.subtitles) return;
    
    // Line-level tracking
    const activeLine = currentClip.subtitles.find(l => currentTime >= l.start && currentTime <= l.end);
    
    if (activeLine) {
      lastActiveLineRef.current = activeLine;
    } else if (lastActiveLineRef.current && (autoPause || isDictationMode)) {
      // If we just left an active line, and we are slightly past its end (meaning normal playback, not a seek jump backwards)
      const justPassed = currentTime > lastActiveLineRef.current.end && currentTime < lastActiveLineRef.current.end + 0.6;
      if (justPassed) {
        playerRef.current?.pause();
      }
      lastActiveLineRef.current = null;
    }
  }, [currentTime, isPlaying, autoPause, isDictationMode, currentClip?.subtitles]);

  const handleToggleDictationMode = () => {
    const next = !isDictationMode;
    setIsDictationMode(next);
    try { localStorage.setItem('toolker_yt_dictation_mode', String(next)); } catch (e) {}
    showToast(next ? "⌨️ DICTATION TYPING MODE ON" : "KARAOKE SUBTITLE MODE");
  };

  const handleToggleMaskMode = () => {
    const next: 'asterisks' | 'blur' = maskMode === 'asterisks' ? 'blur' : 'asterisks';
    setMaskMode(next);
    try { localStorage.setItem('toolker_yt_mask_mode', next); } catch (e) {}
    showToast(next === 'asterisks' ? "STYLE: * ASTERISKS" : "STYLE: ░ BLUR TEXT");
  };

  const handleToggleTranslation = () => {
    const next = !showTranslation;
    setShowTranslation(next);
    try { localStorage.setItem('toolker_yt_show_translation', String(next)); } catch (e) {}
    showToast(next ? "🇫🇷 TRADUCTION VISIBLE" : "TRADUCTION MASQUÉE");
  };

  const handleReplayActiveLine = () => {
    if (!currentClip?.subtitles) return;
    const subs = currentClip.subtitles;
    const active = subs.find(l => currentTime >= l.start - 0.15 && currentTime <= l.end + 0.6)
      || subs.find(l => l.start > currentTime)
      || subs[0];
    if (active) {
      playerRef.current?.seekTo(active.start);
      playerRef.current?.play();
      showToast("↺ REPLAYING SENTENCE");
    }
  };

  const handleLineCompleted = (completedLine: SubtitleLine) => {
    showToast("🎉 CORRECT! SENTENCE COMPLETED", 2000);
    setTimeout(() => {
      if (!currentClip?.subtitles) return;
      const subs = currentClip.subtitles;
      const currentIdx = subs.findIndex(l => l.id === completedLine.id);
      if (currentIdx !== -1 && currentIdx < subs.length - 1) {
        handleSelectLine(subs[currentIdx + 1]);
      } else {
        showToast("🏆 ALL CLIP DIALOGUE COMPLETED!", 3500);
      }
    }, 1100);
  };

  // Play / Pause toggle
  const handleTogglePlay = () => {
    playerRef.current?.togglePlay();
  };

  // Jump to specific subtitle line
  const handleSelectLine = (line: SubtitleLine) => {
    setCurrentTime(line.start);
    playerRef.current?.seekTo(line.start);
    playerRef.current?.play();
  };

  // Previous Line navigation (<)
  const handlePrevLine = () => {
    if (!currentClip) return;
    const subs = currentClip.subtitles;
    if (!subs.length) return;
    const currentIndex = subs.findIndex(l => currentTime >= l.start && currentTime <= l.end + 0.3);
    if (currentIndex > 0) {
      handleSelectLine(subs[currentIndex - 1]);
    } else if (currentIndex === -1) {
      const prior = [...subs].reverse().find(l => l.start < currentTime);
      if (prior) handleSelectLine(prior);
      else handleSelectLine(subs[0]);
    } else {
      // Replay first line
      handleSelectLine(subs[0]);
    }
  };

  // Next Line navigation (>)
  const handleNextLine = () => {
    if (!currentClip) return;
    const subs = currentClip.subtitles;
    if (!subs.length) return;
    const next = subs.find(l => l.start > currentTime + 0.2);
    if (next) {
      handleSelectLine(next);
    } else {
      handleSelectLine(subs[subs.length - 1]);
    }
  };

  const handleSelectMode = (mode: 'slow' | 'normal') => {
    setPlaybackMode(mode);
    if (mode === 'slow') {
      playerRef.current?.setPlaybackRate(0.5);
    } else {
      playerRef.current?.setPlaybackRate(1);
    }
  };

  // Open Shadowing Mic Modal on current line
  const handleOpenShadowModal = () => {
    playerRef.current?.pause();
    if (!currentClip) return;
    const subs = currentClip.subtitles;
    const active = subs.find(l => currentTime >= l.start && currentTime <= l.end + 0.5) 
      || subs.find(l => l.start > currentTime) 
      || subs[0];
    setActiveShadowLine(active);
  };

  const handleStartHoldRecord = async () => {
    playerRef.current?.pause();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setIsRecordingShadow(true);
      setRecordingDuration(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
      showToast("⚠️ Microphone access denied");
    }
  };

  const handleStopHoldRecord = (shouldSend: boolean) => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (shouldSend) {
        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          if (audioBlob.size > 0) {
            const base64 = await blobToBase64(audioBlob);
            setLatestLocalAudio(base64);

            // Auto-play locally immediately
            stopAllAudio();
            playStandardAudio(base64);

            // Broadcast to partner in room
            if (isConnected) {
              broadcastAction({ type: 'AUDIO_SYNC', payload: base64 });
              showToast("✓ SHADOW SENT TO PARTNER");
            } else {
              showToast("✓ SHADOW RECORDED (STANDALONE)");
            }
          }
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
          }
        };
        mediaRecorderRef.current.stop();
      } else {
        handleCancelHoldRecord();
        return;
      }
    } else if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    setIsRecordingShadow(false);
    setRecordingDuration(0);
  };

  const handleCancelHoldRecord = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsRecordingShadow(false);
    setRecordingDuration(0);
    showToast("✕ RECORDING CANCELLED");
  };

  return (
    <div className="min-h-screen bg-[#d8d2c4] text-[#1c1d20] flex flex-col items-center justify-start overflow-y-auto font-sans p-2 sm:p-6 pb-36 relative">
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 z-50 bg-[#16171a] text-[#ebe6d8] border-2 border-[#cf573c] px-4 sm:px-5 py-2 sm:py-2.5 rounded-full font-mono text-[11px] sm:text-xs font-bold uppercase shadow-[4px_4px_0px_#18191c] sm:shadow-[5px_5px_0px_#18191c] flex items-center gap-2 transition-all">
          <span className="w-2.5 h-2.5 rounded-full bg-[#cf573c] animate-pulse shrink-0" />
          <span className="truncate max-w-[280px] sm:max-w-none">{toastMessage}</span>
        </div>
      )}

      <div className="w-full max-w-4xl mx-auto flex flex-col gap-3.5 sm:gap-6">
        {/* 1. TOP BAR: Navigation, Title, and Library Selector */}
        <header className="bg-[#e4dfd3] p-2 sm:p-3 rounded-lg border-2 border-[#1c1d20] shadow-[3px_3px_0px_#18191c] sm:shadow-[5px_5px_0px_#18191c] relative flex items-center justify-between gap-2 sm:gap-3">
          <div className="absolute top-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
          <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
          
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <SectionNavigator activeMode="shadowing" />
          </div>

          <div className="flex flex-col items-center text-center flex-1 min-w-0 px-1">
             <span className="font-mono text-[8.5px] sm:text-[10px] font-bold tracking-widest text-[#5c5950] uppercase mb-0.5 truncate max-w-full">
                SHADOWING STUDIO // CLIP
             </span>
             <h1 className="font-sans text-xs sm:text-lg font-bold text-[#1c1d20] truncate max-w-[140px] sm:max-w-md tracking-tight uppercase">
               {currentClip?.title || "NO CLIP SELECTED"}
             </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <RoomShareButton 
              modeName="shadowing" 
              onClipSync={() => currentClip && syncClip(currentClip)} 
            />

            <button
              onClick={() => setIsLibraryOpen(true)}
              title="Switch Video or Paste YouTube URL"
              className="text-[10px] sm:text-xs font-mono font-bold uppercase bg-[#476171] hover:bg-[#374c59] text-[#fbf8f2] border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md transition-all active:translate-y-0.5 active:shadow-[0px_0px_0px_#18191c]"
            >
              CLIPS 🎬
            </button>
          </div>
        </header>

        {/* 2. VIDEO VIEWPORT */}
        <div className="bg-[#e4dfd3] p-1.5 sm:p-4 rounded-lg border-2 border-[#1c1d20] shadow-[3px_3px_0px_#18191c] sm:shadow-[5px_5px_0px_#18191c] relative w-full flex justify-center min-h-0 sm:min-h-[300px]">
          <div className="absolute top-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
          <div className="absolute top-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
          <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
          <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>

          {currentClip ? (
            <div className="w-full max-w-3xl flex flex-col border-2 border-[#1c1d20] bg-[#e4dfd3] rounded-md overflow-hidden z-10">
              <div className="w-full bg-black shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] relative">
                <YouTubePlayer
                  ref={playerRef}
                  videoId={currentClip.youtubeId}
                  playbackRate={playbackMode === 'slow' ? 0.75 : 1}
                  initialTime={currentTime}
                  onTimeUpdate={(time) => setCurrentTime(time)}
                  onStateChange={(playing) => setIsPlaying(playing)}
                  onDurationChange={(d) => setDuration(d)}
                  onOpenLibrary={() => setIsLibraryOpen(true)}
                />
              </div>
              <CustomTimeline 
                currentTime={currentTime}
                duration={duration}
                onSeek={(t) => {
                  playerRef.current?.seekTo(t);
                  setCurrentTime(t);
                }}
              />
            </div>
          ) : (
            <div className="w-full max-w-3xl flex flex-col items-center justify-center border-2 border-[#1c1d20] bg-[#16171a] rounded-md overflow-hidden z-10 text-center p-8">
              <span className="text-4xl mb-4">🎬</span>
              <h2 className="font-mono font-bold text-[#ebe6d8] uppercase tracking-wide mb-2">No Video Loaded</h2>
              <p className="font-mono text-xs text-[#a0a4b5] max-w-md">Click the CLIPS button to import a YouTube video URL and start shadowing.</p>
              <button
                onClick={() => setIsLibraryOpen(true)}
                className="mt-6 text-xs font-mono font-bold uppercase bg-[#cf573c] hover:bg-[#a83f2a] text-[#ebe6d8] border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] px-6 py-3 rounded-md transition-all active:translate-y-0.5 active:shadow-[0px_0px_0px_#18191c]"
              >
                OPEN LIBRARY
              </button>
            </div>
          )}
        </div>

        {/* 3. SUBTITLE STAGE */}
        <div className="bg-[#e4dfd3] rounded-lg border-2 border-[#1c1d20] shadow-[5px_5px_0px_#18191c] relative w-full flex-1 flex flex-col items-center">
          {currentClip ? (
            <SubtitleStage
              subtitles={currentClip.subtitles}
              currentTime={currentTime}
              onSelectLine={handleSelectLine}
              isDictationMode={isDictationMode}
              onToggleDictationMode={handleToggleDictationMode}
              maskMode={maskMode}
              onToggleMaskMode={handleToggleMaskMode}
              showTranslation={showTranslation}
              onToggleTranslation={handleToggleTranslation}
              onLineCompleted={handleLineCompleted}
              onReplayLine={handleReplayActiveLine}
              isSyncing={isAutoHealingSubtitles}
              syncError={subtitlesError}
              onOpenLibrary={() => setIsLibraryOpen(true)}
            />
          ) : (
            <div className="flex items-center justify-center h-full w-full opacity-50">
               <span className="font-mono text-sm font-bold text-[#5c5950] uppercase tracking-widest">Awaiting Video Subtitles...</span>
            </div>
          )}
        </div>
      </div>

      {/* 4. FLOATING TACTILE CONTROL DOCK WITH HOLD-TO-RECORD */}
      <ControlDock
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        onPrevLine={handlePrevLine}
        onNextLine={handleNextLine}
        playbackMode={playbackMode}
        onSelectMode={handleSelectMode}
        autoPause={autoPause}
        onToggleAutoPause={() => setAutoPause(!autoPause)}
        onOpenShadowModal={handleOpenShadowModal}
        onStartHoldRecord={handleStartHoldRecord}
        onStopHoldRecord={handleStopHoldRecord}
        onCancelHoldRecord={handleCancelHoldRecord}
        isRecordingShadow={isRecordingShadow}
        recordingDuration={recordingDuration}
        isDictationMode={isDictationMode}
        onToggleDictationMode={handleToggleDictationMode}
        hasPartnerAudio={!!latestPartnerAudio}
        hasUnreadPartnerAudio={hasUnreadPartnerAudio}
        isPlayingPartnerAudio={isPlayingPartnerAudio}
        onTogglePlayPartnerAudio={handleTogglePlayPartnerAudio}
      />

      {/* 5. MODALS */}
      {activeShadowLine && (
        <ShadowRecorderModal
          line={activeShadowLine}
          initialLocalAudio={latestLocalAudio}
          initialRemoteAudio={latestPartnerAudio}
          onClose={() => setActiveShadowLine(null)}
          onReplaySegment={() => {
            playerRef.current?.seekTo(activeShadowLine.start);
            playerRef.current?.play();
            const duration = (activeShadowLine.end - activeShadowLine.start) * 1000;
            setTimeout(() => {
              playerRef.current?.pause();
            }, Math.max(duration, 1500));
          }}
        />
      )}

      {isLibraryOpen && (
        <VideoLibraryModal
          currentClipId={currentClip?.id || null}
          onSelectClip={(newClip) => {
            setCurrentClip(newClip);
            setCurrentTime(0);
            if (roomId) {
              syncClip(newClip);
            }
          }}
          onClose={() => setIsLibraryOpen(false)}
        />
      )}
    </div>
  );
};

export default ShadowingStudio;
