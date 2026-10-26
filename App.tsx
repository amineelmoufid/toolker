import React, { useState, useEffect } from 'react';
import { UserRole, AppState, AppMode } from './types';
import Login from './components/Login';
import Generator from './components/Generator';
import Chat from './components/Chat';
import ShadowingStudio from './components/shadowing/ShadowingStudio';
import DictationStudio from './components/dictation/DictationStudio';
import FocusReaderStudio from './components/reader/FocusReaderStudio';
import { initPresence, clearAllData, claimRole, releaseRole } from './services/firebase';

const USERNAME_STORAGE_KEY = 'toolker_device_username';
const USERID_STORAGE_KEY = 'toolker_device_userid';

const getStoredUserId = () => {
  let id = localStorage.getItem(USERID_STORAGE_KEY);
  if (!id) {
    id = `u_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    localStorage.setItem(USERID_STORAGE_KEY, id);
  }
  return id;
};

const isAdminRoute = () => {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();
  return path === '/adm' || path === '/adm/' || path.startsWith('/adm/') || path === '/admin' || hash === '#adm' || search.includes('role=admin');
};

import { useRoom } from './contexts/RoomContext';
import { RoomShareButton } from './components/common/RoomShareButton';
import { SectionNavigator } from './components/common/SectionNavigator';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    role: UserRole.UNSET,
    userName: '',
    isAuthenticated: false,
  });
  const [appMode, setAppMode] = useState<AppMode>(() => {
    if (window.location.hash === '#shadowing' || window.location.search.includes('mode=shadowing')) return 'shadowing';
    if (window.location.hash === '#dictation' || window.location.search.includes('mode=dictation')) return 'dictation';
    if (window.location.hash === '#reader' || window.location.search.includes('mode=reader')) return 'reader';
    return 'instrument';
  });
  const [isInitializing, setIsInitializing] = useState(true);

  const { peerId, roomId, createRoom, connectToRoom, isConnected, remotePeerId, disconnectRoom } = useRoom();
  const [roomUrlCopied, setRoomUrlCopied] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    
    if (roomParam && !isConnected && roomId !== roomParam) {
      connectToRoom(roomParam);
    }
  }, [roomId, isConnected, connectToRoom]);

  const handleCreateRoom = () => {
    const activeRoom = createRoom();
    const newUrl = new URL(window.location.origin + window.location.pathname);
    newUrl.searchParams.set('room', activeRoom);
    if (appMode === 'shadowing') {
      newUrl.searchParams.set('mode', 'shadowing');
      newUrl.hash = '#shadowing';
    } else if (appMode === 'dictation') {
      newUrl.searchParams.set('mode', 'dictation');
      newUrl.hash = '#dictation';
    } else if (appMode === 'reader') {
      newUrl.searchParams.set('mode', 'reader');
      newUrl.hash = '#reader';
    }
    window.history.pushState({}, '', newUrl.toString());
    
    navigator.clipboard.writeText(newUrl.toString()).then(() => {
      setRoomUrlCopied(true);
      setTimeout(() => setRoomUrlCopied(false), 3000);
    });
  };

  const handleLeaveRoom = () => {
    disconnectRoom();
    const newUrl = new URL(window.location.origin + window.location.pathname);
    window.history.pushState({}, '', newUrl.toString());
  };

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#shadowing') {
        setAppMode('shadowing');
      } else if (window.location.hash === '#dictation') {
        setAppMode('dictation');
      } else if (window.location.hash === '#reader') {
        setAppMode('reader');
      } else if (appMode === 'shadowing' || appMode === 'dictation' || appMode === 'reader') {
        setAppMode('instrument');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [appMode]);

  useEffect(() => {
    const checkAuth = async () => {
      const isAdm = isAdminRoute();
      const userId = getStoredUserId();

      if (isAdm) {
        // Secure admin route: NEVER auto-login, always ask for name
        setAppState({
          role: UserRole.UNSET,
          userName: '',
          isAuthenticated: false,
        });
      } else {
        // Normal user route: check if this device is remembered
        const rememberedName = localStorage.getItem(USERNAME_STORAGE_KEY);
        if (rememberedName && rememberedName.trim() && rememberedName.trim().toLowerCase() !== 'amine elm') {
          setAppState({
            role: UserRole.USER,
            userName: rememberedName.trim(),
            isAuthenticated: true,
          });
          initPresence(userId, UserRole.USER);
        } else {
          // No remembered name: set state to prompt for name directly
          setAppState({
            role: UserRole.USER, // default role prompt
            userName: '',
            isAuthenticated: false,
          });
        }
      }
      setIsInitializing(false);
    };

    checkAuth();
  }, []);

  const handleSetRole = async (role: UserRole, name: string) => {
    const userId = getStoredUserId();
    
    if (role === UserRole.ADMIN) {
      try {
        await claimRole(role, userId, true);
      } catch (err: any) {
        console.warn("Error claiming role, proceeding anyway", err);
      }

      // Fire and forget
      clearAllData().catch(e => console.warn("Cleanup error (ignored):", e));
      
      setAppState({
        role: UserRole.ADMIN,
        userName: 'Amine',
        isAuthenticated: true,
      });
      initPresence(userId, role);
    } else {
      // Save device name
      localStorage.setItem(USERNAME_STORAGE_KEY, name.trim());
      setAppState({
        role: UserRole.USER,
        userName: name.trim(),
        isAuthenticated: true,
      });
      initPresence(userId, role);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem(USERNAME_STORAGE_KEY);
    
    // Release the Firebase role lock before navigating away or changing state
    if (appState.role) {
      try {
        await releaseRole(appState.role);
      } catch (err) {
        console.warn("Failed to release role lock on logout", err);
      }
    }

    if (isAdminRoute()) {
      window.location.href = '/';
    } else {
      setAppState({
        role: UserRole.UNSET,
        userName: '',
        isAuthenticated: false,
      });
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#d8d2c4] flex items-center justify-center font-mono text-xs text-[#524f46]">
        <div className="p-4 bg-[#e4dfd3] border-2 border-[#1c1d20] rounded shadow-[4px_4px_0px_#18191c] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#cf573c] animate-pulse"></span>
          <span>INITIALIZING INSTRUMENT TELEMETRY...</span>
        </div>
      </div>
    );
  }

  if (!appState.isAuthenticated) {
    return <Login onLogin={handleSetRole} defaultRole={UserRole.USER} />;
  }

  if (appMode === 'shadowing') {
    return (
      <ShadowingStudio
        onBack={() => {
          window.location.hash = '';
          setAppMode('instrument');
        }}
        onNavigate={(mode: AppMode) => {
          setAppMode(mode);
          if (mode === 'instrument') {
            window.location.hash = '';
          } else {
            window.location.hash = `#${mode}`;
          }
        }}
      />
    );
  }

  if (appMode === 'dictation') {
    return (
      <DictationStudio onBack={() => {
        window.location.hash = '';
        setAppMode('instrument');
      }} />
    );
  }

  if (appMode === 'reader') {
    return (
      <FocusReaderStudio onBack={() => {
        window.location.hash = '';
        setAppMode('instrument');
      }} />
    );
  }

  const isAdmin = appState.role === UserRole.ADMIN;

  return (
    <div className="min-h-screen bg-[#d8d2c4] text-[#1c1d20] font-sans p-3 sm:p-6 pb-16">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        
        {/* Master Console Instrument Header */}
        <header className="bg-[#e4dfd3] p-5 rounded-lg border-2 border-[#1c1d20] shadow-[5px_5px_0px_#18191c] relative">
          {/* Chassis Corner Rivets */}
          <div className="absolute top-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
          <div className="absolute top-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
          <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
          <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-[10px] font-bold tracking-widest text-[#5c5950] uppercase">
                  PRECISION AUDIO INSTRUMENT // SPEC-80
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#3d7a4d]"></span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-[#1c1d20] uppercase">
                Pronunciation Pro
              </h1>
              <p className="text-xs font-mono text-[#636056] mt-0.5">
                Dual-Channel Acoustic Feedback &amp; Practice Deck
              </p>
            </div>

            {/* Operator Telemetry Capsule */}
            <div className="flex items-center gap-2 bg-[#16171a] p-2.5 rounded border-2 border-[#2b2c32] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.8)] self-start sm:self-auto">
              <div className="flex flex-col">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#7a776e]">ACTIVE OPERATOR</span>
                <span className="font-mono text-xs font-bold text-[#ebe6d8] truncate max-w-[120px] sm:max-w-[150px]">
                  {appState.userName}
                </span>
              </div>
              
              <span className={`px-2.5 py-1 rounded font-mono text-[10px] font-bold uppercase tracking-wider border ${
                isAdmin 
                  ? 'bg-[#cf573c] text-[#fbf8f2] border-[#a83f2a]' 
                  : 'bg-[#476171] text-[#fbf8f2] border-[#374c59]'
              }`}>
                {appState.role}
              </span>

              <button 
                onClick={handleLogout}
                title={isAdmin ? "Exit Admin" : "Change Nickname"}
                className="ml-1 text-xs font-mono text-[#7a776e] hover:text-[#cf573c] transition-colors p-1 rounded hover:bg-[#2b2c32]"
              >
                ⎋
              </button>
            </div>
          </div>

          {/* Minimalist SVG Section Navigation Strip */}
          <div className="mt-4 pt-3 border-t border-[#c5bfb0] flex flex-wrap items-center justify-between gap-3">
            <SectionNavigator
              activeMode={appMode}
              onSelectMode={(mode) => {
                if (mode === 'instrument') {
                  window.location.hash = '';
                } else {
                  window.location.hash = `#${mode}`;
                }
                setAppMode(mode);
              }}
            />

            <div className="flex items-center gap-2">
              <RoomShareButton modeName={appMode} />
            </div>
          </div>
        </header>

        {/* MODULE 01: Target Sentence & Synthesis Deck */}
        <section className="bg-[#e4dfd3] rounded-lg p-5 border-2 border-[#1c1d20] shadow-[5px_5px_0px_#18191c] relative">
          <Generator role={appState.role} />
        </section>



        {/* MODULE 03: Communications Terminal */}
        <section className="bg-[#e4dfd3] rounded-lg p-5 border-2 border-[#1c1d20] shadow-[5px_5px_0px_#18191c] relative flex-grow min-h-[420px]">
          <Chat role={appState.role} userName={appState.userName} />
        </section>

      </div>
    </div>
  );
};

export default App;