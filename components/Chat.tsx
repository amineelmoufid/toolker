import React, { useState, useEffect, useRef } from 'react';
import { UserRole, ChatMessage } from '../types';
import { onValue, chatRef, sendChatMessage } from '../services/firebase';
import { blobToBase64, playStandardAudio, stopAllAudio } from '../utils/audio';
import { useRoom } from '../contexts/RoomContext';

interface ChatProps {
  role: UserRole;
  userName: string;
}

const Chat: React.FC<ChatProps> = ({ role, userName }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [p2pMessages, setP2pMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const { isConnected, broadcastAction, lastAction } = useRoom();

  useEffect(() => {
    if (lastAction?.type === 'CHAT_MESSAGE' && lastAction.payload) {
      setP2pMessages(prev => [...prev, lastAction.payload]);
    }
  }, [lastAction]);

  useEffect(() => {
    // Only subscribe to Firebase if NOT connected to a P2P room (or just always subscribe but we display all)
    const unsubscribe = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]: [string, any]) => ({
          ...val,
          id
        }));
        setMessages(list.sort((a, b) => a.timestamp - b.timestamp));
      } else {
        setMessages([]);
      }
    });
    return () => {
      unsubscribe();
      stopAllAudio();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const allMessages = isConnected 
    ? [...messages, ...p2pMessages].sort((a, b) => a.timestamp - b.timestamp)
    : messages;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() && !isRecording) return;

    if (isRecording) {
      stopRecordingAndSend();
      return;
    }

    const msgData: Partial<ChatMessage> = {
      sender: userName,
      text: newMessage.trim(),
      role: role,
      timestamp: Date.now()
    };

    if (isConnected) {
      const p2pMsg = { ...msgData, id: `p2p_${Date.now()}` } as ChatMessage;
      broadcastAction({ type: 'CHAT_MESSAGE', payload: p2pMsg });
      setP2pMessages(prev => [...prev, p2pMsg]);
    } else {
      await sendChatMessage(msgData);
    }

    setNewMessage('');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const base64 = await blobToBase64(audioBlob);
        
        const msgData: Partial<ChatMessage> = {
          sender: userName,
          audioBase64: base64,
          role: role,
          timestamp: Date.now()
        };

        if (isConnected) {
          const p2pMsg = { ...msgData, id: `p2p_${Date.now()}` } as ChatMessage;
          broadcastAction({ type: 'CHAT_MESSAGE', payload: p2pMsg });
          setP2pMessages(prev => [...prev, p2pMsg]);
        } else {
          await sendChatMessage(msgData);
        }
        
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordDuration(0);
      timerRef.current = window.setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone access denied.");
    }
  };

  const stopRecordingAndSend = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      cleanupRecording();
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    cleanupRecording();
  };

  const cleanupRecording = () => {
    setIsRecording(false);
    setRecordDuration(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const playAudioMsg = (id: string, base64: string) => {
    if (playingId === id) {
      stopAllAudio();
      setPlayingId(null);
    } else {
      setPlayingId(id);
      playStandardAudio(base64, () => setPlayingId(null));
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Recessed CRT/LCD Comms Display Area */}
      <div 
        ref={scrollRef}
        className="flex-grow overflow-y-auto space-y-3 p-4 rounded-lg bg-[#16171a] border-2 border-[#282a30] shadow-[inset_2px_2px_6px_rgba(0,0,0,0.85)]"
        style={{ maxHeight: '380px' }}
      >
        {allMessages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex flex-col ${msg.sender === userName ? 'items-end' : 'items-start'}`}
          >
            {/* Header / Callsign tag */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="font-mono text-[9px] font-bold text-[#8a867c] uppercase">{msg.sender}</span>
              <span className={`font-mono text-[8px] px-1.5 py-0.2 rounded border font-bold uppercase ${
                msg.role === UserRole.ADMIN 
                  ? 'border-[#cf573c]/50 text-[#cf573c] bg-[#cf573c]/10' 
                  : 'border-[#476171]/50 text-[#476171] bg-[#476171]/10'
              }`}>
                {msg.role}
              </span>
            </div>
            
            {/* Message Cartridge */}
            <div className={`p-3 rounded border-2 max-w-[85%] break-words ${
              msg.sender === userName 
                ? 'bg-[#476171] text-[#fbf8f2] border-[#1c1d20] shadow-[2px_2px_0px_#18191c]' 
                : 'bg-[#22242a] text-[#ebe6d8] border-[#383a42] shadow-[2px_2px_0px_#18191c]'
            }`}>
              {msg.text && (
                <p className="font-mono text-xs leading-relaxed">{msg.text}</p>
              )}
              
              {/* Microcassette Voice Note */}
              {msg.audioBase64 && (
                <div className={`flex items-center gap-3 bg-[#16171a] p-2.5 rounded border border-[#383a42] ${msg.text ? 'mt-2' : ''}`}>
                  <button
                    onClick={() => playAudioMsg(msg.id, msg.audioBase64!)}
                    className={`w-8 h-8 flex items-center justify-center rounded border border-[#1c1d20] transition-all duration-75 shrink-0 ${
                      playingId === msg.id 
                        ? 'bg-[#cf573c] text-white shadow-none' 
                        : 'bg-[#2b2d35] text-[#ebe6d8] hover:bg-[#383a42] shadow-[1px_1px_0px_#18191c]'
                    }`}
                  >
                    {playingId === msg.id ? (
                      <span className="font-mono text-[10px] font-bold">■</span>
                    ) : (
                      <span className="font-mono text-[10px] font-bold ml-0.5">▶</span>
                    )}
                  </button>

                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[9px] font-bold text-[#8a867c] uppercase tracking-wider">
                      VOICE NOTE // PCM
                    </span>
                    <div className="flex gap-1">
                      {[1,2,3,4,5,6].map(i => (
                        <div 
                          key={i} 
                          className={`w-1 rounded-xs transition-all ${
                            playingId === msg.id 
                              ? 'bg-[#cf573c] h-3 animate-pulse' 
                              : 'bg-[#474a54] h-2'
                          }`} 
                          style={{ animationDelay: `${i * 0.1}s` }}
                        ></div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <span className="font-mono text-[8px] text-[#636056] mt-0.5">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        ))}

        {messages.length === 0 && (
          <div className="h-full py-16 flex items-center justify-center text-center">
            <p className="font-mono text-xs text-[#716e64] uppercase tracking-wider">
              &gt; COMMS LOG BUFFER STANDBY // TRANSMIT TEXT OR VOICE RECORDING
            </p>
          </div>
        )}
      </div>

      {/* Input Control Dock */}
      <div className="pt-2 border-t-2 border-[#232428]">
        {isRecording ? (
          <div className="flex items-center gap-3 bg-[#16171a] p-2 rounded-lg border-2 border-[#cf573c] shadow-[inset_1px_1px_4px_rgba(0,0,0,0.8)]">
            <div className="flex items-center gap-2 px-2 flex-grow">
              <div className="w-2.5 h-2.5 bg-[#cf573c] rounded-full animate-ping"></div>
              <span className="font-mono text-sm font-bold text-[#cf573c]">{formatTime(recordDuration)}</span>
              <span className="font-mono text-[9px] font-bold text-[#8a867c] uppercase tracking-widest ml-2">
                REC BUS LIVE...
              </span>
            </div>
            <button
              onClick={cancelRecording}
              className="px-3 py-1.5 bg-[#2b2d35] hover:bg-[#383a42] text-[#ebe6d8] border border-[#1c1d20] rounded font-mono text-xs font-bold uppercase transition-all duration-75"
            >
              ABORT
            </button>
            <button
              onClick={stopRecordingAndSend}
              className="bg-[#cf573c] hover:bg-[#db6247] px-4 py-1.5 rounded border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] text-[#fbf8f2] font-mono text-xs font-bold uppercase tracking-wider active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all duration-75"
            >
              TRANSMIT VOICE
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex gap-2">
            <button
              type="button"
              onClick={startRecording}
              className="bg-[#cf573c] hover:bg-[#db6247] p-2.5 rounded border-2 border-[#1c1d20] shadow-[3px_3px_0px_#18191c] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_#18191c] text-[#fbf8f2] transition-all duration-75 flex items-center justify-center shrink-0"
              title="Record Voice Note"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="INPUT DISPATCH MESSAGE..."
              className="flex-grow bg-[#16171a] border-2 border-[#2a2c33] px-3 py-2.5 rounded text-[#ebe6d8] font-mono text-xs shadow-[inset_1px_1px_3px_rgba(0,0,0,0.8)] focus:border-[#476171] outline-none placeholder:text-[#585963]"
            />

            <button
              type="submit"
              disabled={!newMessage.trim()}
              className={`px-4 py-2.5 rounded border-2 border-[#1c1d20] font-mono text-xs font-bold uppercase tracking-wider transition-all duration-75 ${
                !newMessage.trim() 
                  ? 'bg-[#cec7b8] text-[#716d63] cursor-not-allowed shadow-[1px_1px_0px_#18191c]' 
                  : 'bg-[#476171] hover:bg-[#547184] text-[#fbf8f2] shadow-[3px_3px_0px_#18191c] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_#18191c]'
              }`}
            >
              SEND ↵
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Chat;