// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import {
  ChevronLeft, ChevronDown, Swords, Plus, Minus, Check, Zap, X,
  Undo2, Disc, User, Trash2, ArrowRight,
  CheckCircle2, Target, Shield, Flame, Activity, Trophy, Share2,
  TrendingUp, BarChart2, Users, Star, Award,
  ArrowUpRight, Clock, MapPin, UserPlus, UserCheck,
  ClipboardList, Search, RefreshCcw, ShieldAlert, Camera, HelpCircle,
  LayoutDashboard, PieChart, ZapOff, Calendar, Crown, Settings, Image as ImageIcon, Save,
  ChevronRight, Smartphone, Medal, Zap as Bolt, Crosshair, Edit2, Upload,
  ArrowLeftRight, History, Coins
} from 'lucide-react';
import MotionButton from './components/MotionButton';
import { MatchState, Player, TeamID, PlayerID, BallEvent } from './types';
import { useAuth } from './AuthContext';
import { syncMatchToSupabase, saveMatchRecord, upsertPlayer, generatePlayerId, buildStatsFromHistory, pushLiveMatchState, supabase } from './lib/supabase';

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
  const [pendingExtra, setPendingExtra] = useState<'WD' | 'NB' | 'BYE' | 'LB' | null>(null);
  const [wicketWizard, setWicketWizard] = useState<{ open: boolean, type?: string }>({ open: false });
  const [newName, setNewName] = useState('');
  const [tossFlipPhase, setTossFlipPhase] = useState('WAITING');
  const [phoneQuery, setPhoneQuery] = useState('');
  const [editingTeamNameId, setEditingTeamNameId] = useState<TeamID | null>(null);
  const [tossCall, setTossCall] = useState<{ teamA: 'HEADS' | 'TAILS'; teamB: 'HEADS' | 'TAILS' }>({ teamA: 'HEADS', teamB: 'TAILS' });
  const [tossResult, setTossResult] = useState<'HEADS' | 'TAILS' | null>(null);
  const [tossPhase, setTossPhase] = useState<'CALL' | 'FLIP' | 'WINNER' | 'DECISION' | 'RESULT'>('CALL');
  const [tossCaller, setTossCaller] = useState<'A' | 'B' | null>(null);

  // NEW: Config flow step tracking (1: format, 2: details, 3: teams)
  const [configStep, setConfigStep] = useState(1);
  const [matchMode, setMatchMode] = useState<'INDIVIDUAL' | 'TOURNAMENT'>('INDIVIDUAL');
  const [showCustomRules, setShowCustomRules] = useState(false);
  const [showOfficials, setShowOfficials] = useState(false);

  // Premium team selection state
  const [teamDrawer, setTeamDrawer] = useState<{ open: boolean; targetTeam: 'A' | 'B' | null; mode: 'SEARCH' | 'CREATE' }>({ open: false, targetTeam: null, mode: 'SEARCH' });
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [teamCreateName, setTeamCreateName] = useState('');
  const [vsRevealed, setVsRevealed] = useState(false);

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

  const liveChannelRef = useRef<any>(null);

  useEffect(() => {
    if (!match.matchId) return;
    const ch = supabase.channel(`live:${match.matchId}`);
    ch.subscribe();
    liveChannelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      liveChannelRef.current = null;
    };
  }, [match.matchId]);

  useEffect(() => {
    if (status !== 'LIVE' || !match.matchId) return;
    pushLiveMatchState(match);
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
    if (!userData?.phone) { setMatch(m => ({ ...m, toss: { winnerId: null, decision: null } })); setStatus('TOSS_FLIP'); return; }

    const globalVault = JSON.parse(localStorage.getItem('22YARDS_GLOBAL_VAULT') || '{}');
    const userVault = globalVault[userData.phone] || { teams: [] };
    const archivedTeams = userVault.teams || [];

    const isUserInA = (match.teams.teamA.squad || []).some(p => p.phone === userData.phone);
    const isUserInB = (match.teams.teamB.squad || []).some(p => p.phone === userData.phone);

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

    setMatch(m => ({ ...m, toss: { winnerId: null, decision: null } }));
    setStatus('TOSS_FLIP');
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
    setMatch(m => ({ ...m, toss: { winnerId: null, decision: null } }));
    setStatus('TOSS_FLIP');
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

  const handleUndo = () => {
    if (!match.history || match.history.length === 0) return;

    setMatch(m => {
      const lastBall = m.history[m.history.length - 1];
      if (!lastBall) return m;

      const battingTeamKey = m.teams.battingTeamId === 'A' ? 'teamA' : 'teamB';
      const bowlingTeamKey = m.teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB';

      const updatedBattingSquad = (m.teams[battingTeamKey]?.squad || []).map(p => {
        if (p.id === lastBall.strikerId) {
          return {
            ...p,
            runs: Math.max(0, (p.runs || 0) - (lastBall.runsScored || 0)),
            balls: Math.max(0, (p.balls || 0) - (!lastBall.type || lastBall.type === 'LEGAL' ? 1 : 0)),
            fours: lastBall.runsScored === 4 && (!lastBall.type || lastBall.type === 'LEGAL') ? Math.max(0, (p.fours || 0) - 1) : (p.fours || 0),
            sixes: lastBall.runsScored === 6 && (!lastBall.type || lastBall.type === 'LEGAL') ? Math.max(0, (p.sixes || 0) - 1) : (p.sixes || 0),
            isOut: false,
            wicketType: undefined,
          };
        }
        if (p.id === lastBall.nonStrikerId && (lastBall.runsScored === 2 || lastBall.runsScored === 3)) {
          return {
            ...p,
            balls: Math.max(0, (p.balls || 0) - 1),
          };
        }
        return p;
      });

      const updatedBowlingSquad = (m.teams[bowlingTeamKey]?.squad || []).map(p => {
        if (p.id === lastBall.bowlerId) {
          return {
            ...p,
            wickets: lastBall.isWicket ? Math.max(0, (p.wickets || 0) - 1) : (p.wickets || 0),
            runs_conceded: Math.max(0, (p.runs_conceded || 0) - (lastBall.runsScored || 0) - (lastBall.type === 'WD' || lastBall.type === 'NB' ? 1 : 0)),
            balls_bowled: Math.max(0, (p.balls_bowled || 0) - (lastBall.type === 'WD' || lastBall.type === 'NB' ? 0 : 1)),
          };
        }
        return p;
      });

      return {
        ...m,
        teams: {
          ...m.teams,
          [battingTeamKey]: { ...m.teams[battingTeamKey], squad: updatedBattingSquad },
          [bowlingTeamKey]: { ...m.teams[bowlingTeamKey], squad: updatedBowlingSquad },
        },
        liveScore: {
          runs: Math.max(0, m.liveScore.runs - (lastBall.runsScored || 0) - (lastBall.type === 'WD' || lastBall.type === 'NB' ? 1 : 0)),
          wickets: Math.max(0, m.liveScore.wickets - (lastBall.isWicket ? 1 : 0)),
          balls: Math.max(0, m.liveScore.balls - (lastBall.type === 'WD' || lastBall.type === 'NB' ? 0 : 1)),
        },
        history: m.history.slice(0, -1),
      };
    });
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

    const buildMatchRecord = (playerObj: any, playerTeamId: 'A' | 'B') => {
      const oppTeamObj = playerTeamId === 'A' ? teamB : teamA;

      let result = 'DREW';
      if (finalMatchState.status === 'COMPLETED') {
        const chasers = finalMatchState.teams.battingTeamId;
        const defenders = finalMatchState.teams.bowlingTeamId;
        const finalScore = finalMatchState.liveScore.runs;
        const target = finalMatchState.config.target || 0;
        if (finalScore >= target) {
          result = chasers === playerTeamId ? 'WON' : 'LOST';
        } else if (finalScore === target - 1) {
          result = 'TIED';
        } else {
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
        fullScorecard: (() => {
          const inn1BatterKey = finalMatchState.teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB';
          const inn1BowlerKey = finalMatchState.teams.battingTeamId === 'A' ? 'teamA' : 'teamB';
          const inn1BattingTeam = finalMatchState.teams[inn1BatterKey];
          const inn1BowlingTeam = finalMatchState.teams[inn1BowlerKey];
          const hist = finalMatchState.history || [];
          const allSquad = [...(inn1BattingTeam.squad || []), ...(inn1BowlingTeam.squad || [])];
          const findP = (id: string) => allSquad.find(p => p.id === id);

          return {
            innings1: {
              teamName: inn1BattingTeam.name,
              batters: inn1BattingTeam.squad || [],
              bowlers: inn1BowlingTeam.squad || [],
            },
            innings2: {
              teamName: finalMatchState.teams.battingTeamId === 'A' ? teamA.name : teamB.name,
              batters: finalMatchState.teams.battingTeamId === 'A' ? (teamA.squad || []) : (teamB.squad || []),
              bowlers: finalMatchState.teams.battingTeamId === 'A' ? (teamB.squad || []) : (teamA.squad || []),
            }
          };
        })(),
      };
    };

    if (isUserInTeamA) {
      const userInA = (teamA.squad || []).find(p => p.phone === activePhone);
      if (userInA) {
        globalVault[activePhone].history.push(buildMatchRecord(userInA, 'A'));
      }
    }
    if (isUserInTeamB) {
      const userInB = (teamB.squad || []).find(p => p.phone === activePhone);
      if (userInB) {
        globalVault[activePhone].history.push(buildMatchRecord(userInB, 'B'));
      }
    }

    const upsertTeam = (team: any, teamType: 'A' | 'B') => {
      const existingTeamIdx = globalVault[activePhone].teams.findIndex(
        t => t.name.toUpperCase() === team.name.toUpperCase()
      );
      if (existingTeamIdx >= 0) {
        globalVault[activePhone].teams[existingTeamIdx] = {
          id: globalVault[activePhone].teams[existingTeamIdx].id || `T-${Date.now()}`,
          name: team.name,
          city: team.city || '',
          players: team.squad || [],
          dateLastPlayed: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
        };
      } else {
        globalVault[activePhone].teams.push({
          id: `T-${Date.now()}`,
          name: team.name,
          city: team.city || '',
          players: team.squad || [],
          dateLastPlayed: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
        });
      }
    };

    if (isUserInTeamA) upsertTeam(teamA, 'A');
    if (isUserInTeamB) upsertTeam(teamB, 'B');

    localStorage.setItem('22YARDS_GLOBAL_VAULT', JSON.stringify(globalVault));
  };

  const getTeamInitials = (name: string) => {
    const words = name.split(' ');
    return words.length > 1
      ? (words[0][0] + words[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };

  const getRecentTeams = (): Array<{ name: string; logo?: string; squad: any[] }> => {
    try {
      const globalVault = JSON.parse(localStorage.getItem('22YARDS_GLOBAL_VAULT') || '{}');
      const allTeams: Array<{ name: string; logo?: string; squad: any[] }> = [];
      Object.values(globalVault).forEach((userVault: any) => {
        if (userVault?.teams) {
          userVault.teams.forEach((t: any) => {
            if (t.name && !allTeams.some(existing => existing.name.toUpperCase() === t.name.toUpperCase())) {
              allTeams.push({ name: t.name, logo: t.logo, squad: t.players || t.squad || [] });
            }
          });
        }
      });
      return allTeams;
    } catch { return []; }
  };

  const isConfigValid = () => {
    const hasTeamA = match.teams.teamA.name && match.teams.teamA.squad.length > 0;
    const hasTeamB = match.teams.teamB.name && match.teams.teamB.squad.length > 0;
    return match.config.overs > 0 && hasTeamA && hasTeamB && match.config.matchType;
  };

  const commitBall = (runs: number, extra?: string, isWicket?: boolean, wicketType?: string, fielderId?: PlayerID) => {
    setMatch(m => {
      if (!m.crease.strikerId || !m.crease.bowlerId) return m;

      const battingTeamKey = m.teams.battingTeamId === 'A' ? 'teamA' : 'teamB';
      const bowlingTeamKey = m.teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB';

      const updatedBattingSquad = (m.teams[battingTeamKey]?.squad || []).map(p => {
        if (p.id === m.crease.strikerId) {
          return {
            ...p,
            runs: (p.runs || 0) + runs,
            balls: (p.balls || 0) + (extra ? 0 : 1),
            fours: runs === 4 && !extra ? (p.fours || 0) + 1 : (p.fours || 0),
            sixes: runs === 6 && !extra ? (p.sixes || 0) + 1 : (p.sixes || 0),
            isOut: isWicket ? true : p.isOut,
            wicketType: isWicket ? wicketType : p.wicketType,
          };
        }
        if (p.id === m.crease.nonStrikerId && (runs === 2 || runs === 3)) {
          return {
            ...p,
            balls: (p.balls || 0) + 1,
          };
        }
        return p;
      });

      const updatedBowlingSquad = (m.teams[bowlingTeamKey]?.squad || []).map(p => {
        if (p.id === m.crease.bowlerId) {
          return {
            ...p,
            wickets: isWicket ? (p.wickets || 0) + 1 : (p.wickets || 0),
            runs_conceded: (p.runs_conceded || 0) + runs + (extra === 'WD' || extra === 'NB' ? 1 : 0),
            balls_bowled: (p.balls_bowled || 0) + (extra === 'WD' || extra === 'NB' ? 0 : 1),
          };
        }
        return p;
      });

      const newLiveScore = {
        runs: m.liveScore.runs + runs + (extra === 'WD' || extra === 'NB' ? 1 : 0),
        wickets: m.liveScore.wickets + (isWicket ? 1 : 0),
        balls: m.liveScore.balls + (extra === 'WD' || extra === 'NB' ? 0 : 1),
      };

      const ballEvent: BallEvent = {
        ballId: `${m.matchId}-${m.currentInnings}-${m.history.length}`,
        overNumber: Math.floor(m.liveScore.balls / 6),
        ballNumber: (m.liveScore.balls % 6) + 1,
        bowlerId: m.crease.bowlerId!,
        strikerId: m.crease.strikerId!,
        fielderId,
        runsScored: runs,
        totalValue: runs + (extra === 'WD' || extra === 'NB' ? 1 : 0),
        extras: extra === 'WD' || extra === 'NB' || extra === 'BYE' || extra === 'LB' ? 1 : 0,
        isWicket: isWicket || false,
        type: extra ? (extra as any) : 'LEGAL',
        zone: undefined,
        wicketType,
        innings: m.currentInnings,
        teamId: m.teams.battingTeamId,
        teamTotalAtThisBall: newLiveScore.runs,
        wicketsAtThisBall: newLiveScore.wickets,
      };

      const totalOvers = Math.floor(newLiveScore.balls / 6);
      const ballsInOver = newLiveScore.balls % 6;
      const shouldTransition = newLiveScore.wickets >= 10 || (totalOvers >= m.config.overs && ballsInOver === 0);

      let newStatus = 'LIVE';
      let newCurrentInnings = m.currentInnings;
      if (shouldTransition && m.currentInnings === 1) {
        newStatus = 'INNINGS_BREAK';
        newCurrentInnings = 2;
        setOverlayAnim('INNINGS_BREAK');
        setTimeout(() => setOverlayAnim(null), 3000);
      }

      if (shouldTransition && m.currentInnings === 2) {
        newStatus = 'COMPLETED';
        setTimeout(() => setStatus('SUMMARY'), 100);
      }

      if (m.currentInnings === 2 && m.config.target && newLiveScore.runs >= m.config.target) {
        newStatus = 'COMPLETED';
        setTimeout(() => setStatus('SUMMARY'), 100);
      }

      return {
        ...m,
        teams: {
          ...m.teams,
          [battingTeamKey]: { ...m.teams[battingTeamKey], squad: updatedBattingSquad },
          [bowlingTeamKey]: { ...m.teams[bowlingTeamKey], squad: updatedBowlingSquad },
        },
        liveScore: newLiveScore,
        history: [...(m.history || []), ballEvent],
        currentInnings: newCurrentInnings,
      };
    });
  };

  const getPlayerAvatar = (player: any): string => {
    if (player?.avatar) return player.avatar;
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
        const isBattingNow = status === 'LIVE' && match.currentInnings === inningsNum && (match.crease.strikerId === player.id || match.crease.nonStrikerId === player.id);
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

  const generateShareText = (phase: string) => {
    const battingTeam = getTeamObj(match.teams.battingTeamId);
    const bowlingTeam = getTeamObj(match.teams.bowlingTeamId);
    const overs = Math.floor(match.liveScore.balls / 6);
    const balls = match.liveScore.balls % 6;
    return `${battingTeam.name} ${match.liveScore.runs}/${match.liveScore.wickets} (${overs}.${balls}) vs ${bowlingTeam.name} | 22 Yards`;
  };

  const innings1TeamId = match.currentInnings === 1 ? match.teams.battingTeamId : match.teams.bowlingTeamId;
  const innings2TeamId = match.currentInnings === 1 ? match.teams.bowlingTeamId : match.teams.battingTeamId;

  // Squad Editor Modal Helper Functions
  const handleEnlistNewPlayer = () => {
    if (!editingTeamId || !newName.trim()) return;
    const key = editingTeamId === 'A' ? 'teamA' : 'teamB';
    const newPlayer = {
      id: generatePlayerId(phoneQuery || `${Date.now()}`),
      name: newName.trim(),
      phone: phoneQuery,
      isCaptain: false,
      isWicketKeeper: false,
      runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false,
      wickets: 0, runs_conceded: 0, balls_bowled: 0, catches: 0, stumpings: 0, run_outs: 0,
    };
    setMatch(m => ({
      ...m,
      teams: { ...m.teams, [key]: { ...m.teams[key], squad: [...(m.teams[key].squad || []), newPlayer] } }
    }));
    setNewName('');
    setPhoneQuery('');
    setSelectedVaultPlayer(null);
  };

  const handleSetCaptain = (playerId: PlayerID) => {
    if (!editingTeamId) return;
    const key = editingTeamId === 'A' ? 'teamA' : 'teamB';
    setMatch(m => ({
      ...m,
      teams: {
        ...m.teams,
        [key]: {
          ...m.teams[key],
          squad: (m.teams[key].squad || []).map(p => ({ ...p, isCaptain: p.id === playerId }))
        }
      }
    }));
  };

  const handleSetWicketKeeper = (playerId: PlayerID) => {
    if (!editingTeamId) return;
    const key = editingTeamId === 'A' ? 'teamA' : 'teamB';
    setMatch(m => ({
      ...m,
      teams: {
        ...m.teams,
        [key]: {
          ...m.teams[key],
          squad: (m.teams[key].squad || []).map(p => ({ ...p, isWicketKeeper: p.id === playerId }))
        }
      }
    }));
  };

  const isCaptainSelected = () => {
    if (!editingTeamId) return false;
    const key = editingTeamId === 'A' ? 'teamA' : 'teamB';
    return (match.teams[key]?.squad || []).some(p => p.isCaptain);
  };

  const isWicketKeeperSelected = () => {
    if (!editingTeamId) return false;
    const key = editingTeamId === 'A' ? 'teamA' : 'teamB';
    return (match.teams[key]?.squad || []).some(p => p.isWicketKeeper);
  };

  const handleSelectVaultPlayer = (player: any) => {
    setSelectedVaultPlayer(player);
    setNewName(player.name);
    setPhoneQuery(player.phone || '');
    setShowPlayerDropdown(false);
  };

  const handleClearVaultPlayer = () => {
    setSelectedVaultPlayer(null);
    setNewName('');
    setPhoneQuery('');
  };

  const startQRScanner = () => {
    setShowQRScanner(true);
    setQrScanStatus('SCANNING');
  };

  const closeQRScanner = () => {
    setShowQRScanner(false);
  };

  const handleShareAction = (action: string) => {
    if (action === 'whatsapp') {
      const text = encodeURIComponent(shareText);
      window.open(`https://wa.me/?text=${text}`);
    } else if (action === 'copy') {
      navigator.clipboard.writeText(shareText);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  const copyTransferLink = () => {
    const link = transferTab === 'HANDOFF' ? handoffQRUrl : broadcastQRUrl;
    if (link) {
      navigator.clipboard.writeText(link);
      setTransferLinkCopied(true);
      setTimeout(() => setTransferLinkCopied(false), 2000);
    }
  };

  const openTransferModal = () => {
    setShowTransferModal(true);
  };

  const isAddPlayerDisabled = !newName.trim();

  return (
    <div className="h-full w-full bg-[#050505] text-white flex flex-col overflow-hidden relative font-sans max-h-[100dvh]">
      <input type="file" ref={logoInputRef} onChange={handleLogoFileChange} className="hidden" accept="image/*" />

      {/* HEADER */}
      <div className="h-14 flex items-center px-6 border-b border-white/5 bg-black/50 backdrop-blur-md z-[100] shrink-0">
        <button onClick={onBack} className="p-2 -ml-2 text-[#00F0FF] hover:bg-white/5 rounded-full transition-all"><ChevronLeft size={20} /></button>
        <h2 className="ml-4 font-heading text-xl tracking-[0.1em] text-white uppercase italic">
          {status === 'LIVE' ? 'BATTLEFIELD' : status === 'SUMMARY' ? 'ARENA TELEMETRY' : 'MATCH SETUP'}
        </h2>
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

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">
        {/* Overlay Animations */}
        <AnimatePresence>
          {overlayAnim && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[5000] flex items-center justify-center pointer-events-none overflow-hidden"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.7, 0] }}
                transition={{ duration: overlayAnim === 'FREE_HIT' ? 2 : 0.6, repeat: overlayAnim === 'FREE_HIT' ? 1 : 0 }}
                className={`absolute inset-0 ${
                  overlayAnim === 'SIX' ? 'bg-[#FFD600]' :
                  overlayAnim === 'FOUR' ? 'bg-[#BC13FE]' :
                  overlayAnim === 'WICKET' ? 'bg-[#FF003C]' :
                  overlayAnim === 'FREE_HIT' ? 'bg-gradient-to-tr from-[#00F0FF] via-[#FFD600] to-[#00F0FF]' :
                  'bg-[#00F0FF]'
                }`}
              />
              <motion.div
                initial={{ scale: 0.2, rotate: overlayAnim === 'FREE_HIT' ? 12 : -15, filter: 'blur(15px)' }}
                animate={{
                  scale: [1, 1.4, 1],
                  rotate: 0,
                  filter: 'blur(0px)',
                  x: overlayAnim === 'FREE_HIT' ? [0, -15, 15, -15, 15, 0] : 0,
                  y: overlayAnim === 'FREE_HIT' ? [0, 10, -10, 10, -10, 0] : 0
                }}
                exit={{ scale: 3, opacity: 0, filter: 'blur(30px)' }}
                transition={{ type: 'spring', damping: 8, stiffness: 300, duration: overlayAnim === 'FREE_HIT' ? 2 : 0.6 }}
                className="relative z-10 px-6 text-center"
              >
                <h1 className={`font-heading ${overlayAnim === 'INNINGS_BREAK' ? 'text-[80px] sm:text-[100px]' : 'text-[120px] sm:text-[140px]'} italic font-black leading-none drop-shadow-[0_0_40px_rgba(0,0,0,0.6)] ${
                  overlayAnim === 'SIX' ? 'text-[#FFD600]' :
                  overlayAnim === 'FOUR' ? 'text-[#BC13FE]' :
                  overlayAnim === 'WICKET' ? 'text-[#FF003C]' :
                  overlayAnim === 'FREE_HIT' ? 'text-white' :
                  'text-[#00F0FF]'
                }`}>
                  {overlayAnim === 'INNINGS_BREAK' ? 'INNINGS BREAK' : overlayAnim === 'FREE_HIT' ? 'FREE HIT!' : overlayAnim}
                </h1>
                {overlayAnim === 'FREE_HIT' && (
                  <motion.div
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ repeat: Infinity, duration: 0.2 }}
                    className="mt-2 text-[10px] font-black uppercase tracking-[0.8em] text-[#00F0FF]"
                  >
                    DANGER SQUADRON ACTIVE
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CONFIG SCREEN - CRICHEROS STYLE 3-STEP FLOW */}
        {status === 'CONFIG' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <AnimatePresence mode="wait">
              {/* STEP 1: MATCH MODE SELECTION (Individual vs Tournament) */}
              {configStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8 flex flex-col"
                >
                  <div className="space-y-3">
                    <h3 className="font-heading text-3xl uppercase italic text-[#00F0FF]">Match Type</h3>
                    <p className="text-[11px] text-white/40 uppercase tracking-[0.2em]">Choose your match format</p>
                  </div>

                  <div className="space-y-4 flex-1">
                    {/* INDIVIDUAL MATCH CARD */}
                    <motion.button
                      onClick={() => {
                        setMatchMode('INDIVIDUAL');
                        setConfigStep(2);
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full p-8 rounded-[32px] border-2 transition-all ${
                        matchMode === 'INDIVIDUAL'
                          ? 'bg-[#00F0FF]/10 border-[#00F0FF] shadow-[0_0_40px_rgba(0,240,255,0.3)]'
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start space-x-6">
                        <div className="flex-shrink-0">
                          <div className="w-16 h-16 rounded-full bg-[#00F0FF]/20 border border-[#00F0FF] flex items-center justify-center">
                            <Swords size={32} className="text-[#00F0FF]" />
                          </div>
                        </div>
                        <div className="flex-1 text-left">
                          <h4 className="font-heading text-xl uppercase italic text-white mb-2">Individual Match</h4>
                          <p className="text-[11px] text-white/60">Standalone friendly game between two teams</p>
                        </div>
                      </div>
                    </motion.button>

                    {/* TOURNAMENT MATCH CARD */}
                    <motion.button
                      onClick={() => {
                        setMatchMode('TOURNAMENT');
                        setConfigStep(2);
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full p-8 rounded-[32px] border-2 transition-all ${
                        matchMode === 'TOURNAMENT'
                          ? 'bg-[#39FF14]/10 border-[#39FF14] shadow-[0_0_40px_rgba(57,255,20,0.3)]'
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start space-x-6">
                        <div className="flex-shrink-0">
                          <div className="w-16 h-16 rounded-full bg-[#39FF14]/20 border border-[#39FF14] flex items-center justify-center">
                            <Trophy size={32} className="text-[#39FF14]" />
                          </div>
                        </div>
                        <div className="flex-1 text-left">
                          <h4 className="font-heading text-xl uppercase italic text-white mb-2">Tournament Match</h4>
                          <p className="text-[11px] text-white/60">Linked to a tournament with multiple rounds</p>
                        </div>
                      </div>
                    </motion.button>
                  </div>

                  {/* Tournament selector placeholder (if needed in future) */}
                  {matchMode === 'TOURNAMENT' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Tournament</label>
                        <div className="w-full bg-white/5 border border-white/10 rounded-[20px] p-4 text-white/40 text-sm">
                          Select Tournament (Coming Soon)
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Round</label>
                        <div className="w-full bg-white/5 border border-white/10 rounded-[20px] p-4 text-white/40 text-sm">
                          Select Round (Coming Soon)
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* STEP 2: MATCH DETAILS (Single scrollable screen with all config) */}
              {configStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6 pb-32"
                >
                  <div className="space-y-3">
                    <h3 className="font-heading text-3xl uppercase italic text-[#00F0FF]">Match Details</h3>
                    <p className="text-[11px] text-white/40 uppercase tracking-[0.2em]">Configure your match</p>
                  </div>

                  {/* MATCH TYPE SELECTOR - Horizontal Pills */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Match Type</label>
                    <div className="flex flex-wrap gap-2">
                      {['LIMITED_OVERS', 'TEST', 'BOX_CRICKET', 'PAIRS_CRICKET'].map((type) => (
                        <motion.button
                          key={type}
                          onClick={() => {
                            setMatch(m => ({ ...m, config: { ...m.config, matchType: type } }));
                            if (type === 'BOX_CRICKET') {
                              setShowCustomRules(true);
                            }
                          }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-[0.2em] transition-all ${
                            match.config.matchType === type
                              ? 'bg-[#00F0FF] text-black shadow-[0_0_20px_rgba(0,240,255,0.4)]'
                              : 'bg-white/5 border border-white/10 text-white hover:border-white/20'
                          }`}
                        >
                          {type.replace('_', ' ')}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* CUSTOM MATCH RULES - Collapsible */}
                  <motion.div className="border border-white/10 rounded-[24px] overflow-hidden">
                    <motion.button
                      onClick={() => setShowCustomRules(!showCustomRules)}
                      className="w-full p-4 bg-white/[0.02] hover:bg-white/[0.05] flex items-center justify-between transition-all"
                    >
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Custom Match Rules</span>
                      <motion.div
                        animate={{ rotate: showCustomRules ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown size={16} className="text-white/40" />
                      </motion.div>
                    </motion.button>
                    <AnimatePresence>
                      {showCustomRules && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="bg-black/40 border-t border-white/5 p-4 space-y-4"
                        >
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Minus Runs Per Wicket</label>
                            <input
                              type="number"
                              placeholder="-5"
                              // @ts-nocheck - store as custom field
                              value={match.config.minusRunsPerWicket || '-5'}
                              onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, minusRunsPerWicket: e.target.value } }))}
                              className="w-full bg-white/5 border border-white/10 rounded-[20px] p-3 text-white font-bold text-center outline-none focus:border-[#00F0FF]/40"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Any Other Rules</label>
                            <input
                              type="text"
                              placeholder="E.g., No wides, Boundary line rule..."
                              // @ts-nocheck
                              value={match.config.customRules || ''}
                              onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, customRules: e.target.value } }))}
                              className="w-full bg-white/5 border border-white/10 rounded-[20px] p-3 text-white font-bold outline-none focus:border-[#00F0FF]/40 placeholder:text-white/10"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {/* NUMBER OF OVERS - Input with Quick Presets */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Number of Overs</label>
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {[5, 10, 15, 20, 50].map((preset) => (
                        <motion.button
                          key={preset}
                          onClick={() => setMatch(m => ({ ...m, config: { ...m.config, overs: preset } }))}
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.92 }}
                          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                            match.config.overs === preset
                              ? 'bg-[#00F0FF] text-black shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                              : 'bg-white/5 border border-white/10 text-white hover:border-white/20'
                          }`}
                        >
                          {preset}
                        </motion.button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="999"
                      value={match.config.overs}
                      onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, overs: parseInt(e.target.value) || 0 } }))}
                      className="w-full bg-white/5 border border-white/10 rounded-[20px] p-3 text-white font-bold text-center outline-none focus:border-[#00F0FF]/40"
                      placeholder="Enter overs"
                    />
                  </div>

                  {/* MAX OVERS PER BOWLER */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Max Overs Per Bowler</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={match.config.oversPerBowler}
                      onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, oversPerBowler: parseInt(e.target.value) || 0 } }))}
                      className="w-full bg-white/5 border border-white/10 rounded-[20px] p-3 text-white font-bold text-center outline-none focus:border-[#00F0FF]/40"
                    />
                  </div>

                  {/* BALL TYPE - Horizontal Pills */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Ball Type</label>
                    <div className="flex gap-2 flex-wrap">
                      {['TENNIS', 'LEATHER', 'OTHER'].map((type) => (
                        <motion.button
                          key={type}
                          onClick={() => setMatch(m => ({ ...m, config: { ...m.config, ballType: type } }))}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-[0.2em] transition-all ${
                            match.config.ballType === type
                              ? 'bg-[#00F0FF] text-black shadow-[0_0_20px_rgba(0,240,255,0.4)]'
                              : 'bg-white/5 border border-white/10 text-white hover:border-white/20'
                          }`}
                        >
                          {type}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* PITCH TYPE - Horizontal Pills */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Pitch Type</label>
                    <div className="flex gap-2 flex-wrap">
                      {['TURF', 'MATTING', 'INDOOR', 'OTHER'].map((type) => (
                        <motion.button
                          key={type}
                          onClick={() => setMatch(m => ({ ...m, config: { ...m.config, pitchType: type } }))}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-[0.2em] transition-all ${
                            match.config.pitchType === type
                              ? 'bg-[#00F0FF] text-black shadow-[0_0_20px_rgba(0,240,255,0.4)]'
                              : 'bg-white/5 border border-white/10 text-white hover:border-white/20'
                          }`}
                        >
                          {type}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* GROUND NAME - Search Input */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Ground Name</label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                      <input
                        type="text"
                        value={match.config.ground}
                        onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, ground: e.target.value } }))}
                        className="w-full bg-white/5 border border-white/10 rounded-[20px] p-3 pl-10 text-white font-bold outline-none focus:border-[#00F0FF]/40 placeholder:text-white/10"
                        placeholder="Search ground or stadium..."
                      />
                    </div>
                  </div>

                  {/* DATE & TIME */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Date & Time</label>
                    <input
                      type="datetime-local"
                      value={match.config.dateTime}
                      onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, dateTime: e.target.value } }))}
                      className="w-full bg-white/5 border border-white/10 rounded-[20px] p-3 text-white font-bold outline-none focus:border-[#00F0FF]/40"
                    />
                  </div>

                  {/* MATCH OFFICIALS - Collapsible */}
                  <motion.div className="border border-white/10 rounded-[24px] overflow-hidden">
                    <motion.button
                      onClick={() => setShowOfficials(!showOfficials)}
                      className="w-full p-4 bg-white/[0.02] hover:bg-white/[0.05] flex items-center justify-between transition-all"
                    >
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Match Officials</span>
                      <motion.div
                        animate={{ rotate: showOfficials ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown size={16} className="text-white/40" />
                      </motion.div>
                    </motion.button>
                    <AnimatePresence>
                      {showOfficials && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="bg-black/40 border-t border-white/5 p-4 space-y-4"
                        >
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Umpire Name</label>
                            <input
                              type="text"
                              placeholder="Enter umpire name"
                              // @ts-nocheck
                              value={match.config.umpireName || ''}
                              onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, umpireName: e.target.value } }))}
                              className="w-full bg-white/5 border border-white/10 rounded-[20px] p-3 text-white font-bold outline-none focus:border-[#00F0FF]/40 placeholder:text-white/10"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Scorer Name</label>
                            <input
                              type="text"
                              placeholder="Enter scorer name"
                              // @ts-nocheck
                              value={match.config.scorerName || ''}
                              onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, scorerName: e.target.value } }))}
                              className="w-full bg-white/5 border border-white/10 rounded-[20px] p-3 text-white font-bold outline-none focus:border-[#00F0FF]/40 placeholder:text-white/10"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {/* TIE-BREAKER METHOD - Horizontal Pills */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Tie-Breaker Method</label>
                    <div className="flex gap-2 flex-wrap">
                      {['SUPER_OVER', 'BOWL_OUT', 'NO_TIEBREAKER'].map((type) => (
                        <motion.button
                          key={type}
                          onClick={() => setMatch(m => ({ ...m, config: { ...m.config, tieBreaker: type } }))}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-[0.2em] transition-all ${
                            match.config.tieBreaker === type
                              ? 'bg-[#39FF14] text-black shadow-[0_0_20px_rgba(57,255,20,0.3)]'
                              : 'bg-white/5 border border-white/10 text-white hover:border-white/20'
                          }`}
                        >
                          {type.replace('_', ' ')}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 3: PREMIUM TEAM SELECTION */}
              {configStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8 pb-32"
                >
                  <div className="space-y-3">
                    <h3 className="font-heading text-3xl uppercase italic text-[#00F0FF]">Team Selection</h3>
                    <p className="text-[11px] text-white/40 uppercase tracking-[0.2em]">Select or create your teams</p>
                  </div>

                  {/* TWO SLEEK TEAM CARDS */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {(['A', 'B'] as const).map((teamId) => {
                      const team = getTeamObj(teamId);
                      const isTeamSelected = !!team.name;

                      return (
                        <motion.div
                          key={teamId}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="relative"
                        >
                          <AnimatePresence mode="wait">
                            {!isTeamSelected ? (
                              // EMPTY STATE
                              <motion.div
                                key="empty"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setTeamDrawer({ open: true, targetTeam: teamId, mode: 'SEARCH' })}
                                className="bg-gradient-to-br from-[#0A0A0A] to-[#111] rounded-[40px] border-2 border-dashed border-white/10 p-12 flex flex-col items-center justify-center cursor-pointer hover:border-white/20 transition-all min-h-[280px] active:scale-95"
                              >
                                <motion.div
                                  animate={{ scale: [1, 1.08, 1] }}
                                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                >
                                  <Plus size={48} className="text-white/20 mb-4" />
                                </motion.div>
                                <p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">Tap to select</p>
                                <p className="text-[8px] text-white/15 uppercase tracking-widest small-caps mt-6 absolute top-6">Team {teamId}</p>
                              </motion.div>
                            ) : (
                              // FILLED STATE
                              <motion.div
                                key="filled"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="bg-[#121212] border-2 border-[#39FF14]/30 rounded-[40px] p-6 space-y-4"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center space-x-4 flex-1">
                                    <div className="relative">
                                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#FFD600] to-[#FF6D00] flex items-center justify-center font-heading text-xl font-black text-black overflow-hidden shadow-xl">
                                        {team.logo ? (
                                          <img src={team.logo} className="w-full h-full object-cover" alt={team.name} />
                                        ) : (
                                          getTeamInitials(team.name)
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-heading text-lg uppercase italic text-white truncate">{team.name}</h4>
                                      <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">{(team.squad || []).length} Players</p>
                                    </div>
                                  </div>
                                  <motion.button
                                    onClick={() => setTeamDrawer({ open: true, targetTeam: teamId, mode: 'SEARCH' })}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="text-[#39FF14] text-xs uppercase font-black tracking-[0.1em] py-1 px-2 rounded-full hover:bg-white/5 transition-all"
                                  >
                                    Change
                                  </motion.button>
                                </div>

                                <motion.button
                                  onClick={() => setEditingTeamId(teamId)}
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  className="w-full py-4 rounded-[24px] bg-[#4DB6AC] text-black font-black uppercase tracking-[0.2em] text-sm shadow-lg"
                                >
                                  Manage Squad
                                </motion.button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* THE VS BADGE CLIMAX */}
                  <div className="relative h-32 flex items-center justify-center">
                    <AnimatePresence>
                      {match.teams.teamA.name && match.teams.teamB.name && (
                        <>
                          <motion.div
                            key="vs-badge"
                            initial={{ scale: 0, rotate: -20 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            onAnimationComplete={() => {
                              setVsRevealed(true);
                              try {
                                window.navigator.vibrate?.(50);
                              } catch {}
                            }}
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
                          >
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FFD600] to-[#FF6D00] flex items-center justify-center shadow-[0_0_40px_rgba(255,214,0,0.5)]">
                              <span className="font-heading text-2xl text-black font-black italic">VS</span>
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* THE BOTTOM SHEET DRAWER */}
                  <AnimatePresence>
                    {teamDrawer.open && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9500] bg-black/80 backdrop-blur-sm"
                        onClick={() => setTeamDrawer({ open: false, targetTeam: null, mode: 'SEARCH' })}
                      >
                        <motion.div
                          initial={{ y: '100%' }}
                          animate={{ y: 0 }}
                          exit={{ y: '100%' }}
                          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute bottom-0 left-0 right-0 bg-[#0A0A0A] rounded-t-[40px] border-t border-white/10 max-h-[85vh] flex flex-col overflow-hidden"
                        >
                          {/* Drag handle */}
                          <div className="flex justify-center pt-3 pb-2">
                            <div className="w-10 h-1 rounded-full bg-white/20" />
                          </div>

                          {/* SEARCH MODE */}
                          {teamDrawer.mode === 'SEARCH' ? (
                            <div className="flex-1 flex flex-col overflow-hidden">
                              {/* Header */}
                              <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0">
                                <h3 className="font-heading text-2xl uppercase italic text-white">Select Team</h3>
                                <button
                                  onClick={() => setTeamDrawer({ open: false, targetTeam: null, mode: 'SEARCH' })}
                                  className="p-2 text-white/40 hover:text-white transition-colors"
                                >
                                  <X size={20} />
                                </button>
                              </div>

                              {/* Search Input */}
                              <div className="p-6 border-b border-white/10 shrink-0">
                                <div className="relative">
                                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                                  <input
                                    type="text"
                                    placeholder="Search teams..."
                                    value={teamSearchQuery}
                                    onChange={(e) => setTeamSearchQuery(e.target.value)}
                                    autoFocus
                                    className="w-full bg-white/5 border border-white/10 rounded-[20px] pl-12 pr-4 py-3 text-white outline-none focus:border-[#00F0FF]/40 placeholder:text-white/20 text-sm"
                                  />
                                </div>
                              </div>

                              {/* Content */}
                              <div className="flex-1 overflow-y-auto no-scrollbar">
                                {(() => {
                                  const recentTeams = getRecentTeams();
                                  const filtered = recentTeams.filter(t =>
                                    t.name.toUpperCase().includes(teamSearchQuery.toUpperCase())
                                  );

                                  if (filtered.length === 0 && teamSearchQuery === '') {
                                    // No recent teams
                                    return (
                                      <div className="p-6 flex flex-col items-center justify-center min-h-[300px]">
                                        <Shield size={48} className="text-white/10 mb-4" />
                                        <p className="text-center text-white/50 text-sm mb-6">No teams yet. Your legacy starts here.</p>
                                        <motion.button
                                          onClick={() => {
                                            setTeamSearchQuery('');
                                            setTeamDrawer({ open: true, targetTeam: teamDrawer.targetTeam, mode: 'CREATE' });
                                          }}
                                          whileHover={{ scale: 1.05 }}
                                          whileTap={{ scale: 0.95 }}
                                          className="flex items-center space-x-2 px-6 py-3 rounded-[20px] bg-[#39FF14] text-black font-black text-sm uppercase tracking-[0.1em]"
                                        >
                                          <Plus size={16} />
                                          <span>Create Your First Team</span>
                                        </motion.button>
                                      </div>
                                    );
                                  }

                                  if (filtered.length === 0) {
                                    return (
                                      <div className="p-6 text-center text-white/40 text-sm">No teams match your search</div>
                                    );
                                  }

                                  return (
                                    <div className="p-6 space-y-3">
                                      {filtered.length > 0 && (
                                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-4">
                                          YOUR RECENT TEAMS
                                        </p>
                                      )}
                                      {filtered.map((team) => (
                                        <motion.button
                                          key={team.name}
                                          onClick={() => {
                                            setMatch(m => ({
                                              ...m,
                                              teams: {
                                                ...m.teams,
                                                [teamDrawer.targetTeam === 'A' ? 'teamA' : 'teamB']: {
                                                  ...m.teams[teamDrawer.targetTeam === 'A' ? 'teamA' : 'teamB'],
                                                  name: team.name,
                                                  logo: team.logo || '',
                                                  squad: team.squad || []
                                                }
                                              }
                                            }));
                                            setTeamSearchQuery('');
                                            setTeamDrawer({ open: false, targetTeam: null, mode: 'SEARCH' });
                                          }}
                                          whileHover={{ scale: 1.02 }}
                                          whileTap={{ scale: 0.98 }}
                                          className="w-full flex items-center space-x-4 p-4 rounded-[24px] bg-white/5 border border-white/10 hover:border-[#39FF14]/40 transition-all"
                                        >
                                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FFD600] to-[#FF6D00] flex items-center justify-center font-heading text-sm font-black text-black flex-shrink-0">
                                            {team.logo ? (
                                              <img src={team.logo} className="w-full h-full object-cover rounded-full" alt={team.name} />
                                            ) : (
                                              getTeamInitials(team.name)
                                            )}
                                          </div>
                                          <div className="flex-1 text-left min-w-0">
                                            <p className="font-black text-white text-sm truncate">{team.name}</p>
                                            <p className="text-[10px] text-white/40">{team.squad.length} Players</p>
                                          </div>
                                        </motion.button>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Footer - Create New */}
                              <div className="p-6 border-t border-white/10 shrink-0">
                                <motion.button
                                  onClick={() => {
                                    setTeamSearchQuery('');
                                    setTeamDrawer({ open: true, targetTeam: teamDrawer.targetTeam, mode: 'CREATE' });
                                  }}
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  className="w-full flex items-center justify-center space-x-2 py-4 rounded-[24px] bg-white/5 border border-white/10 font-black text-white text-sm uppercase tracking-[0.1em] hover:bg-white/10 transition-all"
                                >
                                  <Plus size={16} />
                                  <span>Create New Team</span>
                                </motion.button>
                              </div>
                            </div>
                          ) : (
                            // CREATE MODE
                            <div className="flex-1 flex flex-col overflow-hidden">
                              {/* Header */}
                              <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0">
                                <div className="flex items-center space-x-3">
                                  <button
                                    onClick={() => setTeamDrawer({ open: true, targetTeam: teamDrawer.targetTeam, mode: 'SEARCH' })}
                                    className="p-2 text-white/40 hover:text-white transition-colors"
                                  >
                                    <ChevronLeft size={20} />
                                  </button>
                                  <h3 className="font-heading text-2xl uppercase italic text-white">Create Team</h3>
                                </div>
                                <button
                                  onClick={() => setTeamDrawer({ open: false, targetTeam: null, mode: 'SEARCH' })}
                                  className="p-2 text-white/40 hover:text-white transition-colors"
                                >
                                  <X size={20} />
                                </button>
                              </div>

                              {/* Form */}
                              <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6">
                                {/* Team Name Input */}
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Team Name</label>
                                  <input
                                    type="text"
                                    placeholder="Enter team name"
                                    value={teamCreateName}
                                    onChange={(e) => setTeamCreateName(e.target.value.toUpperCase())}
                                    autoFocus
                                    className="w-full bg-white/5 border border-white/10 rounded-[20px] px-4 py-3 text-white font-black uppercase outline-none focus:border-[#00F0FF]/40 placeholder:text-white/10 text-sm"
                                  />
                                </div>

                                {/* Logo Upload */}
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Team Logo</label>
                                  <motion.label
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="flex flex-col items-center justify-center p-8 rounded-[24px] border-2 border-dashed border-white/10 cursor-pointer hover:border-white/20 transition-all"
                                  >
                                    <Camera size={32} className="text-white/30 mb-2" />
                                    <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Tap to upload logo (optional)</p>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={(e) => {
                                        if (e.target.files?.[0]) {
                                          const reader = new FileReader();
                                          reader.onload = (event) => {
                                            setMatch(m => ({
                                              ...m,
                                              teams: {
                                                ...m.teams,
                                                [teamDrawer.targetTeam === 'A' ? 'teamA' : 'teamB']: {
                                                  ...m.teams[teamDrawer.targetTeam === 'A' ? 'teamA' : 'teamB'],
                                                  name: teamCreateName,
                                                  logo: event.target?.result as string,
                                                  squad: []
                                                }
                                              }
                                            }));
                                            setTeamCreateName('');
                                            setTeamSearchQuery('');
                                            setTeamDrawer({ open: false, targetTeam: null, mode: 'SEARCH' });
                                          };
                                          reader.readAsDataURL(e.target.files[0]);
                                        }
                                      }}
                                      className="hidden"
                                    />
                                  </motion.label>
                                </div>
                              </div>

                              {/* Footer - Create Button */}
                              <div className="p-6 border-t border-white/10 shrink-0">
                                <motion.button
                                  onClick={() => {
                                    if (teamCreateName.trim()) {
                                      setMatch(m => ({
                                        ...m,
                                        teams: {
                                          ...m.teams,
                                          [teamDrawer.targetTeam === 'A' ? 'teamA' : 'teamB']: {
                                            ...m.teams[teamDrawer.targetTeam === 'A' ? 'teamA' : 'teamB'],
                                            name: teamCreateName,
                                            squad: []
                                          }
                                        }
                                      }));
                                      setTeamCreateName('');
                                      setTeamSearchQuery('');
                                      setTeamDrawer({ open: false, targetTeam: null, mode: 'SEARCH' });
                                    }
                                  }}
                                  disabled={!teamCreateName.trim()}
                                  whileHover={teamCreateName.trim() ? { scale: 1.02 } : {}}
                                  whileTap={teamCreateName.trim() ? { scale: 0.98 } : {}}
                                  className={`w-full py-4 rounded-[24px] font-black uppercase tracking-[0.2em] text-sm transition-all ${
                                    teamCreateName.trim()
                                      ? 'bg-[#39FF14] text-black shadow-[0_0_30px_rgba(57,255,20,0.3)]'
                                      : 'bg-white/5 text-white/30 cursor-not-allowed'
                                  }`}
                                >
                                  Create Team
                                </motion.button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            {/* CONFIG FOOTER - NAVIGATION */}
            <div className="p-6 bg-[#050505] border-t border-white/5 z-[200] shrink-0 pb-10 shadow-[0_-20px_60px_rgba(0,0,0,0.9)] flex gap-3">
              {configStep > 1 && (
                <motion.button
                  onClick={() => setConfigStep(configStep - 1)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 py-6 rounded-[24px] bg-white/5 border border-white/10 font-black uppercase tracking-[0.3em] text-sm text-white hover:bg-white/10 transition-all"
                >
                  Back
                </motion.button>
              )}
              {configStep < 3 ? (
                <motion.button
                  onClick={() => setConfigStep(configStep + 1)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 py-6 rounded-[24px] bg-[#00F0FF] text-black font-black uppercase tracking-[0.3em] text-sm shadow-[0_0_30px_rgba(0,240,255,0.3)]"
                >
                  Next
                </motion.button>
              ) : (
                <motion.div
                  animate={isConfigValid() ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 0.4, delay: 0.3 }}
                >
                  <MotionButton
                    disabled={!isConfigValid()}
                    onClick={checkTeamConflicts}
                    className={`flex-1 py-6 !rounded-[24px] font-black uppercase tracking-[0.3em] text-sm transition-all ${
                      isConfigValid() ? 'bg-[#39FF14] text-black shadow-[0_12px_40px_rgba(57,255,20,0.4)]' : 'bg-white/5 text-white/10'
                    }`}
                  >
                    Proceed to Toss
                  </MotionButton>
                </motion.div>
              )}
            </div>
          </div>
        )}

        {/* SQUAD CONFLICT MODAL */}
        <AnimatePresence>
          {squadConflict && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10000] bg-black/95 flex items-center justify-center p-6 backdrop-blur-xl"
            >
              <motion.div
                initial={{ scale: 0.9, y: 40 }}
                animate={{ scale: 1, y: 0 }}
                className="w-full max-w-sm bg-[#0A0A0A] border border-white/10 rounded-[48px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)]"
              >
                <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                  <div className="flex items-center space-x-3">
                    <ShieldAlert size={24} className="text-[#FFD600]" />
                    <h3 className="font-heading text-4xl tracking-tighter uppercase italic">SQUAD RECON</h3>
                  </div>
                </div>
                <div className="p-10 space-y-8">
                  <div className="space-y-4 text-center">
                    <p className="text-[11px] font-black text-[#00F0FF] uppercase tracking-[0.4em]">Conflict Detected</p>
                    <h4 className="font-heading text-5xl uppercase leading-none text-white italic">{squadConflict.name}</h4>
                    <p className="text-[10px] font-black text-white/30 uppercase leading-relaxed tracking-widest">
                      THIS TEAM ALREADY EXISTS IN YOUR CAREER ARCHIVE
                    </p>
                  </div>
                  <div className="p-5 bg-white/5 rounded-3xl border border-white/10 space-y-4">
                    <div className="flex justify-between items-center px-2">
                      <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Archived Roster</span>
                      <span className="text-[9px] font-black text-[#39FF14] uppercase">{(squadConflict.existingSquad || []).length} PERSONNEL</span>
                    </div>
                    <div className="flex -space-x-3 justify-center overflow-hidden py-2">
                      {(squadConflict.existingSquad || []).slice(0, 5).map((p, i) => (
                        <div key={i} className="w-10 h-10 rounded-full border-2 border-black bg-[#111] overflow-hidden">
                          <img src={getPlayerAvatar(p)} className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {squadConflict.existingSquad.length > 5 && (
                        <div className="w-10 h-10 rounded-full border-2 border-black bg-[#111] flex items-center justify-center text-[10px] font-black text-white/40">
                          +{squadConflict.existingSquad.length - 5}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col space-y-3">
                    <MotionButton
                      onClick={() => handleResolveConflict('EXISTING')}
                      className="w-full bg-[#00F0FF] text-black py-5 !rounded-[24px] font-black tracking-[0.3em]"
                    >
                      ARCHIVE LINKAGE
                    </MotionButton>
                    <button
                      onClick={() => handleResolveConflict('NEW')}
                      className="w-full text-white/30 hover:text-white py-4 font-black uppercase text-[9px] tracking-[0.4em] transition-all"
                    >
                      FRESH COMMISSION
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TOSS SCREEN - 2-step: Who Won → Bat/Bowl → straight to Openers */}
        {status === 'TOSS_FLIP' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#050505]">
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8 pb-32 flex flex-col items-center justify-center">
              <AnimatePresence mode="wait">
                {/* STEP 1: Who won the toss? */}
                {!match.toss.winnerId && (
                  <motion.div
                    key="toss-winner"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-6 w-full max-w-md text-center"
                  >
                    <div className="space-y-3">
                      <Coins size={40} className="text-[#FFD600] mx-auto" />
                      <h2 className="font-heading text-3xl uppercase italic text-white">Who Won The Toss?</h2>
                      <p className="text-[11px] text-white/40 uppercase tracking-[0.2em]">Tap the winning team</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setMatch(m => ({ ...m, toss: { ...m.toss, winnerId: 'A' } }))}
                      className="w-full p-5 rounded-[24px] bg-gradient-to-r from-[#FFD600]/15 to-[#FFD600]/5 border-2 border-[#FFD600]/60 hover:border-[#FFD600] flex items-center gap-4 transition-all active:scale-95"
                    >
                      <div className="w-12 h-12 rounded-full bg-[#FFD600]/20 border border-[#FFD600] flex items-center justify-center font-black text-[18px] text-[#FFD600] shrink-0">
                        A
                      </div>
                      <p className="font-black text-[15px] uppercase text-[#FFD600] text-left">{match.teams.teamA.name}</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMatch(m => ({ ...m, toss: { ...m.toss, winnerId: 'B' } }))}
                      className="w-full p-5 rounded-[24px] bg-gradient-to-r from-[#00F0FF]/15 to-[#00F0FF]/5 border-2 border-[#00F0FF]/60 hover:border-[#00F0FF] flex items-center gap-4 transition-all active:scale-95"
                    >
                      <div className="w-12 h-12 rounded-full bg-[#00F0FF]/20 border border-[#00F0FF] flex items-center justify-center font-black text-[18px] text-[#00F0FF] shrink-0">
                        B
                      </div>
                      <p className="font-black text-[15px] uppercase text-[#00F0FF] text-left">{match.teams.teamB.name}</p>
                    </button>
                  </motion.div>
                )}

                {/* STEP 2: Bat or Bowl? → directly goes to Openers */}
                {match.toss.winnerId && (
                  <motion.div
                    key="toss-decision"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-6 w-full max-w-md text-center"
                  >
                    <div className="space-y-3">
                      <Trophy size={40} className="text-[#00F0FF] mx-auto" />
                      <h2 className="font-heading text-3xl uppercase italic text-white">
                        {getTeamObj(match.toss.winnerId).name}
                      </h2>
                      <p className="text-[13px] font-black text-[#00F0FF] uppercase tracking-[0.2em]">Won the toss! What do they choose?</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const winnerId = match.toss.winnerId;
                        const loserId = winnerId === 'A' ? 'B' : 'A';
                        setMatch(m => ({
                          ...m,
                          toss: { ...m.toss, decision: 'BAT' },
                          teams: { ...m.teams, battingTeamId: winnerId, bowlingTeamId: loserId }
                        }));
                        setSelectionTarget('STRIKER');
                        setStatus('OPENERS');
                      }}
                      className="w-full p-6 rounded-[24px] bg-gradient-to-r from-[#39FF14]/15 to-[#39FF14]/5 border-2 border-[#39FF14]/60 hover:border-[#39FF14] hover:shadow-[0_0_20px_rgba(57,255,20,0.2)] transition-all space-y-2 active:scale-95"
                    >
                      <Zap size={28} className="text-[#39FF14] mx-auto" />
                      <p className="font-black text-[16px] text-[#39FF14] uppercase">Bat First</p>
                      <p className="text-[11px] text-white/50">Set the target</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const winnerId = match.toss.winnerId;
                        const loserId = winnerId === 'A' ? 'B' : 'A';
                        setMatch(m => ({
                          ...m,
                          toss: { ...m.toss, decision: 'BOWL' },
                          teams: { ...m.teams, battingTeamId: loserId, bowlingTeamId: winnerId }
                        }));
                        setSelectionTarget('STRIKER');
                        setStatus('OPENERS');
                      }}
                      className="w-full p-6 rounded-[24px] bg-gradient-to-r from-[#BC13FE]/15 to-[#BC13FE]/5 border-2 border-[#BC13FE]/60 hover:border-[#BC13FE] hover:shadow-[0_0_20px_rgba(188,19,254,0.2)] transition-all space-y-2 active:scale-95"
                    >
                      <Disc size={28} className="text-[#BC13FE] mx-auto" />
                      <p className="font-black text-[16px] text-[#BC13FE] uppercase">Bowl First</p>
                      <p className="text-[11px] text-white/50">Chase later</p>
                    </button>

                    {/* Go back to change winner */}
                    <button
                      type="button"
                      onClick={() => setMatch(m => ({ ...m, toss: { ...m.toss, winnerId: null, decision: null } }))}
                      className="text-[11px] font-black text-white/30 uppercase tracking-[0.1em] hover:text-white/50 transition-all"
                    >
                      Change toss winner
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* OPENERS SCREEN */}
        {status === 'OPENERS' && (() => {
          // Safety net: if selectionTarget is null when entering OPENERS, auto-set to STRIKER
          const activeTarget = selectionTarget || 'STRIKER';
          if (!selectionTarget) setTimeout(() => setSelectionTarget('STRIKER'), 0);

          const battingSquad = getTeamObj(match.teams.battingTeamId)?.squad || [];
          const bowlingSquad = getTeamObj(match.teams.bowlingTeamId)?.squad || [];
          const battingTeamName = getTeamObj(match.teams.battingTeamId)?.name || 'Batting';
          const bowlingTeamName = getTeamObj(match.teams.bowlingTeamId)?.name || 'Bowling';

          const stepLabels = [
            { key: 'STRIKER', label: 'Striker' },
            { key: 'NON_STRIKER', label: 'Non-Striker' },
            { key: 'BOWLER', label: 'Opening Bowler' },
          ];
          const currentStepIdx = stepLabels.findIndex(s => s.key === activeTarget);

          return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6 pb-32">
              {/* Header */}
              <div className="space-y-3">
                <h2 className="font-heading text-3xl uppercase italic text-[#00F0FF]">Select Openers</h2>
                <p className="text-[11px] text-white/40 uppercase tracking-[0.2em]">
                  {activeTarget === 'BOWLER' ? bowlingTeamName : battingTeamName}
                </p>
              </div>

              {/* Step Progress */}
              <div className="flex items-center gap-2">
                {stepLabels.map((step, i) => (
                  <div key={step.key} className="flex items-center gap-2 flex-1">
                    <div className={`h-1 flex-1 rounded-full transition-all ${
                      i <= currentStepIdx ? 'bg-[#00F0FF]' : 'bg-white/10'
                    }`} />
                    <p className={`text-[8px] font-black uppercase tracking-[0.1em] shrink-0 ${
                      i === currentStepIdx ? 'text-[#00F0FF]' : i < currentStepIdx ? 'text-[#39FF14]' : 'text-white/20'
                    }`}>{step.label}</p>
                  </div>
                ))}
              </div>

              {/* Current Selection Label */}
              <div className="p-3 rounded-[16px] bg-[#00F0FF]/10 border border-[#00F0FF]/20">
                <p className="text-[11px] font-black text-[#00F0FF] uppercase tracking-[0.2em] text-center">
                  {activeTarget === 'STRIKER' && 'Tap to select the opening striker'}
                  {activeTarget === 'NON_STRIKER' && 'Now pick the non-striker'}
                  {activeTarget === 'BOWLER' && 'Choose who bowls the first over'}
                </p>
              </div>

              {/* Selected so far */}
              {(match.crease.strikerId || match.crease.nonStrikerId) && (
                <div className="flex gap-3">
                  {match.crease.strikerId && (() => {
                    const p = battingSquad.find(pl => pl.id === match.crease.strikerId);
                    return p ? (
                      <div className="flex-1 p-3 rounded-[16px] bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-[#39FF14] shrink-0" />
                        <div>
                          <p className="text-[8px] text-[#39FF14] font-black uppercase">Striker</p>
                          <p className="text-[11px] font-black text-white uppercase">{p.name}</p>
                        </div>
                      </div>
                    ) : null;
                  })()}
                  {match.crease.nonStrikerId && (() => {
                    const p = battingSquad.find(pl => pl.id === match.crease.nonStrikerId);
                    return p ? (
                      <div className="flex-1 p-3 rounded-[16px] bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-[#39FF14] shrink-0" />
                        <div>
                          <p className="text-[8px] text-[#39FF14] font-black uppercase">Non-Striker</p>
                          <p className="text-[11px] font-black text-white uppercase">{p.name}</p>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Player List */}
              <div className="space-y-3">
                {activeTarget === 'STRIKER' && battingSquad.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => {
                      setMatch(m => ({ ...m, crease: { ...m.crease, strikerId: player.id } }));
                      setSelectionTarget('NON_STRIKER');
                    }}
                    className="w-full p-4 rounded-[20px] bg-white/5 border border-white/10 hover:border-[#00F0FF]/40 flex items-center gap-4 transition-all active:scale-95"
                  >
                    <img src={getPlayerAvatar(player)} className="w-11 h-11 rounded-full" />
                    <div className="flex-1 text-left">
                      <p className="font-black text-[13px] text-white uppercase">{player.name}</p>
                      <p className="text-[10px] text-white/40">{player.phone || ''}</p>
                    </div>
                    <ChevronRight size={16} className="text-white/20" />
                  </button>
                ))}

                {activeTarget === 'NON_STRIKER' && battingSquad.filter(p => p.id !== match.crease.strikerId).map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => {
                      setMatch(m => ({ ...m, crease: { ...m.crease, nonStrikerId: player.id } }));
                      setSelectionTarget('BOWLER');
                    }}
                    className="w-full p-4 rounded-[20px] bg-white/5 border border-white/10 hover:border-[#00F0FF]/40 flex items-center gap-4 transition-all active:scale-95"
                  >
                    <img src={getPlayerAvatar(player)} className="w-11 h-11 rounded-full" />
                    <div className="flex-1 text-left">
                      <p className="font-black text-[13px] text-white uppercase">{player.name}</p>
                      <p className="text-[10px] text-white/40">{player.phone || ''}</p>
                    </div>
                    <ChevronRight size={16} className="text-white/20" />
                  </button>
                ))}

                {activeTarget === 'BOWLER' && bowlingSquad.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => {
                      setMatch(m => ({ ...m, crease: { ...m.crease, bowlerId: player.id } }));
                      setSelectionTarget(null);
                      setStatus('LIVE');
                    }}
                    className="w-full p-4 rounded-[20px] bg-white/5 border border-white/10 hover:border-[#BC13FE]/40 flex items-center gap-4 transition-all active:scale-95"
                  >
                    <img src={getPlayerAvatar(player)} className="w-11 h-11 rounded-full" />
                    <div className="flex-1 text-left">
                      <p className="font-black text-[13px] text-white uppercase">{player.name}</p>
                      <p className="text-[10px] text-white/40">{player.phone || ''}</p>
                    </div>
                    <ChevronRight size={16} className="text-white/20" />
                  </button>
                ))}

                {/* Empty state if no players in squad */}
                {((activeTarget === 'STRIKER' || activeTarget === 'NON_STRIKER') && battingSquad.length === 0) && (
                  <div className="p-8 text-center space-y-3">
                    <Users size={32} className="text-white/20 mx-auto" />
                    <p className="text-[12px] text-white/40 font-black uppercase">No players in batting squad</p>
                    <p className="text-[10px] text-white/30">Go back and add players first</p>
                  </div>
                )}
                {(activeTarget === 'BOWLER' && bowlingSquad.length === 0) && (
                  <div className="p-8 text-center space-y-3">
                    <Users size={32} className="text-white/20 mx-auto" />
                    <p className="text-[12px] text-white/40 font-black uppercase">No players in bowling squad</p>
                    <p className="text-[10px] text-white/30">Go back and add players first</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })()}

        {/* LIVE SCORING SCREEN */}
        {status === 'LIVE' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* PREMIUM SCOREBOARD HEADER */}
            <div className="shrink-0 p-6 bg-gradient-to-b from-black/50 to-black/20 border-b border-white/5 space-y-4">
              <div className="grid grid-cols-3 gap-4 items-center">
                {/* BATTING TEAM */}
                <div className="text-center space-y-2">
                  <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Batting</p>
                  <div className="flex flex-col items-center space-y-1">
                    {match.teams.teamA.logo || match.teams.teamB.logo ? (
                      <img src={getTeamObj(match.teams.battingTeamId).logo} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-heading text-sm text-white">
                        {getTeamInitials(getTeamObj(match.teams.battingTeamId).name)}
                      </div>
                    )}
                    <p className="text-[10px] font-black uppercase text-white">{getTeamObj(match.teams.battingTeamId).name}</p>
                  </div>
                </div>

                {/* LIVE SCORE */}
                <motion.div
                  className="text-center space-y-2 p-4 rounded-[24px] bg-white/5 border border-white/10"
                  key={`score-${match.liveScore.runs}-${match.liveScore.wickets}-${match.liveScore.balls}`}
                >
                  <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Score</p>
                  <h3 className="font-numbers text-3xl font-black text-[#00F0FF]">{match.liveScore.runs}/{match.liveScore.wickets}</h3>
                  <p className="text-[9px] text-white/30">
                    {Math.floor(match.liveScore.balls / 6)}.{match.liveScore.balls % 6} overs
                  </p>
                </motion.div>

                {/* BOWLING TEAM */}
                <div className="text-center space-y-2">
                  <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Bowling</p>
                  <div className="flex flex-col items-center space-y-1">
                    {match.teams.teamA.logo || match.teams.teamB.logo ? (
                      <img src={getTeamObj(match.teams.bowlingTeamId).logo} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-heading text-sm text-white">
                        {getTeamInitials(getTeamObj(match.teams.bowlingTeamId).name)}
                      </div>
                    )}
                    <p className="text-[10px] font-black uppercase text-white">{getTeamObj(match.teams.bowlingTeamId).name}</p>
                  </div>
                </div>
              </div>

              {/* BATSMEN DISPLAY */}
              <div className="grid grid-cols-2 gap-3">
                {match.crease.strikerId && (
                  <div className="p-3 rounded-[20px] bg-[#00F0FF]/10 border border-[#00F0FF]/30 space-y-1">
                    <p className="text-[8px] font-black text-[#00F0FF] uppercase">Striker</p>
                    {(() => {
                      const striker = getPlayer(match.crease.strikerId);
                      return (
                        <div className="flex items-center space-x-2">
                          <img src={getPlayerAvatar(striker)} className="w-8 h-8 rounded-full" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-black text-white truncate">{striker?.name}</p>
                            <p className="text-[8px] text-white/40">{striker?.runs || 0}({striker?.balls || 0})</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
                {match.crease.nonStrikerId && (
                  <div className="p-3 rounded-[20px] bg-white/5 border border-white/10 space-y-1">
                    <p className="text-[8px] font-black text-white/40 uppercase">Non-Striker</p>
                    {(() => {
                      const nonStriker = getPlayer(match.crease.nonStrikerId);
                      return (
                        <div className="flex items-center space-x-2">
                          <img src={getPlayerAvatar(nonStriker)} className="w-8 h-8 rounded-full" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-black text-white truncate">{nonStriker?.name}</p>
                            <p className="text-[8px] text-white/40">{nonStriker?.runs || 0}({nonStriker?.balls || 0})</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* LIVE KEYPAD */}
            <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[0, 1, 2, 3, 4, 5, 6].map((runs) => (
                  <KeypadButton
                    key={runs}
                    onClick={() => handleScore(runs)}
                    color={runs === 0 ? 'white' : runs === 4 ? '#BC13FE' : runs === 6 ? '#FFD600' : 'white'}
                    bg={runs === 0 ? CYBER_COLORS.grey : runs === 4 ? '#BC13FE' + '22' : runs === 6 ? '#FFD600' + '22' : CYBER_COLORS.grey}
                  >
                    {runs === 0 ? 'DOT' : runs}
                  </KeypadButton>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-2">
                <KeypadButton onClick={() => setPendingExtra('WD')} bg="#FF6D00" color="#050505" active={pendingExtra === 'WD'}>WD</KeypadButton>
                <KeypadButton onClick={() => setPendingExtra('NB')} bg="#FF6D00" color="#050505" active={pendingExtra === 'NB'}>NB</KeypadButton>
                <KeypadButton onClick={() => setPendingExtra('BYE')} bg="#FF6D00" color="#050505" active={pendingExtra === 'BYE'}>BYE</KeypadButton>
                <KeypadButton onClick={() => setPendingExtra('LB')} bg="#FF6D00" color="#050505" active={pendingExtra === 'LB'}>LB</KeypadButton>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <KeypadButton onClick={() => setWicketWizard({ open: true })} bg="#FF003C" color="#FFF" span={2}>WICKET</KeypadButton>
                <KeypadButton onClick={() => {}} bg="white/5" color="white/30" disabled>SWAP</KeypadButton>
                <KeypadButton onClick={handleUndo} disabled={!match.history || match.history.length === 0} bg={CYBER_COLORS.grey} color={CYBER_COLORS.orange}>UNDO</KeypadButton>
              </div>
            </div>

            {/* WICKET WIZARD */}
            <AnimatePresence>
              {wicketWizard.open && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[5000] bg-black/95 flex items-center justify-center p-6"
                >
                  <motion.div
                    initial={{ scale: 0.9, y: 40 }}
                    animate={{ scale: 1, y: 0 }}
                    className="w-full max-w-sm bg-[#0A0A0A] border border-white/10 rounded-[48px] overflow-hidden shadow-2xl"
                  >
                    <div className="p-8 border-b border-white/5 bg-white/[0.02]">
                      <h3 className="font-heading text-3xl uppercase italic text-[#FF003C]">Wicket Type</h3>
                    </div>
                    <div className="p-6 space-y-3">
                      {['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'RUN OUT', 'HIT WICKET'].map((type) => (
                        <motion.button
                          key={type}
                          onClick={() => handleWicketAction(type)}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="w-full p-4 rounded-[24px] bg-white/5 border border-white/10 hover:border-[#FF003C]/40 font-black uppercase text-sm transition-all"
                        >
                          {type}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* INNINGS BREAK */}
        {status === 'INNINGS_BREAK' && (
          <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 8, stiffness: 200 }}
              className="text-center space-y-6 px-6 max-w-2xl"
            >
              <h2 className="font-heading text-6xl uppercase italic text-[#00F0FF]">INNINGS END</h2>
              <div className="p-8 rounded-[40px] bg-white/5 border border-white/10 space-y-4">
                <p className="text-[12px] font-black text-white/40 uppercase tracking-[0.3em]">Inning 1 Summary</p>
                <h3 className="font-heading text-4xl uppercase italic">{getTeamObj(match.teams.battingTeamId)?.name || 'Team'}</h3>
                <p className="font-numbers text-5xl font-black text-[#00F0FF]">{match.liveScore.runs}/{match.liveScore.wickets}</p>
                <p className="text-[11px] text-white/40">in {Math.floor(match.liveScore.balls / 6)}.{match.liveScore.balls % 6} overs</p>
              </div>
              <motion.button
                onClick={() => {
                  setMatch(m => ({
                    ...m,
                    config: { ...m.config, target: m.liveScore.runs + 1, innings1Score: m.liveScore.runs, innings1Wickets: m.liveScore.wickets, innings1Balls: m.liveScore.balls },
                    teams: { ...m.teams, battingTeamId: m.teams.bowlingTeamId, bowlingTeamId: m.teams.battingTeamId },
                    liveScore: { runs: 0, wickets: 0, balls: 0 },
                    crease: { strikerId: null, nonStrikerId: null, bowlerId: null, previousBowlerId: null },
                    currentInnings: 2,
                  }));
                  setSelectionTarget('STRIKER');
                  setStatus('OPENERS');
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="mt-8 px-8 py-6 rounded-[24px] bg-[#39FF14] text-black font-black uppercase tracking-[0.3em] shadow-[0_0_40px_rgba(57,255,20,0.4)]"
              >
                Start Innings 2
              </motion.button>
            </motion.div>
          </div>
        )}

        {/* SUMMARY SCREEN */}
        {status === 'SUMMARY' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6 pb-20">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="p-8 rounded-[40px] bg-gradient-to-br from-[#00F0FF]/10 to-[#FFD600]/10 border border-white/10 space-y-4 text-center"
              >
                <h2 className="font-heading text-4xl uppercase italic text-[#00F0FF]">Match Complete</h2>
                {winnerTeam && (
                  <>
                    <h3 className="font-heading text-5xl uppercase italic text-[#39FF14]">{winnerTeam.name}</h3>
                    <p className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em]">{winnerTeam.margin}</p>
                  </>
                )}
              </motion.div>

              {/* TABS */}
              <div className="flex gap-2 p-1 bg-white/5 rounded-[20px]">
                {['OVERVIEW', 'ANALYTICS', 'SCORECARD'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSummaryTab(tab as any)}
                    className={`flex-1 py-3 rounded-[16px] font-black text-[10px] uppercase tracking-[0.2em] transition-all ${
                      summaryTab === tab ? 'bg-[#00F0FF] text-black shadow-[0_0_20px_rgba(0,240,255,0.3)]' : 'text-white/40'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* TAB CONTENT */}
              {summaryTab === 'OVERVIEW' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    {['A', 'B'].map((id) => (
                      <div key={id} className="p-6 rounded-[32px] bg-white/5 border border-white/10 text-center space-y-3">
                        <p className="text-[10px] font-black text-white/40 uppercase">{getTeamObj(id).name}</p>
                        <p className="font-numbers text-3xl font-black text-white">
                          {getTeamObj(id).squad?.reduce((sum, p) => sum + (p.runs || 0), 0) || 0}
                        </p>
                        <p className="text-[9px] text-white/30">
                          {getTeamObj(id).squad?.filter(p => !p.isOut).length || 0} batting
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {summaryTab === 'ANALYTICS' && (
                <div className="space-y-4 text-[10px] text-white/40 text-center py-12">
                  <p>Detailed analytics coming soon</p>
                </div>
              )}

              {summaryTab === 'SCORECARD' && (
                <div className="space-y-6">
                  {['A', 'B'].map((id) => (
                    <div key={id} className="space-y-3">
                      <p className="text-[10px] font-black text-[#00F0FF] uppercase">{getTeamObj(id).name}</p>
                      <div className="space-y-2">
                        {(getTeamObj(id).squad || []).map((player) => (
                          <div key={player.id} className="p-3 rounded-[16px] bg-white/5 border border-white/10 flex justify-between items-center">
                            <p className="text-[9px] font-black text-white">{player.name}</p>
                            <p className="text-[9px] font-numbers text-[#00F0FF]">{player.runs || 0}({player.balls || 0})</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SQUAD EDITOR MODAL */}
      <AnimatePresence>
        {editingTeamId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/95 flex items-end md:items-center justify-center p-4 md:p-6"
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="w-full max-w-2xl bg-[#0A0A0A] border border-white/10 rounded-[40px] overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                <button onClick={() => setEditingTeamId(null)} className="p-2 -ml-2 text-[#00F0FF] hover:bg-white/5 rounded-full">
                  <ChevronLeft size={20} />
                </button>
                <h3 className="font-heading text-xl uppercase italic">{getTeamObj(editingTeamId)?.name || 'Squad Editor'}</h3>
                <div className="w-10" />
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Current Squad */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-black text-white/40 uppercase tracking-[0.2em]">Current Squad</p>
                    {(!isCaptainSelected() || !isWicketKeeperSelected()) && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="px-2 py-1 bg-[#FF6D00]/20 border border-[#FF6D00] rounded-full text-[8px] font-black text-[#FF6D00] uppercase"
                      >
                        {!isCaptainSelected() && !isWicketKeeperSelected() ? 'Set Captain & WK' : !isCaptainSelected() ? 'Set Captain' : 'Set WK'}
                      </motion.div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(getTeamObj(editingTeamId)?.squad || []).map((player) => (
                      <div key={player.id} className="p-3 rounded-[16px] bg-white/5 border border-white/10 flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1">
                          <img src={getPlayerAvatar(player)} alt={player.name} className="w-8 h-8 rounded-full" />
                          <div className="flex-1">
                            <p className="text-[10px] font-black text-white">{player.name}</p>
                            <p className="text-[8px] text-white/40">{player.phone || 'No phone'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleSetCaptain(player.id)}
                            title="Set as Captain"
                            className={`p-2 rounded-lg transition-all ${
                              player.isCaptain
                                ? 'bg-[#FFD600]/30 text-[#FFD600] border border-[#FFD600]'
                                : 'bg-white/5 text-white/40 hover:text-white border border-transparent hover:border-white/20'
                            }`}
                          >
                            <Crown size={14} />
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleSetWicketKeeper(player.id)}
                            title="Set as Wicket Keeper"
                            className={`p-2 rounded-lg transition-all ${
                              player.isWicketKeeper
                                ? 'bg-[#00F0FF]/30 text-[#00F0FF] border border-[#00F0FF]'
                                : 'bg-white/5 text-white/40 hover:text-white border border-transparent hover:border-white/20'
                            }`}
                          >
                            <GloveIcon size={14} />
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setMatch(m => {
                              const key = editingTeamId === 'A' ? 'teamA' : 'teamB';
                              return { ...m, teams: { ...m.teams, [key]: { ...m.teams[key], squad: m.teams[key].squad.filter(p => p.id !== player.id) } } };
                            })}
                            className="p-2 text-[#FF003C] hover:bg-[#FF003C]/20 rounded-lg transition-all border border-transparent hover:border-[#FF003C]/30"
                          >
                            <Trash2 size={14} />
                          </motion.button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* New Recruitment */}
                <div className="space-y-3 p-4 rounded-[24px] bg-white/5 border border-white/10">
                  <p className="text-[11px] font-black text-[#00F0FF] uppercase tracking-[0.2em]">New Recruitment</p>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Player name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value.toUpperCase())}
                      className="w-full px-3 py-3 min-h-[48px] rounded-[12px] bg-white/10 border border-white/20 text-[13px] text-white placeholder:text-white/30 outline-none"
                    />
                    {showPlayerDropdown && playerDropdownList.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto bg-[#1A1A1A] border border-white/20 rounded-[12px] z-50 shadow-2xl"
                      >
                        {playerDropdownList.map((p) => (
                          <motion.button
                            key={p.id}
                            whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
                            onClick={() => handleSelectVaultPlayer(p)}
                            className="w-full px-3 py-2 text-left text-[12px] text-white hover:bg-white/10 transition-all border-b border-white/5 last:border-b-0"
                          >
                            <p className="font-black">{p.name}</p>
                            <p className="text-[10px] text-white/40">{p.phone}</p>
                          </motion.button>
                        ))}
                      </motion.div>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Phone (optional)"
                    value={phoneQuery}
                    onChange={(e) => setPhoneQuery(e.target.value)}
                    className="w-full px-3 py-3 min-h-[48px] rounded-[12px] bg-white/10 border border-white/20 text-[13px] text-white placeholder:text-white/30 outline-none"
                  />
                  <button
                    onClick={startQRScanner}
                    className="w-full py-3 min-h-[48px] rounded-[12px] bg-white/10 border border-white/20 text-[12px] font-black text-[#00F0FF] uppercase hover:bg-white/15 transition-all flex items-center justify-center gap-2"
                  >
                    <Camera size={14} /> Scan QR
                  </button>
                </div>

                {/* Add Player Button */}
                <button
                  type="button"
                  onClick={() => { handleEnlistNewPlayer(); }}
                  className={`w-full min-h-[56px] py-4 rounded-[20px] font-black uppercase text-[13px] tracking-[0.2em] transition-all duration-150 flex items-center justify-center gap-2 select-none touch-manipulation ${
                    isAddPlayerDisabled
                      ? 'bg-white/5 text-white/20 pointer-events-none'
                      : 'bg-[#00F0FF] text-black shadow-[0_4px_20px_rgba(0,240,255,0.3)] cursor-pointer active:scale-95 active:shadow-[0_0_10px_rgba(0,240,255,0.5)]'
                  }`}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <Plus size={18} />
                  <span>Add Player</span>
                </button>
              </div>

              <div className="p-6 border-t border-white/5 flex gap-3">
                <button
                  onClick={() => setEditingTeamId(null)}
                  className="flex-1 py-3 rounded-[20px] bg-white/5 border border-white/10 font-black text-[11px] uppercase text-white hover:bg-white/10 transition-all"
                >
                  Close
                </button>
                <button
                  onClick={() => setEditingTeamId(null)}
                  className="flex-1 py-3 rounded-[20px] bg-[#39FF14] text-black font-black text-[11px] uppercase hover:shadow-[0_0_20px_rgba(57,255,20,0.3)] transition-all"
                >
                  Save Squadron
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LIVE SCORECARD MODAL */}
      <AnimatePresence>
        {showLiveScorecard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLiveScorecard(false)}
            className="fixed inset-0 z-[4000] bg-black/95 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl bg-[#0A0A0A] border border-white/10 rounded-[40px] overflow-hidden max-h-[80vh] overflow-y-auto p-6 space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-xl uppercase italic text-[#00F0FF]">Live Scorecard</h3>
                <button onClick={() => setShowLiveScorecard(false)} className="p-2 text-white/40 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              {/* Batting Team */}
              <div className="space-y-3">
                <p className="text-[11px] font-black text-[#00F0FF] uppercase tracking-[0.2em]">Batting</p>
                <div className="space-y-2">
                  {(match.teams[match.teams.battingTeamId === 'A' ? 'teamA' : 'teamB']?.squad || []).map((player) => (
                    <div key={player.id} className="p-3 rounded-[16px] bg-white/5 border border-white/10 flex justify-between items-center">
                      <p className="text-[10px] font-black text-white">{player.name}</p>
                      <p className="text-[10px] font-numbers text-[#00F0FF]">{player.runs}({player.balls}) {player.fours > 0 ? `${player.fours}x4` : ''} {player.sixes > 0 ? `${player.sixes}x6` : ''}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bowling Team */}
              <div className="space-y-3">
                <p className="text-[11px] font-black text-[#39FF14] uppercase tracking-[0.2em]">Bowling</p>
                <div className="space-y-2">
                  {(match.teams[match.teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB']?.squad || []).map((player) => (
                    <div key={player.id} className="p-3 rounded-[16px] bg-white/5 border border-white/10 flex justify-between items-center">
                      <p className="text-[10px] font-black text-white">{player.name}</p>
                      <p className="text-[10px] font-numbers text-[#39FF14]">{Math.floor((player.balls_bowled || 0) / 6)}.{(player.balls_bowled || 0) % 6} - {player.runs_conceded}/{player.wickets}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SHARE MODAL */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowShareModal(false)}
            className="fixed inset-0 z-[4000] bg-black/95 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-[40px] overflow-hidden p-6 space-y-4"
            >
              <h3 className="font-heading text-lg uppercase italic text-[#00F0FF]">Share Score</h3>
              <pre className="p-4 rounded-[16px] bg-white/5 border border-white/10 text-[10px] text-white/80 overflow-x-auto">
                {shareText}
              </pre>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleShareAction('whatsapp')}
                  className="py-2 rounded-[12px] bg-[#25D366] text-black font-black text-[11px] uppercase"
                >
                  WhatsApp
                </button>
                <button
                  onClick={() => handleShareAction('copy')}
                  className="py-2 rounded-[12px] bg-[#00F0FF] text-black font-black text-[11px] uppercase"
                >
                  {shareCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR SCANNER MODAL */}
      <AnimatePresence>
        {showQRScanner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[4000] bg-black/95 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-[40px] overflow-hidden p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg uppercase italic text-[#00F0FF]">QR Scanner</h3>
                <button onClick={closeQRScanner} className="p-2 text-white/40 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="relative w-full aspect-square rounded-[20px] bg-black border-2 border-white/20 flex items-center justify-center overflow-hidden">
                <video ref={qrVideoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 border-2 border-[#00F0FF] rounded-[12px]" />
                </div>
                <p className="relative z-10 text-[12px] text-white/60 text-center">{qrScanStatus === 'SCANNING' ? 'Point at QR code' : qrScanError}</p>
              </div>
              <canvas ref={qrCanvasRef} className="hidden" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TRANSFER MODAL */}
      <AnimatePresence>
        {showTransferModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowTransferModal(false)}
            className="fixed inset-0 z-[4000] bg-black/95 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-[40px] overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-heading text-lg uppercase italic text-[#00F0FF]">Transfer Scoring</h3>
                <button onClick={() => setShowTransferModal(false)} className="p-2 text-white/40">
                  <X size={18} />
                </button>
              </div>

              {/* Tab Selector */}
              <div className="flex p-2 bg-white/5 m-4 rounded-[16px]">
                <button
                  onClick={() => setTransferTab('HANDOFF')}
                  className={`flex-1 py-2 rounded-[12px] text-[11px] font-black uppercase ${
                    transferTab === 'HANDOFF' ? 'bg-[#00F0FF] text-black' : 'text-white/40'
                  }`}
                >
                  Handoff
                </button>
                <button
                  onClick={() => setTransferTab('BROADCAST')}
                  className={`flex-1 py-2 rounded-[12px] text-[11px] font-black uppercase ${
                    transferTab === 'BROADCAST' ? 'bg-[#00F0FF] text-black' : 'text-white/40'
                  }`}
                >
                  Broadcast
                </button>
              </div>

              <div className="p-6 space-y-4">
                {handoffQRUrl && transferTab === 'HANDOFF' && (
                  <div className="aspect-square rounded-[20px] bg-white p-2">
                    <img src={handoffQRUrl} alt="Handoff QR" className="w-full h-full" />
                  </div>
                )}
                {broadcastQRUrl && transferTab === 'BROADCAST' && (
                  <div className="aspect-square rounded-[20px] bg-white p-2">
                    <img src={broadcastQRUrl} alt="Broadcast QR" className="w-full h-full" />
                  </div>
                )}
                <button
                  onClick={copyTransferLink}
                  className="w-full py-3 rounded-[20px] bg-[#00F0FF] text-black font-black text-[11px] uppercase"
                >
                  {transferLinkCopied ? 'Link Copied!' : 'Copy Link'}
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
