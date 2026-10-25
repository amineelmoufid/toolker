import React, { useState, useEffect, useRef } from 'react';
import { UserRole, PracticeSession, AppLanguage, TokenUsageInfo } from '../types';
import { playPcmBuffer, decodeBase64 } from '../utils/audio';
import { 
  generatePracticeSentence, 
  generateSpeech, 
  DEFAULT_PROMPT, 
  getApiKey, 
  setApiKey, 
  getCustomPrompt, 
  setCustomPromptStorage, 
  resolvePromptPreview 
} from '../services/geminiService';
import { 
  publishSessionText, 
  publishSessionAudio, 
  setSpeedGenerating, 
  onValue, 
  sessionRef, 
  configRef, 
  saveCustomPrompt 
} from '../services/firebase';

interface GeneratorProps {
  role: UserRole;
}

type VoiceSpeed = 'word' | 'slow' | 'normal';

const Generator: React.FC<GeneratorProps> = ({ role }) => {
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState<AppLanguage>('English');
  const [speed, setSpeed] = useState<VoiceSpeed>('slow');
  const [currentSession, setCurrentSession] = useState<PracticeSession | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(() => getCustomPrompt());
  const [apiKeyInput, setApiKeyInput] = useState(() => getApiKey());
  const [errorMessage, setErrorMessage] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const unsubSession = onValue(sessionRef, (snapshot) => {
      const data = snapshot.val();
      setCurrentSession(data);
    });
    
    const unsubConfig = onValue(configRef, (snapshot) => {
      const data = snapshot.val();
      if (data?.customPrompt) {
        setCustomPrompt(data.customPrompt);
        setCustomPromptStorage(data.customPrompt);
      }
    });

    return () => {
      unsubSession();
      unsubConfig();
    };
  }, []);

  const handleGenerateNew = async () => {
    if (!topic.trim()) return;
    setLocalLoading(true);
    setErrorMessage('');
    try {
      const sentenceResult = await generatePracticeSentence(topic, language, customPrompt);
      const textUsage = sentenceResult.usage;

      let tokenUsageInfo: TokenUsageInfo = {
        textPromptTokens: textUsage?.promptTokens || 0,
        textCandidatesTokens: textUsage?.candidatesTokens || 0,
        textTotalTokens: textUsage?.totalTokens || 0,
        totalTokens: textUsage?.totalTokens || 0,
        lastUpdated: Date.now()
      };

      await publishSessionText(sentenceResult.sentence, language, tokenUsageInfo);
      
      // Generate the active speed first, awaiting it so the UI unlocks
      await setSpeedGenerating(speed, true);
      const speechResult = await generateSpeech(sentenceResult.sentence, speed, language);
      const audioUsage = speechResult.usage;

      if (audioUsage) {
        tokenUsageInfo = {
          ...tokenUsageInfo,
          audioPromptTokens: audioUsage.promptTokens,
          audioCandidatesTokens: audioUsage.candidatesTokens,
          audioTotalTokens: audioUsage.totalTokens,
          totalTokens: (tokenUsageInfo.textTotalTokens || 0) + (audioUsage.totalTokens || 0),
          lastUpdated: Date.now()
        };
      }

      await publishSessionAudio(speed, speechResult.base64Audio, tokenUsageInfo);

      // Background Preload Loop for other speeds
      const otherSpeeds: VoiceSpeed[] = ['normal', 'slow', 'word'].filter(s => s !== speed) as VoiceSpeed[];
      
      // We don't await this block, so it runs in background
      (async () => {
        let currentTokens = tokenUsageInfo;
        for (const targetSpeed of otherSpeeds) {
          try {
            await setSpeedGenerating(targetSpeed, true);
            const bgSpeechResult = await generateSpeech(sentenceResult.sentence, targetSpeed, language);
            const bgUsage = bgSpeechResult.usage;
            
            if (bgUsage) {
              currentTokens = {
                ...currentTokens,
                audioTotalTokens: (currentTokens.audioTotalTokens || 0) + bgUsage.totalTokens,
                totalTokens: currentTokens.totalTokens + bgUsage.totalTokens,
                lastUpdated: Date.now()
              };
            }
            await publishSessionAudio(targetSpeed, bgSpeechResult.base64Audio, currentTokens);
          } catch(err) {
            console.error(`Background preload failed for ${targetSpeed}:`, err);
            await setSpeedGenerating(targetSpeed, false);
          }
        }
      })();

    } catch (error: any) {
      console.error("Failed to generate:", error);
      const msg = error?.message || String(error);
      if (msg.includes('PERMISSION_DENIED')) {
        setErrorMessage("Firebase Database Permission Denied. Your Firebase Rules might be expired, or your API key is blocked by Google Cloud (403). Error: " + msg);
      } else {
        setErrorMessage("Generation failed: " + msg);
      }
      await setSpeedGenerating(speed, false).catch(()=>{});
    } finally {
      setLocalLoading(false);
    }
  };


  const handleRegenerateAudio = async (targetSpeed?: string): Promise<string | null> => {
    const requestedSpeed = targetSpeed || speed;
    
    // If already generating by someone (us or a partner), skip firing a duplicate request.
    if (currentSession?.generatingSpeeds?.[requestedSpeed]) {
      return null;
    }

    if (!currentSession?.sentence || localLoading) return null;
    setErrorMessage('');
    try {
      await setSpeedGenerating(requestedSpeed, true);
      const speechResult = await generateSpeech(currentSession.sentence, requestedSpeed as any, currentSession.language);
      const audioUsage = speechResult.usage;

      let tokenUsageInfo: TokenUsageInfo = currentSession.tokenUsage || {
        totalTokens: 0,
        lastUpdated: Date.now()
      };

      if (audioUsage) {
        tokenUsageInfo = {
          ...tokenUsageInfo,
          audioPromptTokens: audioUsage.promptTokens,
          audioCandidatesTokens: audioUsage.candidatesTokens,
          audioTotalTokens: (tokenUsageInfo.audioTotalTokens || 0) + audioUsage.totalTokens,
          totalTokens: (tokenUsageInfo.textTotalTokens || 0) + (tokenUsageInfo.audioTotalTokens || 0) + audioUsage.totalTokens,
          lastUpdated: Date.now()
        };
      }

      await publishSessionAudio(requestedSpeed, speechResult.base64Audio, tokenUsageInfo);
      return speechResult.base64Audio;
    } catch (error: any) {
      console.error("Failed to regenerate audio:", error);
      const msg = error?.message || String(error);
      if (msg.includes('PERMISSION_DENIED')) {
        setErrorMessage("Firebase Database Permission Denied or API Blocked: " + msg);
      } else {
        setErrorMessage("Audio synthesis failed: " + msg);
      }
      await setSpeedGenerating(requestedSpeed, false).catch(()=>{});
      return null;
    }
  };

  const handleSelectSpeed = async (newSpeed: 'slow' | 'normal' | 'word') => {
    setSpeed(newSpeed);
    let audioToPlay = currentSession?.referenceAudios?.[newSpeed];
    
    // JIT Preloading logic
    if (currentSession && !audioToPlay && !localLoading && !currentSession.generatingSpeeds?.[newSpeed]) {
      audioToPlay = await handleRegenerateAudio(newSpeed) || undefined;
    }

    if (audioToPlay) {
      try {
        const audioData = decodeBase64(audioToPlay);
        playPcmBuffer(audioData);
      } catch(e) { console.error(e) }
    }
  };

  const handleSavePrompt = async () => {
    try {
      setApiKey(apiKeyInput);
      setCustomPromptStorage(customPrompt);
      await saveCustomPrompt(customPrompt);
      setSaveSuccessMsg('✓ PROMPT PARAMETERS SAVED');
      setErrorMessage('');
      setTimeout(() => setSaveSuccessMsg(''), 3000);
    } catch (err: any) {
      console.error("Error saving prompt:", err);
      setErrorMessage("Failed to persist prompt to Firebase bus: " + (err?.message || err));
    }
  };

  const handleRestoreDefault = async () => {
    setCustomPrompt(DEFAULT_PROMPT);
    setCustomPromptStorage(DEFAULT_PROMPT);
    try {
      await saveCustomPrompt(DEFAULT_PROMPT);
      setSaveSuccessMsg('✓ DEFAULT PROMPT RESTORED');
      setTimeout(() => setSaveSuccessMsg(''), 3000);
    } catch (err) {
      console.warn("Could not sync default prompt to cloud bus:", err);
    }
  };

  const handleInsertTag = (tag: string) => {
    if (textareaRef.current) {
      const el = textareaRef.current;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const val = customPrompt;
      const nextVal = val.substring(0, start) + tag + val.substring(end);
      setCustomPrompt(nextVal);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else {
      setCustomPrompt(prev => prev + ' ' + tag);
    }
  };

  const isCustomized = customPrompt.trim() !== DEFAULT_PROMPT.trim();
  const isGlobalLoading = currentSession?.generatingSpeeds?.[speed] === true;
  const resolvedPreview = resolvePromptPreview(customPrompt, language, topic);
  const activeAudio = currentSession?.referenceAudios?.[speed] || currentSession?.referenceAudios?.normal || currentSession?.referenceAudios?.slow || currentSession?.referenceAudios?.word;

  useEffect(() => {
    if (activeAudio && !isGlobalLoading) {
      try {
        const audioData = decodeBase64(activeAudio);
        playPcmBuffer(audioData);
      } catch (err) {
        console.error('Auto-play failed:', err);
      }
    }
  }, [activeAudio, isGlobalLoading]);

  return (
    <div className="space-y-5">
      {/* Upper Control Deck */}
      {(role === UserRole.ADMIN || role === UserRole.USER) && (
        <div className="space-y-4 bg-[#dad3c4] p-4 rounded-lg border-2 border-[#232428]">
          {/* Top Bar: Topic Input, Language Selector & Generate Button */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-grow flex gap-2">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && topic.trim() && !localLoading && !isGlobalLoading) {
                    handleGenerateNew();
                  }
                }}
                placeholder="INPUT TOPIC (e.g., 'Aviation', 'Travel', 'Artificial Intelligence')..."
                className="flex-grow bg-[#16171a] border-2 border-[#2a2c33] p-2.5 rounded font-mono text-sm text-[#ebe6d8] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.8)] focus:border-[#476171] outline-none placeholder:text-[#585963]"
              />
              
              {/* Language Selector Rocker */}
              <div className="flex bg-[#16171a] rounded p-1 border-2 border-[#2a2c33] items-center gap-1 shrink-0">
                {(['English', 'French'] as AppLanguage[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLanguage(l)}
                    className={`px-2.5 py-1 rounded font-mono text-xs font-bold transition-all duration-75 ${
                      language === l 
                        ? 'bg-[#476171] text-[#fbf8f2] shadow-[1px_1px_0px_#18191c]' 
                        : 'text-[#7d7a71] hover:text-[#ebe6d8]'
                    }`}
                  >
                    {l === 'English' ? 'EN' : 'FR'}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Generate Button */}
            <button
              onClick={handleGenerateNew}
              disabled={localLoading || !topic.trim()}
              className={`px-5 py-2.5 rounded border-2 border-[#1c1d20] font-mono text-xs font-bold uppercase tracking-wider transition-all duration-75 shrink-0 relative overflow-hidden ${
                localLoading || !topic.trim()
                  ? 'bg-[#cec7b8] text-[#716d63] cursor-not-allowed shadow-[1px_1px_0px_#18191c]' 
                  : 'bg-[#476171] hover:bg-[#547184] text-[#fbf8f2] shadow-[3px_3px_0px_#18191c] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_#18191c]'
              }`}
            >
              <span>{localLoading ? 'SYNTHESIZING...' : '▶ GENERATE'}</span>
              {localLoading && (
                <div className="absolute bottom-0 left-0 h-1 bg-[#cf573c] w-full animate-pulse"></div>
              )}
            </button>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-[#cf573c]/15 border-2 border-[#cf573c] p-3 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[#cf573c] font-bold text-sm">⚠</span>
                <p className="text-[#cf573c] font-mono text-xs font-bold leading-tight">{errorMessage}</p>
              </div>
              {!showPromptEditor && role === UserRole.ADMIN && (
                <button
                  onClick={() => setShowPromptEditor(true)}
                  className="bg-[#cf573c] text-white text-[10px] font-mono font-bold px-2.5 py-1 rounded uppercase tracking-wider self-start sm:self-auto shrink-0"
                >
                  Configure Prompt / Key ⚙
                </button>
              )}
            </div>
          )}

          {/* Success Toast / Notification */}
          {saveSuccessMsg && (
            <div className="bg-[#3d7a4d]/15 border-2 border-[#3d7a4d] p-2.5 rounded flex items-center gap-2">
              <span className="text-[#3d7a4d] font-bold text-xs">✓</span>
              <p className="text-[#2b5837] font-mono text-xs font-bold leading-tight">{saveSuccessMsg}</p>
            </div>
          )}

          {/* GEMINI PROMPT MATRIX HEADER / TOGGLE */}
          {role === UserRole.ADMIN && (
            <>
            <div className="bg-[#cfc8b8] p-2.5 rounded border border-[#b8b1a0] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#3d3b35] flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isCustomized ? 'bg-[#3d7a4d]' : 'bg-[#476171]'}`}></span>
                GEMINI API PROMPT:
              </span>
              <span className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase border ${
                isCustomized 
                  ? 'bg-[#3d7a4d]/20 text-[#244b2d] border-[#3d7a4d]/40' 
                  : 'bg-[#1c1d20]/10 text-[#555248] border-[#1c1d20]/20'
              }`}>
                {isCustomized ? 'CUSTOM CALIBRATED' : 'DEFAULT TEMPLATE'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => setShowPromptEditor(!showPromptEditor)}
                className="bg-[#16171a] hover:bg-[#23252b] text-[#ebe6d8] border border-[#2b2c32] shadow-[2px_2px_0px_#18191c] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none px-2.5 py-1 rounded font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
              >
                <span>{showPromptEditor ? '▲' : '⚙'}</span>
                <span>{showPromptEditor ? 'HIDE PROMPT EDITOR' : 'VIEW / CHANGE PROMPT'}</span>
              </button>
            </div>
          </div>

          {/* PROMPT SUMMARY PEEK (WHEN COLLAPSED) */}
          {!showPromptEditor && (
            <div 
              onClick={() => setShowPromptEditor(true)}
              className="cursor-pointer bg-[#16171a] hover:border-[#476171] transition-colors p-2.5 rounded border-2 border-[#2b2c32] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.7)] group"
            >
              <div className="flex items-center justify-between text-[9px] font-mono text-[#777469] mb-1">
                <span>CURRENT PROMPT TEMPLATE PEEK:</span>
                <span className="text-[#476171] group-hover:text-[#ebe6d8] transition-colors">CLICK TO EDIT ✎</span>
              </div>
              <p className="font-mono text-xs text-[#d6d0c0] truncate leading-relaxed">
                "{customPrompt}"
              </p>
            </div>
          )}

          {/* EXPANDED PROMPT CALIBRATION MATRIX */}
          {showPromptEditor && (
            <div className="bg-[#16171a] p-4 sm:p-5 rounded border-2 border-[#2b2c32] space-y-4 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.85)]">
              {/* Header Plate */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#262830] pb-2.5">
                <div>
                  <span className="font-mono text-xs font-bold text-[#ebe6d8] uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#cf573c]"></span>
                    GEMINI PROMPT CALIBRATION &amp; SYNTHESIS MATRIX
                  </span>
                  <p className="font-mono text-[10px] text-[#7a776e] mt-0.5">
                    Model target: <strong className="text-[#cf573c]">gemini-3.5-flash-lite</strong>. Dynamic tags: <code className="text-[#476171]">{"{{LANGUAGE}}"}</code> and <code className="text-[#476171]">{"{{TOPIC}}"}</code>.
                  </p>
                </div>

                {/* Tag Injector Buttons */}
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] uppercase text-[#6d6a60] mr-1">INSERT TAGS:</span>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{{LANGUAGE}}')}
                    title="Insert language placeholder"
                    className="bg-[#24262c] hover:bg-[#32353e] text-[#ebe6d8] border border-[#3e414c] px-2 py-0.5 rounded font-mono text-[10px] font-bold"
                  >
                    + {"{{LANGUAGE}}"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{{TOPIC}}')}
                    title="Insert topic placeholder"
                    className="bg-[#24262c] hover:bg-[#32353e] text-[#ebe6d8] border border-[#3e414c] px-2 py-0.5 rounded font-mono text-[10px] font-bold"
                  >
                    + {"{{TOPIC}}"}
                  </button>
                </div>
              </div>

              {/* Prompt Template Matrix Textarea */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="font-mono text-[10px] font-bold text-[#476171] uppercase tracking-wider">
                    PROMPT TEMPLATE CONTENT
                  </label>
                  <span className="font-mono text-[9px] text-[#777469]">
                    {customPrompt.length} CHARS
                  </span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Enter custom Gemini prompt template..."
                  rows={4}
                  className="w-full bg-[#121316] border-2 border-[#2b2c32] rounded p-3 text-xs text-[#ebe6d8] font-mono leading-relaxed outline-none focus:border-[#476171] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.8)]"
                />
              </div>

              {/* LIVE RESOLVED PREVIEW ACCORDION */}
              <div className="bg-[#121316] p-3 rounded border border-[#2b2c32] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] font-bold text-[#7a776e] uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-[#476171]"></span>
                    LIVE PAYLOAD RESOLUTION PREVIEW (CURRENT CONTEXT: {language.toUpperCase()} // "{topic.trim() || (language === 'French' ? 'VOYAGE' : 'AVIATION')}")
                  </span>
                </div>
                <p className="font-mono text-[11px] text-[#b8b3a5] bg-[#0c0d0f] p-2.5 rounded border border-[#1e2025] leading-relaxed italic select-all">
                  "{resolvedPreview}"
                </p>
              </div>

              {/* Action Buttons Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button 
                    type="button"
                    onClick={handleSavePrompt}
                    className="bg-[#476171] hover:bg-[#547184] text-[#fbf8f2] border border-[#1c1d20] shadow-[2px_2px_0px_#18191c] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none px-4 py-2 rounded font-mono text-xs font-bold uppercase transition-all duration-75 flex items-center gap-1.5"
                  >
                    <span>💾</span>
                    <span>SAVE PROMPT</span>
                  </button>
                  <button 
                    type="button"
                    onClick={handleRestoreDefault}
                    className="bg-[#cec7b8] hover:bg-[#bfb7a6] text-[#1c1d20] border border-[#1c1d20] shadow-[2px_2px_0px_#18191c] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none px-3 py-2 rounded font-mono text-xs font-bold uppercase transition-all duration-75"
                  >
                    RESTORE DEFAULT
                  </button>
                </div>

                {topic.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      handleSavePrompt();
                      handleGenerateNew();
                    }}
                    disabled={localLoading || isGlobalLoading}
                    className="bg-[#cf573c] hover:bg-[#db6247] text-[#fbf8f2] border border-[#1c1d20] shadow-[2px_2px_0px_#18191c] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none px-3.5 py-2 rounded font-mono text-xs font-bold uppercase transition-all duration-75"
                  >
                    SAVE &amp; GENERATE ▶
                  </button>
                )}
              </div>

              {/* API Key Configuration Drawer */}
              <div className="pt-3 border-t border-[#23252c] space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] font-bold text-[#7a776e] uppercase tracking-wider">
                    OPTIONAL: GOOGLE GEMINI API KEY OVERRIDE (AI STUDIO)
                  </span>
                  <span className="font-mono text-[9px] text-[#777469]">
                    {apiKeyInput ? '● CONFIGURED (SAVED IN BROWSER)' : '○ USING SYSTEM KEY'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIzaSy... (Leave blank to use preconfigured system key)"
                    className="flex-grow bg-[#121316] border border-[#2b2c32] rounded p-2 text-xs text-[#ebe6d8] font-mono outline-none focus:border-[#476171] placeholder:text-[#52545e]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setApiKey(apiKeyInput);
                      setSaveSuccessMsg('✓ API KEY UPDATED IN BROWSER');
                      setTimeout(() => setSaveSuccessMsg(''), 3000);
                    }}
                    className="bg-[#24262c] hover:bg-[#32353e] text-[#ebe6d8] border border-[#3e414c] px-3 py-1.5 rounded font-mono text-[10px] font-bold uppercase shrink-0"
                  >
                    SET KEY
                  </button>
                </div>
              </div>
            </div>
          )}


            </>
          )}
        </div>
      )}

      {/* Target Sentence Recessed Charcoal Display */}
      {currentSession ? (
        <div className="bg-[#16171a] p-6 sm:p-8 rounded-lg border-2 border-[#282a30] shadow-[inset_3px_3px_8px_rgba(0,0,0,0.85)] flex flex-col items-center text-center relative overflow-hidden">
          
          {/* Top Status Header inside Display */}
          <div className="w-full flex items-center justify-between pb-3 mb-4 border-b border-[#282a30]">
            <span className="font-mono text-[9px] font-bold text-[#cf573c] uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#cf573c] animate-pulse"></span>
              TARGET SENTENCE BUFFER
            </span>
            
            <div className="flex items-center gap-2">
              {currentSession.tokenUsage && (
                <span className="font-mono text-[9px] font-bold bg-[#1e2026] text-[#3d7a4d] px-2 py-0.5 rounded border border-[#2d3039] flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-[#3d7a4d]"></span>
                  <span>{currentSession.tokenUsage.totalTokens.toLocaleString()} TOKENS</span>
                </span>
              )}
              <span className="font-mono text-[9px] font-bold bg-[#262830] text-[#ebe6d8] px-2 py-0.5 rounded border border-[#383a42] uppercase">
                {currentSession.language === 'English' ? 'EN-US // 24kHz' : 'FR-FR // 24kHz'}
              </span>
            </div>
          </div>
          
          {/* Primary Sentence Text & Controls */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mt-2 w-full">
            <p className="font-mono text-xl sm:text-2xl text-[#f3efe4] leading-relaxed tracking-wide flex-1 text-left">
              "{currentSession.sentence}"
            </p>
            
            <div className="flex items-center gap-4 shrink-0">
              {/* Tempo Selector Pill */}
              <div className="flex bg-[#d8d2c4] p-1 rounded-full border border-[#a8a497] shadow-[2px_2px_0px_#18191c]">
                <button
                  onClick={() => handleSelectSpeed('slow')}
                  title="Slow Mode"
                  className={`p-1.5 rounded-full transition-colors ${speed === 'slow' ? 'bg-[#cf573c] text-white shadow-inner' : 'text-[#4d4a43] hover:bg-[#c5bfb0]'}`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4" />
                    <path d="M12 18v4" />
                    <path d="M4.93 19.07l2.83-2.83" />
                    <path d="M16.24 7.76l2.83-2.83" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                </button>
                
                <button
                  onClick={() => handleSelectSpeed('normal')}
                  title="Normal Mode"
                  className={`p-1.5 rounded-full transition-colors ${speed === 'normal' ? 'bg-[#1c1d20] text-white shadow-inner' : 'text-[#4d4a43] hover:bg-[#c5bfb0]'}`}
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>

                <button
                  onClick={() => handleSelectSpeed('word')}
                  title="Word-by-Word Mode (JIT Preloading)"
                  className={`p-1.5 rounded-full transition-colors ${speed === 'word' ? 'bg-[#3b82f6] text-white shadow-inner' : 'text-[#4d4a43] hover:bg-[#c5bfb0]'}`}
                >
                  <span className="font-mono text-[11px] font-bold leading-none block h-4 w-4 flex items-center justify-center">W</span>
                </button>
              </div>


            </div>
          </div>
          
          {/* Token Breakdown Ribbon */}
          {currentSession.tokenUsage && (
            <div className="w-full mt-5 pt-3 border-t border-[#23252c] flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] text-[#716e64]">
              <div className="flex items-center gap-1.5">
                <span className="text-[#8e8a7f] uppercase font-bold tracking-wider">AI METRICS:</span>
                <span className="text-[#cf573c] font-bold">GEMINI 3.5 FLASH LITE</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {currentSession.tokenUsage.textTotalTokens !== undefined && (
                  <span className="bg-[#191a20] px-2 py-0.5 rounded border border-[#2b2d35] text-[#ebe6d8]">
                    TEXT TOKENS: <strong className="text-[#ebe6d8]">{currentSession.tokenUsage.textTotalTokens}</strong>
                  </span>
                )}
                {currentSession.tokenUsage.audioTotalTokens !== undefined && (
                  <span className="bg-[#191a20] px-2 py-0.5 rounded border border-[#2b2d35] text-[#ebe6d8]">
                    AUDIO TOKENS: <strong className="text-[#ebe6d8]">{currentSession.tokenUsage.audioTotalTokens}</strong>
                  </span>
                )}
              </div>
            </div>
          )}

          {isGlobalLoading && (
            <div className="w-full max-w-sm mt-6 space-y-2">
              <div className="h-1.5 w-full bg-[#262830] rounded overflow-hidden border border-[#383a42]">
                <div className="h-full bg-[#cf573c] animate-[loading_1.8s_infinite_linear] w-1/3"></div>
              </div>
              <p className="font-mono text-[9px] text-[#cf573c] font-bold uppercase tracking-widest animate-pulse">
                SYNTHESIZING ACOUSTIC REFERENCE SAMPLES...
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#16171a] py-12 px-6 rounded-lg border-2 border-[#282a30] shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8)] text-center">
          <p className="font-mono text-xs text-[#716e64] uppercase tracking-widest">
            &gt; STANDBY: INPUT TOPIC ABOVE AND EXECUTE GENERATION
          </p>
        </div>
      )}

      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
};

export default Generator;