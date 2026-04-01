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

  // NEW: Config flow step tracking (1: format, 2: details, 3: teams)
  const [configStep, setConfigStep] = useState(1);

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
    if (!userData?.phone) { setStatus('TOSS_FLIP'); return; }

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

      const ballEvent: BallEvent = {
        ballNum: m.history.length + 1,
        runs,
        extra,
        isWicket: isWicket || false,
        wicketType,
        strikerId: m.crease.strikerId,
        nonStrikerId: m.crease.nonStrikerId,
        bowlerId: m.crease.bowlerId,
        fielderId,
        innings: m.currentInnings,
      };

      const newLiveScore = {
        runs: m.liveScore.runs + runs + (extra === 'WD' || extra === 'NB' ? 1 : 0),
        wickets: m.liveScore.wickets + (isWicket ? 1 : 0),
        balls: m.liveScore.balls + (extra === 'WD' || extra === 'NB' ? 0 : 1),
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

        {/* CONFIG SCREEN - STEP-BASED */}
        {status === 'CONFIG' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <AnimatePresence mode="wait">
              {configStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8"
                >
                  <div className="space-y-3">
                    <h3 className="font-heading text-3xl uppercase italic text-[#00F0FF]">Match Format</h3>
                    <p className="text-[11px] text-white/40 uppercase tracking-[0.2em]">Select the cricket format</p>
                  </div>

                  <div className="space-y-4">
                    {['LIMITED_OVERS', 'BOX_TURF', 'PAIR_CRICKET', 'TEST', 'THE_HUNDRED'].map((type) => (
                      <motion.button
                        key={type}
                        onClick={() => setMatch(m => ({ ...m, config: { ...m.config, matchType: type } }))}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`w-full p-6 rounded-[32px] border-2 transition-all ${
                          match.config.matchType === type
                            ? 'bg-[#00F0FF]/10 border-[#00F0FF] shadow-[0_0_30px_rgba(0,240,255,0.3)]'
                            : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center space-x-4">
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            match.config.matchType === type ? 'border-[#00F0FF] bg-[#00F0FF]' : 'border-white/20'
                          }`}>
                            {match.config.matchType === type && <Check size={16} className="text-black" />}
                          </div>
                          <span className="font-heading text-xl uppercase italic">{type.replace('_', ' ')}</span>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {configStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8 pb-32"
                >
                  <div className="space-y-3">
                    <h3 className="font-heading text-3xl uppercase italic text-[#00F0FF]">Match Details</h3>
                    <p className="text-[11px] text-white/40 uppercase tracking-[0.2em]">Configure overs and match settings</p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Overs Per Side</label>
                      <div className="flex items-center bg-white/5 border border-white/10 rounded-[24px] p-2 px-6">
                        <input
                          type="number"
                          min="1"
                          max="999"
                          value={match.config.overs}
                          onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, overs: parseInt(e.target.value) || 0 } }))}
                          className="w-full bg-transparent text-center font-numbers text-4xl font-black py-4 text-white outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Max Overs Per Bowler</label>
                      <div className="flex items-center bg-white/5 border border-white/10 rounded-[24px] p-2 px-6">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={match.config.oversPerBowler}
                          onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, oversPerBowler: parseInt(e.target.value) || 0 } }))}
                          className="w-full bg-transparent text-center font-numbers text-4xl font-black py-4 text-white outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Ball Type</label>
                      <select
                        value={match.config.ballType}
                        onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, ballType: e.target.value } }))}
                        className="w-full bg-white/5 border border-white/10 rounded-[24px] p-4 text-white font-bold uppercase outline-none"
                      >
                        <option>TENNIS</option>
                        <option>LEATHER</option>
                        <option>SYNTHETIC</option>
                      </select>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Pitch Type</label>
                      <select
                        value={match.config.pitchType}
                        onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, pitchType: e.target.value } }))}
                        className="w-full bg-white/5 border border-white/10 rounded-[24px] p-4 text-white font-bold uppercase outline-none"
                      >
                        <option>TURF</option>
                        <option>CONCRETE</option>
                        <option>MATTING</option>
                        <option>CLAY</option>
                      </select>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">City / Town</label>
                      <input
                        type="text"
                        value={match.config.city}
                        onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, city: e.target.value } }))}
                        className="w-full bg-white/5 border border-white/10 rounded-[24px] p-4 text-white font-bold uppercase outline-none placeholder:text-white/10"
                        placeholder="KANPUR"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Ground / Stadium</label>
                      <input
                        type="text"
                        value={match.config.ground}
                        onChange={(e) => setMatch(m => ({ ...m, config: { ...m.config, ground: e.target.value } }))}
                        className="w-full bg-white/5 border border-white/10 rounded-[24px] p-4 text-white font-bold uppercase outline-none placeholder:text-white/10"
                        placeholder="STADIUM NAME"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {configStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8 pb-32"
                >
                  <div className="space-y-3">
                    <h3 className="font-heading text-3xl uppercase italic text-[#00F0FF]">Team Setup</h3>
                    <p className="text-[11px] text-white/40 uppercase tracking-[0.2em]">Configure your squads</p>
                  </div>

                  <div className="space-y-8">
                    {['A', 'B'].map((id) => {
                      const team = getTeamObj(id);
                      return (
                        <motion.div
                          key={id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-6 rounded-[32px] bg-white/[0.02] border border-white/10 space-y-4"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="relative group">
                              <div
                                onClick={() => triggerLogoUpload(id)}
                                className="w-16 h-16 rounded-full bg-black border-4 border-white/10 flex items-center justify-center font-heading text-2xl text-white overflow-hidden shadow-xl cursor-pointer hover:border-[#00F0FF]/40 transition-all"
                              >
                                {team.logo ? <img src={team.logo} className="w-full h-full object-cover" /> : getTeamInitials(team.name)}
                              </div>
                              <button
                                onClick={() => triggerLogoUpload(id)}
                                className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#00F0FF] text-black rounded-full flex items-center justify-center shadow-lg border-2 border-black"
                              >
                                <Upload size={10} strokeWidth={3} />
                              </button>
                            </div>

                            <div className="flex-1 space-y-2">
                              {editingTeamNameId === id ? (
                                <input
                                  autoFocus
                                  className="bg-white/10 border border-[#00F0FF]/40 rounded-xl px-3 py-2 text-sm font-black uppercase text-white w-full outline-none"
                                  value={team.name}
                                  onBlur={() => setEditingTeamNameId(null)}
                                  onChange={(e) => {
                                    const val = e.target.value.toUpperCase();
                                    setMatch(m => ({
                                      ...m,
                                      teams: {
                                        ...m.teams,
                                        [id === 'A' ? 'teamA' : 'teamB']: { ...m.teams[id === 'A' ? 'teamA' : 'teamB'], name: val }
                                      }
                                    }));
                                  }}
                                />
                              ) : (
                                <button
                                  onClick={() => setEditingTeamNameId(id)}
                                  className="flex items-center space-x-2 text-sm"
                                >
                                  <p className="font-black uppercase text-white">{team.name}</p>
                                  <Edit2 size={12} className="text-white/30" />
                                </button>
                              )}
                              <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">{(team.squad || []).length} Players</p>
                            </div>
                          </div>

                          <motion.button
                            onClick={() => setEditingTeamId(id)}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full py-4 rounded-[24px] bg-[#4DB6AC] text-black font-black uppercase tracking-[0.2em] text-sm shadow-lg"
                          >
                            Manage Squad
                          </motion.button>
                        </motion.div>
                      );
                    })}
                  </div>
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
                <MotionButton
                  disabled={!isConfigValid()}
                  onClick={checkTeamConflicts}
                  className={`flex-1 py-6 !rounded-[24px] font-black uppercase tracking-[0.3em] text-sm transition-all ${
                    isConfigValid() ? 'bg-[#39FF14] text-black shadow-[0_12px_40px_rgba(57,255,20,0.4)]' : 'bg-white/5 text-white/10'
                  }`}
                >
                  Start Match
                </MotionButton>
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

        {/* TOSS FLIP SCREEN */}
        {status === 'TOSS_FLIP' && (
          <div className="flex-1 flex flex-col items-center justify-center h-full overflow-hidden relative bg-[#050505]">
            <style>{`
              @keyframes coinFlip {
                0% { transform: perspective(800px) rotateY(0deg) scale(1); }
                10% { transform: perspective(800px) rotateY(360deg) translateY(-40px) scale(1.1); }
                20% { transform: perspective(800px) rotateY(720deg) translateY(-80px) scale(1.15); }
                30% { transform: perspective(800px) rotateY(1080deg) translateY(-120px) scale(1.2); }
                40% { transform: perspective(800px) rotateY(1440deg) translateY(-140px) scale(1.2); }
                50% { transform: perspective(800px) rotateY(1800deg) translateY(-130px) scale(1.15); }
                60% { transform: perspective(800px) rotateY(2160deg) translateY(-100px) scale(1.1); }
                70% { transform: perspective(800px) rotateY(2520deg) translateY(-60px) scale(1.05); }
                80% { transform: perspective(800px) rotateY(2880deg) translateY(-20px) scale(1); }
                90% { transform: perspective(800px) rotateY(3060deg) translateY(-5px) scale(1); }
                100% { transform: perspective(800px) rotateY(3240deg) translateY(0px) scale(1); }
              }
              @keyframes coinGlow { 0%, 100% { box-shadow: 0 0 30px rgba(255, 214, 0, 0.3), 0 0 60px rgba(255, 214, 0, 0.1); } 50% { box-shadow: 0 0 50px rgba(255, 214, 0, 0.6), 0 0 100px rgba(255, 214, 0, 0.3), 0 0 150px rgba(255, 214, 0, 0.1); } }
              @keyframes coinShadow { 0% { transform: scaleX(1); opacity: 0.3; } 40% { transform: scaleX(0.4); opacity: 0.1; } 100% { transform: scaleX(1); opacity: 0.3; } }
              .coin-flip-active { animation: coinFlip 2.8s cubic-bezier(0.25, 0.1, 0.25, 1) forwards; }
              .coin-glow { animation: coinGlow 1.5s ease-in-out infinite; }
              .coin-shadow { animation: coinShadow 2.8s cubic-bezier(0.25, 0.1, 0.25, 1) forwards; }
            `}</style>

            <div className="absolute inset-0 overflow-hidden">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-[#00F0FF]/10 to-transparent rounded-full blur-3xl"
              />
            </div>

            <div className="relative z-10 text-center space-y-8 max-w-md mx-auto px-6">
              <div className="space-y-3">
                <h2 className="font-heading text-5xl uppercase italic text-[#00F0FF]">Toss Time</h2>
                <p className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em]">Decide who bats first</p>
              </div>

              {tossFlipPhase === 'WAITING' && (
                <motion.button
                  onClick={() => {
                    setTossFlipPhase('FLIPPING');
                    setTimeout(() => {
                      const winner = Math.random() > 0.5 ? 'A' : 'B';
                      setMatch(m => ({ ...m, toss: { ...m.toss, winnerId: winner } }));
                      setTossFlipPhase('CHOOSE');
                    }, 3000);
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-full py-6 rounded-[24px] bg-[#FFD600] text-black font-black uppercase tracking-[0.3em] shadow-[0_0_40px_rgba(255,214,0,0.4)]"
                >
                  Call the Toss
                </motion.button>
              )}

              {tossFlipPhase === 'FLIPPING' && (
                <div className="py-12 flex justify-center">
                  <div className="coin-flip-active coin-glow w-24 h-24 rounded-full bg-gradient-to-br from-[#FFD600] to-[#FFA500] shadow-2xl flex items-center justify-center font-black text-2xl text-black">
                    22
                  </div>
                </div>
              )}

              {tossFlipPhase === 'CHOOSE' && match.toss.winnerId && (
                <div className="space-y-8">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="p-6 bg-white/5 rounded-[32px] border border-[#00F0FF]/30 text-center"
                  >
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Toss Winner</p>
                    <h3 className="font-heading text-3xl uppercase italic text-[#00F0FF]">{getTeamObj(match.toss.winnerId).name}</h3>
                  </motion.div>

                  <div className="space-y-3">
                    <MotionButton
                      onClick={() => {
                        setMatch(m => ({ ...m, toss: { ...m.toss, decision: 'BAT' } }));
                        setTimeout(() => setStatus('OPENERS'), 500);
                      }}
                      className="w-full py-6 rounded-[24px] bg-[#39FF14] text-black font-black uppercase tracking-[0.3em] shadow-[0_0_30px_rgba(57,255,20,0.3)]"
                    >
                      Bat First
                    </MotionButton>
                    <MotionButton
                      onClick={() => {
                        setMatch(m => ({ ...m, toss: { ...m.toss, decision: 'BOWL' } }));
                        setTimeout(() => setStatus('OPENERS'), 500);
                      }}
                      className="w-full py-6 rounded-[24px] bg-[#BC13FE] text-white font-black uppercase tracking-[0.3em] shadow-[0_0_30px_rgba(188,19,254,0.3)]"
                    >
                      Bowl First
                    </MotionButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* OPENERS SCREEN */}
        {status === 'OPENERS' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8 pb-32">
              <div className="space-y-3">
                <h2 className="font-heading text-3xl uppercase italic text-[#00F0FF]">Select Your Openers</h2>
                <p className="text-[11px] text-white/40 uppercase tracking-[0.2em]">Choose striker and non-striker</p>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {selectionTarget === 'STRIKER' && (
                  <div className="space-y-4">
                    <p className="text-[10px] font-black text-[#00F0FF] uppercase tracking-[0.3em]">Select Striker</p>
                    {(getTeamObj(match.teams.battingTeamId).squad || []).map((player) => (
                      <motion.button
                        key={player.id}
                        onClick={() => {
                          setMatch(m => ({ ...m, crease: { ...m.crease, strikerId: player.id } }));
                          setSelectionTarget('NON_STRIKER');
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full p-4 rounded-[24px] bg-white/5 border border-white/10 hover:border-[#00F0FF]/40 flex items-center space-x-4 transition-all"
                      >
                        <img src={getPlayerAvatar(player)} className="w-12 h-12 rounded-full" />
                        <div className="flex-1 text-left">
                          <p className="font-black text-white uppercase">{player.name}</p>
                          <p className="text-[10px] text-white/40">{player.phone}</p>
                        </div>
                        <ChevronRight size={18} className="text-white/30" />
                      </motion.button>
                    ))}
                  </div>
                )}

                {selectionTarget === 'NON_STRIKER' && (
                  <div className="space-y-4">
                    <p className="text-[10px] font-black text-[#00F0FF] uppercase tracking-[0.3em]">Select Non-Striker</p>
                    {(getTeamObj(match.teams.battingTeamId).squad || []).filter(p => p.id !== match.crease.strikerId).map((player) => (
                      <motion.button
                        key={player.id}
                        onClick={() => {
                          setMatch(m => ({ ...m, crease: { ...m.crease, nonStrikerId: player.id } }));
                          setSelectionTarget('BOWLER');
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full p-4 rounded-[24px] bg-white/5 border border-white/10 hover:border-[#00F0FF]/40 flex items-center space-x-4 transition-all"
                      >
                        <img src={getPlayerAvatar(player)} className="w-12 h-12 rounded-full" />
                        <div className="flex-1 text-left">
                          <p className="font-black text-white uppercase">{player.name}</p>
                          <p className="text-[10px] text-white/40">{player.phone}</p>
                        </div>
                        <ChevronRight size={18} className="text-white/30" />
                      </motion.button>
                    ))}
                  </div>
                )}

                {selectionTarget === 'BOWLER' && (
                  <div className="space-y-4">
                    <p className="text-[10px] font-black text-[#00F0FF] uppercase tracking-[0.3em]">Select Opening Bowler</p>
                    {(getTeamObj(match.teams.bowlingTeamId).squad || []).map((player) => (
                      <motion.button
                        key={player.id}
                        onClick={() => {
                          setMatch(m => ({ ...m, crease: { ...m.crease, bowlerId: player.id } }));
                          setSelectionTarget(null);
                          setStatus('LIVE');
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full p-4 rounded-[24px] bg-white/5 border border-white/10 hover:border-[#00F0FF]/40 flex items-center space-x-4 transition-all"
                      >
                        <img src={getPlayerAvatar(player)} className="w-12 h-12 rounded-full" />
                        <div className="flex-1 text-left">
                          <p className="font-black text-white uppercase">{player.name}</p>
                          <p className="text-[10px] text-white/40">{player.phone}</p>
                        </div>
                        <ChevronRight size={18} className="text-white/30" />
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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

              <div className="grid grid-cols-3 gap-2">
                <KeypadButton onClick={() => setPendingExtra('WD')} bg="#FF6D00" color="#050505" active={pendingExtra === 'WD'}>WD</KeypadButton>
                <KeypadButton onClick={() => setPendingExtra('NB')} bg="#FF6D00" color="#050505" active={pendingExtra === 'NB'}>NB</KeypadButton>
                <KeypadButton onClick={() => setPendingExtra('BYE')} bg="#FF6D00" color="#050505" active={pendingExtra === 'BYE'}>BYE</KeypadButton>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <KeypadButton onClick={() => setWicketWizard({ open: true })} bg="#FF003C" color="#FFF">WICKET</KeypadButton>
                <KeypadButton onClick={() => {}} bg="white/5" color="white/30" disabled>UNDO</KeypadButton>
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
                <h3 className="font-heading text-4xl uppercase italic">{getTeamObj(match.teams.battingTeamId).name}</h3>
                <p className="font-numbers text-5xl font-black text-[#00F0FF]">{match.liveScore.runs}/{match.liveScore.wickets}</p>
                <p className="text-[11px] text-white/40">in {Math.floor(match.liveScore.balls / 6)}.{match.liveScore.balls % 6} overs</p>
              </div>
              <motion.button
                onClick={() => {
                  setMatch(m => ({ ...m, teams: { ...m.teams, battingTeamId: m.teams.bowlingTeamId, bowlingTeamId: m.teams.battingTeamId }, liveScore: { runs: 0, wickets: 0, balls: 0 }, crease: { strikerId: null, nonStrikerId: null, bowlerId: null, previousBowlerId: null } }));
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
    </div>
  );
};

export default MatchCenter;
