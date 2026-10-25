import React, { useState, useRef, useEffect } from 'react';
import { SubtitleLine } from '../../types';
import { blobToBase64, playStandardAudio, stopAllAudio } from '../../utils/audio';
import { useRoom } from '../../contexts/RoomContext';

interface ShadowRecorderModalProps {
  line: SubtitleLine;
  initialLocalAudio?: string | null;
  initialRemoteAudio?: string | null;
  onClose: () => void;
  onReplaySegment: () => void;
}

const ShadowRecorderModal: React.FC<ShadowRecorderModalProps> = ({
  line,
  initialLocalAudio,
  initialRemoteAudio,
  onClose,
  onReplaySegment
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [localAudioBase64, setLocalAudioBase64] = useState<string | null>(initialLocalAudio || null);
  const [remoteAudioBase64, setRemoteAudioBase64] = useState<string | null>(initialRemoteAudio || null);
  
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [isPlayingRemote, setIsPlayingRemote] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [micError, setMicError] = useState('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const { broadcastAction, lastAction, isConnected } = useRoom();

  useEffect(() => {
    return () => {
      stopAllAudio();
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Listen to partner AUDIO_SYNC
  useEffect(() => {
    if (lastAction?.type === 'AUDIO_SYNC' && lastAction.payload) {
      setRemoteAudioBase64(lastAction.payload);
      stopAllAudio();
      setIsPlayingRemote(true);
      playStandardAudio(lastAction.payload, () => {
        setIsPlayingRemote(false);
      });
    }
  }, [lastAction]);

  const startRecording = async () => {
    setMicError('');
    setLocalAudioBase64(null);
    setRecordDuration(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 0) {
          const base64 = await blobToBase64(audioBlob);
          setLocalAudioBase64(base64);
          
          if (isConnected) {
            broadcastAction({ type: 'AUDIO_SYNC', payload: base64 });
          }
          
          stopAllAudio();
          setIsPlayingLocal(true);
          playStandardAudio(base64, () => {
            setIsPlayingLocal(false);
          });
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setMicError("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handlePlayMyAudio = () => {
    if (!localAudioBase64) return;
    if (isPlayingLocal) {
      stopAllAudio();
      setIsPlayingLocal(false);
    } else {
      stopAllAudio();
      setIsPlayingLocal(true);
      playStandardAudio(localAudioBase64, () => {
        setIsPlayingLocal(false);
      });
    }
  };

  const handlePlayRemoteAudio = () => {
    if (!remoteAudioBase64) return;
    if (isPlayingRemote) {
      stopAllAudio();
      setIsPlayingRemote(false);
    } else {
      stopAllAudio();
      setIsPlayingRemote(true);
      playStandardAudio(remoteAudioBase64, () => {
        setIsPlayingRemote(false);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-[#e4dfd3] border-2 border-[#1c1d20] rounded-xl p-4 sm:p-6 shadow-[6px_6px_0px_#18191c] relative flex flex-col text-left select-none">
        
        {/* Chassis Corner Rivets */}
        <div className="absolute top-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
        <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
        <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>

        {/* Header Bar */}
        <div className="flex items-center justify-between gap-2 mb-3 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#cf573c] animate-pulse shrink-0" />
            <span className="font-mono text-[10px] font-bold tracking-widest text-[#5c5950] uppercase">
              SHADOW // LINE PRACTICE
            </span>
          </div>

          <button
            onClick={onClose}
            title="Close"
            className="w-6 h-6 rounded bg-[#16171a] text-white hover:bg-[#cf573c] border border-[#1c1d20] flex items-center justify-center text-xs font-mono font-bold transition-all active:translate-y-0.5"
          >
            ✕
          </button>
        </div>

        {/* Target Sentence Box */}
        <div className="bg-[#16171a] border-2 border-[#2b2c32] rounded-lg p-3.5 sm:p-4 mb-3.5 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.8)]">
          <p className="font-mono text-sm sm:text-base text-[#ebe6d8] font-bold leading-relaxed">
            "{line.text}"
          </p>
          {line.translation && (
            <p className="font-sans text-xs text-[#9d9aa8] mt-1.5 border-t border-[#2b2c32] pt-1.5">
              {line.translation}
            </p>
          )}
        </div>

        {/* Error message */}
        {micError && (
          <div className="bg-[#fef2f2] border-2 border-[#b91c1c] text-[#b91c1c] rounded-md p-2 mb-3 text-[11px] font-mono font-bold">
            ⚠️ {micError}
          </div>
        )}

        {/* Action Controls: Replay & Record */}
        <div className="grid grid-cols-2 gap-2.5 mb-3.5">
          <button
            onClick={onReplaySegment}
            className="flex items-center justify-center gap-1.5 bg-[#24262c] hover:bg-[#32353e] text-[#ebe6d8] border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] rounded-md py-2.5 px-3 font-mono text-[11px] sm:text-xs font-bold uppercase transition-all active:translate-y-0.5 active:shadow-none"
          >
            <span>🔊</span>
            <span>REPLAY CLIP</span>
          </button>

          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex items-center justify-center gap-1.5 border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] rounded-md py-2.5 px-3 font-mono text-[11px] sm:text-xs font-bold uppercase transition-all active:translate-y-0.5 active:shadow-none text-white ${
              isRecording
                ? 'bg-[#b91c1c] animate-pulse'
                : 'bg-[#cf573c] hover:bg-[#a83f2a]'
            }`}
          >
            <span>{isRecording ? '⏹' : '🎙'}</span>
            <span>{isRecording ? `STOP (${recordDuration}s)` : 'RECORD VOICE'}</span>
          </button>
        </div>

        {/* Compact Recordings List (Only shows when audio is actually recorded!) */}
        {(localAudioBase64 || remoteAudioBase64) && (
          <div className="flex flex-col gap-2 pt-1 border-t border-[#c5bfb0]">
            {/* Your voice pill */}
            {localAudioBase64 && (
              <div className="flex items-center justify-between bg-[#ded8cb] border border-[#1c1d20] rounded-md px-3 py-2 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#cf573c]" />
                  <span className="font-bold text-[#1c1d20]">YOUR VOICE</span>
                </div>
                <button
                  onClick={handlePlayMyAudio}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase border border-[#1c1d20] shadow-[1px_1px_0px_#18191c] active:translate-y-0.5 active:shadow-none flex items-center gap-1 ${
                    isPlayingLocal
                      ? 'bg-[#cf573c] text-white'
                      : 'bg-[#16171a] hover:bg-[#2c2d33] text-white'
                  }`}
                >
                  <span>{isPlayingLocal ? '⏹' : '▶'}</span>
                  <span>{isPlayingLocal ? 'STOP' : 'PLAY'}</span>
                </button>
              </div>
            )}

            {/* Partner voice pill */}
            {remoteAudioBase64 && (
              <div className="flex items-center justify-between bg-[#ded8cb] border border-[#1c1d20] rounded-md px-3 py-2 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#3d7a4d]" />
                  <span className="font-bold text-[#1c1d20]">PARTNER VOICE</span>
                </div>
                <button
                  onClick={handlePlayRemoteAudio}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase border border-[#1c1d20] shadow-[1px_1px_0px_#18191c] active:translate-y-0.5 active:shadow-none flex items-center gap-1 ${
                    isPlayingRemote
                      ? 'bg-[#3d7a4d] text-white'
                      : 'bg-[#16171a] hover:bg-[#2c2d33] text-white'
                  }`}
                >
                  <span>{isPlayingRemote ? '⏹' : '▶'}</span>
                  <span>{isPlayingRemote ? 'STOP' : 'PLAY'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Subtle footer tip */}
        <p className="font-mono text-[9.5px] text-[#7a776e] mt-2.5 text-center">
          {isConnected 
            ? "🤝 Room active • Shadow recordings sync automatically with partner" 
            : "💡 Tip: Replay the line once, then record your echo"}
        </p>

      </div>
    </div>
  );
};

export default ShadowRecorderModal;
