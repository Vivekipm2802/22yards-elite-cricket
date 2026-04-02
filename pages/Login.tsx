// @ts-nocheck
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, RefreshCw, User, ChevronDown, CheckCircle2, ShieldCheck, MapPin, X } from 'lucide-react';
import MotionButton from '../components/MotionButton';
import { upsertPlayer, fetchPlayerByPhone, generatePlayerId, touchLastLogin } from '../lib/supabase';

interface LoginProps {
  onLogin: (userData: any) => void;
}

const ROLES = ['All-Rounder', 'Batsman', 'Bowler', 'Wicket Keeper'];

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('All-Rounder');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [finalUserData, setFinalUserData] = useState<any>(null);

  const handleSubmit = async () => {
    if (!name || !phone || !role || !city) {
      alert("Please complete the authorization protocol.");
      return;
    }
    if (phone.length !== 10) {
      alert("Phone number must be exactly 10 digits.");
      return;
    }

    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1200));

    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}&backgroundColor=020617`;

    const userData = {
      name,
      phone,
      role,
      city,
      avatar: avatarUrl,
      authDate: new Date().toISOString()
    };

    try {
      // ââ Step 1: Check if player exists in Supabase ââââââââââââââââââ
      let existingProfile = null;
      try {
        existingProfile = await fetchPlayerByPhone(phone);
      } catch (_) { /* offline fallback */ }

      // ââ Step 2: Sync vault from Supabase into localStorage ââââââââââ
      const globalVault = JSON.parse(localStorage.getItem('22YARDS_GLOBAL_VAULT') || '{}');

      if (existingProfile) {
        // Returning player: hydrate localStorage from Supabase archive_vault
        if (!globalVault[phone]) {
          globalVault[phone] = { history: [], teams: [], name, role, city };
        }
        if (existingProfile.archive_vault && existingProfile.archive_vault.length > 0) {
          globalVault[phone].history = existingProfile.archive_vault;
        }
        localStorage.setItem('22YARDS_GLOBAL_VAULT', JSON.stringify(globalVault));

        // Update last_login
        await touchLastLogin(phone).catch(() => {});
      } else {
        // New player: create fresh vault + upsert to Supabase
        if (!globalVault[phone]) {
          globalVault[phone] = { history: [], teams: [], name, role, city };
          localStorage.setItem('22YARDS_GLOBAL_VAULT', JSON.stringify(globalVault));
        }

        const playerId = generatePlayerId(phone);
        await upsertPlayer({
          player_id: playerId,
          phone,
          name: name.toUpperCase(),
          city,
          role,
          avatar_url: avatarUrl,
          matches_played: 0, career_runs: 0, balls_faced: 0,
          innings_played: 0, not_outs: 0, total_fours: 0, total_sixes: 0,
          batting_average: 0, strike_rate: 0,
          total_wickets: 0, overs_bowled: 0, balls_bowled_raw: 0,
          runs_conceded: 0, best_figures: '0/0', best_figures_wickets: 0,
          best_figures_runs: 999, three_w_hauls: 0, five_w_hauls: 0,
          bowling_average: 0, bowling_economy: 0,
          total_catches: 0, run_outs: 0, stumpings: 0, fielding_impact: 0,
          toss_wins: 0, matches_led: 0, captaincy_wins: 0,
          elite_rank: 'Cadet', total_victories: 0, total_defeats: 0,
          archive_vault: [],
        }).catch(() => {});
      }

      localStorage.setItem('22YARDS_USER_DATA', JSON.stringify(userData));
      setFinalUserData(userData);
      setIsSuccess(true);
    } catch (error) {
      console.error("Auth Failure:", error);
      localStorage.setItem('22YARDS_USER_DATA', JSON.stringify(userData));
      onLogin(userData);
    } finally {
      setLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="fixed inset-0 bg-[#020617] flex flex-col items-center justify-center z-[1100] overflow-hidden p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 flex flex-col items-center text-center space-y-10 w-full max-w-sm"
        >
          <div className="relative">
             <motion.div 
               animate={{ scale: [1, 2], opacity: [0.5, 0] }}
               transition={{ duration: 2, repeat: Infinity }}
               className="absolute inset-0 rounded-full border-2 border-[#39FF14]/50"
             />
             <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-[#39FF14] via-[#00F0FF] to-[#39FF14] p-1 shadow-[0_0_50px_rgba(57,255,20,0.3)]">
                <div className="w-full h-full bg-[#020617] rounded-full flex items-center justify-center relative overflow-hidden">
                   <ShieldCheck size={48} className="text-[#39FF14]" />
                </div>
             </div>
          </div>
          <div className="space-y-2">
            <h2 className="font-heading text-7xl italic text-white leading-none tracking-tighter">AUTHORIZED</h2>
            <p className="text-[10px] font-black tracking-[0.5em] text-[#39FF14] uppercase opacity-80">Pitch Access Granted</p>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => onLogin(finalUserData)}
            className="bg-[#39FF14] text-black px-16 py-5 rounded-2xl font-heading text-3xl tracking-widest uppercase shadow-[0_0_40px_rgba(57,255,20,0.4)] transition-all hover:brightness-110"
          >
            WALK TO PITCH
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="w-full h-[100dvh] bg-[#020617] flex flex-col items-center justify-start overflow-hidden px-8 relative pt-10 sm:pt-16 pb-8">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[25vh] bg-[#39FF14]/5 blur-[100px] pointer-events-none" />
      
      {/* Brand Header - Scaled for strict viewport height maintenance */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="w-full flex flex-col items-center mb-4 sm:mb-8 shrink-0"
      >
        <div className="relative flex flex-col items-center text-center">
          <h1 className="font-heading text-[100px] sm:text-[140px] md:text-[160px] leading-[0.65] font-black text-[#39FF14] tracking-tighter drop-shadow-[0_0_40px_rgba(57,255,20,0.4)]">22</h1>
          <h1 className="font-heading text-[70px] sm:text-[100px] md:text-[110px] leading-[0.8] font-black tracking-tighter bg-gradient-to-br from-[#39FF14] to-[#00F0FF] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,240,255,0.3)]">YARDS</h1>
          
          <div className="flex items-center justify-center space-x-4 sm:space-x-6 mt-4 sm:mt-8 w-full max-w-[280px]">
             <div className="h-[1px] flex-1 bg-white/10" />
             <p className="text-[#00F0FF] text-[9px] sm:text-[10px] font-black tracking-[0.6em] sm:tracking-[0.8em] uppercase whitespace-nowrap opacity-80">STADIUM ACCESS</p>
             <div className="h-[1px] flex-1 bg-white/10" />
          </div>
        </div>
      </motion.div>

      {/* Access Card - Tightened for small screens */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[360px] flex-1 flex flex-col glass-luxury border-[#00F0FF]/10 rounded-[32px] sm:rounded-[48px] p-6 sm:p-10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] overflow-hidden"
      >
        <div className="space-y-4 sm:space-y-6 flex-1 overflow-y-auto no-scrollbar">
          {/* Identity */}
          <div className="space-y-2">
            <label className="text-[9px] font-black text-[#00F0FF] uppercase tracking-[0.3em] ml-1">IDENTITY</label>
            <div className="relative group">
              <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-[#00F0FF] transition-colors"><User size={18} /></div>
              <input 
                type="text" 
                placeholder="Full Name" 
                className="w-full bg-black/40 border border-white/5 rounded-xl py-4 sm:py-5 pl-12 pr-6 outline-none text-white font-bold text-sm focus:border-[#00F0FF]/30 transition-all placeholder:text-white/20" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                disabled={loading} 
              />
            </div>
          </div>
          
          {/* Mobile Uplink */}
          <div className="space-y-2">
            <label className="text-[9px] font-black text-[#00F0FF] uppercase tracking-[0.3em] ml-1">MOBILE UPLINK</label>
            <div className="relative group">
              <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-[#00F0FF] transition-colors"><Smartphone size={18} /></div>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="+91..."
                maxLength={10}
                className="w-full bg-black/40 border border-white/5 rounded-xl py-4 sm:py-5 pl-12 pr-6 outline-none text-white font-bold text-sm focus:border-[#00F0FF]/30 transition-all font-numbers placeholder:text-white/20"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                disabled={loading}
              />
            </div>
          </div>

          {/* Role Selection */}
          <div className="space-y-2">
            <label className="text-[9px] font-black text-[#00F0FF] uppercase tracking-[0.3em] ml-1">ROLE SELECTION</label>
            <button 
              onClick={() => setShowRoleDropdown(!showRoleDropdown)} 
              className="w-full bg-black/40 border border-white/5 rounded-xl py-4 sm:py-5 px-6 outline-none text-white font-bold text-sm text-left flex justify-between items-center group focus:border-[#00F0FF]/30"
            >
              <span className="truncate">{role}</span>
              <ChevronDown size={18} className={`transition-transform text-white/20 ${showRoleDropdown ? 'rotate-180 text-[#00F0FF]' : ''}`} />
            </button>
          </div>

          {/* City Base */}
          <div className="space-y-2">
            <label className="text-[9px] font-black text-[#00F0FF] uppercase tracking-[0.3em] ml-1">CITY BASE</label>
            <div className="relative group">
              <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-[#00F0FF] transition-colors"><MapPin size={18} /></div>
              <input 
                type="text" 
                placeholder="City" 
                className="w-full bg-black/40 border border-white/5 rounded-xl py-4 sm:py-5 pl-12 pr-6 outline-none text-white font-bold text-sm focus:border-[#00F0FF]/30 transition-all placeholder:text-white/20" 
                value={city} 
                onChange={(e) => setCity(e.target.value)} 
                disabled={loading} 
              />
            </div>
          </div>
        </div>

        {/* Action Button - Locked at bottom of card */}
        <div className="pt-6 mt-auto shrink-0">
          <MotionButton
            onClick={handleSubmit}
            disabled={loading || !name || !phone || phone.length !== 10 || !role || !city}
            className="w-full bg-[#00F0FF] text-black py-5 sm:py-7 !rounded-2xl sm:!rounded-3xl font-black tracking-[0.3em] sm:tracking-[0.4em] flex items-center justify-center space-x-4 text-[10px] sm:text-xs uppercase shadow-[0_20px_50px_rgba(0,240,255,0.4)] border-0 active:scale-95 disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none disabled:cursor-not-allowed"
          >
            {loading ? <RefreshCw className="animate-spin w-5 h-5" /> : <span>AUTHORIZE ACCESS</span>}
          </MotionButton>
        </div>
      </motion.div>

      {/* Footer Text */}
      <p className="mt-6 sm:mt-10 text-[8px] font-black text-white/10 uppercase tracking-[0.6em] shrink-0">System Version 22.1.Y | Secure Node</p>

      {/* Role Picker Modal Overlay */}
      <AnimatePresence>
        {showRoleDropdown && (
          <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowRoleDropdown(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, y: 100 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: 100 }} 
              className="relative w-full max-w-sm bg-[#0D0D0D] border border-[#00F0FF]/10 rounded-[32px] sm:rounded-[40px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,1)]"
            >
              <div className="p-6 sm:p-8 border-b border-white/5 flex justify-between items-center">
                 <h3 className="text-xs sm:text-sm font-black text-[#00F0FF] uppercase tracking-[0.3em] sm:tracking-[0.4em]">SELECT ROLE</h3>
                 <button onClick={() => setShowRoleDropdown(false)} className="p-2 text-white/20"><X size={20} /></button>
              </div>
              <div className="p-4">
                {ROLES.map((r) => (
                  <button 
                    key={r} 
                    onClick={() => { setRole(r); setShowRoleDropdown(false); }} 
                    className={`w-full px-6 sm:px-8 py-4 sm:py-5 text-left text-sm font-bold text-white transition-all rounded-xl sm:rounded-2xl mb-2 last:mb-0 flex items-center justify-between ${role === r ? 'bg-[#00F0FF]/10 text-[#00F0FF]' : 'hover:bg-white/5'}`}
                  >
                    {r.toUpperCase()}
                    {role === r && <CheckCircle2 size={18} className="text-[#00F0FF]" />}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Login;
