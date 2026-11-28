import React, { useState, useRef, useEffect } from 'react';
import { blobToBase64, playStandardAudio, stopAllAudio } from '../../utils/audio';
import { useRoom } from '../../contexts/RoomContext';

interface ShadowMicButtonProps {
  label?: string;
  targetText?: string;
  variant?: 'card' | 'input';
  size?: 'sm' | 'md';
  onRecordingFinished?: (base64: string) => void;
  className?: string;
}

export const ShadowMicButton: React.FC<ShadowMicButtonProps> = ({
  label,
  targetText,
  variant = 'card',
  size = 'md',
  onRecordingFinished,
  className = ''
}) => {
  const [recordState, setRecordState] = useState<'idle' | 'recording' | 'playing'>('idle');
  const [recordDuration, setRecordDuration] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const safetyTimeoutRef = useRef<number | null>(null);
  const lastAudioRef = useRef<string | null>(null);

  const { isConnected, syncAudio } = useRoom();

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  const startRecording = async () => {
    setMicError(null);
    stopAllAudio();
    cleanup();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : MediaRecorder.isTypeSupported('audio/mp4') 
          ? 'audio/mp4' 
          : '';

      const mediaRecorder = mimeType 
        ? new MediaRecorder(stream, { mimeType }) 
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        const type = mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type });

        if (audioBlob.size > 0) {
          try {
            const base64 = await blobToBase64(audioBlob);
            lastAudioRef.current = base64;
            
            if (onRecordingFinished) {
              onRecordingFinished(base64);
            }

            // Sync to room partner if connected
            if (isConnected && syncAudio) {
              syncAudio(base64);
            }

            // DIRECT AUTO-PLAYBACK: Play back the user's recording immediately so they hear how they said it!
            setRecordState('playing');
            stopAllAudio();
            playStandardAudio(base64, () => {
              setRecordState('idle');
            });

          } catch (err) {
            console.error('Error processing audio recording', err);
            setRecordState('idle');
          }
        } else {
          setRecordState('idle');
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start();
      setRecordState('recording');
      setRecordDuration(0);

      timerRef.current = window.setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);

      // Auto-stop after 9 seconds of recording
      safetyTimeoutRef.current = window.setTimeout(() => {
        stopRecording();
      }, 9000);

    } catch (err: any) {
      console.warn('Microphone access denied or error:', err);
      setMicError('Mic blocked');
      setRecordState('idle');
    }
  };

  const stopRecording = () => {
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (recordState === 'idle') {
      startRecording();
    } else if (recordState === 'recording') {
      stopRecording();
    } else if (recordState === 'playing') {
      stopAllAudio();
      setRecordState('idle');
    }
  };

  // Replay user's last recorded audio if they want
  const handleReplayLast = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lastAudioRef.current && recordState === 'idle') {
      setRecordState('playing');
      stopAllAudio();
      playStandardAudio(lastAudioRef.current, () => {
        setRecordState('idle');
      });
    }
  };

  // Styles based on variant
  const isCard = variant === 'card';
  const sizeClasses = size === 'sm' 
    ? 'h-8 px-2.5 text-xs' 
    : isCard 
      ? 'w-9 h-9 sm:w-10 sm:h-10 rounded-xl' 
      : 'w-10 h-10 sm:w-12 sm:h-12 rounded-xl';

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        title={
          recordState === 'recording' 
            ? 'Click to stop & hear yourself' 
            : recordState === 'playing' 
              ? 'Click to stop playback' 
              : 'Shadow: Record your voice & hear yourself'
        }
        className={`flex items-center justify-center font-mono font-bold transition-all select-none active:translate-y-0.5 ${sizeClasses} ${
          isCard 
            ? recordState === 'recording'
              ? 'bg-[#cf573c] text-white border-2 border-[#cf573c] shadow-[0px_0px_14px_rgba(207,87,60,0.8)] animate-pulse'
              : recordState === 'playing'
                ? 'bg-[#3d7a4d] text-white border-2 border-[#3d7a4d] shadow-[0px_0px_14px_rgba(61,122,77,0.8)]'
                : 'bg-[#22242a] text-[#cfcbbe] hover:text-[#e89271] hover:bg-[#2c2f38] border border-[#393b45] hover:border-[#e89271]/60'
            : recordState === 'recording'
              ? 'bg-[#cf573c] text-white border-2 border-[#1c1d20] shadow-[2px_2px_0px_#1c1d20] animate-pulse'
              : recordState === 'playing'
                ? 'bg-[#3d7a4d] text-white border-2 border-[#1c1d20] shadow-[2px_2px_0px_#1c1d20]'
                : 'bg-[#ebe6d8] text-[#1c1d20] hover:bg-[#c5bfb0] border-2 border-[#1c1d20] shadow-[2px_2px_0px_#1c1d20]'
        }`}
      >
        {recordState === 'recording' ? (
          <div className="flex items-center justify-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
            <span className="text-[10px] font-mono font-extrabold">{recordDuration}s</span>
          </div>
        ) : recordState === 'playing' ? (
          <div className="flex items-center justify-center text-white" title="Playing your voice">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
        ) : (
          <div className="flex items-center justify-center">
            {/* Microphone Icon */}
            <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
        )}
      </button>

      {/* Mic error pill if permission denied */}
      {micError && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-mono text-[#cf573c] bg-[#16171a] px-1.5 py-0.5 rounded border border-[#cf573c]">
          {micError}
        </span>
      )}
    </div>
  );
};

export default ShadowMicButton;
