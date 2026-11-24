import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { 
  syncRoomClip, 
  syncRoomAudio, 
  subscribeToRoomData, 
  getStoredUserId, 
  killRoomInFirebase, 
  checkIsRoomKilled,
  setRoomHost,
  getRoomHost,
  sendRoomChatMessage,
  syncRoomDictation,
  subscribeToRoomDictation,
  syncRoomShadowState,
  subscribeToRoomShadowState
} from '../services/firebase';

export type RoomAction = {
  type: 'PLAY' | 'PAUSE' | 'SEEK' | 'AUDIO_SYNC' | 'SYNC_SENTENCE' | 'SYNC_VIDEO' | 'CHAT_MESSAGE' | 'SYNC_DICTATION' | 'SYNC_CAPTION' | 'TOGGLE_LINE_BY_LINE' | 'ROOM_KILLED';
  payload?: any;
};

export type ConnectionTelemetry = 'none' | 'p2p' | 'cloud' | 'both';

interface RoomContextProps {
  roomId: string | null;
  peerId: string;
  remotePeerId: string | null;
  isConnected: boolean;
  isHost: boolean;
  connectionType: ConnectionTelemetry;
  createRoom: (initialClip?: any) => string;
  connectToRoom: (id: string) => void;
  disconnectRoom: () => void;
  leaveRoom: () => void;
  killRoom: () => Promise<void>;
  broadcastAction: (action: RoomAction) => void;
  syncClip: (clip: any) => void;
  syncDictation: (lesson: any) => void;
  lastAction: RoomAction | null;
  syncedClip: any | null;
  syncedDictation: any | null;
}

const RoomContext = createContext<RoomContextProps | undefined>(undefined);

export const RoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [peerId, setPeerId] = useState<string>('');
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(() => {
    return new URLSearchParams(window.location.search).get('room');
  });
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);
  const [isHost, setIsHost] = useState<boolean>(() => {
    const rId = new URLSearchParams(window.location.search).get('room');
    if (!rId) return false;
    return localStorage.getItem(`toolker_host_room_${rId}`) === 'true';
  });
  const [lastAction, setLastAction] = useState<RoomAction | null>(null);
  const [syncedClip, setSyncedClip] = useState<any | null>(null);
  const [syncedDictation, setSyncedDictation] = useState<any | null>(null);
  
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const lastAudioTimestampRef = useRef<number>(Date.now());
  const lastShadowTimestampRef = useRef<number>(Date.now());

  // Initialize PeerJS for direct WebRTC with Google STUN servers for robust NAT traversal
  useEffect(() => {
    const peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });
    
    peer.on('open', (id) => {
      setPeerId(id);
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    peer.on('error', (err) => {
      console.warn('PeerJS connection notice:', err);
    });

    peerRef.current = peer;

    return () => {
      peer.destroy();
    };
  }, []);

  // Check host status when roomId changes
  useEffect(() => {
    if (!roomId) {
      setIsHost(false);
      return;
    }
    const myId = getStoredUserId();
    const storedHostFlag = localStorage.getItem(`toolker_host_room_${roomId}`) === 'true';
    if (storedHostFlag) {
      setIsHost(true);
      return;
    }
    getRoomHost(roomId).then(hostId => {
      if (hostId && hostId === myId) {
        setIsHost(true);
        localStorage.setItem(`toolker_host_room_${roomId}`, 'true');
      } else {
        setIsHost(false);
      }
    });
  }, [roomId]);

  // Listen to Firebase room updates for instant 100% reliable state sync
  useEffect(() => {
    if (!roomId) {
      setIsFirebaseConnected(false);
      return;
    }

    setIsFirebaseConnected(true);
    const unsubscribeData = subscribeToRoomData(roomId, (data) => {
      if (!data) return;

      // Check if room was killed
      if (data.killed === true) {
        disconnectRoom();
        const newUrl = new URL(window.location.origin + window.location.pathname);
        window.history.pushState({}, '', newUrl.toString());
        alert("⚠ ROOM TERMINATED // This shared link has been killed and can never be used again.");
        return;
      }

      // 1. Synchronize Video / Clip
      if (data.clip) {
        setSyncedClip(data.clip);
        setLastAction({ type: 'SYNC_VIDEO', payload: data.clip });
      }

      // 2. Synchronize Shadow Audio
      if (data.latestAudio) {
        const { audioBase64, senderId, timestamp } = data.latestAudio;
        const myId = peerId || getStoredUserId();
        
        // Only trigger for partner's audio and if newer than connection time
        if (senderId !== myId && timestamp > lastAudioTimestampRef.current) {
          lastAudioTimestampRef.current = timestamp;
          setLastAction({ type: 'AUDIO_SYNC', payload: audioBase64 });
        }
      }
    });

    // 3. Synchronize Dictation
    const unsubscribeDictation = subscribeToRoomDictation(roomId, (dictationData) => {
      if (dictationData) {
        setSyncedDictation(dictationData);
        setLastAction({ type: 'SYNC_DICTATION', payload: dictationData });
      }
    });

    // 4. Synchronize Shadow Caption & Line-by-Line State
    const unsubscribeShadow = subscribeToRoomShadowState(roomId, (shadowData) => {
      if (!shadowData || !shadowData.updatedAt) return;
      const myId = peerId || getStoredUserId();
      if (shadowData.senderId === myId) return;
      if (shadowData.updatedAt <= lastShadowTimestampRef.current) return;
      lastShadowTimestampRef.current = shadowData.updatedAt;

      if (typeof shadowData.lineByLine === 'boolean') {
        setLastAction({ type: 'TOGGLE_LINE_BY_LINE', payload: { enabled: shadowData.lineByLine } });
      }
      if (typeof shadowData.start === 'number') {
        setLastAction({
          type: 'SYNC_CAPTION',
          payload: {
            lineId: shadowData.activeLineId,
            start: shadowData.start,
            autoPlay: true
          }
        });
      }
    });

    return () => {
      unsubscribeData();
      unsubscribeDictation();
      unsubscribeShadow();
    };
  }, [roomId, peerId]);

  // Auto-connect WebRTC PeerJS if room ID matches peer
  useEffect(() => {
    if (roomId && peerId && !isPeerConnected && remotePeerId !== roomId && roomId !== peerId) {
      connectToPeer(roomId);
    }
  }, [roomId, peerId, isPeerConnected, remotePeerId]);

  const setupConnection = (conn: DataConnection) => {
    if (connRef.current) {
      connRef.current.close();
    }

    connRef.current = conn;
    
    conn.on('open', () => {
      setRemotePeerId(conn.peer);
      setIsPeerConnected(true);
    });

    conn.on('data', (data: any) => {
      if (data?.type === 'ROOM_KILLED') {
        disconnectRoom();
        const newUrl = new URL(window.location.origin + window.location.pathname);
        window.history.pushState({}, '', newUrl.toString());
        alert("⚠ ROOM TERMINATED // The room creator has killed this session.");
        return;
      }
      if (data?.type === 'SYNC_DICTATION') {
        setSyncedDictation(data.payload);
      }
      setLastAction(data as RoomAction);
    });

    conn.on('close', () => {
      setRemotePeerId(null);
      setIsPeerConnected(false);
      connRef.current = null;
    });
    
    conn.on('error', (err) => {
      console.warn('Peer connection notice:', err);
      setRemotePeerId(null);
      setIsPeerConnected(false);
      connRef.current = null;
    });
  };

  const connectToPeer = (id: string) => {
    if (!peerRef.current) return;
    try {
      const conn = peerRef.current.connect(id);
      setupConnection(conn);
    } catch (e) {
      console.warn("Could not connect to WebRTC peer, falling back to Firebase:", e);
    }
  };

  const connectToRoom = async (id: string) => {
    if (!id) return;
    const isKilled = await checkIsRoomKilled(id);
    if (isKilled) {
      alert("⚠ ROOM TERMINATED // This shared link was killed and cannot be accessed.");
      const newUrl = new URL(window.location.origin + window.location.pathname);
      window.history.pushState({}, '', newUrl.toString());
      setRoomId(null);
      return;
    }
    setRoomId(id);
    connectToPeer(id);
  };

  const createRoom = (initialClip?: any): string => {
    const newRoomId = peerId || `room_${Date.now()}`;
    const myId = getStoredUserId();
    
    setRoomId(newRoomId);
    setIsHost(true);
    localStorage.setItem(`toolker_host_room_${newRoomId}`, 'true');
    setRoomHost(newRoomId, myId).catch(err => console.warn('Could not record room host:', err));
    
    if (initialClip) {
      syncRoomClip(newRoomId, initialClip);
    }

    return newRoomId;
  };

  const disconnectRoom = () => {
    if (connRef.current) {
      connRef.current.close();
      connRef.current = null;
    }
    setRemotePeerId(null);
    setIsPeerConnected(false);
    setRoomId(null);
    setIsHost(false);
    setSyncedClip(null);
    setSyncedDictation(null);
  };

  const leaveRoom = () => {
    disconnectRoom();
    const newUrl = new URL(window.location.origin + window.location.pathname);
    window.history.pushState({}, '', newUrl.toString());
  };

  const killRoom = async () => {
    const activeId = roomId;
    if (!activeId) return;

    // 1. Broadcast termination to peer
    if (connRef.current && isPeerConnected) {
      try {
        connRef.current.send({ type: 'ROOM_KILLED', payload: { roomId: activeId } });
      } catch (_) {}
    }

    // 2. Mark permanently killed in Firebase
    await killRoomInFirebase(activeId);

    // 3. Disconnect local state & clean URL
    disconnectRoom();
    const newUrl = new URL(window.location.origin + window.location.pathname);
    window.history.pushState({}, '', newUrl.toString());
  };

  const syncClip = (clip: any) => {
    if (!clip) return;
    if (roomId) {
      syncRoomClip(roomId, clip);
    }
    if (connRef.current && isPeerConnected) {
      connRef.current.send({ type: 'SYNC_VIDEO', payload: clip });
    }
  };

  const syncDictation = (lesson: any) => {
    if (!lesson) return;
    if (roomId) {
      syncRoomDictation(roomId, lesson);
    }
    if (connRef.current && isPeerConnected) {
      connRef.current.send({ type: 'SYNC_DICTATION', payload: lesson });
    }
  };

  const broadcastAction = (action: RoomAction) => {
    // 1. Send via Firebase for guaranteed delivery
    if (roomId) {
      if (action.type === 'AUDIO_SYNC') {
        const myId = peerId || getStoredUserId();
        syncRoomAudio(roomId, action.payload, myId);
      } else if (action.type === 'SYNC_VIDEO') {
        syncRoomClip(roomId, action.payload);
      } else if (action.type === 'SYNC_DICTATION') {
        syncRoomDictation(roomId, action.payload);
      } else if (action.type === 'CHAT_MESSAGE') {
        sendRoomChatMessage(roomId, action.payload);
      } else if (action.type === 'SYNC_CAPTION') {
        syncRoomShadowState(roomId, {
          activeLineId: action.payload?.lineId,
          start: action.payload?.start,
          senderId: peerId || getStoredUserId()
        });
      } else if (action.type === 'TOGGLE_LINE_BY_LINE') {
        syncRoomShadowState(roomId, {
          lineByLine: action.payload?.enabled,
          senderId: peerId || getStoredUserId()
        });
      }
    }

    // 2. Also send via WebRTC peer data connection for sub-millisecond P2P
    if (connRef.current && isPeerConnected) {
      try {
        connRef.current.send(action);
      } catch (e) {
        console.warn("PeerJS send failed:", e);
      }
    }
  };

  const isConnected = !!roomId && (isFirebaseConnected || isPeerConnected);

  const connectionType: ConnectionTelemetry = 
    isPeerConnected && isFirebaseConnected ? 'both' :
    isPeerConnected ? 'p2p' :
    isFirebaseConnected ? 'cloud' : 'none';

  return (
    <RoomContext.Provider value={{ 
      roomId,
      peerId, 
      remotePeerId, 
      isConnected, 
      isHost,
      connectionType,
      createRoom,
      connectToRoom, 
      disconnectRoom,
      leaveRoom,
      killRoom, 
      broadcastAction, 
      syncClip,
      syncDictation,
      lastAction,
      syncedClip,
      syncedDictation
    }}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = () => {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
};
