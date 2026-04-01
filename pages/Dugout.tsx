// @ts-nocheck
import React, { useMemo, useState, useEffect } from 'react';
// Removed Variants to avoid missing export error
import { motion } from 'framer-motion';
import {
  Swords, Swords as SwordsIcon, LineChart, Map, Crown, Zap,
  ChevronRight, Activity, Radar, Target,
  Calendar, Trophy, Star, TrendingUp, MapPin, Hash
} from 'lucide-react';
import GlassCard from '../components/GlassCard';
import MotionButton from '../components/MotionButton';
import { useAuth } from '../AuthContext';
import { fetchLeaderboard } from '../lib/supabase';

interface DugoutProps {
  onNavigate: (page: 'DUGOUT' | 'MATCH_CENTER' | 'PERFORMANCE' | 'ARENA' | 'HISTORY' | 'TOURNAMENTS') => void;
  onUpgrade?: () => void;
}

const LIVE_FEEDS = [
  { id: '1', teamA: 'Avengers XI', teamB: 'Warriors CC', status: 'Inning 1 â¢ 14.2 Overs', detail: '142/3 (RR: 9.9)', trend: '+0.4', color: '#00F0FF' },
  { id: '2', teamA: 'Tech Giants', teamB: 'Sales Force', status: 'Match Suspended', detail: 'Weather Delay', trend: '0.0', color: '#39FF14' },
];

const PROTOCOLS = [
  { id: 'MATCH_CENTER', label: 'Start Match', sub: 'Scoring Deployment', icon: SwordsIcon, color: '#00F0FF' },
  { id: 'TOURNAMENTS', label: 'Pro Circuits', sub: 'Elite Tournaments', icon: Trophy, color: '#39FF14' },
  { id: 'ARENA', label: 'Ground Intel', sub: 'Strategic Booking', icon: Map, color: '#00F0FF' },
  { id: 'PERFORMANCE', label: 'Performance Hub', sub: 'Elite Analytics', icon: Radar, color: '#39FF14' },
];

// Used any for variants to avoid complex framer-motion versioning issues
const containerVariants: any = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 }
  }
};

// Used any for variants to avoid complex framer-motion versioning issues
const itemVariants: any = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as any } 
  }
};

const Dugout: React.FC<DugoutProps> = ({ onNavigate, onUpgrade }) => {
  const { userData } = useAuth();
  // Theme-aware: detect light mode so we can override inline-style icon colours
  const isLightMode = typeof document !== 'undefined' && document.documentElement?.dataset?.theme === 'light';

  // Calculate real career runs from specific phone number profile in the Vault
  const careerStats = useMemo(() => {
    const activePhone = userData?.phone || '';
    const globalVault = JSON.parse(localStorage.getItem('22YARDS_GLOBAL_VAULT') || '{}');
    const profileData = globalVault[activePhone] || { history: [], teams: [] };
    const history = profileData.history || [];

    const totalRuns = history.reduce((acc: number, match: any) => acc + (parseInt(match.runs) || 0), 0);

    const hash = activePhone.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
    const uid = `22Y-${Math.abs(hash % 9999).toString().padStart(4, '0')}-${String.fromCharCode(65 + (Math.abs(hash) % 26))}`;

    return { totalRuns, uid };
  }, [userData]);

  // B-08 fix: real impact rank from Supabase leaderboard
  const [cloudRank, setCloudRank] = useState<string | null>(null);
  useEffect(() => {
    if (!userData?.phone) return;
    fetchLeaderboard('career_runs', 100)
      .then(leaders => {
        const idx = leaders.findIndex(l => l.phone === userData.phone);
        if (idx >= 0) {
          setCloudRank(`#${idx + 1}`);
        } else {
          setCloudRank(careerStats.totalRuns > 0 ? '#â' : 'UNRANKED');
        }
      })
      .catch(() => {
        // Fallback if Supabase unreachable
        setCloudRank(careerStats.totalRuns > 1000 ? '#12' : careerStats.totalRuns > 0 ? '#42' : 'UNRANKED');
      });
  }, [userData?.phone]);
  const displayRank = cloudRank ?? (careerStats.totalRuns > 1000 ? '#12' : careerStats.totalRuns > 0 ? '#42' : 'UNRANKED');

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-6xl mx-auto px-6 py-8 space-y-12 pb-40 scroll-container"
    >
      {/* Header Section */}
      <motion.section variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <div className="h-[2px] w-8 bg-[#00F0FF] shadow-[0_0_8px_#00F0FF]"></div>
            <span className="text-[10px] font-black tracking-[0.5em] text-[#00F0FF] uppercase">Stadium Command Node</span>
            <div className="bg-white/5 px-2 py-0.5 rounded border border-white/10 flex items-center space-x-1 ml-2">
               <Hash size={8} className="text-[#00F0FF]" />
               <span className="text-[8px] font-black text-white/40 tracking-widest">{careerStats.uid}</span>
            </div>
          </div>
          <h1 className="font-heading text-8xl tracking-tighter text-white leading-[0.85] uppercase">
            DUGOUT<br/><span className="text-[#00F0FF]">HUB</span>
          </h1>
        </div>
        
        {/* Personal Real Stats */}
        <div className="flex space-x-10 border-l border-white/10 pl-8 h-fit py-2">
          <div className="space-y-1">
            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Career Runs</p>
            <p className="font-numbers text-4xl text-white font-bold tracking-tighter leading-none">
              {careerStats.totalRuns.toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Impact Rank</p>
            <p className="font-numbers text-4xl text-[#39FF14] font-bold tracking-tighter leading-none">
              {displayRank}
            </p>
          </div>
        </div>
      </motion.section>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <motion.div variants={itemVariants}>
            <GlassCard className="p-8 relative overflow-hidden group border-l-4 border-[#00F0FF]">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Calendar size={120} className="text-[#00F0FF]" />
              </div>
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 text-[#00F0FF]">
                    <Activity size={14} className="animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">Next Deployment</span>
                  </div>
                  <h3 className="font-heading text-4xl text-white uppercase tracking-tight">Avengers XI <span className="text-white/20">vs</span> Thunder CC</h3>
                  <div className="flex items-center space-x-4 text-white/40 text-[10px] font-black uppercase tracking-widest">
                    <span className="flex items-center"><MapPin size={12} className="mr-1" /> Palika Stadium</span>
                    <span className="flex items-center"><Calendar size={12} className="mr-1" /> Tomorrow â¢ 07:00 PM</span>
                  </div>
                </div>
                <MotionButton onClick={() => onNavigate('MATCH_CENTER')} className="bg-[#00F0FF] text-black !rounded-xl !py-4 !px-8 text-[11px] font-black tracking-widest shadow-[0_0_20px_rgba(0,240,255,0.4)]">
                  PRE-MATCH SYNC
                </MotionButton>
              </div>
            </GlassCard>
          </motion.div>

          <motion.div variants={itemVariants} className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Live Tactical Feed</h3>
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-ping" />
                <span className="text-[9px] font-black text-[#39FF14] uppercase">02 Active Battles</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {LIVE_FEEDS.map((feed) => (
                <GlassCard key={feed.id} className="p-6 group cursor-pointer border-b-2" style={{ borderBottomColor: `${feed.color}20` }}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-1">
                      <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">{feed.status}</p>
                      <h4 className="font-heading text-2xl text-white tracking-wide uppercase">{feed.teamA} v {feed.teamB}</h4>
                    </div>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="font-numbers text-3xl text-white tracking-tighter">{feed.detail}</p>
                      <div className="flex items-center space-x-1 mt-1">
                        <TrendingUp size={10} className="text-[#39FF14]" />
                        <span className="text-[9px] font-bold text-[#39FF14] uppercase tracking-widest">Trend {feed.trend}</span>
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/5 opacity-40 group-hover:opacity-100 group-hover:bg-[#00F0FF]/10 transition-all">
                      <ChevronRight size={14} className="group-hover:text-[#00F0FF]" />
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <motion.div variants={itemVariants} className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 px-1">System Hub</h3>
            <div className="grid grid-cols-1 gap-3">
              {PROTOCOLS.map((p) => (
                <button 
                  key={p.id} 
                  onClick={() => onNavigate(p.id as any)}
                  className="flex items-center p-5 glass-premium rounded-2xl border-white/5 hover:border-[#00F0FF]/20 transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mr-5 group-hover:scale-110 group-hover:bg-[#00F0FF]/10 transition-all">
                    <p.icon size={22} style={{ color: isLightMode ? '#991b1b' : p.color }} strokeWidth={2} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[12px] font-black text-white uppercase tracking-wider leading-none mb-1">{p.label}</p>
                    <p className="text-[8px] text-white/20 font-black uppercase tracking-widest">{p.sub}</p>
                  </div>
                  <ChevronRight size={14} className="text-white/10 group-hover:text-[#00F0FF]" />
                </button>
              ))}
            </div>
          </motion.div>

          <motion.div variants={itemVariants}>
            <div className="relative p-[1px] rounded-3xl overflow-hidden bg-gradient-to-br from-[#00F0FF]/60 via-[#00F0FF]/10 to-transparent">
              <div className="bg-[#020617] p-8 rounded-[23px] flex flex-col items-center text-center space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-[#00F0FF]/20 blur-2xl rounded-full" />
                  <Crown size={42} className="text-[#00F0FF] relative z-10 drop-shadow-[0_0_15px_rgba(0,240,255,0.6)]" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-heading text-4xl text-white tracking-tighter uppercase leading-none">ELITE SQUADRON</h3>
                  <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] max-w-[180px] mx-auto">
                    Unlock tactical superiority and global telemetry.
                  </p>
                </div>
                <MotionButton 
                  onClick={onUpgrade} 
                  className="bg-[#00F0FF] text-black w-full !rounded-xl font-black text-[10px] py-4 shadow-[0_0_20px_#00F0FF44]"
                >
                  AUTHORIZE UPGRADE
                </MotionButton>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Ticker Feed */}
      <motion.div 
        variants={itemVariants}
        className="fixed bottom-24 left-0 right-0 bg-black/40 backdrop-blur-md border-y border-white/5 py-3 overflow-hidden z-40"
      >
        <div className="flex whitespace-nowrap animate-marquee">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex space-x-12 px-6">
              <span className="text-[9px] font-black text-[#00F0FF] uppercase tracking-[0.2em]">â¡ NEW TOURNAMENT: Kanpur Monsoon Bash registration closing in 48h</span>
              <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">|</span>
              <span className="text-[9px] font-black text-[#39FF14] uppercase tracking-[0.2em]">ð VENUE UPDATE: Royal Turf Arena sync complete</span>
              <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">|</span>
              <span className="text-[9px] font-black text-[#00F0FF] uppercase tracking-[0.2em]">ð ANALYTICS: Your Impact Score increased by +1.2 pts</span>
            </div>
          ))}
        </div>
      </motion.div>

      <style>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-33.33%); } }
        .animate-marquee { animation: marquee 30s linear infinite; }
      `}</style>
    </motion.div>
  );
};

export default Dugout;
