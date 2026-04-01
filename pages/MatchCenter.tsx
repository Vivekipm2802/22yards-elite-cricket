// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { 
  ChevronLeft, Swords, Plus, Minus, Check, Zap, X, 
  Undo2, Disc, User, Trash2, ArrowRight,
  CheckCircle2, Target, Shield, Flame, Activity, Trophy, Share2,
  TrendingUp, BarChart2, Users, Star, Award, 
  ArrowUpRight, Clock, MapPin, UserPlus, UserCheck,
  ClipboardList, Search, RefreshCcw, ShieldAlert, Camera, HelpCircle,
  LayoutDashboard, PieChart, ZapOff, Calendar, Crown, Settings, Image as ImageIcon, Save,
  ChevronRight, Smartphone, Medal, Zap as Bolt, Crosshair, Edit2, Upload,
  ArrowLeftRight, History
} from 'lucide-react';
import MotionButton from '../components/MotionButton';
import { MatchState, Player, TeamID, PlayerID, BallEvent } from '../types';
import { useAuth } from '../AuthContext';
import { syncMatchToSupabase, saveMatchRecord, upsertPlayer, generatePlayerId, buildStatsFromHistory, pushLiveMatchState, supabase } from '../lib/supabase';

const CYBER_COLORS = {
  bg: '#050505',
  surface: '#121212',
  cyan: '#00F0FF',
  red: '#FF003C',
  purple: '#BC13FE',
  gold: '#FFD600',
  green: '#39FF14',
  grey: '#1A1A1A',
  teal: '#4DB6AC',
  textDim: '#666666',
  orange: '#FF6D00'
};

const GloveIcon = ({ size = 20, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M16 11V6a2 2 0 0 0-4 0v5" />
    <path d="M12 10V4a2 2 0 0 0-4 0v6" />
    <path d="M8 10V6a2 2 0 0 0-4 0v10" />
    <path d="M16 8a2 2 0 1 1 4 0v7a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7V11" />
    <path d="M19 14h2" />
  </svg>
);

const KeypadButton = ({ children, onClick, color = 'white', border = 'transparent', bg = CYBER_COLORS.grey, span = 1, active = false, disabled = false }) => (
  <motion.button
    whileTap={!disabled ? { scale: 0.94 } : {}}
    onClick={!disabled ? onClick : undefined}
    style={{ 
      backgroundColor: active ? CYBER_COLORS.cyan + '22' : bg,
      borderColor: active ? CYBER_COLORS.cyan : border,
      color: active ? CYBER_COLORS.cyan : color,
      gridColumn: `span ${span}`,
      opacity: disabled ? 0.3 : 1
    }}
    className={`h-14 sm:h-16 rounded-xl border-2 flex items-center justify-center font-numbers text-xl sm:text-2xl font-black shadow-lg transition-all ${active ? 'animate-pulse' : ''}`}
  >
    {children}
  </motion.button>
);

const MatchCenter: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { userData } = useAuth();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [activeLogoTeamId, setActiveLogoTeamId] = useState<TeamID | null>(null);
  
  function createInitialState(): MatchState {
    return {
      matchId: `M-${Date.now()}`,
      status: 'CONFIG',
      currentInnings: 1,
      toss: { winnerId: null, decision: null },
      config: { 
        overs: 5, oversPerBowler: 1, ballType: 'TENNIS', matchType: 'LIMITED_OVERS', pitchType: 'TURF',
        city: 'Kanpur', ground: '', wagonWheel: true,
        powerPlay: 2,
        dateTime: new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
      },
      teams: {
        teamA: { id: 'A', name: 'TEAM A', city: '', squad: [], logo: '', resolutionMode: 'NEW', resolutionHandled: false },
        teamB: { id: 'B', name: 'TEAM B', city: '', squad: [], logo: '', resolutionMode: 'NEW', resolutionHandled: false },
        battingTeamId: 'A', bowlingTeamId: 'B',
      },
      liveScore: { runs: 0, wickets: 0, balls: 0 },
      crease: { strikerId: null, nonStrikerId: null, bowlerId: null, previousBowlerId: null },
      history: [],
    };
  }

  const [match, setMatch] = useState<MatchState>(() => {
    const saved = localStorage.getItem('22YARDS_ACTIVE_MATCH');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.status === 'COMPLETED') {
        return createInitialState();
      }
      return parsed;
    }
    return createInitialState();
  });

  const [status, setStatus] = useState<string>(match.status === 'COMPLETED' ? 'SUMMARY' : match.status);
  const [summaryTab, setSummaryTab] = useState<'OVERVIEW' | 'ANALYTICS' | 'SCORECARD'>('OVERVIEW');
  const [overlayAnim, setOverlayAnim] = useState<'FOUR' | 'SIX' | 'WICKET' | 'FREE_HIT' | 'INNINGS_BREAK' | null>(null);
  const [winnerTeam, setWinnerTeam] = useState<{name: string, id: TeamID | null, margin: string} | null>(null);
  const [selectionTarget, setSelectionTarget] = useState<'STRIKER' | 'NON_STRIKER' | 'BOWLER' | 'NEW_BATSMAN' | 'NEXT_BOWLER' | 'FIELDER' | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<TeamID | null>(null);
  const [showLiveScorecard, setShowLiveScorecard] = useState(false);
  const [pendingExtra, setPendingExtra] = useState<'WD' | 'NB' | 'BYE' | 'LB' | null>(null); // B-04: added LB
  const [wicketWizard, setWicketWizard] = useState<{ open: boolean, type?: string }>({ open: false });
  const [newName, setNewName] = useState('');
  const [phoneQuery, setPhoneQuery] = useState('');
  const [editingTeamNameId, setEditingTeamNameId] = useState<TeamID | null>(null);

  // Share scorecard
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareText, setShareText] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

  // QR Scanner
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [qrScanStatus, setQrScanStatus] = useState<'SCANNING' | 'SUCCESS' | 'ERROR'>('SCANNING');
  const [qrScanError, setQrScanError] = useState('');
  const qrVideoRef = useRef<HTMLVideoElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrStreamRef = useRef<MediaStream | null>(null);
  const qrAnimRef = useRef<number | null>(null);

  // Transfer Scoring / Live Broadcast
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTab, setTransferTab] = useState<'HANDOFF' | 'BROADCAST'>('HANDOFF');
  const [handoffQRUrl, setHandoffQRUrl] = useState<string | null>(null);
  const [broadcastQRUrl, setBroadcastQRUrl] = useState<string | null>(null);
  const [transferLinkCopied, setTransferLinkCopied] = useState(false);
  // lastPushRef removed â push every ball immediately for real-time broadcast

  // Player ID search dropdown
  const [playerDropdownList, setPlayerDropdownList] = useState<Array<{id: string, name: string, phone: string}>>([]);
  const [selectedVaultPlayer, setSelectedVaultPlayer] = useState<{id: string, name: string, phone: string} | null>(null);
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  
  const [squadConflict, setSquadConflict] = useState<{
    open: boolean;
    teamId: TeamID;
    name: string;
    existingSquad: any[];
    archivedTeamId: string;
  } | null>(null);

  useEffect(() => {
    if (match.status !== 'COMPLETED') {
      localStorage.setItem('22YARDS_ACTIVE_MATCH', JSON.stringify(match));
    }
  }, [match]);

  // ââ Supabase Broadcast channel ref âââââââââââââââââââââââââââââââââââââââââââ
  const liveChannelRef = useRef<any>(null);

  // Subscribe as soon as the matchId is known (during CONFIG, before first ball).
  // This gives the WebSocket handshake time to complete so the channel is fully
  // connected by the time scoring starts. Waiting until status==='LIVE' caused a
  // race condition where the first few balls were dropped because subscribe() is
  // async and .send() was called before the connection was established.
  useEffect(() => {
    if (!match.matchId) return;
    const ch = supabase.channel(`live:${match.matchId}`);
    ch.subscribe();                 // async â connects in background
    liveChannelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      liveChannelRef.current = null;
    };
  }, [match.matchId]); // only re-run if matchId changes (never in practice)

  // Live broadcast push â DB upsert + WebSocket broadcast after EVERY ball.
  // IMPORTANT: use the local `status` UI variable, NOT `match.status`.
  // `match.status` is only ever 'CONFIG' or 'COMPLETED' â it never becomes 'LIVE'.
  // The local `status` state is what transitions to 'LIVE' when scoring begins.
  useEffect(() => {
    if (status !== 'LIVE' || !match.matchId) return;
    // 1. DB upsert â persists state so late-joining spectators load the current score
    pushLiveMatchState(match);
    // 2. Broadcast â instant delivery (~50 ms) to all connected spectator tabs
    liveChannelRef.current?.send({
      type: 'broadcast',
      event: 'score_update',
      payload: match,
    });
  }, [match.liveScore.balls, match.liveScore.wickets, match.currentInnings, status]);

  const getTeamObj = (id: TeamID) => id === 'A' ? match.teams.teamA : match.teams.teamB;
  const getPlayer = (id: PlayerID | null) => {
    if (!id) return null;
    return [...(match.teams.teamA?.squad || []), ...(match.teams.teamB?.squad || [])].find(p => p.id === id) || null;
  };

  const checkTeamConflicts = () => {
    if (!userData?.phone) { setStatus('TOSS'); return; }
    
    const globalVault = JSON.parse(localStorage.getItem('22YARDS_GLOBAL_VAULT') || '{}');
    const userVault = globalVault[userData.phone] || { teams: [] };
    const archivedTeams = userVault.teams || [];

    const isUserInA = (match.teams.teamA.squad || []).some(p => p.phone === userData.phone);
    const isUserInB = (match.teams.teamB.squad || []).some(p => p.phone === userData.phone);

    // Conflict logic only for the team containing the registered player
    if (isUserInA && !match.teams.teamA.resolutionHandled) {
      const conflictA = archivedTeams.find(t => t.name.toUpperCase() === match.teams.teamA.name.toUpperCase());
      if (conflictA) {
        setSquadConflict({ open: true, teamId: 'A', name: match.teams.teamA.name, existingSquad: conflictA.players || conflictA.squad || [], archivedTeamId: conflictA.id });
        return;
      }
    }
    
    if (isUserInB && !match.teams.teamB.resolutionHandled) {
      const conflictB = archivedTeams.find(t => t.name.toUpperCase() === match.teams.teamB.name.toUpperCase());
      if (conflictB) {
        setSquadConflict({ open: true, teamId: 'B', name: match.teams.teamB.name, existingSquad: conflictB.players || conflictB.squad || [], archivedTeamId: conflictB.id });
        return;
      }
    }

    setStatus('TOSS');
  };

  const handleResolveConflict = (resolveType: 'EXISTING' | 'NEW') => {
    if (!squadConflict) return;

    setMatch(m => {
      const key = squadConflict.teamId === 'A' ? 'teamA' : 'teamB';
      return {
        ...m,
        teams: {
          ...m.teams,
          [key]: { 
            ...m.teams[key], 
            resolutionMode: resolveType, 
            resolutionHandled: true,
            linkedArchivedId: resolveType === 'EXISTING' ? squadConflict.archivedTeamId : null
          }
        }
      };
    });

    setSquadConflict(null);
    // Directly transition to TOSS to prevent double-modal issues for same-named teams
    setStatus('TOSS');
  };

  const handleScore = (runs: number) => {
    if (!match.crease.bowlerId) {
       setSelectionTarget('NEXT_BOWLER');
       return;
    }
    if (pendingExtra === 'NB') {
       setOverlayAnim('FREE_HIT');
       setTimeout(() => setOverlayAnim(null), 2500);
    } else if (runs === 4) {
       setOverlayAnim('FOUR');
       setTimeout(() => setOverlayAnim(null), 1500);
    } else if (runs === 6) {
       setOverlayAnim('SIX');
       setTimeout(() => setOverlayAnim(null), 1500);
    }
    commitBall(runs, pendingExtra);
    setPendingExtra(null);
  };

  const handleWicketAction = (type: string, runs = 0) => {
    if (type === 'CAUGHT' || type === 'RUN OUT') {
      setWicketWizard({ open: false, type: type });
      setSelectionTarget('FIELDER');
      return;
    }

    if (type === 'STUMPED') {
      const bowlingKey = match.teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB';
      const wk = (match.teams[bowlingKey]?.squad || []).find(p => p.isWicketKeeper);
      setWicketWizard({ open: false });
      
      if (wk) {
        setMatch(m => {
          const bKey = m.teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB';
          const updatedBowlingSquad = (m.teams[bKey]?.squad || []).map(p => {
            if (p.id === wk.id) return { ...p, stumpings: (p.stumpings || 0) + 1 };
            return p;
          });
          return { ...m, teams: { ...m.teams, [bKey]: { ...m.teams[bKey], squad: updatedBowlingSquad } } };
        });
        commitBall(0, undefined, true, 'STUMPED', wk.id);
      } else {
        setWicketWizard({ open: false, type: 'STUMPED' });
        setSelectionTarget('FIELDER');
      }
      return;
    }
    
    setWicketWizard({ open: false });
    commitBall(runs, undefined, true, type);
  };

  const handleFielderSelected = (fielderId: PlayerID) => {
    const wType = wicketWizard.type;
    setSelectionTarget(null);
    setMatch(m => {
      const bowlingKey = m.teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB';
      const updatedBowlingSquad = (m.teams[bowlingKey]?.squad || []).map(p => {
        if (p.id === fielderId) {
            if (wType === 'CAUGHT') return { ...p, catches: (p.catches || 0) + 1 };
            if (wType === 'RUN OUT') return { ...p, run_outs: (p.run_outs || 0) + 1 };
            if (wType === 'STUMPED') return { ...p, stumpings: (p.stumpings || 0) + 1 };
        }
        return p;
      });
      return { ...m, teams: { ...m.teams, [bowlingKey]: { ...m.teams[bowlingKey], squad: updatedBowlingSquad } } };
    });
    commitBall(0, undefined, true, wType, fielderId);
  };

  const persistToGlobalVault = (finalMatchState: MatchState, winnerName = '', winnerMargin = '') => {
    if (!userData?.phone) return;

    const activePhone = userData.phone;
    const globalVault = JSON.parse(localStorage.getItem('22YARDS_GLOBAL_VAULT') || '{}');
    if (!globalVault[activePhone]) {
      globalVault[activePhone] = { history: [], teams: [], name: userData.name };
    }

    const teamA = finalMatchState.teams.teamA;
    const teamB = finalMatchState.teams.teamB;
    const isUserInTeamA = (teamA.squad || []).some(p => p.phone === activePhone);
    const isUserInTeamB = (teamB.squad || []).some(p => p.phone === activePhone);

    // ââ Helper: build a personalised match record for any participant âââââââââ
    const buildMatchRecord = (playerObj: any, playerTeamId: 'A' | 'B') => {
      const oppTeamObj = playerTeamId === 'A' ? teamB : teamA;

      let result = 'DREW';
      if (finalMatchState.status === 'COMPLETED') {
        const chasers = finalMatchState.teams.battingTeamId;
        const defenders = finalMatchState.teams.bowlingTeamId;
        const finalScore = finalMatchState.liveScore.runs;
        const target = finalMatchState.config.target || 0;
        if (finalScore >= target) {
          // Chasers won
          result = chasers === playerTeamId ? 'WON' : 'LOST';
        } else if (finalScore === target - 1) {
          // B-05 fix: tie
          result = 'TIED';
        } else {
          // Defenders (setting team) won
          result = defenders === playerTeamId ? 'WON' : 'LOST';
        }
      }

      return {
        id: finalMatchState.matchId,
        date: finalMatchState.config.dateTime,
        opponent: oppTeamObj.name,
        result,
        runs: playerObj.runs || 0,
        ballsFaced: playerObj.balls || 0,
        fours: playerObj.fours || 0,
        sixes: playerObj.sixes || 0,
        wicketsTaken: playerObj.wickets || 0,
        runsConceded: playerObj.runs_conceded || 0,
        ballsBowled: playerObj.balls_bowled || 0,
        catches: playerObj.catches || 0,
        stumpings: playerObj.stumpings || 0,
        runOuts: playerObj.run_outs || 0,
        asCaptain: playerObj.isCaptain,
        asKeeper: playerObj.isWicketKeeper,
        matchWon: result === 'WON',
        tossWon: finalMatchState.toss.winnerId === playerTeamId,
        // B-03 fix: use actual innings-1 batting team (not hardcoded teamA)
        // At match end: battingTeamId = inn2 chaser, bowlingTeamId = inn1 setter
        fullScorecard: (() => {
          const inn1BatterKey = finalMatchState.teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB';
          const inn1BowlerKey = finalMatchState.teams.battingTeamId === 'A' ? 'teamA' : 'teamB';
          const inn1BattingTeam = finalMatchState.teams[inn1BatterKey];
          const inn1BowlingTeam = finalMatchState.teams[inn1BowlerKey];
          const hist = finalMatchState.history || [];
          const allSquad = [...(inn1BattingTeam.squad || []), ...(inn1BowlingTeam.squad || [])];
          const findP = (id: string) => allSquad.find(p => p.id === id);

          // ââ Dismissal string for a batter in a given innings âââââââââââââ
          const getOutDetail = (playerId: string, inningsNum: number) => {
            const outEv = hist.find(h => h.innings === inningsNum && h.isWicket && h.strikerId === playerId);
            if (!outEv) {
              const p = findP(playerId);
              return (p?.balls || 0) > 0 ? 'not out' : 'dnb';
            }
            const bowlerName = findP(outEv.bowlerId)?.name || 'Unknown';
            const fielderName = findP(outEv.fielderId)?.name || '';
            switch (outEv.wicketType) {
              case 'BOWLED':      return `b ${bowlerName}`;
              case 'CAUGHT':     return (fielderName && fielderName !== bowlerName) ? `c ${fielderName} b ${bowlerName}` : `c & b ${bowlerName}`;
              case 'LBW':        return `lbw b ${bowlerName}`;
              case 'STUMPED':    return `st ${fielderName || 'Keeper'} b ${bowlerName}`;
              case 'RUN OUT':    return `run out (${fielderName || 'Fielder'})`;
              case 'HIT WICKET': return `hit wicket b ${bowlerName}`;
              default:           return `out`;
            }
          };

          // ââ Extras breakdown for an innings ââââââââââââââââââââââââââââââ
          const getExtras = (inningsNum: number) => {
            const balls = hist.filter(h => h.innings === inningsNum);
            const wides    = balls.filter(h => h.type === 'WD').reduce((s, h) => s + (h.totalValue || 1), 0);
            const noBalls  = balls.filter(h => h.type === 'NB').length;
            const byes     = balls.filter(h => h.type === 'BYE').reduce((s, h) => s + (h.runsScored || 0), 0);
            const legByes  = balls.filter(h => h.type === 'LB').reduce((s, h) => s + (h.runsScored || 0), 0);
            const penalties = balls.filter(h => h.type === 'PENALTY_RUNS').length * 5;
            return { total: wides + noBalls + byes + legByes + penalties, wides, noBalls, byes, legByes, penalties };
          };

          // ââ Fall of wickets for an innings ââââââââââââââââââââââââââââââââ
          const getFoW = (inningsNum: number, squad: any[]) =>
            hist
              .filter(h => h.innings === inningsNum && h.isWicket)
              .map(h => ({
                batterName: squad.find(p => p.id === h.strikerId)?.name || 'Unknown',
                score: `${h.teamTotalAtThisBall}/${h.wicketsAtThisBall}`,
                over: `${Math.floor(h.ballNumber / 6)}.${h.ballNumber % 6}`,
              }));

          // ââ Match awards âââââââââââââââââââââââââââââââââââââââââââââââââ
          const scored = allSquad
            .map(p => ({ ...p, _impact: (p.runs||0) + (p.wickets||0)*25 + (p.catches||0)*10 + (p.run_outs||0)*10 + (p.stumpings||0)*10 }))
            .sort((a, b) => b._impact - a._impact);
          const _bestBat  = [...scored].sort((a,b) => (b.runs||0)-(a.runs||0))[0];
          const _bestBowl = [...scored].filter(p => (p.balls_bowled||0) >= 6).sort((a,b) => (b.wickets||0)-(a.wickets||0)||(a.runs_conceded||0)-(b.runs_conceded||0))[0] || scored.sort((a,b) => (b.wickets||0)-(a.wickets||0))[0];

          return {
            battingTeam: {
              name: inn1BattingTeam.name,
              squad: (inn1BattingTeam.squad || []).map(p => ({ ...p, outDetail: getOutDetail(p.id, 1) })),
            },
            bowlingTeam: {
              name: inn1BowlingTeam.name,
              squad: (inn1BowlingTeam.squad || []).map(p => ({ ...p, outDetail: getOutDetail(p.id, 2) })),
            },
            inn1Extras: getExtras(1),
            inn2Extras: getExtras(2),
            inn1FoW: getFoW(1, inn1BattingTeam.squad || []),
            inn2FoW: getFoW(2, inn1BowlingTeam.squad || []),
            inn1Total: {
              runs: finalMatchState.config.innings1Score || 0,
              wickets: finalMatchState.config.innings1Wickets || 0,
              balls: finalMatchState.config.innings1Balls || 0,
            },
            inn2Total: {
              runs: finalMatchState.liveScore.runs || 0,
              wickets: finalMatchState.liveScore.wickets || 0,
              balls: finalMatchState.liveScore.balls || 0,
            },
            matchResult: winnerName ? `${winnerName} won${winnerMargin ? ' by ' + winnerMargin : ''}` : 'Match Complete',
            awards: {
              bestBatsman: _bestBat  ? { name: _bestBat.name,  stat: `${_bestBat.runs||0}(${_bestBat.balls||0})` }                                    : null,
              bestBowler:  _bestBowl ? { name: _bestBowl.name, stat: `${_bestBowl.wickets||0}/${_bestBowl.runs_conceded||0}` }                        : null,
              mvp:         scored[0] ? { name: scored[0].name }                                                                                        : null,
            },
          };
        })(),
        targetScore: finalMatchState.config.target || (finalMatchState.config.innings1Score + 1),
        // Team totals for archive display â isInn1Batter = this player's team batted first
        myTeamScore: (() => { const f = playerTeamId === finalMatchState.teams.bowlingTeamId; return f ? (finalMatchState.config.innings1Score || 0) : (finalMatchState.liveScore.runs || 0); })(),
        myTeamWickets: (() => { const f = playerTeamId === finalMatchState.teams.bowlingTeamId; return f ? (finalMatchState.config.innings1Wickets || 0) : (finalMatchState.liveScore.wickets || 0); })(),
        myTeamOvers: (() => { const f = playerTeamId === finalMatchState.teams.bowlingTeamId; const b = f ? (finalMatchState.config.innings1Balls || 0) : (finalMatchState.liveScore.balls || 0); return `${Math.floor(b/6)}.${b%6}`; })(),
        oppTeamScore: (() => { const f = playerTeamId === finalMatchState.teams.bowlingTeamId; return f ? (finalMatchState.liveScore.runs || 0) : (finalMatchState.config.innings1Score || 0); })(),
        oppTeamWickets: (() => { const f = playerTeamId === finalMatchState.teams.bowlingTeamId; return f ? (finalMatchState.liveScore.wickets || 0) : (finalMatchState.config.innings1Wickets || 0); })(),
        oppTeamOvers: (() => { const f = playerTeamId === finalMatchState.teams.bowlingTeamId; const b = f ? (finalMatchState.liveScore.balls || 0) : (finalMatchState.config.innings1Balls || 0); return `${Math.floor(b/6)}.${b%6}`; })()
      };
    };

    // ââ Push match record into EVERY participant's vault âââââââââââââââââââââ
    // This ensures all players (not just the scorer) see the match in their
    // Personal Archive and Performance Hub when they log in.
    const allParticipants: Array<{ player: any; teamId: 'A' | 'B' }> = [
      ...(teamA.squad || []).map((p: any) => ({ player: p, teamId: 'A' as const })),
      ...(teamB.squad || []).map((p: any) => ({ player: p, teamId: 'B' as const })),
    ];

    allParticipants.forEach(({ player, teamId }) => {
      const pPhone = player.phone;
      if (!pPhone) return; // skip players registered without a phone number

      if (!globalVault[pPhone]) {
        globalVault[pPhone] = { history: [], teams: [], name: player.name };
      }

      // Idempotent â don't double-insert if the match was somehow already recorded
      const alreadyRecorded = globalVault[pPhone].history.some((m: any) => m.id === finalMatchState.matchId);
      if (!alreadyRecorded) {
        globalVault[pPhone].history.push(buildMatchRecord(player, teamId));
      }
    });

    // ââ Archival Squad Persistence â ONLY for the logged-in scorer's team ââââ
    const myTeamId = isUserInTeamA ? 'A' : (isUserInTeamB ? 'B' : null);
    if (myTeamId) {
      const myTeamObj = myTeamId === 'A' ? teamA : teamB;
      const mode = myTeamObj.resolutionMode;
      const linkedId = myTeamObj.linkedArchivedId;

      if (mode === 'EXISTING' && linkedId) {
        const idx = globalVault[activePhone].teams.findIndex((t: any) => t.id === linkedId);
        if (idx > -1) {
          const archivedSquad = globalVault[activePhone].teams[idx].players || [];
          const matchSquad = myTeamObj.squad || [];
          // Merge based on unique phone number to avoid duplication
          const archivedPhones = new Set(archivedSquad.map((p: any) => p.phone).filter(Boolean));
          const newPlayers = matchSquad.filter((p: any) => !archivedPhones.has(p.phone));
          globalVault[activePhone].teams[idx].players = [...archivedSquad, ...newPlayers];
        }
      } else {
        // Mode is 'NEW' or Unique Name â always creates a fresh entry
        globalVault[activePhone].teams.push({
          id: `T-${Date.now()}-${myTeamId}`,
          name: myTeamObj.name,
          players: myTeamObj.squad || []
        });
      }
    }

    localStorage.setItem('22YARDS_GLOBAL_VAULT', JSON.stringify(globalVault));

    // ââ Supabase Sync âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // Upsert a player row + archive_vault for EVERY participant so that when
    // any player logs in on any device their stats and history are up-to-date.
    const syncToCloud = async () => {
      try {
        // Build upsert promises for all participants with a phone number
        const upsertPromises = allParticipants
          .filter(({ player }) => !!player.phone)
          .map(({ player }) => {
            const pPhone = player.phone;
            const pVault = globalVault[pPhone];
            const fullHistory = pVault?.history || [];
            const statsUpdate = buildStatsFromHistory(fullHistory);
            const isScorer = pPhone === activePhone;

            return upsertPlayer({
              player_id: generatePlayerId(pPhone),
              phone: pPhone,
              name: (player.name || '').toUpperCase(),
              // Preserve richer profile data for the logged-in scorer; use sensible
              // defaults for other participants who haven't self-registered yet.
              city:       isScorer ? (userData.city  || '') : '',
              role:       isScorer ? (userData.role  || 'All-Rounder') : 'All-Rounder',
              avatar_url: isScorer
                ? (userData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}&backgroundColor=020617`)
                : `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}&backgroundColor=020617`,
              ...statsUpdate,
              archive_vault: fullHistory,
            });
          });

        // Run all upserts in parallel, then save the central match record
        await Promise.all(upsertPromises);
        await saveMatchRecord(finalMatchState, winnerName, winnerMargin);

      } catch (e) {
        console.warn('[22YARDS] Supabase sync failed (offline?). Data safe in localStorage.', e);
      }
    };

    syncToCloud();
  };

  const commitBall = (runs: number, extraType?: 'WD' | 'NB' | 'BYE' | 'LB' | 'PENALTY_RUNS', isWicket = false, wicketType?: string, fielderId?: string) => { // B-04/B-19
    if (isWicket) {
      setOverlayAnim('WICKET');
      setTimeout(() => setOverlayAnim(null), 1500);
    }
    // Capture the new state synchronously so we can push it to Supabase immediately
    // after setMatch returns â no useEffect timing dependency, no status checks needed.
    let _newState: any = null;
    setMatch(m => {
      let runIncrement = runs;
      let extraIncrement = 0;
      let isBallCounted = true;
      let batsmanCredit = runs;
      if (extraType === 'WD') { extraIncrement = runs + 1; batsmanCredit = 0; isBallCounted = false; runIncrement = 0; }
      else if (extraType === 'NB') { extraIncrement = 1; isBallCounted = false; }
      else if (extraType === 'BYE') { extraIncrement = runs; batsmanCredit = 0; runIncrement = 0; }
      else if (extraType === 'LB') { extraIncrement = runs; batsmanCredit = 0; runIncrement = 0; } // B-04: leg bye â ball counted, no batsman credit
      else if (extraType === 'PENALTY_RUNS') { extraIncrement = 5; batsmanCredit = 0; isBallCounted = false; runIncrement = 0; } // B-19: 5-run penalty
      // NB-FIX: batsman DOES face a no-ball (ball counts for batsman stats), but WD is not faced
      const batsmanBallCounted = extraType !== 'WD' && extraType !== 'PENALTY_RUNS';
      let totalRunIncr = runIncrement + extraIncrement;
      let r = m.liveScore.runs + totalRunIncr;
      let w = m.liveScore.wickets + (isWicket ? 1 : 0);
      let b = m.liveScore.balls;
      if (isBallCounted) b++;

      const battingKey = m.teams.battingTeamId === 'A' ? 'teamA' : 'teamB';
      const bowlingKey = m.teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB';

      let newBatting = (m.teams[battingKey]?.squad || []).map(p => {
        if (p.id === m.crease.strikerId) return { ...p, runs: (p.runs || 0) + batsmanCredit, balls: (p.balls || 0) + (batsmanBallCounted ? 1 : 0), fours: (p.fours || 0) + (batsmanCredit === 4 ? 1 : 0), sixes: (p.sixes || 0) + (batsmanCredit === 6 ? 1 : 0) };
        return p;
      });

      let newBowling = (m.teams[bowlingKey]?.squad || []).map(p => {
        let updated = { ...p };
        if (p.id === m.crease.bowlerId) {
          updated.runs_conceded = (updated.runs_conceded || 0) + totalRunIncr - (extraType === 'BYE' || extraType === 'LB' ? runs : 0); // B-12: LB excluded from bowler economy
          updated.balls_bowled = (updated.balls_bowled || 0) + (isBallCounted ? 1 : 0);
          if (isWicket && wicketType !== 'RUN OUT') {
            updated.wickets = (updated.wickets || 0) + 1;
          }
        }
        return updated;
      });

      let sId = m.crease.strikerId;
      let nsId = m.crease.nonStrikerId;
      if (isWicket) sId = null;
      // STRIKE-ROT-FIX: use `runs` (physical runs batsmen ran), not `totalRunIncr`
      // so that the NB/WD 1-run penalty doesn't cause an incorrect strike rotation
      else if (runs % 2 !== 0) [sId, nsId] = [nsId, sId];
      
      const ballRecord = { 
        ballId: Date.now().toString(), 
        runsScored: runs, 
        totalValue: totalRunIncr,
        type: extraType || 'LEGAL', 
        isWicket, 
        wicketType: wicketType || undefined,
        strikerId: m.crease.strikerId, 
        bowlerId: m.crease.bowlerId, 
        fielderId: fielderId,
        innings: m.currentInnings, 
        ballNumber: b, 
        teamId: m.teams.battingTeamId,
        overNumber: Math.floor((b - 1) / 6) + 1,
        teamTotalAtThisBall: r,
        wicketsAtThisBall: w
      };

      const inningsOver = w >= (newBatting.length - 1) || (m.currentInnings === 2 && r >= (m.config.target || 9999)) || (isBallCounted && b >= (m.config.overs * 6));
      
      if (inningsOver) {
        setTimeout(() => handleInningsEnd(r, w, b), 500);
      } else if (isBallCounted && b > 0 && b % 6 === 0) {
        if (!isWicket) [sId, nsId] = [nsId, sId];
        // Maiden over detection: check if bowler conceded 0 runs this over (excluding byes/LB)
        const overStartBall = b - 6;
        const overBalls = [...(m.history || []), ballRecord].filter(h => h.innings === m.currentInnings && h.ballNumber > overStartBall && h.ballNumber <= b && h.bowlerId === m.crease.bowlerId);
        const overRunsConceded = overBalls.reduce((sum, h) => sum + (h.totalValue || 0) - (h.type === 'BYE' || h.type === 'LB' ? (h.runsScored || 0) : 0), 0);
        const isMaiden = overRunsConceded === 0 && overBalls.length > 0;
        if (isMaiden) {
          newBowling = newBowling.map(p => p.id === m.crease.bowlerId ? { ...p, maidens: (p.maidens || 0) + 1 } : p);
        }
        const updatedCrease = { ...m.crease, previousBowlerId: m.crease.bowlerId, bowlerId: null, strikerId: sId, nonStrikerId: nsId };
        setTimeout(() => {
            if (isWicket) setSelectionTarget('NEW_BATSMAN');
            else setSelectionTarget('NEXT_BOWLER');
        }, 500);
        _newState = { ...m, liveScore: { runs: r, wickets: w, balls: b }, teams: { ...m.teams, [battingKey]: { ...m.teams[battingKey], squad: newBatting }, [bowlingKey]: { ...m.teams[bowlingKey], squad: newBowling } }, crease: updatedCrease, history: [...(m.history || []), ballRecord] };
        return _newState;
      }

      if (isWicket && !inningsOver) setTimeout(() => setSelectionTarget('NEW_BATSMAN'), 500);
      _newState = { ...m, liveScore: { runs: r, wickets: w, balls: b }, teams: { ...m.teams, [battingKey]: { ...m.teams[battingKey], squad: newBatting }, [bowlingKey]: { ...m.teams[bowlingKey], squad: newBowling } }, crease: { ...m.crease, strikerId: sId, nonStrikerId: nsId }, history: [...(m.history || []), ballRecord] };
      return _newState;
    });
    // setMatch's functional updater runs synchronously â _newState is populated here.
    // Push directly: no useEffect, no status check, no React timing dependency.
    if (_newState) {
      pushLiveMatchState(_newState);
      liveChannelRef.current?.send({ type: 'broadcast', event: 'score_update', payload: _newState });
    }
  };

  const handleInningsEnd = (finalRuns, finalWickets, finalBalls) => {
    setMatch(m => {
      if (m.currentInnings === 1) {
        setOverlayAnim('INNINGS_BREAK');
        setTimeout(() => { setOverlayAnim(null); setStatus('OPENERS'); }, 2000);
        return { ...m, currentInnings: 2, config: { ...m.config, target: finalRuns + 1, innings1Score: finalRuns, innings1Wickets: finalWickets, innings1Balls: finalBalls }, liveScore: { runs: 0, wickets: 0, balls: 0 }, crease: { strikerId: null, nonStrikerId: null, bowlerId: null, previousBowlerId: null }, teams: { ...m.teams, battingTeamId: m.teams.bowlingTeamId, bowlingTeamId: m.teams.battingTeamId } };
      } else {
        let winnerName = 'MATCH DRAWN';
        let winnerId = null;
        let marginStr = 'SCORES LEVEL';
        if (finalRuns >= (m.config.target || 0)) {
           // Chasing team wins by wickets
           winnerId = m.teams.battingTeamId;
           winnerName = getTeamObj(winnerId).name;
           const wicketsRemaining = Math.max(0, (m.teams[m.teams.battingTeamId === 'A' ? 'teamA' : 'teamB']?.squad?.length || 1) - 1 - finalWickets); // B-09 fix
           marginStr = `WON BY ${wicketsRemaining} WICKET${wicketsRemaining !== 1 ? 'S' : ''}`;
        } else if (finalRuns === (m.config.target || 0) - 1) {
           // B-05 fix: Tie condition â scores level
           winnerName = 'MATCH TIED';
           winnerId = null;
           marginStr = 'SCORES LEVEL â MATCH TIED';
        } else {
           // Setting team wins by runs
           winnerId = m.teams.bowlingTeamId;
           winnerName = getTeamObj(winnerId).name;
           marginStr = `WON BY ${(m.config.target || 0) - 1 - finalRuns} RUN${(m.config.target || 0) - 1 - finalRuns !== 1 ? 'S' : ''}`;
        }
        setWinnerTeam({ name: winnerName, id: winnerId, margin: marginStr });
        setStatus('SUMMARY');
        const finalState = { ...m, status: 'COMPLETED', liveScore: { runs: finalRuns, wickets: finalWickets, balls: finalBalls } };
        persistToGlobalVault(finalState, winnerName, marginStr);
        localStorage.removeItem('22YARDS_ACTIVE_MATCH');
        return finalState;
      }
    });
  };

  const handleUndo = () => {
    setMatch(m => {
      if (!m.history || m.history.length === 0) return m;
      const lastBall = m.history[m.history.length - 1];
      const newHistory = m.history.slice(0, -1);
      
      let r = m.liveScore.runs - (lastBall.totalValue || 0);
      let w = m.liveScore.wickets - (lastBall.isWicket ? 1 : 0);
      let b = m.liveScore.balls;
      const wasBallCounted = lastBall.type !== 'WD' && lastBall.type !== 'NB' && lastBall.type !== 'PENALTY_RUNS';
      // NB-FIX: NB counts as a ball faced by the batsman (mirrors batsmanBallCounted in commitBall)
      const batsmanBallCountedForUndo = lastBall.type !== 'WD' && lastBall.type !== 'PENALTY_RUNS';
      if (wasBallCounted) b--;

      const battingKey = lastBall.teamId === 'A' ? 'teamA' : 'teamB';
      const bowlingKey = lastBall.teamId === 'A' ? 'teamB' : 'teamA';

      const newBattingSquad = (m.teams[battingKey]?.squad || []).map(p => {
        if (p.id === lastBall.strikerId) {
          let runsToSubtract = lastBall.runsScored;
          if (lastBall.type === 'WD' || lastBall.type === 'BYE' || lastBall.type === 'LB') runsToSubtract = 0; // B-04: LB not credited to batsman
          return {
            ...p,
            runs: Math.max(0, (p.runs || 0) - runsToSubtract),
            balls: Math.max(0, (p.balls || 0) - (batsmanBallCountedForUndo ? 1 : 0)),
            fours: Math.max(0, (p.fours || 0) - (runsToSubtract === 4 ? 1 : 0)),
            sixes: Math.max(0, (p.sixes || 0) - (runsToSubtract === 6 ? 1 : 0)),
          };
        }
        return p;
      });

      const newBowlingSquad = (m.teams[bowlingKey]?.squad || []).map(p => {
        let updated = { ...p };
        if (p.id === lastBall.bowlerId) {
          updated.runs_conceded = Math.max(0, (p.runs_conceded || 0) - ((lastBall.totalValue || 0) - (lastBall.type === 'BYE' || lastBall.type === 'LB' ? lastBall.runsScored : 0))); // B-12: LB excluded from bowler economy
          updated.balls_bowled = Math.max(0, (p.balls_bowled || 0) - (wasBallCounted ? 1 : 0));
          if (lastBall.isWicket && lastBall.wicketType !== 'RUN OUT') {
            updated.wickets = Math.max(0, (p.wickets || 0) - 1);
          }
        }
        if (lastBall.wicketType === 'STUMPED' && p.id === lastBall.fielderId) updated.stumpings = Math.max(0, (p.stumpings || 0) - 1);
        if (lastBall.wicketType === 'CAUGHT' && p.id === lastBall.fielderId) updated.catches = Math.max(0, (p.catches || 0) - 1);
        if (lastBall.wicketType === 'RUN OUT' && p.id === lastBall.fielderId) updated.run_outs = Math.max(0, (p.run_outs || 0) - 1);
        return updated;
      });

      let sId = m.crease.strikerId;
      let nsId = m.crease.nonStrikerId;
      const wasOverEnd = (b + 1) > 0 && (b + 1) % 6 === 0 && wasBallCounted;
      // Reverse in opposite order of commitBall: undo run-swap first, then over-end swap
      // STRIKE-ROT-FIX: use runsScored (physical runs), not totalValue (which includes NB/WD penalty)
      if (lastBall.isWicket) sId = lastBall.strikerId;
      else if ((lastBall.runsScored || 0) % 2 !== 0) [sId, nsId] = [nsId, sId];
      if (wasOverEnd) [sId, nsId] = [nsId, sId];

      return {
        ...m,
        liveScore: { runs: r, wickets: w, balls: b },
        teams: { ...m.teams, [battingKey]: { ...m.teams[battingKey], squad: newBattingSquad }, [bowlingKey]: { ...m.teams[bowlingKey], squad: newBowlingSquad } },
        crease: { ...m.crease, strikerId: sId, nonStrikerId: nsId, bowlerId: lastBall.bowlerId },
        history: newHistory
      };
    });
    setSelectionTarget(null); // B-06 fix: clear stale selection after undo
  };

  const analyticsData = useMemo(() => {
    const overs = [];
    const history = match.history || [];
    const maxOvers = match.config.overs;
    for (let i = 1; i <= maxOvers; i++) {
      const inn1 = history.filter(h => h.innings === 1 && h.overNumber === i).reduce((sum, h) => sum + (h.totalValue || 0), 0);
      const inn2 = history.filter(h => h.innings === 2 && h.overNumber === i).reduce((sum, h) => sum + (h.totalValue || 0), 0);
      overs.push({ over: i, team1: inn1, team2: inn2 });
    }
    const worm = [];
    let cum1 = 0, cum2 = 0;
    const maxBalls = match.config.overs * 6;
    for (let i = 0; i <= maxBalls; i++) {
      const b1 = history.find(h => h.innings === 1 && h.ballNumber === i);
      const b2 = history.find(h => h.innings === 2 && h.ballNumber === i);
      if (b1) cum1 += (b1.totalValue || 0);
      if (b2) cum2 += (b2.totalValue || 0);
      if (i % 6 === 0 || i === maxBalls) {
        worm.push({ over: i / 6, Team1: cum1, Team2: (match.currentInnings === 2 || match.status === 'COMPLETED') && i <= (match.currentInnings === 2 ? match.liveScore.balls : 9999) ? cum2 : null });
      }
    }
    return { overs, worm };
  }, [match.history, match.liveScore.balls, match.currentInnings, match.status, match.config.overs]);

  const performerStats = useMemo(() => {
    const allPlayers = [...(match.teams.teamA?.squad || []), ...(match.teams.teamB?.squad || [])];
    const scoredPlayers = allPlayers.map(p => {
      const impact = (p.runs || 0) * 1 + (p.wickets || 0) * 25 + (p.catches || 0) * 10 + (p.run_outs || 0) * 10 + (p.stumpings || 0) * 10;
      return { ...p, impact };
    }).sort((a, b) => b.impact - a.impact);
    const bestBatsman = [...scoredPlayers].sort((a, b) => (b.runs || 0) - (a.runs || 0))[0];
    const bestBowler = [...scoredPlayers].filter(p => (p.balls_bowled || 0) >= 6).sort((a, b) => (b.wickets || 0) - (a.wickets || 0) || (a.runs_conceded || 0) - (b.runs_conceded || 0))[0] || scoredPlayers.sort((a, b) => (b.wickets || 0) - (a.wickets || 0))[0];
    return { mvp: scoredPlayers[0], bestBatsman, bestBowler, rankings: scoredPlayers.slice(0, 5) };
  }, [match.teams]);

  const handleEnlistNewPlayer = (name: string, phone: string, teamId: TeamID) => {
    const newP = { id: `P-${Date.now()}`, name: name.toUpperCase(), phone, runs: 0, balls: 0, wickets: 0, catches: 0, run_outs: 0, stumpings: 0, runs_conceded: 0, balls_bowled: 0, fours: 0, sixes: 0, isCaptain: false, isWicketKeeper: false };
    setMatch(m => {
      const key = teamId === 'A' ? 'teamA' : 'teamB';
      return { ...m, teams: { ...m.teams, [key]: { ...m.teams[key], squad: [...(m.teams[key]?.squad || []), newP] } } };
    });
    return newP.id;
  };

  const handleSetCaptain = (playerId, teamId) => {
    setMatch(m => {
      const key = teamId === 'A' ? 'teamA' : 'teamB';
      return { ...m, teams: { ...m.teams, [key]: { ...m.teams[key], squad: (m.teams[key]?.squad || []).map(p => ({ ...p, isCaptain: p.id === playerId })) } } };
    });
  };

  const handleSetWicketKeeper = (playerId, teamId) => {
    setMatch(m => {
      const key = teamId === 'A' ? 'teamA' : 'teamB';
      return { ...m, teams: { ...m.teams, [key]: { ...m.teams[key], squad: (m.teams[key]?.squad || []).map(p => ({ ...p, isWicketKeeper: p.id === playerId })) } } };
    });
  };

  const getTeamInitials = (name: string) => name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : "??";

  const getSquadForSelection = () => {
    const teamId = (selectionTarget === 'BOWLER' || selectionTarget === 'NEXT_BOWLER' || selectionTarget === 'FIELDER') ? match.teams.bowlingTeamId : match.teams.battingTeamId;
    let baseSquad = (getTeamObj(teamId)?.squad || []).filter(p => p.id !== match.crease.strikerId && p.id !== match.crease.nonStrikerId);
    if (selectionTarget === 'NEW_BATSMAN' || selectionTarget === 'STRIKER' || selectionTarget === 'NON_STRIKER') {
        const history = (match.history || []).filter(h => h.innings === match.currentInnings && h.isWicket);
        const outPlayerIds = history.map(h => h.strikerId);
        baseSquad = baseSquad.filter(p => !outPlayerIds.includes(p.id));
    }
    if (selectionTarget === 'BOWLER' || selectionTarget === 'NEXT_BOWLER') {
      const maxBallsAllowed = (match.config.oversPerBowler || 1) * 6;
      const withinQuota = baseSquad.filter(p => (p.balls_bowled || 0) < maxBallsAllowed);
      // If all bowlers have exhausted their quota (emergency), allow anyone to bowl again
      // except the bowler who just bowled (no consecutive overs rule still applies)
      const eligible = withinQuota.length > 0 ? withinQuota : baseSquad;
      if (selectionTarget === 'NEXT_BOWLER') return eligible.filter(p => p.id !== match.crease.previousBowlerId);
      return eligible;
    }
    return baseSquad;
  };

  const isCaptainSelected = (teamId: TeamID) => (getTeamObj(teamId)?.squad || []).some(p => p.isCaptain);
  const isWicketKeeperSelected = (teamId: TeamID) => (getTeamObj(teamId)?.squad || []).some(p => p.isWicketKeeper);
  const striker = getPlayer(match.crease.strikerId);
  const nonStriker = getPlayer(match.crease.nonStrikerId);
  const currentBowler = getPlayer(match.crease.bowlerId);
  const isAddPlayerDisabled = useMemo(() => !newName.trim() || (!selectedVaultPlayer && phoneQuery.length !== 10), [newName, phoneQuery, selectedVaultPlayer]);

  // ââ Player vault helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const allVaultPlayers = useMemo(() => {
    const vault = JSON.parse(localStorage.getItem('22YARDS_GLOBAL_VAULT') || '{}');
    const seen = new Map<string, {id: string, name: string, phone: string}>();
    Object.values(vault).forEach((data: any) => {
      (data.teams || []).forEach((team: any) => {
        (team.players || []).forEach((p: any) => {
          if (p.phone && p.name && !seen.has(p.phone)) {
            seen.set(p.phone, { id: p.id || p.phone, name: p.name, phone: p.phone });
          }
        });
      });
    });
    return Array.from(seen.values());
  }, [editingTeamId]);

  const matchesQuery = (query: string, playerName: string): boolean => {
    if (!query.trim()) return false;
    const q = query.trim().toLowerCase();
    const name = playerName.toLowerCase();
    if (name.includes(q)) return true;
    const qParts = q.split(/\s+/);
    const nParts = name.split(/\s+/);
    if (qParts.length > 1) return qParts.every((qp, i) => nParts[i]?.startsWith(qp));
    return nParts.some(np => np.startsWith(q));
  };

  useEffect(() => {
    if (!newName.trim() || selectedVaultPlayer) {
      setShowPlayerDropdown(false); setPlayerDropdownList([]); return;
    }
    const matches = allVaultPlayers.filter(p => matchesQuery(newName, p.name));
    setPlayerDropdownList(matches.slice(0, 5));
    setShowPlayerDropdown(matches.length > 0);
  }, [newName, selectedVaultPlayer]);

  useEffect(() => {
    if (!editingTeamId) {
      setSelectedVaultPlayer(null); setNewName(''); setPhoneQuery('');
      setShowPlayerDropdown(false); setPlayerDropdownList([]);
    }
  }, [editingTeamId]);

  const handleSelectVaultPlayer = (p: {id: string, name: string, phone: string}) => {
    setSelectedVaultPlayer(p); setNewName(p.name); setPhoneQuery(p.phone);
    setShowPlayerDropdown(false); setPlayerDropdownList([]);
  };
  const handleClearVaultPlayer = () => {
    setSelectedVaultPlayer(null); setNewName(''); setPhoneQuery('');
  };

  // ââ QR Scanner âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const startQRScanner = async () => {
    setQrScanStatus('SCANNING');
    setQrScanError('');
    setShowQRScanner(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      qrStreamRef.current = stream;
      if (qrVideoRef.current) {
        qrVideoRef.current.srcObject = stream;
        qrVideoRef.current.play();
        qrVideoRef.current.addEventListener('loadedmetadata', () => scanQRFrame());
      }
    } catch (e) {
      setQrScanStatus('ERROR');
      setQrScanError('Camera access denied. Please allow camera permission and try again.');
    }
  };

  const scanQRFrame = () => {
    const video = qrVideoRef.current;
    const canvas = qrCanvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      qrAnimRef.current = requestAnimationFrame(scanQRFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    import('jsqr').then(({ default: jsQR }) => {
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        try {
          const data = JSON.parse(code.data);
          if (data.name && data.phone && data.app === '22YARDS') {
            stopQRScanner();
            setNewName(data.name.toUpperCase());
            setPhoneQuery(data.phone);
            setQrScanStatus('SUCCESS');
            setTimeout(() => setShowQRScanner(false), 1200);
          } else {
            throw new Error('Invalid');
          }
        } catch {
          setQrScanStatus('ERROR');
          setQrScanError('Not a valid 22YARDS player QR code. Try again.');
          stopQRScanner();
        }
      } else {
        qrAnimRef.current = requestAnimationFrame(scanQRFrame);
      }
    });
  };

  const stopQRScanner = () => {
    if (qrAnimRef.current) cancelAnimationFrame(qrAnimRef.current);
    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach(t => t.stop());
      qrStreamRef.current = null;
    }
  };

  const closeQRScanner = () => {
    stopQRScanner();
    setShowQRScanner(false);
  };

  // ââ Transfer Scoring / Live Broadcast âââââââââââââââââââââââââââââââââââââââ
  const openTransferModal = async () => {
    const matchId = match.matchId;
    const base = window.location.origin;
    const handoffUrl  = `${base}/?resume=${matchId}`;
    const broadcastUrl = `${base}/?watch=${matchId}`;
    // Push latest state to Supabase first so the link is immediately live
    await pushLiveMatchState(match);
    // Generate QR codes
    try {
      const QRCode = await import('qrcode');
      const opts = { width: 220, margin: 1, color: { dark: '#ffffff', light: '#111111' } };
      const [hQR, bQR] = await Promise.all([
        QRCode.toDataURL(handoffUrl, opts),
        QRCode.toDataURL(broadcastUrl, opts),
      ]);
      setHandoffQRUrl(hQR);
      setBroadcastQRUrl(bQR);
    } catch (_) {}
    setTransferTab('HANDOFF');
    setTransferLinkCopied(false);
    setShowTransferModal(true);
  };

  const copyTransferLink = (url: string) => {
    navigator.clipboard?.writeText(url).catch(() => {});
    setTransferLinkCopied(true);
    setTimeout(() => setTransferLinkCopied(false), 2500);
  };

  // ââ Share helpers âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const generateShareText = (type: 'LIVE' | 'FINAL'): string => {
    const battingTeam = getTeamObj(match.teams.battingTeamId);
    const bowlingTeam = getTeamObj(match.teams.bowlingTeamId);
    if (type === 'LIVE') {
      const overs = `${Math.floor(match.liveScore.balls/6)}.${match.liveScore.balls%6}`;
      const lines: string[] = [
        'ð *22YARDS Â· LIVE SCORECARD*', '',
        `${battingTeam.name}  vs  ${bowlingTeam.name}`,
        `ð *${match.liveScore.runs}/${match.liveScore.wickets}* (${overs} ov)`,
      ];
      if (match.currentInnings === 2 && match.config.target) {
        lines.push(`ð¯ Target ${match.config.target} Â· Need ${Math.max(0, match.config.target - match.liveScore.runs)} in ${Math.max(0, match.config.overs*6 - match.liveScore.balls)} balls`);
      }
      const s = getPlayer(match.crease.strikerId);
      const b = getPlayer(match.crease.bowlerId);
      if (s) lines.push(`ð ${s.name}: ${s.runs}(${s.balls})`);
      if (b) lines.push(`ð³ ${b.name}: ${b.wickets}/${b.runs_conceded}`);
      const liveUrl = `${window.location.origin}/?watch=${match.matchId}`;
      lines.push('', `ð¡ *Watch Live:* ${liveUrl}`);
      lines.push('ð² 22YARDS Cricket App');
      return lines.join('\n');
    }
    // FINAL
    const inn1Key = match.teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB';
    const inn1Team = match.teams[inn1Key];
    const inn2Team = battingTeam;
    const lines: string[] = [
      'ð *22YARDS Â· MATCH REPORT*', '',
      `${inn1Team.name}  vs  ${inn2Team.name}`,
      `ð ${match.config.dateTime || 'Today'}`,
      `ðï¸ ${match.config.ground || 'Ground'}, ${match.config.city}`,
      ``, `ð *${winnerTeam?.margin || 'MATCH COMPLETED'}*`, ''
    ];
    const top2 = (sq: any[]) => [...sq].sort((a,b) => (b.runs||0)-(a.runs||0)).filter(p => (p.runs||0)>0).slice(0,2);
    const topBat = top2(inn1Team.squad || []);
    if (topBat.length) { lines.push(`*${inn1Team.name} Batting*`); topBat.forEach(p => lines.push(`  ${p.name}: ${p.runs}(${p.balls})`)); lines.push(''); }
    const topBowl = [...(inn2Team.squad||[])].filter(p=>(p.wickets||0)>0).sort((a,b)=>(b.wickets||0)-(a.wickets||0)).slice(0,2);
    if (topBowl.length) {
      lines.push('*Bowling*');
      topBowl.forEach(p => {
        const ov = p.balls_bowled ? `${Math.floor(p.balls_bowled/6)}.${p.balls_bowled%6}` : '0';
        lines.push(`  ${p.name}: ${p.wickets}/${p.runs_conceded} (${ov})`);
      });
      lines.push('');
    }
    lines.push('ð² 22YARDS Cricket App');
    return lines.join('\n');
  };

  const handleShareAction = async (text: string) => {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (navigator.share) {
      try { await navigator.share({ title: '22YARDS Cricket', text }); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true); setTimeout(() => setShareCopied(false), 2500);
    } catch { window.open(waUrl, '_blank'); }
  };
  const isConfigValid = useMemo(() => match.config.overs > 0 && match.config.city.trim() !== '' && match.config.ground.trim() !== '', [match.config]);

  // Avatar helper â uses actual uploaded photo for the logged-in user, dicebear for others
  const getPlayerAvatar = (player: any): string => {
    if (player && player.phone && userData?.phone && player.phone === userData.phone && userData?.avatar) {
      return userData.avatar;
    }
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${player?.id || player?.name || 'unknown'}&backgroundColor=050505`;
  };

  const triggerLogoUpload = (teamId: TeamID) => { setActiveLogoTeamId(teamId); logoInputRef.current?.click(); };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeLogoTeamId) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const logoData = reader.result as string;
        setMatch(m => {
          const key = activeLogoTeamId === 'A' ? 'teamA' : 'teamB';
          return { ...m, teams: { ...m.teams, [key]: { ...m.teams[key], logo: logoData } } };
        });
        setActiveLogoTeamId(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const getWicketDetail = (player, inningsNum) => {
    const outEvent = (match.history || []).find(h => h.innings === inningsNum && h.isWicket && h.strikerId === player.id);
    if (!outEvent) {
        const isBattingNow = match.status === 'LIVE' && match.currentInnings === inningsNum && (match.crease.strikerId === player.id || match.crease.nonStrikerId === player.id);
        const hasFacedBalls = (player.balls || 0) > 0;
        return (hasFacedBalls || isBattingNow) ? 'not out' : '';
    }
    const bowler = getPlayer(outEvent.bowlerId);
    const bowlerName = bowler ? bowler.name : 'Unknown';
    const fielder = getPlayer(outEvent.fielderId);
    const fielderName = fielder ? fielder.name : '';
    switch(outEvent.wicketType) {
        case 'BOWLED': return `b ${bowlerName}`;
        case 'CAUGHT': return (fielderName && fielderName !== bowlerName) ? `c ${fielderName} b ${bowlerName}` : `c & b ${bowlerName}`;
        case 'LBW': return `lbw b ${bowlerName}`;
        case 'STUMPED': return `st ${fielderName || 'Keeper'} b ${bowlerName}`;
        case 'RUN OUT': return `run out (${fielderName || 'Fielder'})`;
        case 'HIT WICKET': return `hit wicket b ${bowlerName}`;
        default: return `out b ${bowlerName}`;
    }
  };

  const innings1TeamId = match.currentInnings === 1 ? match.teams.battingTeamId : match.teams.bowlingTeamId;
  const innings2TeamId = match.currentInnings === 1 ? match.teams.bowlingTeamId : match.teams.battingTeamId;

  return (
    <div className="h-full w-full bg-[#050505] text-white flex flex-col overflow-hidden relative font-sans max-h-[100dvh]">
      <input type="file" ref={logoInputRef} onChange={handleLogoFileChange} className="hidden" accept="image/*" />
      <div className="h-14 flex items-center px-6 border-b border-white/5 bg-black/50 backdrop-blur-md z-[100] shrink-0">
        <button onClick={onBack} className="p-2 -ml-2 text-[#00F0FF] hover:bg-white/5 rounded-full transition-all"><ChevronLeft size={20} /></button>
        <h2 className="ml-4 font-heading text-xl tracking-[0.1em] text-white uppercase italic">{status === 'LIVE' ? 'BATTLEFIELD' : status === 'SUMMARY' ? 'ARENA TELEMETRY' : 'START A MATCH'}</h2>
        <div className="flex-1" />
        {status === 'LIVE' && (
          <div className="flex items-center space-x-1">
            {match.history && match.history.length > 0 && (
              <button
                onClick={() => { setShareText(generateShareText('LIVE')); setShowShareModal(true); }}
                className="p-2 text-[#39FF14] hover:bg-white/5 rounded-full transition-all"
                title="Share live scorecard"
              >
                <Share2 size={18} />
              </button>
            )}
            <button onClick={() => setShowLiveScorecard(true)} className="p-2 text-[#00F0FF]"><ClipboardList size={20} /></button>
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">
        <AnimatePresence>{overlayAnim && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[5000] flex items-center justify-center pointer-events-none overflow-hidden"><motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 0.7, 0] }} transition={{ duration: overlayAnim === 'FREE_HIT' ? 2 : 0.6, repeat: overlayAnim === 'FREE_HIT' ? 1 : 0 }} className={`absolute inset-0 ${overlayAnim === 'SIX' ? 'bg-[#FFD600]' : overlayAnim === 'FOUR' ? 'bg-[#BC13FE]' : overlayAnim === 'WICKET' ? 'bg-[#FF003C]' : overlayAnim === 'FREE_HIT' ? 'bg-gradient-to-tr from-[#00F0FF] via-[#FFD600] to-[#00F0FF]' : 'bg-[#00F0FF]'}`} /><motion.div initial={{ scale: 0.2, rotate: overlayAnim === 'FREE_HIT' ? 12 : -15, filter: 'blur(15px)' }} animate={{ scale: [1, 1.4, 1], rotate: 0, filter: 'blur(0px)', x: overlayAnim === 'FREE_HIT' ? [0, -15, 15, -15, 15, 0] : 0, y: overlayAnim === 'FREE_HIT' ? [0, 10, -10, 10, -10, 0] : 0 }} exit={{ scale: 3, opacity: 0, filter: 'blur(30px)' }} transition={{ type: 'spring', damping: 8, stiffness: 300, duration: overlayAnim === 'FREE_HIT' ? 2 : 0.6 }} className="relative z-10 px-6 text-center"><h1 className={`font-heading ${overlayAnim === 'INNINGS_BREAK' ? 'text-[80px] sm:text-[100px]' : 'text-[120px] sm:text-[140px]'} italic font-black leading-none drop-shadow-[0_0_40px_rgba(0,0,0,0.6)] ${overlayAnim === 'SIX' ? 'text-[#FFD600]' : overlayAnim === 'FOUR' ? 'text-[#BC13FE]' : overlayAnim === 'WICKET' ? 'text-[#FF003C]' : overlayAnim === 'FREE_HIT' ? 'text-white' : 'text-[#00F0FF]'}`}>{overlayAnim === 'INNINGS_BREAK' ? 'INNINGS BREAK' : overlayAnim === 'FREE_HIT' ? 'FREE HIT!' : overlayAnim}</h1>{overlayAnim === 'FREE_HIT' && (<motion.div animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.2 }} className="mt-2 text-[10px] font-black uppercase tracking-[0.8em] text-[#00F0FF]">DANGER SQUADRON ACTIVE</motion.div>)}</motion.div></motion.div>)}</AnimatePresence>
        {status === 'CONFIG' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-10 pb-32">
              <div className="flex items-center justify-between relative px-2 py-6 bg-white/[0.02] border border-white/5 rounded-[40px]">
                {['A', 'B'].map(id => {
                  const team = getTeamObj(id);
                  return (
                    <div key={id} className="flex flex-col items-center space-y-4 w-[42%] relative z-10">
                      <div className="relative group">
                         <div onClick={() => triggerLogoUpload(id)} className="w-20 h-20 rounded-full bg-black border-4 border-white/10 flex items-center justify-center font-heading text-3xl text-white overflow-hidden shadow-2xl relative cursor-pointer active:scale-95 transition-all">{team.logo ? <img src={team.logo} className="absolute inset-0 w-full h-full object-cover" /> : getTeamInitials(team.name)}</div>
                         <button onClick={() => triggerLogoUpload(id)} className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#00F0FF] text-black rounded-full flex items-center justify-center shadow-lg border-2 border-black group-hover:scale-110 transition-all"><Upload size={12} strokeWidth={3} /></button>
                      </div>
                      <div className="text-center space-y-2 w-full px-2">
                        <div className="flex items-center justify-center space-x-1">{editingTeamNameId === id ? (<input autoFocus className="bg-black/40 border border-[#00F0FF]/30 rounded px-2 py-1 text-[10px] font-black uppercase text-white w-full text-center outline-none" value={team.name} onBlur={() => setEditingTeamNameId(null)} onChange={(e) => { const val = e.target.value.toUpperCase(); setMatch(m => ({ ...m, teams: { ...m.teams, [id === 'A' ? 'teamA' : 'teamB']: { ...(m.teams[id === 'A' ? 'teamA' : 'teamB'] || {}), name: val } } })); }} />) : (<button onClick={() => setEditingTeamNameId(id)} className="flex items-center space-x-1 max-w-full"><p className="text-[10px] font-black uppercase text-white tracking-tight truncate">{team.name || 'ENTER NAME'}</p><Edit2 size={8} className="text-white/20 shrink-0" /></button>)}</div>
                        <button onClick={() => setEditingTeamId(id)} className="w-full py-2 rounded-xl bg-[#4DB6AC] text-black text-[8px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">Squad ({(team.squad || []).length})</button>
                      </div>
                    </div>
                  );
                })}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#121212] border border-white/10 flex items-center justify-center text-[9px] font-black text-white/20 italic z-10 shadow-xl">VS</div>
              </div>
              <div className="space-y-10">
                <div className="space-y-4"><label className="text-[9px] font-black text-white/30 uppercase tracking-[0.4em] ml-1">Match Type*</label><div className="flex flex-wrap gap-2">{['LIMITED_OVERS', 'BOX_TURF', 'PAIR_CRICKET', 'TEST', 'THE_HUNDRED'].map(type => (<button key={type} onClick={() => setMatch(m => ({ ...m, config: { ...m.config, matchType: type } }))} className={`px-5 py-3 rounded-2xl border text-[9px] font-black uppercase tracking-widest transition-all ${match.config.matchType === type ? 'bg-[#00F0FF] text-black border-[#00F0FF] shadow-lg shadow-[#00F0FF]/10' : 'bg-white/5 border-white/5 text-white/30'}`}>{type.replace('_', ' ')}</button>))}</div></div>
                <div className="grid grid-cols-2 gap-4 items-center">
                   <div className="space-y-3"><label className="text-[9px] font-black text-white/30 uppercase tracking-[0.4em] ml-1">Overs</label><div className="flex items-center bg-black/40 border border-white/5 rounded-2xl p-1 px-4 focus-within:border-[#00F0FF]/40 transition-all"><input type="number" min="1" max="999" value={match.config.overs} onChange={(e) => { const val = parseInt(e.target.value); setMatch(m => ({ ...m, config: { ...m.config, overs: isNaN(val) ? 0 : val } })); }} className="w-full bg-transparent text-center font-numbers text-3xl font-black py-4 text-white outline-none placeholder:text-white/5" /></div></div>
                   <div className="space-y-3"><div className="flex justify-between items-center pr-1"><label className="text-[9px] font-black text-white/30 uppercase tracking-[0.4em] ml-1">Over Limit</label><button className="text-[8px] font-black text-[#00F0FF] uppercase tracking-widest flex items-center">Power Play <ChevronRight size={10} className="ml-1" /></button></div><div className="flex items-center bg-black/40 border border-white/5 rounded-2xl p-1 px-4 focus-within:border-[#00F0FF]/40 transition-all"><input type="number" min="1" max="100" value={match.config.oversPerBowler} onChange={(e) => { const val = parseInt(e.target.value); setMatch(m => ({ ...m, config: { ...m.config, oversPerBowler: isNaN(val) ? 0 : val } })); }} className="w-full bg-transparent text-center font-numbers text-3xl font-black py-4 text-white outline-none placeholder:text-white/5" /></div></div>
                </div>
                <div className="space-y-6 pt-2">
                  <div className="space-y-2"><label className="text-[9px] font-black text-white/30 uppercase tracking-[0.4em] ml-1">City / Town*</label><div className="relative group"><MapPin size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-[#00F0FF] transition-all" /><input type="text" value={match.config.city} onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, city: e.target.value } }))} className="w-full bg-black/40 border border-white/5 rounded-2xl py-5 pl-14 pr-6 text-sm font-bold text-white outline-none focus:border-[#00F0FF]/40 uppercase transition-all" placeholder="KANPUR" /></div></div>
                  <div className="space-y-2"><label className="text-[9px] font-black text-white/30 uppercase tracking-[0.4em] ml-1">Ground*</label><div className="relative group"><ImageIcon size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-[#00F0FF] transition-all" /><input type="text" value={match.config.ground} placeholder="STADIUM NAME" onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, ground: e.target.value } }))} className="w-full bg-black/40 border border-white/5 rounded-2xl py-5 pl-14 pr-6 text-sm font-bold text-white outline-none focus:border-[#00F0FF]/40 uppercase placeholder:text-white/5 transition-all" /></div></div>
                </div>
              </div>
            </div>
            <div className="p-6 bg-[#050505] border-t border-white/5 z-[200] shrink-0 pb-10 shadow-[0_-20px_60px_rgba(0,0,0,0.9)]"><MotionButton disabled={!isConfigValid} onClick={checkTeamConflicts} className={`w-full py-6 !rounded-[24px] font-black uppercase tracking-[0.4em] text-xs transition-all ${isConfigValid ? 'bg-[#39FF14] text-black shadow-[0_12px_40px_rgba(57,255,20,0.4)]' : 'bg-white/5 text-white/10 border-white/5'}`}>Initiate Protocol</MotionButton></div>
          </div>
        )}
        <AnimatePresence>{squadConflict && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] bg-black/95 flex items-center justify-center p-6 backdrop-blur-xl"><motion.div initial={{ scale: 0.9, y: 40 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm bg-[#0A0A0A] border border-white/10 rounded-[48px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)]"><div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]"><div className="flex items-center space-x-3"><ShieldAlert size={24} className="text-[#FFD600]" /><h3 className="font-heading text-4xl tracking-tighter uppercase italic">SQUAD RECON</h3></div></div><div className="p-10 space-y-8"><div className="space-y-4 text-center"><p className="text-[11px] font-black text-[#00F0FF] uppercase tracking-[0.4em]">Conflict Detected</p><h4 className="font-heading text-5xl uppercase leading-none text-white italic">{squadConflict.name}</h4><p className="text-[10px] font-black text-white/30 uppercase leading-relaxed tracking-widest">THIS TEAM ALREADY EXISTS IN YOUR CAREER ARCHIVE. LINK TO THE EXISTING SQUADRON OR COMMISSION A NEW DEPLOYMENT?</p></div><div className="p-5 bg-white/5 rounded-3xl border border-white/10 space-y-4"><div className="flex justify-between items-center px-2"><span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Archived Roster</span><span className="text-[9px] font-black text-[#39FF14] uppercase">{(squadConflict.existingSquad || []).length} PERSONNEL</span></div><div className="flex -space-x-3 justify-center overflow-hidden py-2">{(squadConflict.existingSquad || []).slice(0, 5).map((p, i) => (<div key={i} className="w-10 h-10 rounded-full border-2 border-black bg-[#111] overflow-hidden"><img src={getPlayerAvatar(p)} className="w-full h-full object-cover" /></div>))}{squadConflict.existingSquad.length > 5 && (<div className="w-10 h-10 rounded-full border-2 border-black bg-[#111] flex items-center justify-center text-[10px] font-black text-white/40">+{squadConflict.existingSquad.length - 5}</div>)}</div></div><div className="flex flex-col space-y-3"><MotionButton onClick={() => handleResolveConflict('EXISTING')} className="w-full bg-[#00F0FF] text-black py-5 !rounded-[24px] font-black tracking-[0.3em]">ARCHIVE LINKAGE</MotionButton><button onClick={() => handleResolveConflict('NEW')} className="w-full text-white/30 hover:text-white py-4 font-black uppercase text-[9px] tracking-[0.4em] transition-all">FRESH COMMISSION</button></div></div></motion.div></motion.div>)}</AnimatePresence>
        {status === 'TOSS' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
             <div className="flex-1 overflow-y-auto p-6 space-y-12 no-scrollbar pb-32">
              <div className="space-y-6"><div className="flex items-center space-x-2 ml-1"><Target size={14} className="text-[#00F0FF]" /><p className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em]">Toss Winner Protocol</p></div><div className="grid grid-cols-2 gap-4">{['A', 'B'].map(id => (<button key={id} onClick={() => setMatch(m => ({ ...m, toss: { ...m.toss, winnerId: id } }))} className={`flex flex-col items-center p-8 rounded-[40px] border-2 transition-all space-y-4 ${match.toss.winnerId === id ? 'border-[#39FF14] bg-[#39FF14]/10 shadow-[0_0_30px_#39FF1422]' : 'border-white/5 bg-[#121212]'}`}><div className="w-20 h-20 rounded-full bg-black flex items-center justify-center font-heading text-4xl shadow-inner">{getTeamInitials(getTeamObj(id)?.name)}</div><p className={`text-[9px] font-black uppercase tracking-widest text-center ${match.toss.winnerId === id ? 'text-[#39FF14]' : 'text-white/20'}`}>{getTeamObj(id)?.name}</p></button>))}</div></div>
              <div className="space-y-6"><div className="flex items-center space-x-2 ml-1"><Disc size={14} className="text-[#FF003C]" /><p className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em]">Election Decision</p></div><div className="grid grid-cols-2 gap-4">{['BAT', 'BOWL'].map(opt => (<button key={opt} onClick={() => setMatch(m => { const batId = opt === 'BAT' ? m.toss.winnerId : (m.toss.winnerId === 'A' ? 'B' : 'A'); return { ...m, toss: { ...m.toss, decision: opt }, teams: { ...m.teams, battingTeamId: batId, bowlingTeamId: batId === 'A' ? 'B' : 'A' } }; })} className={`flex flex-col items-center p-8 rounded-[40px] border-2 transition-all space-y-4 ${match.toss.decision === opt ? 'border-[#FF003C] bg-[#FF003C]/10 shadow-[0_0_30px_#FF003C22]' : 'border-white/5 bg-[#121212]'}`}><div className="w-20 h-20 rounded-full bg-black flex items-center justify-center shadow-inner">{opt === 'BAT' ? <Swords size={32} /> : <Disc size={32} />}</div><p className={`text-[9px] font-black uppercase tracking-widest ${match.toss.decision === opt ? 'text-[#FF003C]' : 'text-white/20'}`}>{opt}</p></button>))}</div></div>
            </div>
            <div className="p-6 bg-[#050505] border-t border-white/5 flex items-center justify-between shrink-0 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.8)]"><button className="text-[10px] font-black text-white/20 uppercase tracking-widest ml-4">View Rules</button><MotionButton disabled={!match.toss.winnerId || !match.toss.decision} onClick={() => setStatus('OPENERS')} className="bg-[#4DB6AC] text-black !rounded-2xl !px-12 !py-5 font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl">START MATCH</MotionButton></div>
          </div>
        )}
        {status === 'OPENERS' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
             <div className="flex-1 overflow-y-auto p-6 space-y-12 no-scrollbar pb-32"><div className="space-y-8"><div className="flex items-center space-x-2 ml-1"><Users size={14} className="text-[#00F0FF]" /><p className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em]">Combat Personnel</p></div><div className="grid grid-cols-2 gap-4"><button onClick={() => setSelectionTarget('STRIKER')} className={`p-8 rounded-[40px] border-2 flex flex-col items-center space-y-4 bg-[#121212] transition-all ${match.crease.strikerId ? 'border-[#39FF14] bg-[#39FF14]/5 shadow-[0_0_20px_#39FF1411]' : 'border-white/5'}`}><div className="w-16 h-16 rounded-full bg-black flex items-center justify-center border border-white/10 shadow-inner"><User size={32} className={match.crease.strikerId ? 'text-[#39FF14]' : 'text-white/10'} /></div><p className="text-[9px] font-black uppercase text-center tracking-widest">{getPlayer(match.crease.strikerId)?.name || 'STRIKER'}</p></button><button onClick={() => setSelectionTarget('NON_STRIKER')} className={`p-8 rounded-[40px] border-2 flex flex-col items-center space-y-4 bg-[#121212] transition-all ${match.crease.nonStrikerId ? 'border-[#39FF14] bg-[#39FF14]/5 shadow-[0_0_20px_#39FF1411]' : 'border-white/5'}`}><div className="w-16 h-16 rounded-full bg-black flex items-center justify-center border border-white/10 shadow-inner"><User size={32} className={match.crease.nonStrikerId ? 'text-[#39FF14]' : 'text-white/10'} /></div><p className="text-[9px] font-black uppercase text-center tracking-widest">{getPlayer(match.crease.nonStrikerId)?.name || 'NON-STRIKER'}</p></button></div><div className="flex justify-center"><button onClick={() => setSelectionTarget('BOWLER')} className={`w-full p-8 rounded-[40px] border-2 flex flex-col items-center space-y-4 bg-[#121212] transition-all ${match.crease.bowlerId ? 'border-[#00F0FF] bg-[#00F0FF]/5 shadow-[0_0_20px_#00F0FF11]' : 'border-white/5'}`}><div className="w-16 h-16 rounded-full bg-black flex items-center justify-center border border-white/10 shadow-inner"><Disc size={32} className={match.crease.bowlerId ? 'text-[#00F0FF]' : 'text-white/10'} /></div><p className="text-[9px] font-black uppercase text-center tracking-widest">{getPlayer(match.crease.bowlerId)?.name || 'FIRST BOWLER'}</p></button></div></div></div>
             <div className="p-6 bg-[#050505] border-t border-white/5 flex items-center justify-center shrink-0 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.8)]"><MotionButton disabled={!match.crease.strikerId || !match.crease.nonStrikerId || !match.crease.bowlerId} onClick={() => setStatus('LIVE')} className="w-full max-sm bg-[#4DB6AC] text-black !rounded-2xl !py-6 font-black uppercase tracking-[0.4em] text-xs shadow-2xl">DEPLOY SQUADRONS</MotionButton></div>
          </div>
        )}
        {status === 'LIVE' && (
          <div className="flex-1 flex flex-col h-full bg-[#050505] min-h-0 relative">
            {/* Transfer / Broadcast toolbar */}
            <div className="flex items-center justify-end px-5 pt-3 pb-0 shrink-0 space-x-2">
              <button onClick={openTransferModal} className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#FF003C]/10 border border-[#FF003C]/20 rounded-full text-[#FF003C] hover:bg-[#FF003C]/20 transition-all">
                <Share2 size={10} />
                <span className="text-[7px] font-black uppercase tracking-widest">Share Â· Hand Off</span>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto no-scrollbar flex-1 pb-10">
              <div className="bg-[#121212] border border-white/5 rounded-[32px] p-6 space-y-4 shadow-2xl relative overflow-hidden"><div className="absolute top-0 right-0 p-4 opacity-5"><Activity size={80} /></div><div className="flex justify-between items-baseline relative z-10"><div><span className="font-numbers text-[56px] font-black text-white leading-none">{match.liveScore.runs}</span><span className="font-numbers text-4xl text-white/20 mx-2">/</span><span className="font-numbers text-[56px] font-black text-[#FF003C] leading-none">{match.liveScore.wickets}</span></div><div className="text-right"><p className="text-[10px] font-black text-[#00F0FF] uppercase tracking-widest mb-1">OVERS</p><p className="font-numbers text-4xl font-bold text-white/80 leading-none">{Math.floor(Math.max(0, match.liveScore.balls) / 6)}.{Math.max(0, match.liveScore.balls) % 6}</p></div></div>{match.currentInnings === 2 && match.config.target && (<div className="pt-4 border-t border-white/5 mt-2 space-y-3 relative z-10"><div className="flex justify-between items-center"><div className="flex items-center space-x-2"><div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] shadow-[0_0_8px_#39FF14]" /><span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Target {match.config.target}</span></div><div className="text-right"><span className="text-[10px] font-black text-[#39FF14] uppercase tracking-widest">Need {Math.max(0, match.config.target - match.liveScore.runs)} in {Math.max(0, (match.config.overs * 6) - match.liveScore.balls)} balls</span></div></div><div className="h-2 w-full bg-white/5 rounded-full overflow-hidden relative"><div className="absolute inset-0 bg-gradient-to-r from-[#39FF14]/10 to-transparent" /><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (match.liveScore.runs / match.config.target) * 100)}%` }} transition={{ duration: 0.8, ease: "easeOut" }} className="h-full bg-gradient-to-r from-[#39FF14] via-[#00F0FF] to-[#39FF14] relative shadow-[0_0_15px_rgba(57,255,20,0.5)]"><motion.div animate={{ x: ['-100%', '200%'] }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} className="absolute top-0 left-0 w-20 h-full bg-white/20 blur-sm" /></motion.div></div><div className="flex justify-between items-center text-[8px] font-black text-white/20 uppercase tracking-[0.2em]"><span>CRR: {(match.liveScore.runs / (match.liveScore.balls/6 || 1)).toFixed(2)}</span><span>RRR: {match.config.overs * 6 - match.liveScore.balls > 0 ? ((match.config.target - match.liveScore.runs) / (((match.config.overs * 6) - match.liveScore.balls)/6)).toFixed(2) : '0.00'}</span></div></div>)}</div>
              <div className="space-y-3">
                <div className="space-y-2"><div onClick={() => setSelectionTarget('STRIKER')} className={`h-16 bg-[#121212] border-l-4 transition-all rounded-r-2xl flex items-center justify-between px-5 cursor-pointer shadow-lg ${match.crease.strikerId ? 'border-[#39FF14]' : 'border-white/5 opacity-50'}`}><div className="flex items-center space-x-3"><Zap size={14} className="text-[#39FF14]" /><span className="text-sm font-black text-white uppercase truncate">{striker?.name || 'STRIKER'}</span></div><div className="text-right"><span className="font-numbers text-2xl font-black text-white">{striker?.runs || 0}</span><span className="font-numbers text-sm text-white/40 ml-2">({striker?.balls || 0})</span></div></div><div onClick={() => setSelectionTarget('NON_STRIKER')} className={`h-16 bg-[#121212] border-l-4 transition-all rounded-r-2xl flex items-center justify-between px-5 cursor-pointer shadow-lg ${match.crease.nonStrikerId ? 'border-white/20' : 'border-white/5 opacity-50'}`}><div className="flex items-center space-x-3"><User size={14} className="text-white/20" /><span className="text-sm font-bold text-white/60 uppercase truncate">{nonStriker?.name || 'NON-STRIKER'}</span></div><div className="text-right"><span className="font-numbers text-2xl font-bold text-white/40">{nonStriker?.runs || 0}</span><span className="font-numbers text-sm text-white/20 ml-2">({nonStriker?.balls || 0})</span></div></div></div>
                <div onClick={() => setSelectionTarget('NEXT_BOWLER')} className={`h-16 rounded-2xl flex items-center justify-between px-5 cursor-pointer transition-all ${currentBowler ? 'bg-[#121212] border-r-4 border-[#00F0FF] shadow-lg' : 'bg-[#FF003C]/10 border-2 border-dashed border-[#FF003C]/40 animate-pulse'}`}><div className="flex items-center space-x-3"><Disc size={14} className={currentBowler ? "text-[#00F0FF]" : "text-[#FF003C]"} /><span className={`text-sm font-black uppercase truncate ${currentBowler ? "text-white" : "text-[#FF003C]"}`}>{currentBowler?.name || 'SELECT BOWLER'}</span></div>{currentBowler && (<div className="text-right"><span className="font-numbers text-2xl font-black text-[#00F0FF]">{currentBowler?.wickets || 0}</span><span className="font-numbers text-xl text-white/20 mx-1">-</span><span className="font-numbers text-2xl font-black text-white">{currentBowler?.runs_conceded || 0}</span><span className="font-numbers text-sm text-white/40 ml-2">({Math.floor((currentBowler?.balls_bowled || 0) / 6)}.{ (currentBowler?.balls_bowled || 0) % 6 })</span></div>)}</div>
              </div>
            </div>
            <div className="p-3 sm:p-4 bg-black border-t border-white/5 space-y-3 z-[110] shrink-0 pb-16 sm:pb-20"><div className="grid grid-cols-4 gap-2 sm:gap-3">{[0, 1, 2, 3].map(r => (<KeypadButton key={r} disabled={!currentBowler} onClick={() => handleScore(r)}>{r}</KeypadButton>))}<KeypadButton disabled={!currentBowler} onClick={() => handleScore(4)} color={CYBER_COLORS.purple}>4</KeypadButton><KeypadButton disabled={!currentBowler} onClick={() => handleScore(6)} color={CYBER_COLORS.gold}>6</KeypadButton><KeypadButton disabled={!currentBowler} onClick={() => setPendingExtra(pendingExtra === 'WD' ? null : 'WD')} active={pendingExtra === 'WD'} color={CYBER_COLORS.cyan} bg={CYBER_COLORS.bg}><span className="text-[10px] font-black">WD</span></KeypadButton><KeypadButton disabled={!currentBowler} onClick={() => setPendingExtra(pendingExtra === 'NB' ? null : 'NB')} active={pendingExtra === 'NB'} color={CYBER_COLORS.cyan} bg={CYBER_COLORS.bg}><span className="text-[10px] font-black">NB</span></KeypadButton><KeypadButton disabled={!currentBowler} onClick={() => setWicketWizard({ open: true })} color="white" bg={CYBER_COLORS.red} span={2}><span className="text-[11px] font-black uppercase tracking-widest">WICKET</span></KeypadButton><KeypadButton disabled={!currentBowler} onClick={() => setPendingExtra(pendingExtra === 'BYE' ? null : 'BYE')} active={pendingExtra === 'BYE'} color={CYBER_COLORS.cyan} bg={CYBER_COLORS.bg}><span className="text-[10px] font-black">BYE</span></KeypadButton><KeypadButton disabled={!currentBowler} onClick={() => setPendingExtra(pendingExtra === 'LB' ? null : 'LB')} active={pendingExtra === 'LB'} color={CYBER_COLORS.teal} bg={CYBER_COLORS.bg}><span className="text-[10px] font-black">LB</span></KeypadButton><KeypadButton disabled={!currentBowler} onClick={() => { commitBall(5, 'PENALTY_RUNS'); }} color={CYBER_COLORS.orange} bg={CYBER_COLORS.bg}><span className="text-[10px] font-black">PEN</span></KeypadButton><KeypadButton onClick={() => setMatch(m => ({ ...m, crease: { ...m.crease, strikerId: m.crease.nonStrikerId, nonStrikerId: m.crease.strikerId } }))} color={CYBER_COLORS.teal}><ArrowLeftRight size={24} /></KeypadButton><KeypadButton onClick={handleUndo} disabled={!match.history || match.history.length === 0} color={CYBER_COLORS.orange}><Undo2 size={24} /></KeypadButton></div></div>
          </div>
        )}
        {status === 'SUMMARY' && (
          <div className="flex-1 flex flex-col h-full bg-[#050505] min-h-0 overflow-hidden">
            <div className="sticky top-0 z-[120] bg-black/80 backdrop-blur-xl border-b border-white/5 flex px-4 pt-4 pb-2 shrink-0">{['OVERVIEW', 'ANALYTICS', 'SCORECARD'].map(tab => (<button key={tab} onClick={() => setSummaryTab(tab)} className={`flex-1 py-3 text-[10px] font-black tracking-widest transition-all ${summaryTab === tab ? 'text-[#00F0FF] border-b-2 border-[#00F0FF]' : 'text-white/20'}`}>{tab}</button>))}</div>
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-10 pb-40">
               {summaryTab === 'OVERVIEW' && (
                 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
                    <div className="text-center space-y-4 py-8 border-b border-white/5"><Trophy size={64} className="mx-auto text-[#FFD600] drop-shadow-[0_0_20px_rgba(255,214,0,0.4)]" /><div className="space-y-1"><h3 className="font-heading text-6xl italic leading-none uppercase">{winnerTeam?.name}</h3><p className="text-sm font-black text-[#39FF14] uppercase tracking-[0.3em]">{winnerTeam?.margin}</p></div></div>
                    <div className="space-y-4"><h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 ml-2">Man of the Match</h4><div className="p-8 bg-gradient-to-br from-[#FFD600]/20 to-[#00F0FF]/10 border border-[#FFD600]/30 rounded-[40px] relative overflow-hidden group shadow-2xl"><Medal className="absolute top-6 right-6 text-[#FFD600] opacity-40 animate-pulse" size={48} /><div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 relative z-10"><div className="w-32 h-32 rounded-full bg-black border-4 border-[#FFD600] overflow-hidden shadow-2xl shrink-0"><img src={getPlayerAvatar(performerStats.mvp)} className="w-full h-full object-cover" /></div><div className="flex-1 text-center sm:text-left space-y-4"><div><p className="text-4xl font-heading italic uppercase tracking-tighter text-white leading-none">{performerStats.mvp?.name || 'TBA'}</p><p className="text-[9px] font-black text-[#FFD600] uppercase tracking-widest mt-1">Operational Superiority Point: {performerStats.mvp?.impact?.toFixed(0)}</p></div><div className="grid grid-cols-3 gap-3"><div className="text-center bg-white/5 p-3 rounded-2xl border border-white/5"><p className="font-numbers text-2xl font-black text-[#00F0FF]">{performerStats.mvp?.runs || 0}</p><p className="text-[7px] font-black text-white/30 uppercase mt-1">Runs</p></div><div className="text-center bg-white/5 p-3 rounded-2xl border border-white/5"><p className="font-numbers text-2xl font-black text-[#39FF14]">{performerStats.mvp?.wickets || 0}</p><p className="text-[7px] font-black text-white/30 uppercase mt-1">Wickets</p></div><div className="text-center bg-white/5 p-3 rounded-2xl border border-white/5"><p className="font-numbers text-2xl font-black text-[#FF003C]">{(performerStats.mvp?.catches || 0) + (performerStats.mvp?.run_outs || 0) + (performerStats.mvp?.stumpings || 0)}</p><p className="text-[7px] font-black text-white/30 uppercase mt-1">Dismissals</p></div></div></div></div></div></div>
                    <div className="grid grid-cols-2 gap-4"><div className="p-6 bg-white/[0.03] border border-white/10 rounded-[32px] space-y-4 relative overflow-hidden"><Bolt className="absolute top-4 right-4 text-[#00F0FF] opacity-10" size={32} /><div className="flex items-center space-x-3"><div className="w-12 h-12 rounded-full bg-black border border-[#00F0FF]/40 overflow-hidden"><img src={getPlayerAvatar(performerStats.bestBatsman)} className="w-full h-full object-cover" /></div><div><p className="font-bold text-xs uppercase text-white/40">Best Batsman</p><p className="font-heading text-xl italic uppercase leading-none">{performerStats.bestBatsman?.name}</p></div></div><div className="pt-2 flex justify-between items-end border-t border-white/5"><div><p className="font-numbers text-3xl font-black text-[#00F0FF]">{performerStats.bestBatsman?.runs || 0}</p><p className="text-[7px] font-bold text-white/20 uppercase">Runs Scored</p></div><div className="text-right"><p className="font-numbers text-lg text-white/40">{performerStats.bestBatsman?.balls || 0}</p><p className="text-[7px] font-bold text-white/20 uppercase">Balls</p></div></div></div><div className="p-6 bg-white/[0.03] border border-white/10 rounded-[32px] space-y-4 relative overflow-hidden"><Crosshair className="absolute top-4 right-4 text-[#39FF14] opacity-10" size={32} /><div className="flex items-center space-x-3"><div className="w-12 h-12 rounded-full bg-black border border-[#39FF14]/40 overflow-hidden"><img src={getPlayerAvatar(performerStats.bestBowler)} className="w-full h-full object-cover" /></div><div><p className="font-bold text-xs uppercase text-white/40">Best Bowler</p><p className="font-heading text-xl italic uppercase leading-none">{performerStats.bestBowler?.name}</p></div></div><div className="pt-2 flex justify-between items-end border-t border-white/5"><div><p className="font-numbers text-3xl font-black text-[#39FF14]">{performerStats.bestBowler?.wickets || 0}</p><p className="text-[7px] font-bold text-white/20 uppercase">Wickets Taken</p></div><div className="text-right"><p className="font-numbers text-lg text-white/40">{performerStats.bestBowler?.runs_conceded || 0}</p><p className="text-[7px] font-bold text-white/20 uppercase">Runs Con</p></div></div></div></div>
                    <div className="space-y-4"><h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 ml-2">Top Performers</h4><div className="space-y-3">{performerStats.rankings.map((p, i) => (<div key={p.id} className="flex items-center justify-between p-5 bg-[#121212] border border-white/5 rounded-2xl group hover:border-[#00F0FF]/40 transition-all cursor-pointer"><div className="flex items-center space-x-4"><span className="font-numbers text-[#00F0FF] text-lg font-black w-6">0{i+1}</span><div className="w-10 h-10 rounded-full bg-black border border-white/10 overflow-hidden"><img src={getPlayerAvatar(p)} className="w-full h-full object-cover" /></div><p className="font-black text-xs uppercase tracking-tight">{p.name}</p></div><div className="text-right"><span className="text-[11px] font-black text-[#39FF14] bg-[#39FF14]/10 px-3 py-1 rounded-full">{p.impact.toFixed(0)} IMPACT</span></div></div>))}</div></div>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setShareText(generateShareText('FINAL')); setShowShareModal(true); }} className="w-full py-5 border-2 border-[#39FF14]/30 rounded-[24px] text-[#39FF14] text-[10px] font-black uppercase tracking-widest flex items-center justify-center space-x-3 hover:bg-[#39FF14]/10 active:bg-[#39FF14]/20 transition-all shadow-[0_0_20px_rgba(57,255,20,0.08)]"><Share2 size={16} /><span>Share Match Scorecard</span></motion.button>
                 </motion.div>
               )}
               {summaryTab === 'ANALYTICS' && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12 pb-20"><div className="space-y-4"><div className="flex justify-between items-center ml-2"><h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Manhattan Plot</h4></div><div className="h-72 w-full bg-black/40 rounded-[40px] p-6 border border-white/5 shadow-[0_30px_70px_rgba(0,0,0,0.9)] overflow-visible"><ResponsiveContainer width="100%" height="100%"><BarChart data={analyticsData.overs} margin={{ top: 20, right: 30, left: 0, bottom: 10 }}><CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} /><XAxis dataKey="over" stroke="#ffffffCC" fontSize={12} axisLine={false} tickLine={false} dy={10} tick={{ fill: '#ffffffCC', fontSize: 10, fontWeight: 900 }} label={{ value: 'OVERS', position: 'bottom', fill: '#ffffff80', fontSize: 10, fontWeight: 900, offset: -5 }} /><YAxis stroke="#ffffffCC" fontSize={12} axisLine={false} tickLine={false} dx={-10} tick={{ fill: '#ffffffCC', fontSize: 10, fontWeight: 900 }} /><Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={{ backgroundColor: '#000', border: '1px solid #ffffff10', fontSize: '10px', fontWeight: 900, borderRadius: '12px' }} itemStyle={{ color: '#fff' }} /><Bar dataKey="team1" fill={CYBER_COLORS.cyan} radius={[6, 6, 0, 0]} name="Innings 1" isAnimationActive={true} /><Bar dataKey="team2" fill={CYBER_COLORS.green} radius={[6, 6, 0, 0]} name="Innings 2" isAnimationActive={true} /></BarChart></ResponsiveContainer></div></div><div className="space-y-4"><div className="flex justify-between items-center ml-2"><h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Worm Progression</h4></div><div className="h-72 w-full bg-black/40 rounded-[40px] p-6 border border-white/5 shadow-[0_30px_70px_rgba(0,0,0,0.9)] overflow-visible relative"><ResponsiveContainer width="100%" height="100%"><AreaChart data={analyticsData.worm} margin={{ top: 20, right: 30, left: 0, bottom: 10 }}><defs><linearGradient id="wormInn1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CYBER_COLORS.cyan} stopOpacity={0.3}/><stop offset="95%" stopColor={CYBER_COLORS.cyan} stopOpacity={0}/></linearGradient><linearGradient id="wormInn2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CYBER_COLORS.green} stopOpacity={0.3}/><stop offset="95%" stopColor={CYBER_COLORS.green} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} /><XAxis dataKey="over" stroke="#ffffffCC" fontSize={12} axisLine={false} tickLine={false} dy={10} tick={{ fill: '#ffffffCC', fontSize: 10, fontWeight: 900 }} label={{ value: 'OVERS', position: 'bottom', fill: '#ffffff80', fontSize: 10, fontWeight: 900, offset: -5 }} /><YAxis stroke="#ffffffCC" fontSize={12} axisLine={false} tickLine={false} dx={-10} tick={{ fill: '#ffffffCC', fontSize: 10, fontWeight: 900 }} /><Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #ffffff10', fontSize: '10px', fontWeight: 900, borderRadius: '12px' }} /><Area type="monotone" dataKey="Team1" stroke={CYBER_COLORS.cyan} strokeWidth={4} fill="url(#wormInn1)" dot={{ r: 5, fill: CYBER_COLORS.cyan, strokeWidth: 0 }} name="Innings 1" isAnimationActive={true} animationDuration={2500} /><Area type="monotone" dataKey="Team2" stroke={CYBER_COLORS.green} strokeWidth={4} fill="url(#wormInn2)" dot={{ r: 5, fill: CYBER_COLORS.green, strokeWidth: 0 }} name="Innings 2" connectNulls isAnimationActive={true} animationDuration={2500} /></AreaChart></ResponsiveContainer></div></div></motion.div>
               )}
               {summaryTab === 'SCORECARD' && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12"><div className="p-6 bg-white/[0.02] border border-white/5 rounded-[32px] space-y-4"><p className="text-lg font-black text-[#39FF14] italic uppercase tracking-tighter">{winnerTeam?.name} {winnerTeam?.margin}</p><div className="flex justify-between items-baseline"><div className="space-y-1"><p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">FIRST INNINGS</p><h4 className="font-heading text-4xl leading-none">{getTeamObj(innings1TeamId)?.name}</h4></div><div className="text-right"><p className="font-numbers text-5xl font-black text-white">{match.config.innings1Score}-{match.config.innings1Wickets}</p><p className="text-[10px] font-bold text-white/30 uppercase">({Math.floor(match.config.innings1Balls / 6)}.{match.config.innings1Balls % 6})</p></div></div></div><div className="space-y-6"><div className="bg-[#064e3b] p-4 flex justify-between items-center rounded-t-3xl"><h4 className="text-[12px] font-black uppercase tracking-widest text-white">{getTeamObj(innings1TeamId)?.name}</h4><span className="font-numbers text-xl text-white font-black">{match.config.innings1Score}/{match.config.innings1Wickets} ({Math.floor(match.config.innings1Balls / 6)}.{match.config.innings1Balls % 6})</span></div><div className="bg-[#121212] border border-white/5 rounded-b-3xl overflow-hidden shadow-2xl"><div className="grid grid-cols-12 p-3 bg-white/[0.05] border-b border-white/10 text-[9px] font-black uppercase text-white/40 tracking-widest"><span className="col-span-5">Batsman</span><span className="text-center col-span-1">R</span><span className="text-center col-span-1">B</span><span className="text-center col-span-1">4s</span><span className="text-center col-span-1">6s</span><span className="text-right col-span-3">SR</span></div>{(getTeamObj(innings1TeamId)?.squad || []).map((p, i) => { const detail = getWicketDetail(p, 1); return (<div key={i} className="grid grid-cols-12 p-4 border-b border-white/5 items-center last:border-0 hover:bg-white/[0.02] transition-colors"><div className="col-span-5 flex flex-col"><span className="text-xs font-black uppercase text-white truncate">{p.name}</span><span className="text-[8px] font-bold text-white/20 italic tracking-tighter mt-0.5">{detail}</span></div><span className="text-center col-span-1 font-numbers text-[#00F0FF] font-black">{p.runs || 0}</span><span className="text-center col-span-1 font-numbers text-white/30 text-[10px]">{p.balls || 0}</span><span className="text-center col-span-1 font-numbers text-white/40 text-[10px]">{p.fours || 0}</span><span className="text-center col-span-1 font-numbers text-[#FFD600] font-bold text-[10px]">{p.sixes || 0}</span><span className="text-right col-span-3 font-numbers text-white/20 text-[10px]">{p.balls > 0 ? ((p.runs/p.balls)*100).toFixed(2) : '0.00'}</span></div>)})}</div><div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden mt-4"><div className="grid grid-cols-12 p-3 bg-white/[0.05] border-b border-white/10 text-[9px] font-black uppercase text-white/40 tracking-widest"><span className="col-span-5">Bowler</span><span className="text-center col-span-1">O</span><span className="text-center col-span-1">M</span><span className="text-center col-span-1">R</span><span className="text-center col-span-1">W</span><span className="text-right col-span-3">ER</span></div>{(getTeamObj(innings2TeamId)?.squad || []).map((p, i) => ( (p.balls_bowled || 0) > 0 && (<div key={i} className="grid grid-cols-12 p-4 border-b border-white/5 items-center last:border-0"><span className="col-span-5 text-xs font-bold uppercase text-white truncate">{p.name}</span><span className="text-center col-span-1 font-numbers text-white/40 text-[10px]">{Math.floor(p.balls_bowled/6)}.{p.balls_bowled%6}</span><span className="text-center col-span-1 font-numbers text-white/20 text-[10px]">0</span><span className="text-center col-span-1 font-numbers text-white/60 text-[10px]">{p.runs_conceded || 0}</span><span className="text-center col-span-1 font-numbers text-[#FF003C] font-black">{p.wickets || 0}</span><span className="text-right col-span-3 font-numbers text-white/30 text-[10px]">{p.balls_bowled > 0 ? ((p.runs_conceded/p.balls_bowled)*6).toFixed(2) : '0.00'}</span></div>) ))}</div></div><div className="space-y-6 pt-10 border-t border-white/5"><div className="bg-[#064e3b] p-4 flex justify-between items-center rounded-t-3xl"><h4 className="text-[12px] font-black uppercase tracking-widest text-white">{getTeamObj(innings2TeamId)?.name}</h4><span className="font-numbers text-xl text-white font-black">{match.liveScore.runs}/{match.liveScore.wickets} ({Math.floor(match.liveScore.balls / 6)}.{match.liveScore.balls % 6})</span></div><div className="bg-[#121212] border border-white/5 rounded-b-3xl overflow-hidden shadow-2xl"><div className="grid grid-cols-12 p-3 bg-white/[0.05] border-b border-white/10 text-[9px] font-black uppercase text-white/40 tracking-widest"><span className="col-span-5">Batsman</span><span className="text-center col-span-1">R</span><span className="text-center col-span-1">B</span><span className="text-center col-span-1">4s</span><span className="text-center col-span-1">6s</span><span className="text-right col-span-3">SR</span></div>{(getTeamObj(innings2TeamId)?.squad || []).map((p, i) => { const detail = getWicketDetail(p, 2); return (<div key={i} className="grid grid-cols-12 p-4 border-b border-white/5 items-center last:border-0 hover:bg-white/[0.02] transition-colors"><div className="col-span-5 flex flex-col"><span className="text-xs font-black uppercase text-white truncate">{p.name}</span><span className="text-[8px] font-bold text-white/20 italic tracking-tighter mt-0.5">{detail}</span></div><span className="text-center col-span-1 font-numbers text-[#39FF14] font-black">{p.runs || 0}</span><span className="text-center col-span-1 font-numbers text-white/30 text-[10px]">{p.balls || 0}</span><span className="text-center col-span-1 font-numbers text-white/40 text-[10px]">{p.fours || 0}</span><span className="text-center col-span-1 font-numbers text-[#FFD600] font-bold text-[10px]">{p.sixes || 0}</span><span className="text-right col-span-3 font-numbers text-white/20 text-[10px]">{p.balls > 0 ? ((p.runs/p.balls)*100).toFixed(2) : '0.00'}</span></div>) })}</div><div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden mt-4"><div className="grid grid-cols-12 p-3 bg-white/[0.05] border-b border-white/10 text-[9px] font-black uppercase text-white/40 tracking-widest"><span className="col-span-5">Bowler</span><span className="text-center col-span-1">O</span><span className="text-center col-span-1">M</span><span className="text-center col-span-1">R</span><span className="text-center col-span-1">W</span><span className="text-right col-span-3">ER</span></div>{(getTeamObj(innings1TeamId)?.squad || []).map((p, i) => ( (p.balls_bowled || 0) > 0 && (<div key={i} className="grid grid-cols-12 p-4 border-b border-white/5 items-center last:border-0"><span className="col-span-5 text-xs font-bold uppercase text-white truncate">{p.name}</span><span className="text-center col-span-1 font-numbers text-white/40 text-[10px]">{Math.floor(p.balls_bowled/6)}.{p.balls_bowled%6}</span><span className="text-center col-span-1 font-numbers text-white/20 text-[10px]">0</span><span className="text-center col-span-1 font-numbers text-white/60 text-[10px]">{p.runs_conceded || 0}</span><span className="text-center col-span-1 font-numbers text-[#FF003C] font-black">{p.wickets || 0}</span><span className="text-right col-span-3 font-numbers text-white/30 text-[10px]">{p.balls_bowled > 0 ? ((p.runs_conceded/p.balls_bowled)*6).toFixed(2) : '0.00'}</span></div>) ))}</div><div className="space-y-4 pt-6"><h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] ml-2">Fall of Wickets</h4><div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden"><div className="grid grid-cols-12 p-3 bg-white/[0.05] border-b border-white/10 text-[9px] font-black uppercase text-white/40 tracking-widest"><span className="col-span-6">Athlete</span><span className="text-center col-span-3">Score</span><span className="text-right col-span-3">Over</span></div>{(match.history || []).filter(h => h.innings === 2 && h.isWicket).map((h, i) => (<div key={i} className="grid grid-cols-12 p-4 border-b border-white/5 items-center last:border-0"><span className="col-span-6 text-xs font-black uppercase text-white truncate">{getPlayer(h.strikerId)?.name}</span><span className="text-center col-span-3 font-numbers text-white/60 text-xs">{h.teamTotalAtThisBall || 0}/{h.wicketsAtThisBall || 0}</span><span className="text-right col-span-3 font-numbers text-white/30 text-xs">{Math.floor(h.ballNumber/6)}.{h.ballNumber%6}</span></div>))}{(match.history || []).filter(h => h.innings === 2 && h.isWicket).length === 0 && (<div className="p-6 text-center text-[10px] font-black text-white/10 uppercase tracking-widest italic">No Disruptions Recorded</div>)}</div></div></div></motion.div>
               )}
            </div>
            <div className="p-8 bg-black border-t border-white/5 z-[200] shrink-0 pb-16 shadow-[0_-20px_80px_rgba(0,0,0,0.9)]"><MotionButton onClick={onBack} className="w-full bg-[#00F0FF] text-black !rounded-2xl !py-6 font-black tracking-[0.5em] text-xs shadow-2xl">TERMINATE SESSION</MotionButton></div>
          </div>
        )}
      </div>
      <AnimatePresence>{selectionTarget && (<motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed inset-0 z-[8000] bg-black flex flex-col p-8 pb-16"><div className="flex justify-between items-center mb-10 shrink-0"><div className="space-y-1"><h3 className="font-heading text-5xl uppercase italic tracking-tighter leading-none">SELECT PERSONNEL</h3><p className="text-[10px] font-black text-[#00F0FF] uppercase tracking-[0.3em]">{selectionTarget.replace('_', ' ')} REQUIRED</p></div><button onClick={() => setSelectionTarget(null)} className="p-4 bg-white/5 rounded-full"><X size={20} /></button></div><div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-24">{getSquadForSelection().map(p => (<button key={p.id} onClick={() => { if(selectionTarget === 'FIELDER') handleFielderSelected(p.id); else { setMatch(m => ({ ...m, crease: { ...m.crease, [selectionTarget === 'STRIKER' || selectionTarget === 'NEW_BATSMAN' ? 'strikerId' : (selectionTarget === 'NON_STRIKER' ? 'nonStrikerId' : 'bowlerId')]: p.id } })); setSelectionTarget(null); } }} className="w-full p-6 bg-[#121212] border border-white/5 rounded-[32px] flex items-center justify-between group hover:border-[#00F0FF]/40 transition-all"><div className="flex items-center space-x-6"><div className="w-16 h-16 rounded-full bg-black border border-white/10 overflow-hidden shrink-0 group-hover:border-[#00F0FF]/40 transition-all"><img src={getPlayerAvatar(p)} className="w-full h-full object-cover" alt="" /></div><div className="text-left"><p className="font-bold text-xl uppercase tracking-tight">{p.name}</p><p className="text-[9px] font-black text-white/20 uppercase tracking-widest">{selectionTarget === 'FIELDER' ? 'FIELDING SQUADRON' : 'SQUAD MEMBER'}</p></div></div><ChevronRight className="text-white/10 group-hover:text-[#00F0FF]" /></button>))}</div></motion.div>)}</AnimatePresence>
      <AnimatePresence>{wicketWizard.open && (<motion.div initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '100%' }} className="fixed inset-0 z-[9000] bg-black flex flex-col p-8 pb-16"><div className="flex justify-between items-center mb-10 shrink-0"><div className="space-y-1"><h3 className="font-heading text-5xl uppercase italic tracking-tighter leading-none text-[#FF003C]">DISMISSAL HUB</h3><p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">SELECT WICKET TYPE</p></div><button onClick={() => setWicketWizard({ open: false })} className="p-4 bg-white/5 rounded-full"><X size={20} /></button></div><div className="grid grid-cols-2 gap-4 flex-1 overflow-y-auto no-scrollbar">{[{ label: 'BOWLED', icon: Disc, color: '#FF003C' }, { label: 'CAUGHT', icon: User, color: '#00F0FF' }, { label: 'LBW', icon: Shield, color: '#FFD600' }, { label: 'STUMPED', icon: Bolt, color: '#BC13FE' }, { label: 'RUN OUT', icon: Activity, color: '#39FF14' }, { label: 'HIT WICKET', icon: Target, color: '#FF6D00' }].map(w => (<button key={w.label} onClick={() => handleWicketAction(w.label)} className="p-8 bg-[#121212] border border-white/5 rounded-[40px] flex flex-col items-center justify-center space-y-4 group hover:border-white/20 transition-all"><w.icon size={32} style={{ color: w.color }} className="opacity-60 group-hover:opacity-100 transition-all" /><span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 group-hover:text-white">{w.label}</span></button>))}</div></motion.div>)}</AnimatePresence>
      {/* Share Scorecard Modal */}
      <AnimatePresence>{showShareModal && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowShareModal(false)} className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[9999] flex items-end sm:items-center justify-center p-6"><motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} onClick={e => e.stopPropagation()} className="w-full max-w-sm bg-[#121212] border border-white/10 rounded-[40px] p-8 space-y-6 shadow-2xl"><div className="flex items-center justify-between"><h3 className="font-heading text-4xl italic uppercase tracking-tighter">Share Scorecard</h3><button onClick={() => setShowShareModal(false)} className="p-2 text-white/30 hover:text-white transition-colors"><X size={20} /></button></div><div className="bg-black/50 border border-white/5 rounded-2xl p-4 max-h-48 overflow-y-auto no-scrollbar"><pre className="text-[10px] text-white/60 font-mono whitespace-pre-wrap leading-relaxed">{shareText}</pre></div><div className="space-y-3"><button onClick={() => { window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank'); }} className="w-full py-5 bg-[#25D366] text-black rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center space-x-3 shadow-lg shadow-[#25D366]/20 active:scale-95 transition-all"><span>ð±</span><span>Share on WhatsApp</span></button><button onClick={() => handleShareAction(shareText)} className={`w-full py-5 border-2 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center space-x-3 transition-all active:scale-95 ${shareCopied ? 'border-[#39FF14]/50 text-[#39FF14] bg-[#39FF14]/10' : 'border-white/10 text-white/50 bg-white/5 hover:bg-white/10'}`}>{shareCopied ? <><Check size={16} /><span>Copied to clipboard!</span></> : <><Share2 size={16} /><span>More Options Â· Copy Text</span></>}</button></div></motion.div></motion.div>)}</AnimatePresence>

      <AnimatePresence>{editingTeamId && (<motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed inset-0 bg-black z-[9000] flex flex-col"><div className="h-14 flex items-center px-6 border-b border-white/5 bg-black/50 backdrop-blur-md shrink-0"><button onClick={() => setEditingTeamId(null)} className="p-2 -ml-2 text-white/40 hover:text-white transition-all"><ChevronLeft size={20} /></button><h3 className="ml-4 font-heading text-xl tracking-[0.1em] text-white uppercase italic">SQUADRON MANAGEMENT</h3></div><div className="flex-1 overflow-y-auto no-scrollbar p-8 min-h-0"><div className="space-y-10 pb-32"><div className="space-y-4"><div className="flex justify-between items-end"><div className="space-y-1"><h3 className="font-heading text-4xl italic uppercase leading-none">The Roster</h3><p className="text-[10px] font-black text-[#00F0FF] uppercase tracking-[0.3em]">{(getTeamObj(editingTeamId)?.squad || []).length} PERSONNEL ENLISTED</p></div><div className="flex space-x-2"><div className={`px-4 py-1.5 rounded-full border text-[8px] font-black uppercase tracking-widest ${isCaptainSelected(editingTeamId) ? 'bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/20' : 'bg-[#FF003C]/10 text-[#FF003C] border-[#FF003C]/20 animate-pulse'}`}>{isCaptainSelected(editingTeamId) ? 'CAPTAIN' : 'CAPT REQ'}</div><div className={`px-4 py-1.5 rounded-full border text-[8px] font-black uppercase tracking-widest ${isWicketKeeperSelected(editingTeamId) ? 'bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/20' : 'bg-[#FF003C]/10 text-[#FF003C] border-[#FF003C]/20 animate-pulse'}`}>{isWicketKeeperSelected(editingTeamId) ? 'KEEPER' : 'WK REQ'}</div></div></div><div className="space-y-3">{(getTeamObj(editingTeamId)?.squad || []).length === 0 ? (<div className="py-20 text-center space-y-4 opacity-40 border-2 border-dashed border-white/10 rounded-[40px] flex flex-col items-center justify-center"><Users size={48} className="mb-2" /><p className="text-[10px] font-black uppercase tracking-[0.5em]">No Personnel Active</p></div>) : (getTeamObj(editingTeamId).squad.map((p) => (<div key={p.id} className={`p-6 rounded-[32px] border transition-all flex items-center justify-between ${p.isCaptain || p.isWicketKeeper ? 'bg-white/[0.04] border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.05)]' : 'bg-white/[0.02] border-white/5'}`}><div className="flex items-center space-x-5"><div className="flex flex-col space-y-2"><button onClick={() => handleSetCaptain(p.id, editingTeamId)} className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${p.isCaptain ? 'bg-[#4DB6AC] border-[#4DB6AC] text-black shadow-lg' : 'bg-white/5 border-white/10 text-white/20 hover:text-[#4DB6AC]'}`}><Crown size={20} /></button><button onClick={() => handleSetWicketKeeper(p.id, editingTeamId)} className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${p.isWicketKeeper ? 'bg-[#00F0FF] border-[#00F0FF] text-black shadow-lg' : 'bg-white/5 border-white/10 text-white/20 hover:text-[#00F0FF]'}`}><GloveIcon size={20} /></button></div><div className="text-left"><span className="text-lg font-black uppercase tracking-tight block leading-none">{p.name}</span><span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em] mt-1 block">+91 {p.phone.slice(-4).padStart(p.phone.length, '*')}</span></div></div><button onClick={() => { setMatch(m => { const key = editingTeamId === 'A' ? 'teamA' : 'teamB'; return { ...m, teams: { ...m.teams, [key]: { ...m.teams[key], squad: m.teams[key].squad.filter(x => x.id !== p.id) } } }; }) }} className="text-white/10 hover:text-[#FF003C] transition-colors p-3"><Trash2 size={20} /></button></div>)))}</div></div><div className="space-y-6 pt-10 border-t border-white/5"><div className="flex items-center justify-between"><h3 className="font-heading text-4xl italic uppercase leading-none">New Recruitment</h3><button onClick={startQRScanner} className="flex items-center space-x-2 px-4 py-2 bg-[#00F0FF]/10 border border-[#00F0FF]/30 rounded-xl text-[#00F0FF] hover:bg-[#00F0FF]/20 transition-all"><Camera size={14} /><span className="text-[8px] font-black uppercase tracking-widest">Scan QR</span></button></div><div className="space-y-4"><div className="space-y-1.5"><label className="text-[8px] font-black text-[#00F0FF] uppercase tracking-[0.2em] ml-1">SEARCH OR ENTER ATHLETE</label>{selectedVaultPlayer ? (<motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center justify-between bg-[#39FF14]/10 border border-[#39FF14]/40 rounded-2xl py-4 px-5"><div className="flex items-center space-x-3"><UserCheck size={18} className="text-[#39FF14] shrink-0" /><div><p className="text-sm font-black text-white uppercase">{selectedVaultPlayer.name}</p><p className="text-[9px] font-bold text-[#39FF14] mt-0.5">+91 Â·Â·{selectedVaultPlayer.phone.slice(-4)}</p></div></div><button onClick={handleClearVaultPlayer} className="p-2 text-white/30 hover:text-[#FF003C] transition-colors"><X size={16} /></button></motion.div>) : (<div className="relative"><User size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40 z-10" /><input type="text" placeholder="NAME OR INITIALS (e.g. A D)" value={newName} onChange={(e) => setNewName(e.target.value.toUpperCase())} className="w-full bg-[#111] border border-white/10 rounded-2xl py-5 pl-16 pr-6 text-sm font-black text-white outline-none focus:border-[#00F0FF]/60 uppercase placeholder:text-white/10" /><AnimatePresence>{showPlayerDropdown && playerDropdownList.length > 0 && (<motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute top-full left-0 right-0 mt-2 bg-[#1A1A1A] border border-white/10 rounded-2xl overflow-hidden z-50 shadow-2xl">{playerDropdownList.map((vp, vi) => (<button key={vp.phone} onClick={() => handleSelectVaultPlayer(vp)} className={`w-full flex items-center space-x-4 px-5 py-4 text-left hover:bg-white/5 transition-all ${vi > 0 ? 'border-t border-white/5' : ''}`}><div className="w-9 h-9 rounded-full bg-black border border-white/10 overflow-hidden shrink-0"><img src={getPlayerAvatar(vp)} className="w-full h-full object-cover" /></div><div className="flex-1 min-w-0"><p className="text-sm font-black text-white uppercase truncate">{vp.name}</p><p className="text-[9px] font-bold text-white/30 mt-0.5">+91 Â·Â·{vp.phone.slice(-4)}</p></div><CheckCircle2 size={14} className="text-[#00F0FF] shrink-0 opacity-60" /></button>))}</motion.div>)}</AnimatePresence></div>)}</div>{!selectedVaultPlayer && (<div className="space-y-1.5"><label className="text-[8px] font-black text-[#00F0FF] uppercase tracking-[0.2em] ml-1">MOBILE UPLINK (10 DIGITS)</label><div className="relative"><Smartphone size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40" /><input type="tel" maxLength={10} placeholder="10-DIGIT PHONE NUMBER" value={phoneQuery} onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); if(val.length <= 10) setPhoneQuery(val); }} className="w-full bg-[#111] border border-white/10 rounded-2xl py-5 pl-16 pr-6 text-sm font-black text-white outline-none focus:border-[#00F0FF]/60 placeholder:text-white/10" /></div></div>)}</div><MotionButton disabled={isAddPlayerDisabled} onClick={() => { if(!isAddPlayerDisabled) { handleEnlistNewPlayer(newName, phoneQuery, editingTeamId); setNewName(''); setPhoneQuery(''); setSelectedVaultPlayer(null); } }} className={`w-full !py-6 flex items-center justify-center space-x-3 !rounded-[24px] transition-all ${isAddPlayerDisabled ? 'bg-white/5 text-white/10 opacity-50 border-white/5' : 'bg-white text-black shadow-xl shadow-white/5 border-transparent'}`}><Plus size={20} /><span className="text-[11px] font-black tracking-widest">ENLIST PERSONNEL</span></MotionButton></div></div></div><div className="p-10 bg-black/95 backdrop-blur-xl border-t border-white/5 shrink-0 pb-16"><MotionButton disabled={!isCaptainSelected(editingTeamId) || !isWicketKeeperSelected(editingTeamId) || (getTeamObj(editingTeamId)?.squad || []).length === 0} onClick={() => setEditingTeamId(null)} className={`w-full !py-6 !rounded-[24px] font-black tracking-[0.5em] text-xs transition-all ${isCaptainSelected(editingTeamId) && isWicketKeeperSelected(editingTeamId) ? 'bg-[#39FF14] text-black shadow-[0_15px_40px_rgba(57,255,20,0.2)]' : 'bg-white/5 text-white/20 grayscale border-white/5'}`}>SAVE SQUADRON</MotionButton></div></motion.div>)}</AnimatePresence>

      {/* QR Scanner Modal */}
      <AnimatePresence>
        {showQRScanner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10500] bg-black/95 flex flex-col items-center justify-center p-6 backdrop-blur-xl">
            <div className="w-full max-w-sm bg-[#050505] border border-[#00F0FF]/20 rounded-[40px] overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Camera size={20} className="text-[#00F0FF]" />
                  <h3 className="font-heading text-2xl uppercase italic tracking-tight">SCAN PLAYER QR</h3>
                </div>
                <button onClick={closeQRScanner} className="p-2 text-white/30 hover:text-[#FF003C] transition-colors"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                {qrScanStatus === 'SCANNING' && (
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
                    <video ref={qrVideoRef} className="w-full h-full object-cover" playsInline muted />
                    <canvas ref={qrCanvasRef} className="hidden" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-48 border-2 border-[#00F0FF] rounded-2xl opacity-60 animate-pulse" />
                    </div>
                    <p className="absolute bottom-3 inset-x-0 text-center text-[8px] font-black text-white/40 uppercase tracking-widest">Align player QR within the frame</p>
                  </div>
                )}
                {qrScanStatus === 'SUCCESS' && (
                  <div className="py-10 text-center space-y-3">
                    <CheckCircle2 size={48} className="text-[#39FF14] mx-auto" />
                    <p className="font-heading text-2xl text-[#39FF14] uppercase italic">Player Detected!</p>
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Details auto-filled in form</p>
                  </div>
                )}
                {qrScanStatus === 'ERROR' && (
                  <div className="py-8 text-center space-y-4">
                    <ShieldAlert size={40} className="text-[#FF003C] mx-auto" />
                    <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">{qrScanError}</p>
                    <button onClick={startQRScanner} className="px-6 py-3 bg-[#00F0FF]/10 border border-[#00F0FF]/30 rounded-xl text-[#00F0FF] text-[9px] font-black uppercase tracking-widest">Try Again</button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ââ Transfer Scoring / Live Broadcast Modal ââ */}
      <AnimatePresence>
        {showTransferModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowTransferModal(false)}
            className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[11000] flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-[#121212] border border-white/10 rounded-[40px] overflow-hidden shadow-2xl"
            >
              {/* Tab header */}
              <div className="flex border-b border-white/5">
                {(['HANDOFF', 'BROADCAST'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setTransferTab(tab)}
                    className={`flex-1 py-5 text-[10px] font-black uppercase tracking-widest transition-all ${transferTab === tab ? 'text-[#FF003C] border-b-2 border-[#FF003C]' : 'text-white/20'}`}
                  >
                    {tab === 'HANDOFF' ? 'ð± Hand Off Scoring' : 'ð¡ Live Broadcast'}
                  </button>
                ))}
              </div>

              <div className="p-8 space-y-6">
                {transferTab === 'HANDOFF' ? (
                  <>
                    <div className="text-center space-y-1">
                      <h3 className="font-heading text-3xl italic uppercase text-white">Transfer Scorer</h3>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">New scorer scans to take over Â· all data transfers instantly</p>
                    </div>
                    {handoffQRUrl ? (
                      <div className="flex justify-center">
                        <div className="p-3 bg-[#111] rounded-2xl border border-white/10">
                          <img src={handoffQRUrl} alt="Hand-off QR" className="w-48 h-48 rounded-xl" />
                        </div>
                      </div>
                    ) : (
                      <div className="h-48 flex items-center justify-center">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                          <Activity size={24} className="text-white/30" />
                        </motion.div>
                      </div>
                    )}
                    <button
                      onClick={() => copyTransferLink(`${window.location.origin}/?resume=${match.matchId}`)}
                      className={`w-full py-4 rounded-2xl border-2 font-black text-[10px] uppercase tracking-widest flex items-center justify-center space-x-2 transition-all ${transferLinkCopied ? 'border-[#FF003C]/50 text-[#FF003C] bg-[#FF003C]/10' : 'border-white/10 text-white/50 bg-white/5 hover:bg-white/10'}`}
                    >
                      {transferLinkCopied ? <><Check size={14} /><span>Copied!</span></> : <><Share2 size={14} /><span>Copy Hand-Off Link</span></>}
                    </button>
                    <p className="text-[8px] text-white/20 text-center uppercase tracking-widest leading-relaxed">
                      The new scorer opens this link and taps "Resume Match". Full match state transfers over the internet â requires both phones to be online.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-center space-y-1">
                      <h3 className="font-heading text-3xl italic uppercase text-white">Live Broadcast</h3>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Anyone scans to watch Â· auto-refreshes every 10 s</p>
                    </div>
                    {broadcastQRUrl ? (
                      <div className="flex justify-center">
                        <div className="p-3 bg-[#111] rounded-2xl border border-white/10">
                          <img src={broadcastQRUrl} alt="Broadcast QR" className="w-48 h-48 rounded-xl" />
                        </div>
                      </div>
                    ) : (
                      <div className="h-48 flex items-center justify-center">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                          <Activity size={24} className="text-white/30" />
                        </motion.div>
                      </div>
                    )}
                    <button
                      onClick={() => copyTransferLink(`${window.location.origin}/?watch=${match.matchId}`)}
                      className={`w-full py-4 rounded-2xl border-2 font-black text-[10px] uppercase tracking-widest flex items-center justify-center space-x-2 transition-all ${transferLinkCopied ? 'border-[#FF003C]/50 text-[#FF003C] bg-[#FF003C]/10' : 'border-white/10 text-white/50 bg-white/5 hover:bg-white/10'}`}
                    >
                      {transferLinkCopied ? <><Check size={14} /><span>Copied!</span></> : <><Share2 size={14} /><span>Copy Broadcast Link</span></>}
                    </button>
                    <p className="text-[8px] text-white/20 text-center uppercase tracking-widest leading-relaxed">
                      Share this link with anyone. They open it in any browser â no app or login needed â and see the live score update automatically.
                    </p>
                  </>
                )}

                <button onClick={() => setShowTransferModal(false)} className="w-full py-3 text-white/20 text-[8px] font-black uppercase tracking-widest">
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default MatchCenter;
