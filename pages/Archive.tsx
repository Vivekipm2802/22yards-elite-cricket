// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, Star, Calendar, Zap, Award, Target, Crown,
  TrendingUp, History, Info, Smartphone, Cloud, Users, ShieldCheck,
  ChevronRight, ChevronLeft, X, Swords, Disc, User, Hash, Download
} from 'lucide-react';
import GlassCard from '../components/GlassCard';
import MotionButton from '../components/MotionButton';
import { fetchPlayerByPhone } from '../lib/supabase';

const Archive: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'MATCHES' | 'SQUADS'>('MATCHES');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [viewingMatch, setViewingMatch] = useState<any | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [vaultInfo, setVaultInfo] = useState({ name: '', phone: '' });

  useEffect(() => {
    const savedData = localStorage.getItem('22YARDS_USER_DATA');
    if (savedData) {
      const user = JSON.parse(savedData);
      const globalVault = JSON.parse(localStorage.getItem('22YARDS_GLOBAL_VAULT') || '{}');
      const vaultData = globalVault[user.phone];

      // FIX (Bug 2): merge cloud archive_vault so guests who signed up after a match
      // (or log in on a new device) still see their match history.
      const localHist = vaultData?.history || [];
      fetchPlayerByPhone(user.phone).then(cloudProfile => {
        const cloudHist = (cloudProfile?.archive_vault && Array.isArray(cloudProfile.archive_vault))
          ? cloudProfile.archive_vault : [];
        const seen = new Set();
        const merged = [...cloudHist, ...localHist].filter(m => {
          if (!m?.id || seen.has(m.id)) return false;
          seen.add(m.id); return true;
        });
        setHistory(merged);
      }).catch(() => setHistory(localHist));

      if (vaultData) {
        const hist = vaultData.history || [];
        // history state already set above via cloud merge; skip setHistory(hist)
        
        // Sync team names if registered ID matches a match ID context
        let rawTeams = vaultData.teams || [];
        
        // If no explicit teams are registered, extract unique squads from match history
        if (rawTeams.length === 0 && hist.length > 0) {
          const uniqueTeamsMap = new Map();
          hist.forEach(m => {
            if (m.fullScorecard) {
              // Extract batting team (innings-1 batting team)
              if (m.fullScorecard.battingTeam) {
                const tName = m.fullScorecard.battingTeam.name;
                if (!uniqueTeamsMap.has(tName)) {
                  uniqueTeamsMap.set(tName, {
                    id: m.id,
                    name: tName,
                    players: m.fullScorecard.battingTeam.squad
                  });
                }
              }
              // B-13 fix: also extract bowling team so both teams appear in Squads tab
              if (m.fullScorecard.bowlingTeam) {
                const bName = m.fullScorecard.bowlingTeam.name;
                if (!uniqueTeamsMap.has(bName)) {
                  uniqueTeamsMap.set(bName, {
                    id: m.id + '_bowl',
                    name: bName,
                    players: m.fullScorecard.bowlingTeam.squad
                  });
                }
              }
            }
          });
          rawTeams = Array.from(uniqueTeamsMap.values());
        }

        const syncedTeams = rawTeams.map(team => {
           // Look for this team reference in historical match scorecard for name/roster refresh
           const matchingMatch = hist.find(m => m.id === team.id);
           if (matchingMatch && matchingMatch.fullScorecard) {
              const matchedName = matchingMatch.fullScorecard.battingTeam.name;
              return { 
                ...team, 
                name: matchedName || team.name,
                players: matchingMatch.fullScorecard.battingTeam.squad || team.players
              };
           }
           return team;
        });
        
        setTeams(syncedTeams);
        setVaultInfo({ name: vaultData.name, phone: user.phone });
      }
    }
  }, []);

  return (
    <div className="h-full bg-black text-white overflow-hidden flex flex-col relative">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Vault Status Bar */}
        <div className="px-6 pt-6 flex items-center justify-between shrink-0">
           <div className="flex items-center space-x-3 bg-[#39FF14]/5 border border-[#39FF14]/20 px-4 py-2 rounded-full">
              <Cloud size={14} className="text-[#39FF14]" />
              <span className="text-[9px] font-black text-[#39FF14] uppercase tracking-widest">
             {isSyncing ? 'â³ SYNCING...' : `Vault: +91 ${vaultInfo.phone}`}
           </span>
           </div>
        </div>

        <section className="p-6 pt-8 space-y-8 flex-1 flex flex-col overflow-hidden">
          <div className="space-y-1 shrink-0">
            <h2 className="font-heading text-6xl tracking-tighter uppercase leading-none">ARCHIVE</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Career Repository</p>
          </div>

          {/* Tab Selection */}
          <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 shrink-0">
            <button 
              onClick={() => setActiveTab('MATCHES')}
              className={`flex-1 py-4 rounded-xl text-[10px] font-black tracking-widest transition-all ${activeTab === 'MATCHES' ? 'bg-white text-black shadow-lg' : 'text-white/20'}`}
            >
              BATTLES
            </button>
            <button 
              onClick={() => setActiveTab('SQUADS')}
              className={`flex-1 py-4 rounded-xl text-[10px] font-black tracking-widest transition-all ${activeTab === 'SQUADS' ? 'bg-white text-black shadow-lg' : 'text-white/20'}`}
            >
              SQUADS
            </button>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
            <AnimatePresence mode="wait">
              {activeTab === 'MATCHES' ? (
                <motion.div key="matches" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                   {history.length === 0 ? (
                     <EmptyState icon={History} label="No Battles Recorded" />
                   ) : (
                     history.map((match) => (
                       <motion.div
                        key={match.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setViewingMatch(match)}
                        className="cursor-pointer"
                       >
                         <GlassCard className="p-5 border-white/5 hover:border-[#00F0FF]/30 transition-all">
                            <div className="flex items-center justify-between">
                               <div className="flex items-center space-x-3 flex-1 min-w-0">
                                  <div className={`w-1.5 h-14 rounded-full ${match.result === 'WON' ? 'bg-[#39FF14]' : match.result === 'TIED' ? 'bg-[#FFD600]' : 'bg-[#FF003C]'} opacity-60 shrink-0`} />
                                  <div className="flex-1 min-w-0">
                                     <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">{match.date}</p>
                                     <h4 className="font-heading text-2xl tracking-tight leading-tight uppercase truncate">vs {match.opponent}</h4>
                                     {/* Team scores side-by-side */}
                                     {(match.myTeamScore !== undefined) ? (
                                       <div className="flex items-center space-x-2 mt-1">
                                         <span className="font-numbers text-sm font-black text-white">{match.myTeamScore}/{match.myTeamWickets ?? ''}</span>
                                         <span className="text-[8px] text-white/20 font-bold">({match.myTeamOvers ?? ''})</span>
                                         <span className="text-white/20 text-[9px]">vs</span>
                                         <span className="font-numbers text-sm font-black text-white/60">{match.oppTeamScore}/{match.oppTeamWickets ?? ''}</span>
                                         <span className="text-[8px] text-white/20 font-bold">({match.oppTeamOvers ?? ''})</span>
                                       </div>
                                     ) : (
                                       <p className="text-[9px] text-white/20 font-bold mt-0.5">Score: {match.runs} runs</p>
                                     )}
                                  </div>
                               </div>
                               <div className="text-right shrink-0 ml-2">
                                  <span className={`text-[9px] font-black px-2 py-1 rounded-full border ${match.result === 'WON' ? 'text-[#39FF14] border-[#39FF14]/30 bg-[#39FF14]/10' : match.result === 'TIED' ? 'text-[#FFD600] border-[#FFD600]/30 bg-[#FFD600]/10' : 'text-[#FF003C] border-[#FF003C]/30 bg-[#FF003C]/10'} uppercase tracking-[0.2em]`}>{match.result}</span>
                               </div>
                            </div>
                         </GlassCard>
                       </motion.div>
                     ))
                   )}
                </motion.div>
              ) : (
                <motion.div key="teams" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                   {teams.length === 0 ? (
                     <EmptyState icon={Users} label="No Registered Squads" />
                   ) : (
                     teams.map((team) => (
                       <div key={team.id} className="space-y-2">
                         <motion.button 
                           onClick={() => setExpandedTeamId(expandedTeamId === team.id ? null : team.id)}
                           className="w-full text-left outline-none"
                         >
                           <GlassCard className={`p-6 border-white/5 hover:bg-white/[0.03] transition-all ${expandedTeamId === team.id ? 'border-[#00F0FF]/30 bg-white/[0.03]' : ''}`}>
                              <div className="flex justify-between items-center">
                                 <div className="flex items-center space-x-4">
                                    <div className="w-12 h-12 rounded-xl bg-black border border-white/10 flex items-center justify-center font-heading text-xl text-[#00F0FF]">
                                      {team.name.charAt(0)}
                                    </div>
                                    <div>
                                      <h4 className="font-heading text-3xl uppercase tracking-tighter leading-none">{team.name}</h4>
                                      <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mt-1">Operational Squadron</p>
                                    </div>
                                 </div>
                                 <div className="flex items-center space-x-3">
                                    <div className="text-right">
                                      <p className="font-numbers text-lg font-black text-white">{team.players?.length || 0}</p>
                                      <p className="text-[7px] font-black text-white/20 uppercase">Athletes</p>
                                    </div>
                                    <ChevronRight size={14} className={`text-white/20 transition-transform ${expandedTeamId === team.id ? 'rotate-90 text-[#00F0FF]' : ''}`} />
                                 </div>
                              </div>
                           </GlassCard>
                         </motion.button>
                         
                         <AnimatePresence>
                           {expandedTeamId === team.id && (
                             <motion.div 
                               initial={{ height: 0, opacity: 0 }}
                               animate={{ height: 'auto', opacity: 1 }}
                               exit={{ height: 0, opacity: 0 }}
                               className="overflow-hidden px-2"
                             >
                               <div className="p-4 bg-[#111] rounded-2xl border border-white/5 space-y-2 mb-2">
                                 <p className="text-[8px] font-black text-[#00F0FF] uppercase tracking-[0.4em] mb-4 text-center">ACTIVE SQUADRON ROSTER</p>
                                 {(team.players || [])?.map((p: any, i: number) => (
                                   <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/5">
                                      <div className="flex items-center space-x-3">
                                         <div className="w-8 h-8 rounded-lg bg-black border border-white/10 flex items-center justify-center">
                                            {p.isCaptain ? <Crown size={12} className="text-[#FFD600]" /> : <User size={12} className="text-white/20" />}
                                         </div>
                                         <div className="flex flex-col">
                                            <span className="text-xs font-black text-white uppercase tracking-tight">{p.name}</span>
                                            <span className="text-[7px] font-bold text-[#00F0FF] uppercase tracking-widest">
                                               {p.isCaptain ? 'Captain' : (p.isWicketKeeper ? 'Wicket Keeper' : 'Player')}
                                            </span>
                                         </div>
                                      </div>
                                      <div className="flex items-center text-white/30 space-x-1">
                                         <Smartphone size={8} />
                                         <span className="font-numbers text-[10px] font-bold">{p.phone ? `+91 ${p.phone.slice(-4).padStart(p.phone.length, '*')} ` : 'HIDDEN'}</span>
                                      </div>
                                   </div>
                                 ))}
                               </div>
                             </motion.div>
                           )}
                         </AnimatePresence>
                       </div>
                     ))
                   )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>

      <AnimatePresence>
        {viewingMatch && (
          <ScorecardView 
            match={viewingMatch} 
            onBack={() => setViewingMatch(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const generateScorecardPDF = async (match: any) => {
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // ââ Layout constants âââââââââââââââââââââââââââââââââââââââââââââââââââââ
    const W = 210, PL = 12, PR = 12, CW = W - PL - PR;

    // ââ Color palette ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    const RED:    [number,number,number] = [204, 16,  16];
    const DKRED:  [number,number,number] = [30,  40,  70];
    const PURPLE: [number,number,number] = [50,  50,  80];
    const DARK:   [number,number,number] = [15,  23,  42];
    const MUTED:  [number,number,number] = [100, 116, 139];
    const WHITE:  [number,number,number] = [255, 255, 255];
    const ALTBG:  [number,number,number] = [232, 236, 244];
    const GOLD:   [number,number,number] = [140, 100,  10];

    let y = 0;

    const checkPage = (need = 20) => {
      if (y + need > 282) { doc.addPage(); y = 14; }
    };

    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // HEADER BAND
    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    doc.setFillColor(...RED);
    doc.rect(0, 0, W, 30, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
    doc.text('22YARDS', PL, 13);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('OFFICIAL MATCH SCORECARD', PL, 20);
    const dateStr = match.date
      ? new Date(match.date).toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
      : '';
    doc.setFontSize(7.5);
    doc.text(dateStr, W - PR, 20, { align: 'right' });
    y = 38;

    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // MATCH HEADER â teams + result
    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    const sc   = match.fullScorecard;
    const tA   = sc?.battingTeam?.name  || 'TEAM A'; // inn-1 batting team
    const tB   = sc?.bowlingTeam?.name  || 'TEAM B'; // inn-1 bowling team

    doc.setFillColor(...DARK);
    doc.rect(PL, y, CW, 22, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text(tA, PL + 4, y + 9);
    doc.setFontSize(9); doc.setTextColor(180, 180, 180);
    doc.text('vs', W / 2, y + 9, { align: 'center' });
    doc.setFontSize(13); doc.setTextColor(...WHITE);
    doc.text(tB, W - PR - 4, y + 9, { align: 'right' });

    const resultLine = sc?.matchResult || (match.result ? `Result: ${match.result}` : '');
    doc.setFontSize(8); doc.setFont('helvetica', 'italic');
    doc.setTextColor(255, 195, 195);
    doc.text(resultLine, W / 2, y + 18, { align: 'center' });
    y += 28;

    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // MATCH AWARDS
    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    if (sc?.awards) {
      checkPage(20);
      doc.setFillColor(255, 248, 215);
      doc.rect(PL, y, CW, 18, 'F');
      // left accent stripe
      doc.setFillColor(...RED);
      doc.rect(PL, y, 2.5, 18, 'F');

      const aw = sc.awards;
      const aCol = CW / 3;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
      doc.setTextColor(...GOLD);
      doc.text('MATCH AWARDS', PL + 6, y + 5);

      const drawAward = (icon: string, label: string, value: string, xOff: number) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
        doc.setTextColor(...GOLD);
        doc.text(icon + ' ' + label, PL + xOff + 4, y + 10.5);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.setTextColor(...DARK);
        doc.text(value || '-', PL + xOff + 4, y + 15.5);
      };

      drawAward('BAT', 'BEST BATSMAN', aw.bestBatsman ? `${aw.bestBatsman.name}  ${aw.bestBatsman.stat}` : '-', 0);
      drawAward('BWL', 'BEST BOWLER',  aw.bestBowler  ? `${aw.bestBowler.name}  ${aw.bestBowler.stat}`  : '-', aCol);
      drawAward('MVP', 'MVP',          aw.mvp         ? aw.mvp.name                                     : '-', aCol * 2);
      y += 24;
    }

    if (!sc) {
      doc.setTextColor(...MUTED); doc.setFontSize(10);
      doc.text('No detailed scorecard available.', W / 2, y + 15, { align: 'center' });
      doc.save(`22YARDS_${(match.opponent||'Match').replace(/\s+/g,'_')}.pdf`);
      return;
    }

    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // SECTION HEADER helper
    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    const sectionHeader = (title: string, bgColor: [number,number,number]) => {
      checkPage(14);
      doc.setFillColor(...bgColor);
      doc.rect(PL, y, CW, 8, 'F');
      doc.setTextColor(...WHITE);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.text(title, PL + 3, y + 5.5);
      y += 10;
    };

    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // BATTING TABLE
    // Cols: Batter(40) | Dismissal(60) | R(12) | B(12) | 4s(10) | 6s(10) | SR(12) â 156 out of CW=186
    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    const BAT_COLS = [
      { h: 'BATTER',    w: 40, align: 'left'  },
      { h: 'DISMISSAL', w: 60, align: 'left'  },
      { h: 'R',         w: 13, align: 'right' },
      { h: 'B',         w: 13, align: 'right' },
      { h: '4s',        w: 12, align: 'right' },
      { h: '6s',        w: 12, align: 'right' },
      { h: 'SR',        w: 14, align: 'right' },
    ];

    const drawBatting = (title: string, squad: any[], extras: any, total: any) => {
      sectionHeader(title, RED);

      // Column header row
      doc.setFillColor(...ALTBG);
      doc.rect(PL, y, CW, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...MUTED);
      let cx = PL + 2;
      BAT_COLS.forEach(col => {
        if (col.align === 'right') doc.text(col.h, cx + col.w - 2, y + 4.2, { align: 'right' });
        else doc.text(col.h, cx, y + 4.2);
        cx += col.w;
      });
      y += 7;

      // Player rows
      squad.forEach((p, ri) => {
        checkPage(8);
        const isEven = ri % 2 === 0;
        doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
        doc.rect(PL, y, CW, 7.5, 'F');

        const sr    = (p.balls || 0) > 0 ? (((p.runs||0) / (p.balls||1)) * 100).toFixed(1) : '-';
        const dism  = p.outDetail || ((p.balls||0) > 0 ? 'not out' : 'dnb');
        const isBig = (p.runs || 0) >= 30;

        cx = PL + 2;
        doc.setFont('helvetica', isBig ? 'bold' : 'normal'); doc.setFontSize(7); doc.setTextColor(...DARK);
        doc.text(String(p.name||'').slice(0, 18), cx, y + 5);
        cx += BAT_COLS[0].w;

        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...MUTED);
        doc.text(String(dism).slice(0, 32), cx, y + 5);
        cx += BAT_COLS[1].w;

        doc.setFont('helvetica', isBig ? 'bold' : 'normal'); doc.setFontSize(7); doc.setTextColor(...DARK);
        doc.text(String(p.runs||0), cx + BAT_COLS[2].w - 2, y + 5, { align: 'right' });
        cx += BAT_COLS[2].w;

        doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
        doc.text(String(p.balls||0), cx + BAT_COLS[3].w - 2, y + 5, { align: 'right' });
        cx += BAT_COLS[3].w;

        doc.setTextColor(...DARK);
        doc.text(String(p.fours||0), cx + BAT_COLS[4].w - 2, y + 5, { align: 'right' });
        cx += BAT_COLS[4].w;

        doc.text(String(p.sixes||0), cx + BAT_COLS[5].w - 2, y + 5, { align: 'right' });
        cx += BAT_COLS[5].w;

        doc.setTextColor(...MUTED);
        doc.text(sr, cx + BAT_COLS[6].w - 2, y + 5, { align: 'right' });
        y += 7.5;
      });

      // Extras row
      if (extras) {
        checkPage(8);
        doc.setFillColor(240, 244, 248);
        doc.rect(PL, y, CW, 7, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...MUTED);
        doc.text('Extras', PL + 2, y + 4.8);
        const extStr = `(B ${extras.byes||0}, LB ${extras.legByes||0}, WD ${extras.wides||0}, NB ${extras.noBalls||0}, P ${extras.penalties||0})`;
        doc.text(extStr, PL + 44, y + 4.8);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...DARK);
        doc.text(String(extras.total||0), W - PR - 2, y + 4.8, { align: 'right' });
        y += 7;
      }

      // Innings total row
      if (total) {
        checkPage(9);
        doc.setFillColor(...DARK);
        doc.rect(PL, y, CW, 9, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...WHITE);
        doc.text('TOTAL', PL + 3, y + 6);
        const ovStr = `${Math.floor((total.balls||0)/6)}.${(total.balls||0)%6}`;
        const rr = (total.balls||0) > 0 ? ((total.runs||0) / ((total.balls||1)/6)).toFixed(2) : '0.00';
        doc.text(`${total.runs||0}-${total.wickets||0}  (${ovStr} ov)  RR: ${rr}`, W - PR - 2, y + 6, { align: 'right' });
        y += 13;
      } else {
        y += 4;
      }
    };

    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // BOWLING TABLE
    // Cols: Bowler(64) | O(20) | M(16) | R(18) | W(14) | ER(18)
    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    const BWL_COLS = [
      { h: 'BOWLER', w: 64, align: 'left'  },
      { h: 'O',      w: 20, align: 'right' },
      { h: 'M',      w: 16, align: 'right' },
      { h: 'R',      w: 18, align: 'right' },
      { h: 'W',      w: 14, align: 'right' },
      { h: 'ER',     w: 18, align: 'right' },
    ];

    const drawBowling = (title: string, squad: any[]) => {
      const bowlers = squad.filter(p => (p.balls_bowled||p.ballsBowled||0) > 0 || (p.wickets||0) > 0);
      if (bowlers.length === 0) return;

      sectionHeader(title, DKRED);

      doc.setFillColor(...ALTBG);
      doc.rect(PL, y, CW, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...MUTED);
      let cx = PL + 2;
      BWL_COLS.forEach(col => {
        if (col.align === 'right') doc.text(col.h, cx + col.w - 2, y + 4.2, { align: 'right' });
        else doc.text(col.h, cx, y + 4.2);
        cx += col.w;
      });
      y += 7;

      bowlers.forEach((p, ri) => {
        checkPage(8);
        const isEven = ri % 2 === 0;
        doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
        doc.rect(PL, y, CW, 7.5, 'F');

        const bb  = p.balls_bowled || p.ballsBowled || 0;
        const rc  = p.runs_conceded || p.runsConceded || 0;
        const ov  = `${Math.floor(bb/6)}.${bb%6}`;
        const mai = p.maidens || 0;
        const er  = bb > 0 ? (rc / bb * 6).toFixed(2) : '-';
        const haul = (p.wickets||0) >= 3;

        cx = PL + 2;
        doc.setFont('helvetica', haul ? 'bold' : 'normal'); doc.setFontSize(7); doc.setTextColor(...DARK);
        doc.text(String(p.name||'').slice(0,24), cx, y + 5);
        cx += BWL_COLS[0].w;

        doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
        doc.text(ov, cx + BWL_COLS[1].w - 2, y + 5, { align: 'right' }); cx += BWL_COLS[1].w;
        doc.text(String(mai), cx + BWL_COLS[2].w - 2, y + 5, { align: 'right' }); cx += BWL_COLS[2].w;

        doc.setTextColor(...DARK);
        doc.text(String(rc), cx + BWL_COLS[3].w - 2, y + 5, { align: 'right' }); cx += BWL_COLS[3].w;

        // Wickets â red if any
        doc.setFont('helvetica', (p.wickets||0) > 0 ? 'bold' : 'normal');
        doc.setTextColor(...((p.wickets||0) > 0 ? RED : MUTED));
        doc.text(String(p.wickets||0), cx + BWL_COLS[4].w - 2, y + 5, { align: 'right' }); cx += BWL_COLS[4].w;

        doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
        doc.text(er, cx + BWL_COLS[5].w - 2, y + 5, { align: 'right' });
        y += 7.5;
      });
      y += 4;
    };

    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // FALL OF WICKETS TABLE
    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    const drawFoW = (title: string, fow: any[]) => {
      if (!fow || fow.length === 0) return;
      sectionHeader(title, PURPLE);

      doc.setFillColor(...ALTBG);
      doc.rect(PL, y, CW, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...MUTED);
      doc.text('#',       PL + 2,  y + 4.2);
      doc.text('BATTER',  PL + 14, y + 4.2);
      doc.text('SCORE',   PL + 90, y + 4.2);
      doc.text('OVER',    PL + 120, y + 4.2);
      y += 7;

      fow.forEach((wkt, ri) => {
        checkPage(8);
        const isEven = ri % 2 === 0;
        doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
        doc.rect(PL, y, CW, 7, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(String(ri + 1), PL + 2, y + 4.8);
        doc.setTextColor(...DARK);
        doc.text(String(wkt.batterName||'').slice(0, 26), PL + 14, y + 4.8);
        doc.setTextColor(...MUTED);
        doc.text(String(wkt.score), PL + 90, y + 4.8);
        doc.text(String(wkt.over),  PL + 120, y + 4.8);
        y += 7;
      });
      y += 5;
    };

    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // RENDER INN-1
    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    const inn1Total = sc.inn1Total || { runs: match.myTeamScore||0, wickets: match.myTeamWickets||0, balls: 0 };
    const inn2Total = sc.inn2Total || { runs: match.oppTeamScore||0, wickets: match.oppTeamWickets||0, balls: 0 };

    drawBatting(`BATTING â ${tA}  (INN 1)`, sc.battingTeam?.squad || [], sc.inn1Extras, inn1Total);
    drawBowling(`BOWLING â ${tB}  (INN 1)`, sc.bowlingTeam?.squad || []);
    drawFoW(`FALL OF WICKETS â ${tA}  (INN 1)`, sc.inn1FoW || []);

    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // RENDER INN-2
    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    drawBatting(`BATTING â ${tB}  (INN 2)`, sc.bowlingTeam?.squad || [], sc.inn2Extras, inn2Total);
    drawBowling(`BOWLING â ${tA}  (INN 2)`, sc.battingTeam?.squad || []);
    drawFoW(`FALL OF WICKETS â ${tB}  (INN 2)`, sc.inn2FoW || []);

    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // PAGE FOOTERS
    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    const total = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
      doc.text(`Generated by 22YARDS Cricket App  Â·  Page ${i} of ${total}`, W / 2, 292, { align: 'center' });
    }

    doc.save(`22YARDS_${(match.opponent||'Match').replace(/\s+/g,'_')}_${new Date().toLocaleDateString('en-IN').replace(/\//g,'-')}.pdf`);
  } catch (e) {
    console.error('PDF generation failed:', e);
    alert('PDF generation failed. Please try again.');
  }
};

const ScorecardView = ({ match, onBack }) => {
  const [scTab, setScTab] = useState<'PERSONAL' | 'TEAM_A' | 'TEAM_B'>('PERSONAL');
  const scorecard = match.fullScorecard || null;
  const target = match.targetScore || match.target || (match.innings1Score ? match.innings1Score + 1 : null);

  const getWicketDetailHistorical = (player) => {
    if (player.outDetail) return player.outDetail;
    if ((player.balls || 0) > 0) return 'not out';
    return 'dnb';
  };

  return (
    <motion.div 
      initial={{ x: '100%' }} 
      animate={{ x: 0 }} 
      exit={{ x: '100%' }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-[2000] bg-[#050505] flex flex-col"
    >
      <div className="h-16 flex items-center px-6 border-b border-white/5 bg-black shrink-0">
        <button onClick={onBack} className="p-2 -ml-2 text-[#00F0FF] hover:bg-white/5 rounded-full transition-all">
          <ChevronLeft size={20} />
        </button>
        <div className="ml-4 overflow-hidden flex-1">
           <h3 className="font-heading text-2xl uppercase tracking-widest italic truncate">vs {match.opponent}</h3>
           <p className="text-[8px] font-black text-white/30 uppercase tracking-[0.5em]">{match.date}</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => generateScorecardPDF(match)}
            className="p-2 text-white/40 hover:text-[#FF003C] transition-colors"
            title="Download PDF Scorecard"
          >
            <Download size={18} />
          </button>
          <div className={`px-3 py-1.5 rounded-full ${match.result === 'WON' ? 'bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/20' : match.result === 'TIED' ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/20' : 'bg-[#FF003C]/10 text-[#FF003C] border-[#FF003C]/20'} border text-[9px] font-black uppercase tracking-widest`}>
            {match.result}
          </div>
        </div>
      </div>

      {target && (
        <div className="px-6 py-6 bg-white/[0.02] border-b border-white/5 shrink-0 space-y-4">
           <div className="flex justify-between items-end">
              <div className="space-y-0.5">
                 <p className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em]">Chase Telemetry</p>
                 <h4 className="text-xl font-numbers font-black text-white">Target: {target}</h4>
              </div>
              <div className="text-right">
                 <p className="text-[10px] font-black text-[#39FF14] uppercase tracking-widest">Score: {match.runs}</p>
              </div>
           </div>
           <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-[#39FF14]/10 to-transparent" />
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (match.runs / target) * 100)}%` }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-[#39FF14] to-[#00F0FF] relative shadow-[0_0_15px_#39FF14]"
              />
           </div>
        </div>
      )}

      <div className="flex bg-black p-4 space-x-2 shrink-0 overflow-x-auto no-scrollbar border-b border-white/5">
        <ScTabBtn active={scTab === 'PERSONAL'} onClick={() => setScTab('PERSONAL')} icon={Target} label="PERSONAL IMPACT" />
        {scorecard && (
          <>
            <ScTabBtn active={scTab === 'TEAM_A'} onClick={() => setScTab('TEAM_A')} icon={Swords} label={scorecard.battingTeam.name} />
            <ScTabBtn active={scTab === 'TEAM_B'} onClick={() => setScTab('TEAM_B')} icon={Disc} label={scorecard.bowlingTeam.name} />
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 no-scrollbar pb-32">
        <AnimatePresence mode="wait">
          {scTab === 'PERSONAL' && (
            <motion.div key="personal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
               <div className="grid grid-cols-2 gap-4">
                  <StatBlock label="Runs Scored" value={match.runs} sub={`${match.ballsFaced || 0} Balls faced`} color="#00F0FF" />
                  <StatBlock label="Strike Rate" value={match.ballsFaced > 0 ? ((match.runs/match.ballsFaced)*100).toFixed(1) : '0.0'} sub="Personal Velocity" color="#39FF14" />
                  <StatBlock label="Wickets" value={match.wicketsTaken || 0} sub={`${match.runsConceded || 0} Runs conceded`} color="#FF003C" />
                  <StatBlock label="Economy" value={match.ballsBowled > 0 ? ((match.runsConceded/match.ballsBowled)*6).toFixed(2) : '0.00'} sub="Defense Factor" color="#FFD600" />
               </div>
               <GlassCard className="p-6 border-white/5 space-y-4">
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] mb-4">FIELDING TELEMETRY</p>
                  <div className="grid grid-cols-3 gap-4 text-center">
                     <div><p className="font-numbers text-3xl font-black">{match.catches || 0}</p><p className="text-[8px] font-bold text-white/20 uppercase">Catches</p></div>
                     <div><p className="font-numbers text-3xl font-black">{match.stumpings || 0}</p><p className="text-[8px] font-bold text-white/20 uppercase">Stumpings</p></div>
                     <div><p className="font-numbers text-3xl font-black">{match.runOuts || 0}</p><p className="text-[8px] font-bold text-white/20 uppercase">Run Outs</p></div>
                  </div>
               </GlassCard>
            </motion.div>
          )}
          {(scTab === 'TEAM_A' || scTab === 'TEAM_B') && scorecard && (
            <motion.div key={scTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-10">
              {scTab === 'TEAM_A' ? (
                /* ââ Inn-1 batting team: show their batting (inn-1) AND bowling (inn-2) ââ */
                <>
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-[#00F0FF] uppercase tracking-[0.4em]">BATTING â INN 1</h4>
                    <div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden">
                      <div className="grid grid-cols-5 p-4 border-b border-white/5 text-[8px] font-black uppercase text-white/40 tracking-widest">
                        <span className="col-span-2">Athlete</span><span>R</span><span>B</span><span className="text-right">4s/6s</span>
                      </div>
                      {scorecard.battingTeam.squad.map((p, i) => (
                        <div key={i} className="grid grid-cols-5 p-4 border-b border-white/5 last:border-0 items-center">
                          <div className="col-span-2 flex flex-col pr-2">
                            <span className="text-xs font-black uppercase truncate">{p.name}</span>
                            <span className="text-[8px] text-white/20 italic">{getWicketDetailHistorical(p)}</span>
                          </div>
                          <span className="font-numbers font-bold">{p.runs || 0}</span>
                          <span className="font-numbers text-white/30">{p.balls || 0}</span>
                          <span className="font-numbers text-[10px] text-white/30 text-right">{p.fours || 0}/{p.sixes || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Inn-2 bowling for this team */}
                  {scorecard.battingTeam.squad.filter(p => (p.balls_bowled || p.ballsBowled || 0) > 0 || (p.wickets || 0) > 0).length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black text-[#FF003C] uppercase tracking-[0.4em]">BOWLING â INN 2</h4>
                      <div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden">
                        <div className="grid grid-cols-5 p-4 border-b border-white/5 text-[8px] font-black uppercase text-white/40 tracking-widest">
                          <span className="col-span-2">Bowler</span><span>O</span><span>R</span><span className="text-right">W/Eco</span>
                        </div>
                        {scorecard.battingTeam.squad.filter(p => (p.balls_bowled || p.ballsBowled || 0) > 0 || (p.wickets || 0) > 0).map((p, i) => {
                          const bb = p.balls_bowled || p.ballsBowled || 0;
                          const rc = p.runs_conceded || p.runsConceded || 0;
                          const overs = `${Math.floor(bb / 6)}.${bb % 6}`;
                          const econ = bb > 0 ? (rc / bb * 6).toFixed(1) : '-';
                          return (
                            <div key={i} className="grid grid-cols-5 p-4 border-b border-white/5 last:border-0 items-center">
                              <div className="col-span-2 flex flex-col pr-2">
                                <span className="text-xs font-black uppercase truncate">{p.name}</span>
                                {p.maidens > 0 && <span className="text-[8px] text-[#39FF14]/60 uppercase tracking-widest">{p.maidens}M</span>}
                              </div>
                              <span className="font-numbers font-bold text-white/80">{overs}</span>
                              <span className="font-numbers text-white/30">{rc}</span>
                              <span className="font-numbers text-[10px] text-right">
                                <span className="text-[#FF003C]">{p.wickets || 0}</span>
                                <span className="text-white/30">/{econ}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* ââ Inn-1 bowling team: show their bowling (inn-1) AND batting (inn-2) ââ */
                <>
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-[#FF003C] uppercase tracking-[0.4em]">BOWLING â INN 1</h4>
                    <div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden">
                      <div className="grid grid-cols-5 p-4 border-b border-white/5 text-[8px] font-black uppercase text-white/40 tracking-widest">
                        <span className="col-span-2">Bowler</span><span>O</span><span>R</span><span className="text-right">W/Eco</span>
                      </div>
                      {scorecard.bowlingTeam.squad.filter(p => (p.balls_bowled || p.ballsBowled || 0) > 0 || (p.wickets || 0) > 0).map((p, i) => {
                        const bb = p.balls_bowled || p.ballsBowled || 0;
                        const rc = p.runs_conceded || p.runsConceded || 0;
                        const overs = `${Math.floor(bb / 6)}.${bb % 6}`;
                        const econ = bb > 0 ? (rc / bb * 6).toFixed(1) : '-';
                        return (
                          <div key={i} className="grid grid-cols-5 p-4 border-b border-white/5 last:border-0 items-center">
                            <div className="col-span-2 flex flex-col pr-2">
                              <span className="text-xs font-black uppercase truncate">{p.name}</span>
                              {p.maidens > 0 && <span className="text-[8px] text-[#39FF14]/60 uppercase tracking-widest">{p.maidens}M</span>}
                            </div>
                            <span className="font-numbers font-bold text-white/80">{overs}</span>
                            <span className="font-numbers text-white/30">{rc}</span>
                            <span className="font-numbers text-[10px] text-right">
                              <span className="text-[#FF003C]">{p.wickets || 0}</span>
                              <span className="text-white/30">/{econ}</span>
                            </span>
                          </div>
                        );
                      })}
                      {scorecard.bowlingTeam.squad.filter(p => (p.balls_bowled || p.ballsBowled || 0) > 0 || (p.wickets || 0) > 0).length === 0 && (
                        <div className="p-6 text-center text-[9px] text-white/20 uppercase tracking-widest">No bowling data recorded</div>
                      )}
                    </div>
                  </div>
                  {/* Inn-2 batting for this team */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-[#00F0FF] uppercase tracking-[0.4em]">BATTING â INN 2</h4>
                    <div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden">
                      <div className="grid grid-cols-5 p-4 border-b border-white/5 text-[8px] font-black uppercase text-white/40 tracking-widest">
                        <span className="col-span-2">Athlete</span><span>R</span><span>B</span><span className="text-right">4s/6s</span>
                      </div>
                      {scorecard.bowlingTeam.squad.map((p, i) => (
                        <div key={i} className="grid grid-cols-5 p-4 border-b border-white/5 last:border-0 items-center">
                          <div className="col-span-2 flex flex-col pr-2">
                            <span className="text-xs font-black uppercase truncate">{p.name}</span>
                            <span className="text-[8px] text-white/20 italic">{getWicketDetailHistorical(p)}</span>
                          </div>
                          <span className="font-numbers font-bold">{p.runs || 0}</span>
                          <span className="font-numbers text-white/30">{p.balls || 0}</span>
                          <span className="font-numbers text-[10px] text-white/30 text-right">{p.fours || 0}/{p.sixes || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-black/90 backdrop-blur-xl border-t border-white/5 z-[2100]">
         <MotionButton onClick={onBack} className="w-full bg-[#00F0FF] text-black !rounded-2xl !py-6 font-black tracking-[0.5em] text-[10px]">RETURN TO ARCHIVE</MotionButton>
      </div>
    </motion.div>
  );
};

const ScTabBtn = ({ active, onClick, icon: Icon, label }) => (
  <button onClick={onClick} className={`flex-shrink-0 flex items-center space-x-2 px-6 py-4 rounded-xl text-[10px] font-black tracking-widest transition-all ${active ? 'bg-white text-black shadow-lg shadow-white/5' : 'text-white/20 hover:text-white/40'}`}>
    <Icon size={12} /><span className="uppercase truncate max-w-[100px]">{label}</span>
  </button>
);

const StatBlock = ({ label, value, sub, color }) => (
  <GlassCard className="p-5 border-l-2" style={{ borderLeftColor: color }}>
     <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">{label}</p>
     <p className="font-numbers text-4xl font-black text-white leading-none mb-1">{value}</p>
     <p className="text-[8px] font-bold text-white/40 uppercase tracking-tighter">{sub}</p>
  </GlassCard>
);

const EmptyState = ({ icon: Icon, label }: { icon: any, label: string }) => (
  <div className="flex flex-col items-center justify-center py-20 px-12 text-center bg-[#050505] border-2 border-dashed border-white/5 rounded-[40px] opacity-40">
     <Icon size={48} className="mb-6 text-white/20" />
     <p className="font-heading text-2xl uppercase tracking-[0.4em] leading-tight">{label}</p>
  </div>
);

export default Archive;
