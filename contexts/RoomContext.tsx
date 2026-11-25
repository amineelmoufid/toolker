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
  RoomBroadcastAction,
  syncRoomPlayback,
  subscribeToRoomPlayback,
  RoomPlaybackState,
  calculateAuthoritativeTime,
  subscribeToRoomUserAudios
} from '../services/firebase';

export function getRoomIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  // 1. Check window.location.search (?room=XYZ)
  const searchParams = new URLSearchParams(window.location.search);
  const fromSearch = searchParams.get('room');
  if (fromSearch) return fromSearch;

  // 2. Check window.location.hash (#shadowing?room=XYZ or #room=XYZ)
  const hash = window.location.hash || '';
  if (hash.includes('?')) {
    const hashQuery = hash.split('?')[1];
    const hashParams = new URLSearchParams(hashQuery);
    const fromHashQuery = hashParams.get('room');
    if (fromHashQuery) return fromHashQuery;
  } else if (hash.includes('room=')) {
    const clean = hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(clean);
    const fromClean = hashParams.get('room');
    if (fromClean) return fromClean;
  }
  return null;
}

export type RoomAction = {
  type: 'PLAY' | 'PAUSE' | 'SEEK' | 'PLAYHEAD_PULSE' | 'AUDIO_SYNC' | 'SYNC_SENTENCE' | 'SYNC_VIDEO' | 'CHAT_MESSAGE' | 'SYNC_DICTATION' | 'SYNC_CAPTION' | 'TOGGLE_LINE_BY_LINE' | 'LINE_BOUNDARY_PAUSE' | 'SYNC_PLAYBACK' | 'ROOM_KILLED';
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
  syncPlayback: (state: Partial<RoomPlaybackState>) => void;
  lastAction: RoomAction | null;
  syncedClip: any | null;
  syncedDictation: any | null;
  syncedPlayback: RoomPlaybackState | null;
}

const RoomContext = createContext<RoomContextProps | undefined>(undefined);

export const RoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [peerId, setPeerId] = useState<string>('');
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(() => {
    return getRoomIdFromUrl();
  });
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);
  const [isHost, setIsHost] = useState<boolean>(() => {
    const rId = getRoomIdFromUrl();
    if (!rId) return false;
    return localStorage.getItem(`toolker_host_room_${rId}`) === 'true';
  });
  const [lastAction, setLastAction] = useState<RoomAction | null>(null);
  const [syncedClip, setSyncedClip] = useState<any | null>(null);
  const [syncedDictation, setSyncedDictation] = useState<any | null>(null);
  const [syncedPlayback, setSyncedPlayback] = useState<RoomPlaybackState | null>(null);
  
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const lastAudioTimestampRef = useRef<number>(0);
  const lastShadowTimestampRef = useRef<number>(0);

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

      // 2. Synchronize Shadow Audio (from latestAudio)
      if (data.latestAudio) {
        const { audioBase64, senderId, timestamp } = data.latestAudio;
        const mySenderId = tabSessionIdRef.current;
        const myUserId = getStoredUserId();
        const isSelf = senderId === mySenderId || senderId === myUserId || (peerId && senderId === peerId);
        
        if (!isSelf && timestamp > lastAudioTimestampRef.current) {
          lastAudioTimestampRef.current = timestamp;
          setLastAction({ type: 'AUDIO_SYNC', payload: audioBase64 });
        }
      }
    });

    // 2b. Synchronize User-Specific Shadow Audio Rail (Never overwrites across partners)
    const unsubscribeUserAudios = subscribeToRoomUserAudios(roomId, (userAudios) => {
      if (!userAudios) return;
      const mySenderId = tabSessionIdRef.current;
      const myUserId = getStoredUserId();

      // Find newest audio from any partner in the room
      let newestPartnerAudio: { audioBase64: string; timestamp: number } | null = null;
      for (const [sId, entry] of Object.entries(userAudios)) {
        const isSelf = sId === mySenderId || sId === myUserId || (peerId && sId === peerId);
        if (!isSelf && entry && entry.audioBase64) {
          if (!newestPartnerAudio || entry.timestamp > newestPartnerAudio.timestamp) {
            newestPartnerAudio = entry;
          }
        }
      }

      if (newestPartnerAudio && newestPartnerAudio.timestamp > lastAudioTimestampRef.current) {
        lastAudioTimestampRef.current = newestPartnerAudio.timestamp;
        setLastAction({ type: 'AUDIO_SYNC', payload: newestPartnerAudio.audioBase64 });
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

    // 5. Authoritative Living Playback State (Living Clock, Captions, Line-by-Line, Tempo)
    const unsubscribePlayback = subscribeToRoomPlayback(roomId, (playbackData) => {
      if (!playbackData) return;
      const myId = tabSessionIdRef.current;
      if (playbackData.senderId === myId) return; // Do not process our own echo
      setSyncedPlayback(playbackData);
      setLastAction({ type: 'SYNC_PLAYBACK', payload: playbackData });
    });

    return () => {
      unsubscribeData();
      unsubscribeUserAudios();
      unsubscribeDictation();
      unsubscribeActions();
      unsubscribePlayback();
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
    // Generate clean, deterministic, isolated room ID: e.g. room_1732524_a9b2c3
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const newRoomId = `room_${Date.now().toString(36)}_${randomSuffix}`;
    const myId = getStoredUserId();
    
    setRoomId(newRoomId);
    setIsHost(true);
    localStorage.setItem(`toolker_host_room_${newRoomId}`, 'true');
    setRoomHost(newRoomId, myId).catch(err => console.warn('Could not record room host:', err));
    
    // Update browser URL query param
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('room', newRoomId);
      window.history.pushState({}, '', url.toString());
    } catch (_) {}

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
    setSyncedPlayback(null);
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

  const syncPlayback = (state: Partial<RoomPlaybackState>) => {
    if (!roomId) return;
    const senderId = tabSessionIdRef.current;
    syncRoomPlayback(roomId, {
      ...state,
      senderId
    });
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

    // 1. Broadcast to Firebase real-time action rail & update living playback state
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
        syncRoomPlayback(roomId, {
          activeLineId: action.payload?.lineId,
          time: action.payload?.start,
          isPlaying: true,
          actionId,
          senderId
        });
      } else if (action.type === 'TOGGLE_LINE_BY_LINE') {
        syncRoomPlayback(roomId, {
          lineByLine: action.payload?.enabled,
          actionId,
          senderId
        });
      } else if (action.type === 'PLAY') {
        syncRoomPlayback(roomId, {
          time: action.payload?.time,
          isPlaying: true,
          actionId,
          senderId
        });
      } else if (action.type === 'PAUSE') {
        syncRoomPlayback(roomId, {
          time: action.payload?.time,
          isPlaying: false,
          actionId,
          senderId
        });
      } else if (action.type === 'SEEK') {
        syncRoomPlayback(roomId, {
          time: action.payload?.time,
          actionId,
          senderId
        });
      } else if (action.type === 'LINE_BOUNDARY_PAUSE') {
        syncRoomPlayback(roomId, {
          time: action.payload?.time,
          activeLineId: action.payload?.lineId,
          isPlaying: false,
          actionId,
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
      syncPlayback,
      lastAction,
      syncedClip,
      syncedDictation,
      syncedPlayback
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
