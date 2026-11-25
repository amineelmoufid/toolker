import React, { useState, useRef, useEffect } from 'react';
import { ShadowingClip, SubtitleLine, AppMode } from '../../types';
import { PRESET_CLIPS, reconstructSubtitlesSemantically, parseTranscriptXml } from './mockClips';
import YouTubePlayer, { YouTubePlayerRef } from './YouTubePlayer';
import SubtitleStage from './SubtitleStage';
import ControlDock from './ControlDock';
import VideoLibraryModal from './VideoLibraryModal';
import CustomTimeline from './CustomTimeline';
import { useRoom } from '../../contexts/RoomContext';
import { calculateAuthoritativeTime } from '../../services/firebase';
import { RoomShareButton } from '../common/RoomShareButton';
import { SectionNavigator } from '../common/SectionNavigator';
import { blobToBase64, playStandardAudio, stopAllAudio } from '../../utils/audio';

interface ShadowingStudioProps {
  onBack: () => void;
  onNavigate?: (mode: AppMode) => void;
}

const ShadowingStudio: React.FC<ShadowingStudioProps> = ({ onBack, onNavigate }) => {
  // Initialize state from local storage if available
  const [currentClip, setCurrentClip] = useState<ShadowingClip | null>(() => {
    try {
      const storedSession = localStorage.getItem('toolker_last_session');
      if (storedSession) {
        const parsed = JSON.parse(storedSession);
        if (parsed.clip && parsed.clip.youtubeId && parsed.clip.youtubeId !== 'qB254u2N5gQ') {
          return {
            ...parsed.clip,
            subtitles: reconstructSubtitlesSemantically(parsed.clip.subtitles || [])
          };
        }
      }
    } catch (e) {}

    // Fallback to first saved clip if it exists
    try {
      const storedClips = localStorage.getItem('toolker_saved_clips') || localStorage.getItem('toolker_custom_clips');
      if (storedClips) {
        const parsedClips = JSON.parse(storedClips);
        const validClip = parsedClips.find((c: any) => c.youtubeId && c.youtubeId !== 'qB254u2N5gQ');
        if (validClip) {
          return {
            ...validClip,
            subtitles: reconstructSubtitlesSemantically(validClip.subtitles || [])
          };
        }
      }
    } catch (e) {}

    return null;
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

  // Sync fallback duration from subtitles if YouTube player duration is unavailable or restricted
  useEffect(() => {
    if (currentClip && currentClip.subtitles && currentClip.subtitles.length > 0) {
      const last = currentClip.subtitles[currentClip.subtitles.length - 1];
      if (last.end && last.end > 0) {
        setDuration(prev => (prev > 0 ? prev : last.end));
      }
    }
  }, [currentClip]);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackMode, setPlaybackMode] = useState<'slow' | 'normal'>('normal');
  const [lineByLine, setLineByLine] = useState<boolean>(() => {
    try {
      return localStorage.getItem('toolker_yt_line_by_line') === 'true';
    } catch (e) {
      return false;
    }
  });
  
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
  const [isAutoHealingSubtitles, setIsAutoHealingSubtitles] = useState<boolean>(false);
  const [subtitlesError, setSubtitlesError] = useState<string | null>(null);

  // Listen for 1-Click Bookmarklet Ingestion (via window.name or window postMessage)
  useEffect(() => {
    const processPayload = (payloadStr: string) => {
      try {
        const data = JSON.parse(payloadStr);
        if (data && data.v && data.xml) {
          const subs = parseTranscriptXml(data.xml);
          if (subs && subs.length > 0) {
            const cleanSubs = reconstructSubtitlesSemantically(subs);
            const importedClip: ShadowingClip = {
              id: `imported-${Date.now()}`,
              title: data.title || `YouTube Clip (${data.v})`,
              youtubeId: data.v,
              thumbnail: `https://img.youtube.com/vi/${data.v}/hqdefault.jpg`,
              category: 'BOOKMARKLET IMPORT',
              subtitles: cleanSubs
            };
            setCurrentClip(importedClip);
            setCurrentTime(0);
            setIsLibraryOpen(false);
            showToast(`⭐ 100% Subtitles Imported from YouTube (${cleanSubs.length} sentences)`);

            // Save to localStorage
            try {
              const storedClips = localStorage.getItem('toolker_custom_clips');
              const list = storedClips ? JSON.parse(storedClips) : [];
              const updated = [importedClip, ...list.filter((c: any) => c.youtubeId !== data.v)];
              localStorage.setItem('toolker_custom_clips', JSON.stringify(updated));
            } catch (_) {}

            // Crowdsource to edge cache
            try {
              fetch('/api/cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  videoId: data.v,
                  title: importedClip.title,
                  subtitles: cleanSubs
                })
              }).catch(() => {});
            } catch (_) {}
          }
        }
      } catch (err) {
        console.warn("Failed to process bookmarklet payload:", err);
      }
    };

    // Check window.name on initial load
    try {
      if (typeof window !== 'undefined' && window.name && window.name.startsWith('TOOLKER_DATA:')) {
        const raw = window.name.replace('TOOLKER_DATA:', '');
        window.name = ''; // Clear immediately
        const jsonStr = decodeURIComponent(escape(atob(raw)));
        processPayload(jsonStr);
      }
    } catch (_) {}

    // Listen for cross-window message
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'TOOLKER_IMPORT_XML' && e.data.payload) {
        processPayload(e.data.payload);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);


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
      const cleanSubs = reconstructSubtitlesSemantically(subs);
      setCurrentClip(prev => {
        if (!prev || prev.youtubeId !== ytId) return prev;
        const updated = { ...prev, subtitles: cleanSubs };
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
      // -0.5. Instant Toolker Extension Residential Fetch (sub-second, 100% authentic)
      try {
        const extResult = await new Promise<any>((resolve) => {
          const reqId = `req-studio-${Date.now()}-${Math.random()}`;
          const timer = setTimeout(() => resolve(null), 4000);
          const listener = (event: MessageEvent) => {
            if (event.data && event.data.type === 'TOOLKER_RES_SUBTITLES' && event.data.requestId === reqId) {
              clearTimeout(timer);
              window.removeEventListener('message', listener);
              resolve(event.data);
            }
          };
          window.addEventListener('message', listener);
          window.postMessage({ type: 'TOOLKER_REQ_SUBTITLES', videoId: ytId, requestId: reqId }, '*');
        });
        if (extResult && extResult.ok && extResult.xml) {
          const parsed = parseTranscriptXml(extResult.xml);
          if (parsed && parsed.length > 0) {
            applySubtitles(parsed);
            return;
          }
        }
      } catch (_) {}

      // 0. Instant Serverless Edge Extractor (/api/transcript)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);
        const edgeRes = await fetch(`/api/transcript?v=${ytId}&_t=${Date.now()}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (edgeRes.ok) {
          const edgeData = await edgeRes.json();
          if (edgeData.ok && Array.isArray(edgeData.subtitles) && edgeData.subtitles.length > 0) {
            applySubtitles(edgeData.subtitles);
            return;
          }
        }
      } catch (_) {}

      // 0.5. Ultra-Fast Local Extractor Daemon (instant 2s on-the-fly extraction)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);
        if (window.location.protocol === 'https:') throw new Error('skip http on https');
        const localRes = await fetch(`http://127.0.0.1:38472/transcript?v=${ytId}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (localRes.ok) {
          const localData = await localRes.json();
          if (localData.ok && Array.isArray(localData.subtitles) && localData.subtitles.length > 0) {
            applySubtitles(localData.subtitles);
            return;
          }
        }
      } catch (_) {}

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
  const isAtLineEndRef = useRef<SubtitleLine | null>(null);
  const lastPausedLineIdRef = useRef<string | null>(null);
  const justCompletedLineRef = useRef<SubtitleLine | null>(null);
  const isRemoteUpdateRef = useRef<boolean>(false);
  const suppressOutboundUntilRef = useRef<number>(0);

  const { 
    peerId, 
    roomId, 
    isConnected, 
    isHost,
    createRoom, 
    syncClip, 
    syncPlayback,
    broadcastAction, 
    lastAction, 
    syncedClip,
    syncedPlayback 
  } = useRoom();

  // Synchronize clip from room partner (via Firebase & PeerJS)
  useEffect(() => {
    if (syncedClip && syncedClip.youtubeId) {
      setCurrentClip(prev => {
        if (prev?.id === syncedClip.id && prev?.youtubeId === syncedClip.youtubeId) return prev;
        return {
          ...syncedClip,
          subtitles: reconstructSubtitlesSemantically(syncedClip.subtitles || [])
        };
      });
      showToast(`🎬 SYNCED VIDEO: ${syncedClip.title || 'Clip Loaded'}`);
    }
  }, [syncedClip]);

  // Host seeds initial clip to room; guests adopt room clip
  useEffect(() => {
    if (isHost && roomId && currentClip && isConnected) {
      syncClip(currentClip);
    }
  }, [isHost, roomId, isConnected]);

  // Authoritative Living Room State Synchronizer (Instant Catch-up for late joiners or room updates)
  useEffect(() => {
    if (!syncedPlayback || !currentClip?.subtitles) return;

    // 1. Synchronize Room Parameter: Line-by-Line Mode
    if (typeof syncedPlayback.lineByLine === 'boolean' && syncedPlayback.lineByLine !== lineByLine) {
      setLineByLine(syncedPlayback.lineByLine);
      try { localStorage.setItem('toolker_yt_line_by_line', String(syncedPlayback.lineByLine)); } catch (_) {}
      showToast(syncedPlayback.lineByLine ? "🤝 LINE-BY-LINE: ON (SYNCED)" : "🤝 CONTINUOUS MODE (SYNCED)");
    }

    // 2. Synchronize Room Parameter: Tempo / Playback Rate
    if (typeof syncedPlayback.playbackRate === 'number') {
      const mode = syncedPlayback.playbackRate < 0.9 ? 'slow' : 'normal';
      if (playbackMode !== mode) {
        setPlaybackMode(mode);
        playerRef.current?.setPlaybackRate(syncedPlayback.playbackRate);
        showToast(`🤝 TEMPO: ${syncedPlayback.playbackRate}× (SYNCED)`);
      }
    }

    // 3. Synchronize Room Parameter: Dictation Mode
    if (typeof syncedPlayback.isDictationMode === 'boolean' && syncedPlayback.isDictationMode !== isDictationMode) {
      setIsDictationMode(syncedPlayback.isDictationMode);
      try { localStorage.setItem('toolker_yt_dictation_mode', String(syncedPlayback.isDictationMode)); } catch (_) {}
    }

    // 4. Synchronize Active Caption
    if (syncedPlayback.activeLineId) {
      const matchingLine = currentClip.subtitles.find(l => l.id === syncedPlayback.activeLineId);
      if (matchingLine) {
        lastActiveLineRef.current = matchingLine;
      }
    }

    // 5. Living Clock Calculation & Continuous Seek Alignment
    const authoritativeTime = calculateAuthoritativeTime(syncedPlayback);
    const localTime = playerRef.current?.getCurrentTime() ?? currentTime;
    const drift = Math.abs(localTime - authoritativeTime);
    const deadbandThreshold = syncedPlayback.isPlaying ? 1.5 : 0.4;

    if (drift > deadbandThreshold) {
      isRemoteUpdateRef.current = true;
      suppressOutboundUntilRef.current = Date.now() + 2500;
      playerRef.current?.seekTo(authoritativeTime);
      setCurrentTime(authoritativeTime);
    }

    // 6. Synchronize Play / Pause State
    if (syncedPlayback.isPlaying && !isPlaying) {
      isRemoteUpdateRef.current = true;
      suppressOutboundUntilRef.current = Date.now() + 2500;
      playerRef.current?.play();
    } else if (!syncedPlayback.isPlaying && isPlaying) {
      isRemoteUpdateRef.current = true;
      suppressOutboundUntilRef.current = Date.now() + 2500;
      playerRef.current?.pause();
    }
  }, [syncedPlayback, currentClip?.id]);

  // Hold-to-record Shadow state
  const [isRecordingShadow, setIsRecordingShadow] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [latestLocalAudio, setLatestLocalAudio] = useState<string | null>(null);
  const [latestPartnerAudio, setLatestPartnerAudio] = useState<string | null>(null);
  const [isPlayingPartnerAudio, setIsPlayingPartnerAudio] = useState(false);
  const [isPlayingLocalAudio, setIsPlayingLocalAudio] = useState(false);
  const [hasUnreadPartnerAudio, setHasUnreadPartnerAudio] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedMimeTypeRef = useRef<string>('audio/webm');
  const recordTimerRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (msg: string, duration = 3000) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, duration);
  };

  // Listen to remote actions (AUDIO_SYNC, SYNC_CAPTION, PLAY, PAUSE, SEEK, PLAYHEAD_PULSE, etc.)
  useEffect(() => {
    if (!lastAction) return;

    if (lastAction.type === 'AUDIO_SYNC' && lastAction.payload) {
      const remoteAudio = typeof lastAction.payload === 'string'
        ? lastAction.payload
        : (lastAction.payload.audioBase64 || lastAction.payload.audio);
      if (remoteAudio) {
        setLatestPartnerAudio(remoteAudio);
        setIsPlayingPartnerAudio(false);
        setHasUnreadPartnerAudio(true);
        showToast("🎙️ PARTNER SHADOWED // CLICK ▶ TO LISTEN", 4000);
      }
    } else if (lastAction.type === 'SYNC_CAPTION' && lastAction.payload) {
      const { lineId, start, autoPlay } = lastAction.payload;
      if (typeof start === 'number') {
        isAtLineEndRef.current = null;
        lastPausedLineIdRef.current = null;
        if (lineId && currentClip?.subtitles) {
          const targetLine = currentClip.subtitles.find(l => l.id === lineId);
          if (targetLine) {
            lastActiveLineRef.current = targetLine;
          }
        }
        setCurrentTime(start);
        playerRef.current?.seekTo(start);
        if (autoPlay) {
          playerRef.current?.play();
        }
        showToast("📍 PARTNER JUMPED TO CAPTION");
      }
    } else if (lastAction.type === 'TOGGLE_LINE_BY_LINE' && lastAction.payload) {
      const enabled = !!lastAction.payload.enabled;
      setLineByLine(enabled);
      try { localStorage.setItem('toolker_yt_line_by_line', String(enabled)); } catch (e) {}
      showToast(enabled ? "🤝 LINE-BY-LINE: ON (SYNCED)" : "🤝 LINE-BY-LINE: OFF (SYNCED)");
    } else if (lastAction.type === 'SET_TEMPO' && lastAction.payload) {
      const mode = lastAction.payload.mode === 'slow' ? 'slow' : 'normal';
      const rate = lastAction.payload.rate || (mode === 'slow' ? 0.75 : 1);
      setPlaybackMode(mode);
      playerRef.current?.setPlaybackRate(rate);
      showToast(`🤝 TEMPO: ${rate}× (SYNCED)`);
    } else if (lastAction.type === 'TOGGLE_DICTATION' && lastAction.payload) {
      const enabled = !!lastAction.payload.enabled;
      setIsDictationMode(enabled);
      try { localStorage.setItem('toolker_yt_dictation_mode', String(enabled)); } catch (e) {}
      showToast(enabled ? "🤝 DICTATION: ON (SYNCED)" : "🤝 DICTATION: OFF (SYNCED)");
    } else if (lastAction.type === 'LINE_BOUNDARY_PAUSE' && lastAction.payload) {
      playerRef.current?.pause();
      if (typeof lastAction.payload.time === 'number') {
        playerRef.current?.seekTo(lastAction.payload.time);
        setCurrentTime(lastAction.payload.time);
      }
      if (lastAction.payload.lineId && currentClip?.subtitles) {
        const line = currentClip.subtitles.find(l => l.id === lastAction.payload.lineId);
        if (line) {
          isAtLineEndRef.current = line;
          lastActiveLineRef.current = line;
          justCompletedLineRef.current = line;
          lastPausedLineIdRef.current = line.id;
        }
      }
      showToast("⏸️ READY FOR NEXT LINE // SPACE: REPLAY | ->: NEXT");
    } else if (lastAction.type === 'PLAY') {
      const remoteTime = lastAction.payload?.time;
      const remoteTimestamp = lastAction.payload?.timestamp || Date.now();
      const lag = Math.max(0, (Date.now() - remoteTimestamp) / 1000);
      const targetTime = typeof remoteTime === 'number' ? (remoteTime + lag) : undefined;
      
      if (typeof targetTime === 'number') {
        playerRef.current?.seekTo(targetTime);
        setCurrentTime(targetTime);
      }
      playerRef.current?.play();
    } else if (lastAction.type === 'PAUSE') {
      playerRef.current?.pause();
      if (typeof lastAction.payload?.time === 'number') {
        playerRef.current?.seekTo(lastAction.payload.time);
        setCurrentTime(lastAction.payload.time);
      }
    } else if (lastAction.type === 'SEEK') {
      if (typeof lastAction.payload?.time === 'number') {
        isAtLineEndRef.current = null;
        lastPausedLineIdRef.current = null;
        playerRef.current?.seekTo(lastAction.payload.time);
        setCurrentTime(lastAction.payload.time);
      }
    } else if (lastAction.type === 'PLAYHEAD_PULSE') {
      if (isPlaying && typeof lastAction.payload?.time === 'number') {
        const remoteTime = lastAction.payload.time;
        const remoteTimestamp = lastAction.payload.timestamp || Date.now();
        const lag = Math.max(0, (Date.now() - remoteTimestamp) / 1000);
        const expected = remoteTime + lag;
        if (Math.abs(currentTime - expected) > 0.4) {
          playerRef.current?.seekTo(expected);
          setCurrentTime(expected);
        }
      }
    }
  }, [lastAction]);

  const currentTimeRef = useRef(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Periodic heartbeat pulse to keep room participants strictly synchronized during playback
  useEffect(() => {
    if (!isConnected || !isPlaying) return;
    const interval = setInterval(() => {
      const nowTime = playerRef.current?.getCurrentTime() ?? currentTimeRef.current;
      broadcastAction({
        type: 'PLAYHEAD_PULSE',
        payload: { time: nowTime, timestamp: Date.now() }
      });
    }, 2800);
    return () => clearInterval(interval);
  }, [isConnected, isPlaying]);

  // Global Keyboard Shortcuts (-> next caption, <- prev caption, Space play/replay)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input, textarea, or contentEditable
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextLine();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevLine();
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentClip, currentTime, lineByLine, isDictationMode, isPlaying, isConnected]);

  const handleTogglePlayLocalAudio = () => {
    if (!latestLocalAudio) return;
    if (isPlayingLocalAudio) {
      stopAllAudio();
      setIsPlayingLocalAudio(false);
    } else {
      if (isPlayingPartnerAudio) {
        stopAllAudio();
        setIsPlayingPartnerAudio(false);
      }
      setIsPlayingLocalAudio(true);
      playStandardAudio(latestLocalAudio, () => {
        setIsPlayingLocalAudio(false);
      });
    }
  };

  const handleTogglePlayPartnerAudio = () => {
    if (!latestPartnerAudio) return;
    setHasUnreadPartnerAudio(false); // Disappears immediately when played!
    if (isPlayingPartnerAudio) {
      stopAllAudio();
      setIsPlayingPartnerAudio(false);
    } else {
      if (isPlayingLocalAudio) {
        stopAllAudio();
        setIsPlayingLocalAudio(false);
      }
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

  // Line-by-Line auto-pause logic (seamless play-through: never skips silence, pauses before next dialogue line begins)
  useEffect(() => {
    if (!isPlaying || !currentClip?.subtitles?.length || (!lineByLine && !isDictationMode)) return;

    const subs = currentClip.subtitles;
    // 1. Locate current subtitle context:
    // Either currently spoken (start - 0.1 to end + 0.35) or silence after a line
    let activeLine = subs.find(l => currentTime >= l.start - 0.1 && currentTime <= l.end + 0.35);
    
    // If we are currently in silence between lines, keep lastActiveLineRef as active context
    if (!activeLine && lastActiveLineRef.current) {
      const lastLine = lastActiveLineRef.current;
      const lastIdx = subs.findIndex(l => l.id === lastLine.id);
      const nextLine = (lastIdx !== -1 && lastIdx < subs.length - 1) ? subs[lastIdx + 1] : null;
      if (nextLine && currentTime > lastLine.end && currentTime < nextLine.start) {
        activeLine = lastLine;
      }
    }

    if (activeLine) {
      lastActiveLineRef.current = activeLine;
      justCompletedLineRef.current = activeLine;

      const currentIdx = subs.findIndex(l => l.id === activeLine.id);
      const nextLine = (currentIdx !== -1 && currentIdx < subs.length - 1) ? subs[currentIdx + 1] : null;

      // The pause threshold:
      // If a next line exists, play through ALL silence until right before next speaker (nextLine.start - 0.06s)
      // If no next line (last sentence of video), pause after natural speech tail (activeLine.end + 0.4s)
      const pauseThreshold = nextLine 
        ? Math.max(activeLine.end + 0.25, nextLine.start - 0.06) 
        : (activeLine.end + 0.4);

      // If comfortably inside the active speech part, reset boundary flags for next pause
      if (currentTime < activeLine.end - 0.2) {
        if (isAtLineEndRef.current?.id === activeLine.id) {
          isAtLineEndRef.current = null;
        }
        if (lastPausedLineIdRef.current === activeLine.id) {
          lastPausedLineIdRef.current = null;
        }
      }

      // Reached boundary before next line begins!
      if (currentTime >= pauseThreshold && lastPausedLineIdRef.current !== activeLine.id) {
        lastPausedLineIdRef.current = activeLine.id;
        isAtLineEndRef.current = activeLine;
        justCompletedLineRef.current = activeLine;
        
        const targetPauseTime = nextLine ? (nextLine.start - 0.05) : pauseThreshold;
        playerRef.current?.pause();
        playerRef.current?.seekTo(targetPauseTime);
        setCurrentTime(targetPauseTime);
        
        if (isConnected) {
          broadcastAction({
            type: 'LINE_BOUNDARY_PAUSE',
            payload: {
              lineId: activeLine.id,
              time: targetPauseTime
            }
          });
          syncPlayback({
            activeLineId: activeLine.id,
            time: targetPauseTime,
            isPlaying: false
          });
        }
        showToast("⏸️ READY FOR NEXT LINE // SPACE: REPLAY | ->: NEXT");
        return;
      }
    }
  }, [currentTime, isPlaying, lineByLine, isDictationMode, currentClip?.subtitles, isConnected]);

  const handleToggleLineByLine = () => {
    const next = !lineByLine;
    setLineByLine(next);
    try { localStorage.setItem('toolker_yt_line_by_line', String(next)); } catch (e) {}
    showToast(next ? "🔁 LINE-BY-LINE MODE: ON" : "CONTINUOUS PLAYBACK MODE");

    if (isConnected) {
      broadcastAction({
        type: 'TOGGLE_LINE_BY_LINE',
        payload: {
          enabled: next,
          timestamp: Date.now()
        }
      });
      syncPlayback({ lineByLine: next });
    }
  };

  const handleToggleDictationMode = () => {
    const next = !isDictationMode;
    setIsDictationMode(next);
    try { localStorage.setItem('toolker_yt_dictation_mode', String(next)); } catch (e) {}
    showToast(next ? "⌨️ DICTATION TYPING MODE ON" : "KARAOKE SUBTITLE MODE");

    if (isConnected) {
      broadcastAction({
        type: 'TOGGLE_DICTATION',
        payload: {
          enabled: next,
          timestamp: Date.now()
        }
      });
      syncPlayback({ isDictationMode: next });
    }
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

  // Play / Pause toggle with Line-by-Line replay dedication
  const handleTogglePlay = () => {
    if (!isPlaying) {
      if ((lineByLine || isDictationMode) && currentClip?.subtitles) {
        const subs = currentClip.subtitles;
        // In Line-by-Line mode, the play button is dedicated to playing/replaying the active caption
        const targetLine = isAtLineEndRef.current || lastActiveLineRef.current || subs.find(l => currentTime >= l.start - 0.15 && currentTime <= l.end + 0.3) || subs[0];
        if (targetLine) {
          isAtLineEndRef.current = null;
          lastPausedLineIdRef.current = null;
          lastActiveLineRef.current = targetLine;
          setCurrentTime(targetLine.start);
          playerRef.current?.seekTo(targetLine.start);
          playerRef.current?.play();
          if (isConnected) {
            broadcastAction({
              type: 'PLAY',
              payload: { time: targetLine.start, timestamp: Date.now() }
            });
            syncPlayback({
              activeLineId: targetLine.id,
              time: targetLine.start,
              isPlaying: true
            });
          }
          return;
        }
      }

      lastPausedLineIdRef.current = null;
      playerRef.current?.play();
      if (isConnected) {
        broadcastAction({
          type: 'PLAY',
          payload: { time: currentTime, timestamp: Date.now() }
        });
        syncPlayback({
          time: currentTime,
          isPlaying: true
        });
      }
    } else {
      playerRef.current?.pause();
      if (isConnected) {
        broadcastAction({
          type: 'PAUSE',
          payload: { time: currentTime }
        });
        syncPlayback({
          time: currentTime,
          isPlaying: false
        });
      }
    }
  };

  // Jump to specific subtitle line (synced across room if connected)
  const handleSelectLine = (line: SubtitleLine, broadcast = true) => {
    isAtLineEndRef.current = null;
    lastPausedLineIdRef.current = null;
    lastActiveLineRef.current = line;
    setCurrentTime(line.start);
    playerRef.current?.seekTo(line.start);
    playerRef.current?.play();

    if (isConnected && broadcast) {
      broadcastAction({
        type: 'SYNC_CAPTION',
        payload: {
          lineId: line.id,
          start: line.start,
          autoPlay: true,
          timestamp: Date.now()
        }
      });
      syncPlayback({
        activeLineId: line.id,
        time: line.start,
        isPlaying: true
      });
    }
  };

  // Previous Line navigation (< or ArrowLeft)
  const handlePrevLine = () => {
    if (!currentClip || !currentClip.subtitles?.length) return;
    const subs = currentClip.subtitles;
    const active = lastActiveLineRef.current || isAtLineEndRef.current || subs.find(l => currentTime >= l.start - 0.1 && currentTime <= l.end + 0.3);
    const currentIndex = active ? subs.findIndex(l => l.id === active.id) : subs.findIndex(l => currentTime >= l.start && currentTime <= l.end + 0.3);
    
    if (currentIndex > 0) {
      handleSelectLine(subs[currentIndex - 1], true);
    } else {
      handleSelectLine(subs[0], true);
    }
  };

  // Next Line navigation (> or ArrowRight)
  const handleNextLine = () => {
    if (!currentClip || !currentClip.subtitles?.length) return;
    const subs = currentClip.subtitles;
    const active = lastActiveLineRef.current || isAtLineEndRef.current || subs.find(l => currentTime >= l.start - 0.1 && currentTime <= l.end + 0.3);
    const currentIndex = active ? subs.findIndex(l => l.id === active.id) : subs.findIndex(l => currentTime >= l.start && currentTime <= l.end + 0.3);

    if (currentIndex !== -1 && currentIndex < subs.length - 1) {
      handleSelectLine(subs[currentIndex + 1], true);
    } else if (currentIndex === -1) {
      const next = subs.find(l => l.start > currentTime + 0.1);
      if (next) handleSelectLine(next, true);
      else handleSelectLine(subs[subs.length - 1], true);
    } else {
      handleSelectLine(subs[subs.length - 1], true);
    }
  };

  const handleSelectMode = (mode: 'slow' | 'normal') => {
    setPlaybackMode(mode);
    const rate = mode === 'slow' ? 0.75 : 1;
    playerRef.current?.setPlaybackRate(rate);
    if (isConnected) {
      broadcastAction({
        type: 'SET_TEMPO',
        payload: { mode, rate }
      });
      syncPlayback({ playbackRate: rate });
    }
  };

  // Export full authentic subtitle transcript to Focus Reader Studio
  const handleExportToReader = () => {
    if (!currentClip || !currentClip.subtitles || currentClip.subtitles.length === 0) {
      showToast("⚠️ No subtitles available to export");
      return;
    }

    const reconstructed = reconstructSubtitlesSemantically(currentClip.subtitles);
    const sourceList = reconstructed && reconstructed.length > 0 ? reconstructed : currentClip.subtitles;
    const sentences = sourceList
      .map(s => s.text.trim())
      .filter(Boolean);

    if (sentences.length === 0) {
      showToast("⚠️ Subtitles are empty");
      return;
    }

    // Group sentences into clean, readable paragraphs of 3 sentences each
    const paragraphs: string[] = [];
    for (let i = 0; i < sentences.length; i += 3) {
      paragraphs.push(sentences.slice(i, i + 3).join(' '));
    }
    const fullText = paragraphs.join('\n\n');

    // Store in localStorage for FocusFlow Reader bootstrap
    try {
      localStorage.setItem('focusflow_imported_text', fullText);
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }

    // Broadcast live event in case Focus Reader is currently mounted
    window.dispatchEvent(new CustomEvent('toolker:import-reader-text', {
      detail: { text: fullText }
    }));

    showToast("📖 Exporting full subtitles to Reader...");

    // Immediate navigation to Reader
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      url.hash = '#reader';
      window.history.pushState({}, '', url.toString());
    } catch (_) {}

    window.location.hash = '#reader';
    if (onNavigate) {
      onNavigate('reader');
    }
  };

  const handleStartHoldRecord = async () => {
    playerRef.current?.pause();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }
      recordedMimeTypeRef.current = mimeType || 'audio/webm';

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(100);
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
          const mime = recordedMimeTypeRef.current || 'audio/webm';
          const audioBlob = new Blob(chunksRef.current, { type: mime });
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
            <SectionNavigator activeMode="shadowing" onSelectMode={onNavigate} />
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
              initialClip={currentClip}
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
                  isAtLineEndRef.current = null;
                  lastPausedLineIdRef.current = null;
                  playerRef.current?.seekTo(t);
                  setCurrentTime(t);
                  if (isConnected) {
                    broadcastAction({
                      type: 'SEEK',
                      payload: { time: t }
                    });
                    syncPlayback({ time: t, isPlaying });
                  }
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
              subtitles={reconstructSubtitlesSemantically(currentClip.subtitles || [])}
              currentTime={currentTime}
              onSelectLine={handleSelectLine}
              isDictationMode={isDictationMode}
              onToggleDictationMode={handleToggleDictationMode}
              maskMode={maskMode}
              onToggleMaskMode={handleToggleMaskMode}
              onLineCompleted={handleLineCompleted}
              onReplayLine={handleReplayActiveLine}
              isSyncing={isAutoHealingSubtitles}
              syncError={subtitlesError}
              onOpenLibrary={() => setIsLibraryOpen(true)}
              onExportToReader={handleExportToReader}
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
        autoPause={lineByLine}
        onToggleAutoPause={handleToggleLineByLine}
        isInRoom={isConnected}
        onStartHoldRecord={handleStartHoldRecord}
        onStopHoldRecord={handleStopHoldRecord}
        onCancelHoldRecord={handleCancelHoldRecord}
        isRecordingShadow={isRecordingShadow}
        recordingDuration={recordingDuration}
        isDictationMode={isDictationMode}
        onToggleDictationMode={handleToggleDictationMode}
        hasLocalAudio={!!latestLocalAudio}
        isPlayingLocalAudio={isPlayingLocalAudio}
        onTogglePlayLocalAudio={handleTogglePlayLocalAudio}
        hasPartnerAudio={!!latestPartnerAudio}
        hasUnreadPartnerAudio={hasUnreadPartnerAudio}
        isPlayingPartnerAudio={isPlayingPartnerAudio}
        onTogglePlayPartnerAudio={handleTogglePlayPartnerAudio}
      />

      {/* 5. MODALS */}
      {isLibraryOpen && (
        <VideoLibraryModal
          currentClipId={currentClip?.id || null}
          onSelectClip={(newClip) => {
            const cleanClip = {
              ...newClip,
              subtitles: reconstructSubtitlesSemantically(newClip.subtitles || [])
            };
            setCurrentClip(cleanClip);
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
