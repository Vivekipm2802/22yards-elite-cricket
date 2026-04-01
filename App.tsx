// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Swords,
  LineChart,
  Map,
  Library,
  Trophy as TrophyIcon,
  Menu,
  Bell,
  X,
  Crown,
  ShieldCheck,
  Settings,
  LogOut,
  User,
  Radar,
  Grid,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import SplashScreen from './pages/SplashScreen';
import Login from './pages/Login';
import Dugout from './pages/Dugout';
import MatchCenter from './pages/MatchCenter';
import Performance from './pages/Performance';
import Arena from './pages/Arena';
import Archive from './pages/Archive';
import Tournaments from './pages/Tournaments';
import Profile from './pages/Profile';
import { AuthContext } from './AuthContext';
import LiveScoreboard from './pages/LiveScoreboard';
import { fetchMatchById } from './lib/supabase';

export type Page = 'DUGOUT' | 'MATCH_CENTER' | 'PERFORMANCE' | 'ARENA' | 'HISTORY' | 'TOURNAMENTS' | 'PROFILE';

const App: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [userData, setUserData] = useState<any | null>(null);
  const [activePage, setActivePage] = useState<Page>('DUGOUT');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  /* ââ URL params: ?watch=MATCH_ID or ?resume=MATCH_ID ââ */
  const [watchMatchId] = useState<string | null>(() => {
    try { return new URLSearchParams(window.location.search).get('watch'); } catch { return null; }
  });
  const [resumeMatchId] = useState<string | null>(() => {
    try { return new URLSearchParams(window.location.search).get('resume'); } catch { return null; }
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('22YARDS_THEME');
      return saved === null ? false : saved !== 'light'; // default = light (white + red)
    } catch { return false; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    try { localStorage.setItem('22YARDS_THEME', isDark ? 'dark' : 'light'); } catch {}
  }, [isDark]);

  useEffect(() => {
    try {
      const savedData = localStorage.getItem('22YARDS_USER_DATA');
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed && typeof parsed === 'object' && (parsed.name || parsed.phone)) {
          setUserData(parsed);
        } else {
          localStorage.removeItem('22YARDS_USER_DATA');
          setUserData(null);
        }
      }
    } catch (e) {
      console.error("Auth restoration failed:", e);
      localStorage.removeItem('22YARDS_USER_DATA');
      setUserData(null);
    }
  }, []);

  /* ââ Resume: after login, load match state from Supabase â localStorage â MATCH_CENTER ââ */
  useEffect(() => {
    if (!userData || !resumeMatchId) return;
    (async () => {
      const state = await fetchMatchById(resumeMatchId);
      if (state) {
        try { localStorage.setItem('22YARDS_ACTIVE_MATCH', JSON.stringify(state)); } catch {}
        /* strip the ?resume= param from the URL so a refresh doesn't re-trigger */
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('resume');
          window.history.replaceState({}, '', url.toString());
        } catch {}
        setActivePage('MATCH_CENTER');
      }
    })();
  }, [userData, resumeMatchId]);

  const handleLogin = (data: any) => {
    setUserData(data);
    localStorage.setItem('22YARDS_USER_DATA', JSON.stringify(data));
  };

  const handleLogout = () => {
    localStorage.removeItem('22YARDS_USER_DATA');
    setUserData(null);
    setIsSidebarOpen(false);
    setActivePage('DUGOUT');
  };

  const handleUpdateProfile = (name: string, role: string, avatar: string, age: string, city: string, battingStyle: string, bowlingStyle: string) => {
    const updatedData = { ...userData, name, role, avatar, age, city, battingStyle, bowlingStyle };
    setUserData(updatedData);
    localStorage.setItem('22YARDS_USER_DATA', JSON.stringify(updatedData));
    setActivePage('DUGOUT');
  };

  if (!isReady) {
    return <SplashScreen onComplete={() => setIsReady(true)} />;
  }

  /* ââ Spectator mode: ?watch=MATCH_ID â no login required ââ */
  if (watchMatchId) {
    return <LiveScoreboard matchId={watchMatchId} />;
  }

  if (!userData) {
    return <Login onLogin={handleLogin} />;
  }

  const renderPage = () => {
    switch (activePage) {
      case 'DUGOUT': return <Dugout onNavigate={setActivePage} onUpgrade={() => setShowUpgradeModal(true)} />;
      case 'MATCH_CENTER': return <MatchCenter onBack={() => setActivePage('DUGOUT')} />;
      case 'PERFORMANCE': return <Performance userAvatar={userData.avatar} />;
      case 'ARENA': return <Arena />;
      case 'HISTORY': return <Archive />;
      case 'TOURNAMENTS': return <Tournaments />;
      case 'PROFILE': return <Profile 
        currentName={userData.name} 
        currentRole={userData.role} 
        currentAvatar={userData.avatar} 
        onSave={handleUpdateProfile} 
        onBack={() => setActivePage('DUGOUT')} 
      />;
      default: return <Dugout onNavigate={setActivePage} onUpgrade={() => setShowUpgradeModal(true)} />;
    }
  };

  const navItems = [
    { id: 'DUGOUT', label: 'Dugout', icon: LayoutDashboard },
    { id: 'MATCH_CENTER', label: 'Arena', icon: Swords },
    { id: 'PERFORMANCE', label: 'Stats', icon: LineChart },
    { id: 'ARENA', label: 'Grounds', icon: Map },
  ];

  return (
    <AuthContext.Provider value={{ userData, login: handleLogin, logout: handleLogout }}>
      <div className="h-[100dvh] w-full bg-[#020617] text-white flex flex-col overflow-hidden relative font-sans">
        {/* Top Navigation â safe-area-inset-top handles iPhone Dynamic Island / notch */}
        <div
          className="border-b border-white/5 shrink-0 bg-black/50 backdrop-blur-xl z-[100]"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="h-16 px-6 flex items-center justify-between">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-white/60 hover:text-[#00F0FF] transition-colors">
            <Menu size={20} />
          </button>

          <div className="flex items-center space-x-2">
            <span className="font-heading text-xl tracking-tighter text-[#00F0FF] font-black italic">22YARDS</span>
            <div className="h-4 w-px bg-white/10 mx-2" />
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{activePage.replace('_', ' ')}</span>
          </div>

          <div className="flex items-center space-x-1">
            {/* Theme toggle */}
            <button
              onClick={() => setIsDark(d => !d)}
              className="p-2 text-white/60 hover:text-[#00F0FF] transition-colors"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {/* B-17 fix: notification bell â dot removed until real notifications exist */}
            <button className="p-2 text-white/60 hover:text-[#00F0FF] relative transition-colors" title="Notifications â coming soon">
              <Bell size={18} />
            </button>
          </div>
          </div>
        </div>

        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="h-full w-full"
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Bottom Tab Bar */}
        {activePage !== 'MATCH_CENTER' && activePage !== 'PROFILE' && (
          <div className="bg-black/80 backdrop-blur-2xl border-t border-white/5 flex items-center justify-around px-4 z-[90] shrink-0 bottom-tab-bar" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))', minHeight: '5rem' }}>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id as Page)}
                className={`flex flex-col items-center space-y-1 group transition-all ${activePage === item.id ? 'text-[#00F0FF]' : 'text-white/20'}`}
              >
                <div className={`p-2 rounded-xl transition-all ${activePage === item.id ? 'bg-[#00F0FF]/10 shadow-[0_0_15px_rgba(0,240,255,0.2)]' : 'group-hover:bg-white/5'}`}>
                  <item.icon size={20} strokeWidth={activePage === item.id ? 2.5 : 2} />
                </div>
                <span className={`text-[7px] font-black uppercase tracking-[0.2em] transition-all ${activePage === item.id ? 'opacity-100' : 'opacity-40 group-hover:opacity-60'}`}>{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Sidebar Redesign - Matches Screenshot */}
        <AnimatePresence>
          {isSidebarOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]" 
              />
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed top-0 left-0 bottom-0 w-[300px] bg-[#020d1f] border-r border-white/5 z-[210] flex flex-col p-8 shadow-[20px_0_60px_rgba(0,0,0,0.8)]"
              >
                {/* User Info Header Section */}
                <div className="flex items-center space-x-4 mb-10">
                  <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 overflow-hidden shrink-0">
                    <img src={userData.avatar} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col">
                    <h2 className="font-heading text-4xl leading-none italic text-white tracking-tighter uppercase">{userData.name}</h2>
                    <div className="flex items-center space-x-1 mt-1 text-[#00F0FF]">
                      <ShieldCheck size={12} strokeWidth={2.5} />
                      <span className="text-[10px] font-black uppercase tracking-[0.1em]">{userData.role}</span>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-white/5 mb-8" />

                <div className="flex-1 space-y-2 overflow-y-auto no-scrollbar pr-2">
                  <SidebarItem icon={Grid} label="Dugout Hub" active={activePage === 'DUGOUT'} onClick={() => { setActivePage('DUGOUT'); setIsSidebarOpen(false); }} />
                  <SidebarItem icon={Swords} label="Start Match" active={activePage === 'MATCH_CENTER'} onClick={() => { setActivePage('MATCH_CENTER'); setIsSidebarOpen(false); }} />
                  <SidebarItem icon={LineChart} label="Performance Hub" active={activePage === 'PERFORMANCE'} onClick={() => { setActivePage('PERFORMANCE'); setIsSidebarOpen(false); }} />
                  <SidebarItem icon={Map} label="Arena Venue" active={activePage === 'ARENA'} onClick={() => { setActivePage('ARENA'); setIsSidebarOpen(false); }} />
                  <SidebarItem icon={Library} label="Personal Archive" active={activePage === 'HISTORY'} onClick={() => { setActivePage('HISTORY'); setIsSidebarOpen(false); }} />
                  <SidebarItem icon={TrophyIcon} label="Pro Circuits" active={activePage === 'TOURNAMENTS'} onClick={() => { setActivePage('TOURNAMENTS'); setIsSidebarOpen(false); }} />
                  <SidebarItem icon={Settings} label="Identity Config" active={activePage === 'PROFILE'} onClick={() => { setActivePage('PROFILE'); setIsSidebarOpen(false); }} />
                </div>

                <button onClick={handleLogout} className="flex items-center space-x-4 p-4 rounded-xl text-white/20 hover:bg-red-500/10 hover:text-red-500 transition-all mt-6 group">
                  <LogOut size={18} className="group-hover:animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Terminate Session</span>
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Upgrade Modal */}
        <AnimatePresence>
          {showUpgradeModal && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6"
            >
              <div className="w-full max-w-sm bg-[#0a0a0a] border border-[#00F0FF]/20 rounded-[40px] p-10 space-y-8 relative overflow-hidden shadow-[0_0_100px_rgba(0,240,255,0.1)]">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#00F0FF]/5 blur-[60px] rounded-full" />
                <div className="text-center space-y-4 relative z-10">
                  <div className="w-16 h-16 bg-[#00F0FF]/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Crown size={32} className="text-[#00F0FF]" />
                  </div>
                  <h3 className="font-heading text-4xl italic uppercase text-white leading-none">ELITE SQUADRON</h3>
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Operational Superiority</p>
                </div>

                <div className="space-y-4">
                  <FeatureItem label="Advanced Telemetry" />
                  <FeatureItem label="Global Rankings" />
                  <FeatureItem label="Priority Arena Access" />
                </div>

                <div className="space-y-4">
                  {/* B-16 fix: upgrade button now shows coming-soon message */}
                  <button
                    className="w-full bg-[#00F0FF] text-black py-5 rounded-2xl font-black text-[10px] tracking-[0.5em] uppercase shadow-[0_10px_30px_rgba(0,240,255,0.3)]"
                    onClick={() => { setShowUpgradeModal(false); alert('â¡ Elite Squadron is coming soon!\n\nWe\'re building something special. Stay tuned for the launch announcement.'); }}
                  >AUTHORIZE UPGRADE</button>
                  <button onClick={() => setShowUpgradeModal(false)} className="w-full text-white/20 py-2 text-[8px] font-black uppercase tracking-widest">Decline Protocol</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthContext.Provider>
  );
};

const SidebarItem = ({ icon: Icon, label, active = false, onClick }) => (
  <button 
    onClick={onClick} 
    className={`w-full flex items-center space-x-4 px-6 py-5 rounded-xl transition-all border ${
      active 
      ? 'bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/30 shadow-[0_0_20px_rgba(0,240,255,0.1)]' 
      : 'text-white/40 hover:bg-white/5 hover:text-white border-transparent'
    }`}
  >
    <Icon size={20} className={active ? 'text-[#00F0FF]' : 'opacity-60'} strokeWidth={active ? 2.5 : 2} />
    <span className="text-[11px] font-black uppercase tracking-[0.1em] leading-none whitespace-nowrap">{label}</span>
  </button>
);

const FeatureItem = ({ label }) => (
  <div className="flex items-center space-x-3 text-white/60">
    <ShieldCheck size={14} className="text-[#39FF14]" />
    <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
  </div>
);

export default App;
