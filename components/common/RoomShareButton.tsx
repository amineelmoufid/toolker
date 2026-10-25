import React, { useState } from 'react';
import { useRoom } from '../../contexts/RoomContext';

interface RoomShareButtonProps {
  modeName?: string;
  onClipSync?: () => void;
  className?: string;
}

export const RoomShareButton: React.FC<RoomShareButtonProps> = ({
  modeName,
  onClipSync,
  className = ''
}) => {
  const { roomId, isConnected, createRoom, killRoom } = useRoom();
  const [roomCopied, setRoomCopied] = useState(false);
  const [isKilling, setIsKilling] = useState(false);

  const handleShareOrCopy = () => {
    let activeRoom = roomId;
    if (!activeRoom) {
      activeRoom = createRoom();
      if (onClipSync) onClipSync();
    }

    const newUrl = new URL(window.location.origin + window.location.pathname);
    newUrl.searchParams.set('room', activeRoom);
    if (modeName && modeName !== 'instrument') {
      newUrl.searchParams.set('mode', modeName);
      newUrl.hash = `#${modeName}`;
    }
    window.history.pushState({}, '', newUrl.toString());

    navigator.clipboard.writeText(newUrl.toString()).then(() => {
      setRoomCopied(true);
      setTimeout(() => setRoomCopied(false), 3000);
    });
  };

  const handleKill = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("💀 KILL THIS ROOM PERMANENTLY?\n\nThis will instantly terminate the session for everyone and the shared link will NEVER work again.")) {
      return;
    }

    setIsKilling(true);
    try {
      await killRoom();
    } finally {
      setIsKilling(false);
    }
  };

  if (isConnected) {
    return (
      <div 
        className={`flex items-stretch bg-[#3d7a4d] border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] rounded-md overflow-hidden font-mono text-[10px] sm:text-xs font-bold uppercase select-none transition-all ${className}`}
      >
        {/* Outer/Main button segment: Click to copy link */}
        <button
          onClick={handleShareOrCopy}
          title="Room Active // Click to copy shared link"
          className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 hover:bg-[#346942] active:bg-[#2b5536] text-white transition-colors cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
          <span>{roomCopied ? '✓ COPIED' : 'ROOM ACTIVE 🤝'}</span>
        </button>

        {/* Thick divider */}
        <div className="w-[2px] bg-[#1c1d20]" />

        {/* Embedded Inner Button: KILL ROOM */}
        <button
          onClick={handleKill}
          disabled={isKilling}
          title="Kill Room: Link will permanently stop working for everyone"
          className="px-2 sm:px-3 py-1.5 bg-[#b91c1c] hover:bg-[#991b1b] active:bg-[#7f1d1d] text-white font-bold flex items-center gap-1 cursor-pointer transition-colors border-l border-white/20 active:translate-y-0"
        >
          <span>✕</span>
          <span className="hidden xs:inline sm:inline">{isKilling ? '...' : 'KILL'}</span>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleShareOrCopy}
      title="Create Room to Practice Together"
      className={`text-[10px] sm:text-xs font-mono font-bold uppercase bg-[#cf573c] hover:bg-[#a83f2a] text-[#ebe6d8] border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-md transition-all active:translate-y-0.5 active:shadow-none flex items-center gap-1.5 cursor-pointer ${className}`}
    >
      <span className="w-2 h-2 rounded-full bg-white shrink-0" />
      <span>{roomCopied ? '✓ COPIED' : 'SHARE ROOM 🤝'}</span>
    </button>
  );
};
