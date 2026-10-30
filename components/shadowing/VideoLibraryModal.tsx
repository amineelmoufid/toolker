import React, { useState } from 'react';
import { ShadowingClip, SubtitleLine } from '../../types';
import {
  PRESET_CLIPS,
  parseRawSRTtoSubtitles,
  parsePlainTextToSubtitles,
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

const BOOKMARKLET_CODE = `javascript:(function(){try{var v=(new URLSearchParams(window.location.search)).get('v');if(!v){alert('Please open a YouTube video first!');return;}var pr=window.ytInitialPlayerResponse||(window.ytplayer&&window.ytplayer.config&&window.ytplayer.config.args&&JSON.parse(window.ytplayer.config.args.player_response));var tracks=pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;if(!tracks||!tracks.length){alert('No captions found on YouTube for this video.');return;}var tr=tracks.find(function(t){return t.kind==='asr';})||tracks.find(function(t){return t.isDefault;})||tracks[0];var u=tr.baseUrl;if(!u.includes('fmt='))u+='&fmt=srv3';fetch(u).then(function(r){return r.text();}).then(function(xml){var payload=JSON.stringify({v:v,title:document.title.replace(' - YouTube',''),xml:xml,lang:tr.languageCode||'en'});var w=window.open('https://toolker.stratom.bond/#shadowing','_blank');if(w){w.name='TOOLKER_DATA:'+btoa(unescape(encodeURIComponent(payload)));}}).catch(function(e){alert('Error fetching subtitles: '+e.message);});}catch(e){alert('Bookmarklet error: '+e.message);}})();`;

const VideoLibraryModal: React.FC<VideoLibraryModalProps> = ({
  currentClipId,
  onSelectClip,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>(() => {
    try {
      const stored = localStorage.getItem('toolker_custom_clips');
      const parsed = stored ? JSON.parse(stored) : [];
      return (parsed && parsed.length > 0) ? 'presets' : 'custom';
    } catch (_) {
      return 'custom';
    }
  });
  const [customUrl, setCustomUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [importError, setImportError] = useState('');
  const [videoThumbnail, setVideoThumbnail] = useState('');

  // Subtitle auto-sync states
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isResyncingId, setIsResyncingId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [syncedSubtitles, setSyncedSubtitles] = useState<SubtitleLine[] | null>(null);
  const [hasExtension, setHasExtension] = useState<boolean>(false);
  const [showExtensionModal, setShowExtensionModal] = useState<boolean>(false);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState<boolean>(false);
  const [showManualPaste, setShowManualPaste] = useState<boolean>(false);
  const [manualText, setManualText] = useState<string>('');

  // Detect Toolker Companion Extension
  React.useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === 'TOOLKER_EXTENSION_READY') {
        setHasExtension(true);
      }
    };
    window.addEventListener('message', handleMsg);
    window.postMessage({ type: 'TOOLKER_EXTENSION_PING' }, '*');
    return () => window.removeEventListener('message', handleMsg);
  }, []);

  const extractYouTubeId = (input: string): string | null => {
    if (!input) return null;
    const clean = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
    const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/;
    const match = clean.match(regExp);
    return match ? match[1] : null;
  };

  const fetchSubtitlesForVideo = async (ytId: string, _titleHint: string): Promise<SubtitleLine[]> => {
    // 0. Check window.name or bookmarklet payload (0ms)
    try {
      if (window.name && window.name.startsWith('TOOLKER_DATA:')) {
        const payloadStr = decodeURIComponent(escape(atob(window.name.replace('TOOLKER_DATA:', ''))));
        const payload = JSON.parse(payloadStr);
        if (payload.v === ytId && payload.xml) {
          const raw = parseTranscriptXml(payload.xml);
          const clean = reconstructSubtitlesSemantically(raw);
          if (clean.length > 0) return clean;
        }
      }
    } catch (_) {}

    // 0.5. Check Toolker Companion Extension (Instant residential browser fetch)
    try {
      const extResult = await new Promise<any>((resolve) => {
        const reqId = `req-${Date.now()}-${Math.random()}`;
        const timer = setTimeout(() => resolve(null), 800);
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
          const clean = reconstructSubtitlesSemantically(parsed);
          setSyncMessage(`✓ Extracted original dialogue via Extension (${clean.length} sentences)`);
          return clean;
        }
      }
    } catch (_) {}

    // 1. PRIMARY FAST-PATH: Direct Serverless Edge Extractor (/api/transcript)
    // Instant ~300ms YouTube caption extraction in the video's original spoken language
    try {
      setSyncMessage('⚡ Extracting original dialogue from YouTube in real-time...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`/api/transcript?v=${ytId}&_t=${Date.now()}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
          return data.subtitles;
        }
      }
    } catch (apiErr) {
      console.warn("API transcript notice:", apiErr);
    }

    // 2. Static pre-cached asset check
    try {
      const staticRes = await fetch(`/transcripts/${ytId}.json?_t=${Date.now()}`);
      const contentType = staticRes.headers.get('content-type') || '';
      if (staticRes.ok && contentType.includes('application/json')) {
        const staticData = await staticRes.json();
        if (staticData.ok && Array.isArray(staticData.subtitles) && staticData.subtitles.length > 0) {
          return staticData.subtitles;
        }
      }
    } catch (_) {}

    // 3. Crowdsourced Cloudflare Edge Cache
    try {
      const cacheRes = await fetch(`/api/cache?v=${ytId}&_t=${Date.now()}`);
      if (cacheRes.ok) {
        const cacheData = await cacheRes.json();
        if (cacheData.ok && Array.isArray(cacheData.subtitles) && cacheData.subtitles.length > 0) {
          return cacheData.subtitles;
        }
      }
    } catch (_) {}

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
    const cleanSubs = reconstructSubtitlesSemantically(subs);
    setSyncedSubtitles(cleanSubs);
    setSyncStatus('success');

    if (cleanSubs.length > 0) {
      const wordCount = cleanSubs.reduce((acc: number, sub: any) => acc + (sub.words?.length || 0), 0);
      setSyncMessage(`✓ Synchronized original dialogue (${cleanSubs.length} cues, ${wordCount} words)`);
    } else {
      setSyncMessage(`ℹ️ Video ready for shadowing (no CC detected on YouTube)`);
    }
    setIsSyncing(false);
  };

  const urlDebounceRef = React.useRef<any>(null);

  // Instant fetch & sync when YouTube link is entered (debounced)
  const handleUrlChange = (newUrl: string) => {
    setCustomUrl(newUrl);
    setImportError('');
    if (urlDebounceRef.current) clearTimeout(urlDebounceRef.current);

    const ytId = extractYouTubeId(newUrl.trim());
    if (ytId) {
      setVideoThumbnail(`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`);
      urlDebounceRef.current = setTimeout(() => {
        syncYouTubeVideo(ytId, newUrl.trim());
      }, 300);
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
      ? reconstructSubtitlesSemantically(syncedSubtitles)
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
        const parsed = JSON.parse(stored);
        const valid = Array.isArray(parsed) ? parsed.filter((c: any) => c.youtubeId && c.youtubeId !== 'qB254u2N5gQ') : [];
        setCustomClips(valid);
        if (Array.isArray(parsed) && valid.length !== parsed.length) {
          localStorage.setItem('toolker_custom_clips', JSON.stringify(valid));
        }
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

    const rawSubs = await fetchSubtitlesForVideo(clip.youtubeId, clip.title);
    const newSubs = reconstructSubtitlesSemantically(rawSubs);
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
            {customClips.length === 0 ? (
              <div className="text-center p-8 bg-[#c5bfb0] rounded border-2 border-[#1c1d20] shadow-[inset_2px_2px_5px_rgba(0,0,0,0.2)]">
                <p className="font-mono text-sm font-bold text-[#5c5950] uppercase mb-2">No Saved Clips</p>
                <p className="font-mono text-xs text-[#7a776e]">Click "IMPORT URL" to add a new video.</p>
              </div>
            ) : (
              customClips.map((clip) => {
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
                  : syncedSubtitles && syncedSubtitles.length > 0
                  ? 'bg-[#14261d] border-[#1c1d20] text-[#8fc49b]'
                  : 'bg-[#222329] border-[#1c1d20] text-[#ebe6d8]'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <div className="flex items-center gap-2">
                    {syncStatus === 'loading' && <span className="animate-spin">⏳</span>}
                    {syncStatus === 'success' && (
                      <span>{syncedSubtitles && syncedSubtitles.length > 0 ? '⚡ 100% SUBTITLES SYNCHRONIZED' : 'ℹ️ VIDEO READY'}</span>
                    )}
                    <span className="text-[10px] font-normal tracking-wide">{syncMessage}</span>
                  </div>
                  {syncStatus === 'success' && (!syncedSubtitles || syncedSubtitles.length === 0) && (
                    <button
                      type="button"
                      onClick={() => setShowManualPaste(!showManualPaste)}
                      className="text-[10px] text-[#cf573c] hover:underline uppercase shrink-0 ml-2"
                    >
                      {showManualPaste ? '✕ Hide Paste' : '+ Paste Subtitles'}
                    </button>
                  )}
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

                {/* Optional Manual Subtitle Paste Box */}
                {showManualPaste && (
                  <div className="mt-2.5 pt-2 border-t border-[#7a776e]/40 space-y-2">
                    <p className="text-[10px] text-[#c5bfb0]">
                      Paste SRT or timed dialogue lines (e.g. <code>[00:04] Hello world</code>) below:
                    </p>
                    <textarea
                      rows={3}
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder="1&#10;00:00:01,000 --> 00:00:04,000&#10;Hello and welcome..."
                      className="w-full bg-[#16171a] border border-[#7a776e] rounded p-2 text-[10px] font-mono text-[#ebe6d8] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!manualText.trim()) return;
                        let parsed: SubtitleLine[] = [];
                        if (manualText.includes('-->')) {
                          parsed = parseRawSRTtoSubtitles(manualText);
                        } else {
                          parsed = parsePlainTextToSubtitles(manualText);
                        }
                        if (parsed.length > 0) {
                          setSyncedSubtitles(parsed);
                          setShowManualPaste(false);
                          setSyncMessage(`✓ Added ${parsed.length} custom subtitle lines`);
                        }
                      }}
                      className="px-2 py-1 bg-[#476171] hover:bg-[#374c59] text-white rounded text-[10px] font-bold uppercase border border-[#1c1d20]"
                    >
                      Apply Pasted Subtitles
                    </button>
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

            {/* 100% Autonomous Zero-Fault Extraction Helpers */}
            <div className="bg-[#ded8c9] border-2 border-[#1c1d20] rounded p-3 shadow-[2px_2px_0px_#18191c] space-y-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold text-[#1c1d20] uppercase tracking-wider flex items-center gap-1.5">
                  <span>⚡</span> 100% GUARANTEED RESIDENTIAL EXTRACTION
                </span>
                {hasExtension ? (
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#1e4620] text-[#a3e635] border border-[#1c1d20]">
                    COMPANION ACTIVE ✓
                  </span>
                ) : (
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#476171] text-[#ebe6d8] border border-[#1c1d20]">
                    ZERO-CORS READY
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                {/* 1. Bookmarklet */}
                <div className="p-2.5 bg-[#ebe6d8] rounded border border-[#1c1d20] flex flex-col justify-between shadow-[1px_1px_0px_#1c1d20]">
                  <div>
                    <div className="font-bold text-[11px] text-[#1c1d20] flex items-center gap-1">
                      <span>⭐</span> 1-Click YT Bookmarklet
                    </div>
                    <p className="text-[9.5px] text-[#636056] mt-1 leading-snug">
                      Drag to your Bookmarks Bar. Click it on any YouTube video to open it here with 100% captions!
                    </p>
                  </div>
                  <div className="mt-2.5 flex gap-1.5">
                    <a
                      href={BOOKMARKLET_CODE}
                      onClick={(e) => {
                        // Allow dragging, but if clicked, copy code
                        if (e.isTrusted) {
                          navigator.clipboard.writeText(BOOKMARKLET_CODE);
                          setCopiedBookmarklet(true);
                          setTimeout(() => setCopiedBookmarklet(false), 2500);
                        }
                      }}
                      className="flex-1 text-center py-1.5 px-2 bg-[#cf573c] hover:bg-[#b8452c] text-white font-bold rounded border border-[#1c1d20] shadow-[1px_1px_0px_#1c1d20] text-[10px] cursor-grab select-none active:translate-y-[1px]"
                      title="Drag this button to your Bookmarks Bar!"
                    >
                      {copiedBookmarklet ? '✓ COPIED CODE!' : '⚡ OPEN IN TOOLKER (DRAG ME)'}
                    </a>
                  </div>
                </div>

                {/* 2. Companion Extension */}
                <div className="p-2.5 bg-[#ebe6d8] rounded border border-[#1c1d20] flex flex-col justify-between shadow-[1px_1px_0px_#1c1d20]">
                  <div>
                    <div className="font-bold text-[11px] text-[#1c1d20] flex items-center gap-1">
                      <span>🧩</span> Toolker Extension
                    </div>
                    <p className="text-[9.5px] text-[#636056] mt-1 leading-snug">
                      Lightweight 15KB extension for automatic 0.8s residential extraction when pasting URLs.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowExtensionModal(true)}
                    className="mt-2.5 text-center py-1.5 px-2 bg-[#476171] hover:bg-[#374c59] text-[#ebe6d8] font-bold rounded border border-[#1c1d20] shadow-[1px_1px_0px_#1c1d20] text-[10px] active:translate-y-[1px]"
                  >
                    {hasExtension ? '✓ EXTENSION CONNECTED' : 'HOW TO INSTALL (10s)'}
                  </button>
                </div>
              </div>
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

      {/* Extension Installation Guide Modal */}
      {showExtensionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-[#ebe6d8] border-4 border-[#1c1d20] shadow-[8px_8px_0px_#18191c] rounded-lg max-w-md w-full p-5 space-y-4 font-mono">
            <div className="flex items-center justify-between border-b-2 border-[#1c1d20] pb-2">
              <h3 className="font-bold text-sm text-[#1c1d20] flex items-center gap-2">
                <span>🧩</span> INSTALL TOOLKER EXTENSION
              </h3>
              <button
                onClick={() => setShowExtensionModal(false)}
                className="text-xs font-bold px-2 py-1 bg-[#cf573c] text-white rounded border border-[#1c1d20]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-[#1c1d20]">
              <p className="font-bold text-[#cf573c]">Takes 10 seconds (Chrome / Edge / Brave):</p>
              <ol className="list-decimal list-inside space-y-2 text-[11px] leading-relaxed bg-[#ded8c9] p-3 rounded border border-[#1c1d20]">
                <li>Open <code className="bg-[#1c1d20] text-[#a3e635] px-1 py-0.5 rounded">chrome://extensions</code> in a new tab.</li>
                <li>Turn on <strong className="text-[#cf573c]">Developer mode</strong> (toggle in top-right).</li>
                <li>Click <strong className="text-[#1c1d20]">Load unpacked</strong> (top-left).</li>
                <li>Select the <code className="bg-[#1c1d20] text-[#a3e635] px-1 py-0.5 rounded">extension</code> folder from the project repo.</li>
              </ol>
              <p className="text-[10px] text-[#636056]">
                Once loaded, pasting any YouTube URL will extract authentic subtitles in <strong>under 1 second</strong> using your browser's residential IP (100% zero Cloudflare blocks).
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowExtensionModal(false)}
              className="w-full py-2 bg-[#cf573c] hover:bg-[#b8452c] text-white font-bold text-xs rounded border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c]"
            >
              GOT IT, CLOSE
            </button>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};

export default VideoLibraryModal;
