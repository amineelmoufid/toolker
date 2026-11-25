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
  subscribeToRoomShadowState,
  broadcastRoomActionToFirebase,
  subscribeToRoomActions,
  RoomBroadcastAction
} from '../services/firebase';

export type RoomAction = {
  type: 'PLAY' | 'PAUSE' | 'SEEK' | 'PLAYHEAD_PULSE' | 'AUDIO_SYNC' | 'SYNC_SENTENCE' | 'SYNC_VIDEO' | 'CHAT_MESSAGE' | 'SYNC_DICTATION' | 'SYNC_CAPTION' | 'TOGGLE_LINE_BY_LINE' | 'LINE_BOUNDARY_PAUSE' | 'ROOM_KILLED';
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

  // Unique session ID for each tab/device to prevent self-echo and allow multi-tab testing
  const tabSessionIdRef = useRef<string>(
    'tab_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now()
  );
  // Dedup set for dual-rail delivery (Firebase + WebRTC P2P)
  const processedActionIdsRef = useRef<Set<string>>(new Set());

  // Universal handler for incoming actions from either Firebase or WebRTC P2P
  const handleIncomingAction = (action: any) => {
    if (!action || !action.type) return;
    const mySenderId = tabSessionIdRef.current;
    if (action.senderId && (action.senderId === mySenderId || (peerId && action.senderId === peerId))) {
      return; // Ignore our own actions/echoes
    }
    if (action.actionId) {
      if (processedActionIdsRef.current.has(action.actionId)) {
        return; // Already processed via other rail
      }
      processedActionIdsRef.current.add(action.actionId);
      if (processedActionIdsRef.current.size > 300) {
        const arr = Array.from(processedActionIdsRef.current);
        processedActionIdsRef.current = new Set(arr.slice(arr.length - 150));
      }
    }

    if (action.type === 'ROOM_KILLED') {
      disconnectRoom();
      const newUrl = new URL(window.location.origin + window.location.pathname);
      window.history.pushState({}, '', newUrl.toString());
      alert("⚠ ROOM TERMINATED // The room creator has killed this session.");
      return;
    }
    if (action.type === 'SYNC_DICTATION') {
      setSyncedDictation(action.payload);
    }
    if (action.type === 'SYNC_VIDEO') {
      setSyncedClip(action.payload);
    }
    setLastAction(action as RoomAction);
  };

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
        const mySenderId = tabSessionIdRef.current;
        const myUserId = getStoredUserId();
        const isSelf = senderId === mySenderId || senderId === myUserId || (peerId && senderId === peerId);
        
        // Only trigger for partner's audio and if newer than connection time
        if (!isSelf && timestamp > lastAudioTimestampRef.current) {
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

    // 4. Synchronize all Real-Time Room Actions (Guaranteed Delivery Rail)
    const unsubscribeActions = subscribeToRoomActions(roomId, (remoteAction) => {
      handleIncomingAction(remoteAction);
    });

    // 5. Initial snapshot for newly joined participants (Shadow Caption & Line-by-Line State)
    const unsubscribeShadow = subscribeToRoomShadowState(roomId, (shadowData) => {
      if (!shadowData) return;
      const myId = tabSessionIdRef.current;
      if (shadowData.senderId === myId) return;
      // Only use as snapshot if we haven't received recent real-time actions
      if (processedActionIdsRef.current.size === 0) {
        if (typeof shadowData.lineByLine === 'boolean') {
          setLastAction({ type: 'TOGGLE_LINE_BY_LINE', payload: { enabled: shadowData.lineByLine } });
        }
      }
    });

    return () => {
      unsubscribeData();
      unsubscribeDictation();
      unsubscribeActions();
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
      handleIncomingAction(data);
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
    const actionId = 'act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const senderId = tabSessionIdRef.current;
    const fullAction = {
      ...action,
      actionId,
      senderId,
      timestamp: Date.now()
    };

    // Mark locally as processed so we never process our own echo
    processedActionIdsRef.current.add(actionId);

    // 1. Broadcast to Firebase real-time action rail (guaranteed delivery)
    if (roomId) {
      broadcastRoomActionToFirebase(roomId, fullAction as any);

      if (action.type === 'AUDIO_SYNC') {
        syncRoomAudio(roomId, action.payload, senderId);
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
          senderId
        });
      } else if (action.type === 'TOGGLE_LINE_BY_LINE') {
        syncRoomShadowState(roomId, {
          lineByLine: action.payload?.enabled,
          senderId
        });
      }
    }

    // 2. Also send via WebRTC peer data connection for sub-millisecond P2P
    if (connRef.current && isPeerConnected) {
      try {
        connRef.current.send(fullAction);
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
