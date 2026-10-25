import React, { useState } from 'react';
import { ShadowingClip, SubtitleLine } from '../../types';
import {
  PRESET_CLIPS,
  parseRawSRTtoSubtitles,
  parseTranscriptXml,
  reconstructSubtitlesSemantically
} from './mockClips';
import {
  interpolateWords,
  translateSubtitlesToFrench
} from '../../services/geminiService';

interface VideoLibraryModalProps {
  currentClipId: string | null;
  onSelectClip: (clip: ShadowingClip) => void;
  onClose: () => void;
}

const VideoLibraryModal: React.FC<VideoLibraryModalProps> = ({
  currentClipId,
  onSelectClip,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');
  const [customUrl, setCustomUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [importError, setImportError] = useState('');
  const [videoThumbnail, setVideoThumbnail] = useState('');

  // Subtitle auto-sync states
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isResyncingId, setIsResyncingId] = useState<string | null>(null);
  const [isTranslatingId, setIsTranslatingId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [syncedSubtitles, setSyncedSubtitles] = useState<SubtitleLine[] | null>(null);

  const extractYouTubeId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const fetchSubtitlesForVideo = async (ytId: string, _titleHint: string): Promise<SubtitleLine[]> => {
    // 1. Check static pre-cached JSON asset
    try {
      const staticRes = await fetch(`/transcripts/${ytId}.json?_t=${Date.now()}`);
      if (staticRes.ok) {
        const staticData = await staticRes.json();
        if (staticData.ok && Array.isArray(staticData.subtitles) && staticData.subtitles.length > 0) {
          return staticData.subtitles;
        }
      }
    } catch (_) {}

    // 2. Check if already extracted via /api/extract
    try {
      const checkRes = await fetch(`/api/extract?v=${ytId}&_t=${Date.now()}`);
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.ok && Array.isArray(checkData.subtitles) && checkData.subtitles.length > 0) {
          return checkData.subtitles;
        }
      }
    } catch (_) {}

    // 3. Trigger Autonomous Cloud Extractor via /api/extract
    try {
      setSyncMessage('⚡ Autonomous cloud runner started! Extracting 100% authentic captions...');
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: ytId })
      });

      if (extractRes.ok) {
        const extractData = await extractRes.json();
        if (extractData.ready && Array.isArray(extractData.subtitles) && extractData.subtitles.length > 0) {
          return extractData.subtitles;
        }

        // Poll /api/extract every 2s for up to 30 attempts (~60s)
        for (let i = 1; i <= 30; i++) {
          setSyncMessage(`⚡ Extracting dialogue via cloud runner... (${i * 2}s)`);
          await new Promise(r => setTimeout(r, 2000));
          try {
            const pollRes = await fetch(`/api/extract?v=${ytId}&_t=${Date.now()}`);
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (pollData.ok && Array.isArray(pollData.subtitles) && pollData.subtitles.length > 0) {
                return pollData.subtitles;
              }
              if (pollData.ok === false && pollData.error && !pollData.pending) {
                console.warn("Cloud extractor reported:", pollData.error);
                break;
              }
            }
          } catch (_) {}
        }
      }
    } catch (extractErr) {
      console.warn("Cloud extractor trigger notice:", extractErr);
    }

    // 4. Query Cloudflare Pages transcript API (backup)
    try {
      const res = await fetch(`/api/transcript?v=${ytId}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
          return data.subtitles;
        }
      }
    } catch (apiErr) {
      console.warn("API transcript notice:", apiErr);
    }

    // 5. Check preset clips
    const preset = PRESET_CLIPS.find(p => p.youtubeId === ytId);
    if (preset && preset.subtitles && preset.subtitles.length > 0) {
      return preset.subtitles;
    }

    return [];
  };

  const syncYouTubeVideo = async (ytId: string, _fullUrl: string) => {
    setIsSyncing(true);
    setSyncStatus('loading');
    setSyncMessage('Extracting subtitles & speech dialogue in original language...');

    let detectedTitle = customTitle.trim();

    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        if (oembedData.title) {
          detectedTitle = oembedData.title;
          setCustomTitle(oembedData.title);
        }
      }
    } catch (e) {
      console.warn("oEmbed fetch notice:", e);
    }

    const subs = await fetchSubtitlesForVideo(ytId, detectedTitle);
    setSyncedSubtitles(subs);
    setSyncStatus('success');

    if (subs.length > 0) {
      const wordCount = subs.reduce((acc: number, sub: any) => acc + (sub.words?.length || 0), 0);
      setSyncMessage(`✓ Synchronized original language dialogue (${subs.length} cues, ${wordCount} words)`);
    } else {
      setSyncMessage(`⚠️ No native captions detected on YouTube for this video.`);
    }
    setIsSyncing(false);
  };

  // Instant fetch & sync when YouTube link is entered
  const handleUrlChange = (newUrl: string) => {
    setCustomUrl(newUrl);
    setImportError('');
    const ytId = extractYouTubeId(newUrl.trim());
    if (ytId) {
      setVideoThumbnail(`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`);
      syncYouTubeVideo(ytId, newUrl.trim());
    } else {
      setSyncStatus('idle');
      setSyncedSubtitles(null);
      setSyncMessage('');
      setVideoThumbnail('');
    }
  };

  const handleImportCustom = (e: React.FormEvent) => {
    e.preventDefault();
    setImportError('');
    const ytId = extractYouTubeId(customUrl.trim());
    if (!ytId) {
      setImportError("Please enter a valid YouTube URL (e.g. https://www.youtube.com/watch?v=...)");
      return;
    }

    const title = customTitle.trim() || `YouTube Clip (${ytId})`;
    const subtitles: SubtitleLine[] = (syncedSubtitles && syncedSubtitles.length > 0)
      ? syncedSubtitles
      : [];

    const newClip: ShadowingClip = {
      id: `custom-${Date.now()}`,
      title,
      youtubeId: ytId,
      thumbnail: videoThumbnail || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      category: 'SAVED CLIP',
      subtitles
    };

    try {
      const stored = localStorage.getItem('toolker_custom_clips');
      let customClipsList: ShadowingClip[] = [];
      if (stored) {
        customClipsList = JSON.parse(stored);
      }
      const filtered = customClipsList.filter(c => c.youtubeId !== newClip.youtubeId);
      const updatedClips = [newClip, ...filtered];
      localStorage.setItem('toolker_custom_clips', JSON.stringify(updatedClips));
    } catch (err) {
      console.warn("Failed to save custom clip to localStorage", err);
    }

    onSelectClip(newClip);
    onClose();
  };

  // Load custom clips on mount
  const [customClips, setCustomClips] = useState<ShadowingClip[]>([]);
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem('toolker_custom_clips');
      if (stored) {
        setCustomClips(JSON.parse(stored));
      }
    } catch (err) {
      console.warn("Failed to load custom clips", err);
    }
  }, []);

  const handleDeleteClip = (e: React.MouseEvent, clipId: string) => {
    e.stopPropagation();
    const updated = customClips.filter(c => c.id !== clipId);
    setCustomClips(updated);
    try {
      localStorage.setItem('toolker_custom_clips', JSON.stringify(updated));
    } catch (err) {}
  };

  const handleResyncClip = async (e: React.MouseEvent, clip: ShadowingClip) => {
    e.stopPropagation();
    setIsResyncingId(clip.id);

    const newSubs = await fetchSubtitlesForVideo(clip.youtubeId, clip.title);
    if (newSubs && newSubs.length > 0) {
      const updatedClip = { ...clip, subtitles: newSubs };
      const updatedClips = customClips.map(c => c.id === clip.id ? updatedClip : c);
      setCustomClips(updatedClips);
      try {
        localStorage.setItem('toolker_custom_clips', JSON.stringify(updatedClips));
      } catch (err) {}

      if (clip.id === currentClipId) {
        onSelectClip(updatedClip);
      }
    }
    setIsResyncingId(null);
  };

  const handleTranslateClip = async (e: React.MouseEvent, clip: ShadowingClip) => {
    e.stopPropagation();
    setIsTranslatingId(clip.id);
    try {
      const translatedSubs = await translateSubtitlesToFrench(clip.subtitles);
      const updatedClip = { ...clip, subtitles: translatedSubs };
      const updatedClips = customClips.map(c => c.id === clip.id ? updatedClip : c);
      setCustomClips(updatedClips);
      try {
        localStorage.setItem('toolker_custom_clips', JSON.stringify(updatedClips));
      } catch (err) {}

      if (clip.id === currentClipId) {
        onSelectClip(updatedClip);
      }
    } catch (err) {
      console.warn("Failed to translate clip", err);
    }
    setIsTranslatingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-[#e4dfd3] border-2 border-[#1c1d20] rounded-lg p-6 sm:p-7 shadow-[10px_10px_0px_rgba(0,0,0,0.9)] relative flex flex-col max-h-[90vh]">

        <div className="absolute top-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
        <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
        <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#7a776e] hover:text-[#cf573c] hover:bg-[#c5bfb0] p-1.5 rounded-md border border-transparent hover:border-[#7a776e] bg-transparent font-bold font-mono text-sm"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="mb-5 pb-3 border-b border-[#c5bfb0]">
          <h2 className="text-xl font-mono font-bold uppercase text-[#1c1d20] tracking-wide flex items-center gap-2">
            <span>🎬</span>
            <span>SHADOWING VIDEO LIBRARY</span>
          </h2>
          <p className="text-xs font-mono text-[#636056] mt-0.5">
            Choose a saved scene or paste any YouTube URL to extract dialogue
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-[#c5bfb0] p-1 rounded border-2 border-[#1c1d20] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.5)] mb-5">
          <button
            onClick={() => setActiveTab('presets')}
            className={`flex-1 py-1.5 rounded font-mono text-xs font-bold uppercase ${
              activeTab === 'presets'
                ? 'bg-[#476171] text-[#ebe6d8] shadow-[2px_2px_0px_#18191c] border-2 border-[#1c1d20]'
                : 'text-[#7a776e] hover:text-[#1c1d20] border-2 border-transparent'
            }`}
          >
            SAVED CLIPS
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex-1 py-1.5 rounded font-mono text-xs font-bold uppercase ${
              activeTab === 'custom'
                ? 'bg-[#476171] text-[#ebe6d8] shadow-[2px_2px_0px_#18191c] border-2 border-[#1c1d20]'
                : 'text-[#7a776e] hover:text-[#1c1d20] border-2 border-transparent'
            }`}
          >
            IMPORT URL
          </button>
        </div>

        {/* Tab 1: Presets & Saved */}
        {activeTab === 'presets' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {[...customClips, ...PRESET_CLIPS].length === 0 ? (
              <div className="text-center p-8 bg-[#c5bfb0] rounded border-2 border-[#1c1d20] shadow-[inset_2px_2px_5px_rgba(0,0,0,0.2)]">
                <p className="font-mono text-sm font-bold text-[#5c5950] uppercase mb-2">No Saved Clips</p>
                <p className="font-mono text-xs text-[#7a776e]">Click "IMPORT URL" to add a new video.</p>
              </div>
            ) : (
              [...customClips, ...PRESET_CLIPS].map((clip) => {
                const isSelected = clip.id === currentClipId;
                return (
                  <div
                    key={clip.id}
                    onClick={() => {
                      onSelectClip(clip);
                      onClose();
                    }}
                    className={`p-3.5 rounded-md border-2 transition-all cursor-pointer flex items-center gap-4 ${
                      isSelected
                        ? 'bg-[#c5bfb0] border-[#cf573c] shadow-[4px_4px_0px_#cf573c]'
                        : 'bg-[#ebe6d8] hover:bg-[#d8d2c4] border-[#1c1d20] shadow-[2px_2px_0px_#1c1d20]'
                    }`}
                  >
                    <img
                      src={clip.thumbnail || `https://img.youtube.com/vi/${clip.youtubeId}/mqdefault.jpg`}
                      alt={clip.title}
                      className="w-24 h-16 object-cover rounded border-2 border-[#1c1d20] shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-[#1c1d20] bg-[#16171a] text-[#ebe6d8] uppercase shadow-[1px_1px_0px_#1c1d20]">
                        {clip.category || 'Clip'}
                      </span>
                      <h3 className="font-sans text-sm text-[#1c1d20] font-bold truncate mt-1">
                        {clip.title}
                      </h3>
                      <p className="text-xs font-mono text-[#636056] mt-0.5">
                        {clip.subtitles.length} Sync Segments
                      </p>
                    </div>

                    {clip.category === 'SAVED CLIP' && (
                      <div className="flex flex-col gap-1.5 shrink-0 ml-2">
                        <button
                          onClick={(e) => handleTranslateClip(e, clip)}
                          disabled={isTranslatingId === clip.id || clip.subtitles.length === 0}
                          title="Translate dialogue between French and English"
                          className="text-[9.5px] font-mono font-bold uppercase px-2 py-1 bg-[#3d7a4d] hover:bg-[#346942] text-[#ebe6d8] rounded border-2 border-[#1c1d20] disabled:opacity-50 shadow-[2px_2px_0px_#1c1d20] active:shadow-none active:translate-y-[2px] active:translate-x-[2px]"
                        >
                          {isTranslatingId === clip.id ? 'TRADUCTION...' : '🇫🇷 ⇄ 🇬🇧 TRANSLATE'}
                        </button>
                        <button
                          onClick={(e) => handleResyncClip(e, clip)}
                          disabled={isResyncingId === clip.id}
                          className="text-[9.5px] font-mono font-bold uppercase px-2 py-1 bg-[#476171] hover:bg-[#374c59] text-[#ebe6d8] rounded border-2 border-[#1c1d20] disabled:opacity-50 shadow-[2px_2px_0px_#1c1d20] active:shadow-none active:translate-y-[2px] active:translate-x-[2px]"
                        >
                          {isResyncingId === clip.id ? 'SYNCING' : 'RE-SYNC'}
                        </button>
                        <button
                          onClick={(e) => handleDeleteClip(e, clip.id)}
                          className="text-[9.5px] font-mono font-bold uppercase px-2 py-1 bg-[#cf573c] hover:bg-[#a83f2a] text-[#ebe6d8] rounded border-2 border-[#1c1d20] shadow-[2px_2px_0px_#1c1d20] active:shadow-none active:translate-y-[2px] active:translate-x-[2px]"
                        >
                          DELETE
                        </button>
                      </div>
                    )}

                    {isSelected && (
                      <span className="text-[#cf573c] font-bold text-xs font-mono shrink-0 ml-2">
                        ACTIVE ✓
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Import Custom URL */}
        {activeTab === 'custom' && (
          <form onSubmit={handleImportCustom} className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div>
              <label className="block text-xs font-mono font-bold text-[#5c5950] uppercase mb-1">
                YOUTUBE VIDEO URL *
              </label>
              <input
                type="text"
                value={customUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                required
                className="w-full bg-[#16171a] border-2 border-[#1c1d20] rounded shadow-[inset_2px_2px_5px_rgba(0,0,0,0.8)] p-3 text-xs text-[#ebe6d8] font-mono outline-none focus:border-[#cf573c]"
              />
            </div>

            {/* Video Thumbnail & Info Preview Card */}
            {videoThumbnail && (
              <div className="flex items-center gap-3 bg-[#e4dfd3] p-2.5 rounded border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c]">
                <img
                  src={videoThumbnail}
                  alt="Thumbnail"
                  className="w-20 h-12 object-cover rounded border border-[#1c1d20] shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-[#1c1d20] bg-[#16171a] text-[#ebe6d8] uppercase">
                    YOUTUBE DETECTED
                  </span>
                  <p className="font-sans text-xs text-[#1c1d20] font-bold truncate mt-0.5">
                    {customTitle || "Fetching video title..."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const ytId = extractYouTubeId(customUrl.trim());
                    if (ytId) syncYouTubeVideo(ytId, customUrl.trim());
                  }}
                  disabled={isSyncing}
                  className="text-[10px] font-mono font-bold uppercase px-2.5 py-1.5 rounded bg-[#476171] hover:bg-[#374c59] text-[#ebe6d8] border-2 border-[#1c1d20] shadow-[2px_2px_0px_#1c1d20] shrink-0 disabled:opacity-50 active:shadow-none active:translate-y-[2px] active:translate-x-[2px]"
                  title="Re-run dialogue sync"
                >
                  {isSyncing ? 'SYNCING' : 'RE-SYNC'}
                </button>
              </div>
            )}

            {/* Instant Subtitle Sync Status Card */}
            {syncStatus !== 'idle' && (
              <div className={`p-3 rounded border-2 shadow-[2px_2px_0px_#18191c] text-xs font-mono transition-all ${
                syncStatus === 'loading'
                  ? 'bg-[#1b2234] border-[#1c1d20] text-[#a0b4d8]'
                  : 'bg-[#14261d] border-[#1c1d20] text-[#8fc49b]'
              }`}>
                <div className="flex items-center gap-2 font-bold">
                  {syncStatus === 'loading' && <span className="animate-spin">⏳</span>}
                  {syncStatus === 'success' && (
                    <span>{syncedSubtitles && syncedSubtitles.length > 0 ? '⚡ 100% SUBTITLES SYNCHRONIZED' : 'ℹ️ VIDEO READY'}</span>
                  )}
                  <span className="text-[10px] font-normal tracking-wide">{syncMessage}</span>
                </div>

                {/* Subtitle Preview Box */}
                {syncedSubtitles && syncedSubtitles.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-current/20 max-h-28 overflow-y-auto space-y-1 text-[11px] opacity-90">
                    {syncedSubtitles.slice(0, 4).map((s, idx) => (
                      <div key={idx} className="truncate">
                        <span className="font-bold opacity-80">[{s.start.toFixed(1)}s]</span> {s.text}
                      </div>
                    ))}
                    {syncedSubtitles.length > 4 && (
                      <div className="text-[9px] opacity-60 mt-1 uppercase tracking-wider">
                        + {syncedSubtitles.length - 4} more sentences ready for shadowing
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-mono font-bold text-[#5c5950] uppercase mb-1">
                VIDEO TITLE (OPTIONAL)
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. Ted Talk on Public Speaking"
                className="w-full bg-[#16171a] border-2 border-[#1c1d20] rounded shadow-[inset_2px_2px_5px_rgba(0,0,0,0.8)] p-3 text-xs text-[#ebe6d8] font-mono outline-none focus:border-[#cf573c]"
              />
            </div>

            {importError && (
              <div className="bg-[#cf573c]/20 border-2 border-[#cf573c] rounded p-2.5 text-xs font-mono text-[#1c1d20] font-bold shadow-[2px_2px_0px_#cf573c]">
                {importError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSyncing}
              className="w-full bg-[#cf573c] hover:bg-[#a83f2a] disabled:opacity-50 text-[#ebe6d8] border-2 border-[#1c1d20] py-3 rounded font-mono text-xs font-bold uppercase tracking-wider shadow-[4px_4px_0px_#18191c] active:translate-y-[4px] active:translate-x-[4px] active:shadow-none"
            >
              {isSyncing ? 'SYNCING CAPTIONS...' : 'LOAD VIDEO INTO SHADOWING STUDIO'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
};

export default VideoLibraryModal;
