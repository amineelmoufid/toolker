import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
  getDatabase, 
  ref, 
  onValue, 
  set, 
  push, 
  remove, 
  serverTimestamp,
  get,
  onDisconnect,
  update
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { PracticeSession, UserSubmission, ChatMessage, AppLanguage } from '../types';

const firebaseConfig = {
  apiKey: "AIzaSyB1UOkCHwl8Tqjc4BsP2FC7lj2Qu-f8vCg",
  authDomain: "projects-52223.firebaseapp.com",
  databaseURL: "https://projects-52223-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "projects-52223",
  storageBucket: "projects-52223.firebasestorage.app",
  messagingSenderId: "975723204014",
  appId: "1:975723204014:web:f9a5f7d5668cbbe13ccc3f",
  measurementId: "G-BK3KNT9VYS"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export const sessionRef = ref(db, 'currentSession');
export const submissionsRef = ref(db, 'submissions');
export const chatRef = ref(db, 'chat');
export const presenceRef = ref(db, 'presence');
export const adminLockRef = ref(db, 'locks/admin');
export const userLockRef = ref(db, 'locks/user');
export const configRef = ref(db, 'config');

export const initPresence = (userId: string, role: string) => {
  const userPresenceRef = ref(db, `presence/${userId}`);
  const userSubRef = ref(db, `submissions/${userId}`);
  const specificRoleLockRef = ref(db, `locks/${role.toLowerCase()}`);
  
  onDisconnect(userPresenceRef).remove();
  onDisconnect(userSubRef).remove();
  onDisconnect(specificRoleLockRef).remove();
  
  set(userPresenceRef, true);
  set(specificRoleLockRef, userId);
};

export const claimRole = async (role: string, userId: string, force: boolean = false) => {
  const lockRef = ref(db, `locks/${role.toLowerCase()}`);
  const snapshot = await get(lockRef);
  if (!force && snapshot.exists() && snapshot.val() !== userId) {
    return false;
  }
  await set(lockRef, userId);
  return true;
};

export const releaseRole = async (role: string) => {
  if (role && role !== 'unset') {
    const lockRef = ref(db, `locks/${role.toLowerCase()}`);
    await remove(lockRef);
  }
};

export const saveCustomPrompt = async (prompt: string) => {
  await set(ref(db, 'config/customPrompt'), prompt);
};

export const publishSessionText = async (
  sentence: string, 
  language: AppLanguage,
  tokenUsage?: TokenUsageInfo
) => {
  await set(sessionRef, { 
    sentence, 
    referenceAudios: {}, 
    timestamp: Date.now(),
    language,
    generatingSpeeds: {},
    tokenUsage: tokenUsage || null
  });
};

export const setSpeedGenerating = async (speed: string, isGenerating: boolean) => {
  const updates: Record<string, any> = {};
  if (isGenerating) {
    updates[`currentSession/generatingSpeeds/${speed}`] = true;
  } else {
    updates[`currentSession/generatingSpeeds/${speed}`] = null;
  }
  await update(ref(db), updates);
};

export const publishSessionAudio = async (
  speed: string, 
  audio: string,
  tokenUsage?: TokenUsageInfo
) => {
  const snapshot = await get(sessionRef);
  if (!snapshot.exists()) return;
  
  const updates: Record<string, any> = {};
  updates[`currentSession/referenceAudios/${speed}`] = audio;
  updates[`currentSession/generatingSpeeds/${speed}`] = null;
  if (tokenUsage) {
    updates[`currentSession/tokenUsage`] = tokenUsage;
  }
  await update(ref(db), updates);
};

export const submitAudio = async (submission: UserSubmission) => {
  const userSubRef = ref(db, `submissions/${submission.userId}`);
  await set(userSubRef, submission);
};

export const clearAllData = async () => {
  await remove(sessionRef);
  await remove(submissionsRef);
  await remove(chatRef);
};

export const sendChatMessage = async (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
  const newChatRef = push(chatRef);
  await set(newChatRef, {
    ...msg,
    timestamp: serverTimestamp()
  });

  const snapshot = await get(chatRef);
  if (snapshot.exists()) {
    const messages = snapshot.val();
    const keys = Object.keys(messages).sort((a, b) => messages[a].timestamp - messages[b].timestamp);
    if (keys.length > 15) {
      const toDelete = keys.slice(0, keys.length - 15);
      for (const key of toDelete) {
        await remove(ref(db, `chat/${key}`));
      }
    }
  }
};

export const getStoredUserId = () => {
  const USERID_STORAGE_KEY = 'toolker_device_userid';
  let id = localStorage.getItem(USERID_STORAGE_KEY);
  if (!id) {
    id = `u_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    localStorage.setItem(USERID_STORAGE_KEY, id);
  }
  return id;
};

export const syncRoomClip = async (roomId: string, clip: any) => {
  if (!roomId || !clip) return;
  await set(ref(db, `rooms/${roomId}/clip`), clip);
};

export const syncRoomAudio = async (roomId: string, audioBase64: string, senderId: string, senderName?: string) => {
  if (!roomId || !audioBase64) return;
  await set(ref(db, `rooms/${roomId}/latestAudio`), {
    audioBase64,
    senderId,
    senderName: senderName || 'Partner',
    timestamp: Date.now()
  });
};

export const killRoomInFirebase = async (roomId: string) => {
  if (!roomId) return;
  await set(ref(db, `rooms/${roomId}`), {
    killed: true,
    killedAt: Date.now()
  });
  await set(ref(db, `killed_rooms/${roomId}`), true);
};

export const checkIsRoomKilled = async (roomId: string): Promise<boolean> => {
  if (!roomId) return false;
  try {
    const snapshot = await get(ref(db, `killed_rooms/${roomId}`));
    return snapshot.exists() && snapshot.val() === true;
  } catch (e) {
    return false;
  }
};

export const subscribeToRoomData = (roomId: string, callback: (data: any) => void) => {
  if (!roomId) return () => {};
  const roomRef = ref(db, `rooms/${roomId}`);
  return onValue(roomRef, (snapshot) => {
    callback(snapshot.val());
  });
};

export { onValue };