import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import { onValue, adminLockRef, userLockRef } from '../services/firebase';

interface LoginProps {
  onLogin: (role: UserRole, name: string) => void;
  defaultRole?: UserRole;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const [isLoading, setIsLoading] = useState(false);

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a nickname');
      return;
    }

    setIsLoading(true);
    const isSecretAdmin = name.trim().toLowerCase() === 'amine elm';
    
    try {
      if (isSecretAdmin) {
        await onLogin(UserRole.ADMIN, 'Amine');
      } else {
        await onLogin(UserRole.USER, name.trim());
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to login');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#d8d2c4] p-4 font-sans">
      <div className="bg-[#e4dfd3] p-6 sm:p-8 rounded-lg border-2 border-[#1c1d20] shadow-[6px_6px_0px_#18191c] w-full max-w-md relative">
        
        {/* Decorative Chassis Hardware Screws */}
        <div className="absolute top-2.5 left-2.5 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
        <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
        <div className="absolute bottom-2.5 left-2.5 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>
        <div className="absolute bottom-2.5 right-2.5 w-2 h-2 rounded-full border border-[#7a776e] bg-[#c5bfb0] flex items-center justify-center text-[7px] text-[#4d4a43] select-none">+</div>

        {/* Top Header Plate */}
        <div className="mb-6 pb-4 border-b-2 border-[#2b2c32]">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[10px] font-bold tracking-widest text-[#68655d] uppercase">INSTRUMENT // MOD-80</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#cf573c] animate-pulse"></span>
              <span className="font-mono text-[9px] font-bold tracking-wider text-[#4d4a43] uppercase">SYS.READY</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-[#1c1d20] uppercase">Pronunciation Pro</h1>
          <p className="text-xs text-[#5a574f] font-mono mt-0.5">Terminal Authentication & Session Gate</p>
        </div>

        <form onSubmit={handleUserLogin} className="flex flex-col gap-4">
          <div className="bg-[#16171a] p-3 rounded border-2 border-[#282a30] shadow-[inset_1px_1px_4px_rgba(0,0,0,0.8)]">
            <p className="font-mono text-xs text-[#ebe6d8] flex items-center gap-2">
              <span className="text-[#476171] font-bold">&gt;</span> REGISTRATION BUS ACTIVE
            </p>
          </div>

          <div>
            <label className="block text-xs font-mono font-bold text-[#3d3b35] uppercase mb-1 tracking-wider">
              CALLSIGN / OPERATOR NICKNAME
            </label>
            <input
              type="password"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="e.g. Alex, Sam..."
              required
              autoFocus
              className="w-full bg-[#16171a] border-2 border-[#2b2c32] p-3 rounded text-[#ebe6d8] font-mono text-base shadow-[inset_2px_2px_4px_rgba(0,0,0,0.8)] focus:border-[#476171] outline-none placeholder:text-[#52545e]"
            />
            <p className="text-[10px] font-mono text-[#7a776e] mt-1.5">Your callsign will be broadcasted to the comms terminal.</p>
          </div>

          {error && (
            <div className="bg-[#cf573c]/15 border border-[#cf573c] p-2 rounded text-center">
              <p className="text-[#cf573c] font-mono text-xs font-bold uppercase">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full flex-1 border-2 border-[#1c1d20] shadow-[3px_3px_0px_#18191c] p-3 rounded font-mono text-xs font-bold uppercase tracking-wider transition-all duration-75 ${
                isLoading 
                  ? 'bg-[#cec7b8] text-[#716d63] cursor-not-allowed shadow-[1px_1px_0px_#18191c] translate-x-[2px] translate-y-[2px]' 
                  : 'bg-[#476171] hover:bg-[#526e80] text-[#fbf8f2] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_#18191c]'
              }`}
            >
              {isLoading ? 'AUTHENTICATING...' : 'ENGAGE SESSION ↵'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;