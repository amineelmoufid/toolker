import React, { useState } from 'react';
import { useRoom } from '../../contexts/RoomContext';

interface RoomShareButtonProps {
  modeName?: string;
  onClipSync?: () => void;
  initialClip?: any;
  className?: string;
}

export const RoomShareButton: React.FC<RoomShareButtonProps> = ({
  modeName,
  onClipSync,
  initialClip,
  className = ''
}) => {
  const { roomId, isConnected, isHost, connectionType, createRoom, killRoom, leaveRoom } = useRoom();
  const [roomCopied, setRoomCopied] = useState(false);
  const [isProcessingExit, setIsProcessingExit] = useState(false);

  const handleShareOrCopy = () => {
    let activeRoom = roomId;
    if (!activeRoom) {
      activeRoom = createRoom(initialClip);
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

  const handleExitRoom = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isHost) {
      if (!window.confirm("💀 KILL THIS ROOM PERMANENTLY?\n\nYou are the Host. This will instantly terminate the session for everyone and the shared link will NEVER work again.")) {
        return;
      }

      setIsProcessingExit(true);
      try {
        await killRoom();
      } finally {
        setIsProcessingExit(false);
      }
    } else {
      if (!window.confirm("🚪 LEAVE ROOM?\n\nYou will exit this shared session. The room will stay active for the host.")) {
        return;
      }

      setIsProcessingExit(true);
      try {
        leaveRoom();
      } finally {
        setIsProcessingExit(false);
      }
    }
  };

  const connectionLabel = 
    connectionType === 'both' ? '⚡ CLOUD+P2P' :
    connectionType === 'p2p' ? '⚡ P2P DIRECT' :
    connectionType === 'cloud' ? '☁️ CLOUD SYNC' : '';

  if (isConnected) {
    return (
      <div 
        className={`flex items-stretch bg-[#3d7a4d] border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] rounded-md overflow-hidden font-mono text-[10px] sm:text-xs font-bold uppercase select-none transition-all ${className}`}
      >
        {/* Outer/Main button segment: Click to copy link */}
        <button
          onClick={handleShareOrCopy}
          title={`Room Active [${connectionLabel || 'Connected'}] // Click to copy shared link`}
          className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 hover:bg-[#346942] active:bg-[#2b5536] text-white transition-colors cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
          <span>{roomCopied ? '✓ COPIED' : 'ROOM ACTIVE 🤝'}</span>
          {connectionType === 'p2p' && <span className="text-[9px] text-[#bbf7d0] font-mono hidden sm:inline">⚡</span>}
          {connectionType === 'cloud' && <span className="text-[9px] text-[#fef08a] font-mono hidden sm:inline">☁️</span>}
        </button>

        {/* Thick divider */}
        <div className="w-[2px] bg-[#1c1d20]" />

        {/* Embedded Inner Button: KILL (for Host) or LEAVE (for Guest) */}
        {isHost ? (
          <button
            onClick={handleExitRoom}
            disabled={isProcessingExit}
            title="Kill Room: As host, link will permanently stop working for everyone"
            className="px-2 sm:px-3 py-1.5 bg-[#b91c1c] hover:bg-[#991b1b] active:bg-[#7f1d1d] text-white font-bold flex items-center gap-1 cursor-pointer transition-colors border-l border-white/20 active:translate-y-0"
          >
            <span>✕</span>
            <span className="hidden xs:inline sm:inline">{isProcessingExit ? '...' : 'KILL'}</span>
          </button>
        ) : (
          <button
            onClick={handleExitRoom}
            disabled={isProcessingExit}
            title="Leave Room: Exit session (room stays open for host)"
            className="px-2 sm:px-3 py-1.5 bg-[#476171] hover:bg-[#374c59] active:bg-[#2b3b45] text-white font-bold flex items-center gap-1 cursor-pointer transition-colors border-l border-white/20 active:translate-y-0"
          >
            <span>⎋</span>
            <span className="hidden xs:inline sm:inline">{isProcessingExit ? '...' : 'LEAVE'}</span>
          </button>
        )}
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
