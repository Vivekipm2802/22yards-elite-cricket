// @ts-nocheck 
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Line, Legend, LineChart, Cell
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

const MatchCenter: React.FC<{ onBack: () => void; onNavigate?: (page: string) => void }> = ({ onBack, onNavigate }) => {
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
  const [summaryTab, setSummaryTab] = useState<'SUMMARY' | 'SCORECARD' | 'COMMS' | 'ANALYSIS' | 'MVP'>('SUMMARY');
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
  const [showShareSheet, setShowShareSheet] = useState(false);

  // Add Player Mid-Match
  const [showAddPlayer, setShowAddPlayer] = useState<{ open: boolean; team: 'batting' | 'bowling' | null }>({ open: false, team: null });
  const [addPlayerName, setAddPlayerName] = useState('');
  const [addPlayerPhone, setAddPlayerPhone] = useState('');

  // Summary reveal animation state
  const [summaryPhase, setSummaryPhase] = useState<'SKELETON' | 'COUNTING' | 'REVEAL' | 'READY'>('SKELETON');
  const [countingRuns, setCountingRuns] = useState({ inn1: 0, inn2: 0 });
  const [scorecardReady, setScorecardReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const scorecardRef = useRef<HTMLDivElement>(null);

  // FIRE MODE: Dynamic theme for hot run rates
  const [fireMode, setFireMode] = useState(false);
  const [fireModeBanner, setFireModeBanner] = useState(false);
  const [fireModeDeclined, setFireModeDeclined] = useState(false);

  // ICE MODE: Dynamic theme for slow run rates
  const [iceMode, setIceMode] = useState(false);
  const [iceModeBanner, setIceModeBanner] = useState(false);
  const [iceModeDeclined, setIceModeDeclined] = useState(false);

  // Match Settings (mid-match)
  const [showMatchSettings, setShowMatchSettings] = useState(false);
  const [abandonConfirm, setAbandonConfirm] = useState(false);
  const [abandonReason, setAbandonReason] = useState('');

  // QR Scanner
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [qrScanStatus, setQrScanStatus] = useState<'SCANNING' | 'SUCCESS' | 'ERROR'>('SCANNING');
  const [qrScanError, setQrScanError] = useState('');
  const qrVideoRef = useRef<HTMLVideoElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrStreamRef = useRef<MediaStream | null>(null);
  const qrAnimRef = useRef<number | null>(null);

  // Transfer Scoring / Device Handoff
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTab, setTransferTab] = useState<'HANDOFF' | 'SPECTATOR'>('HANDOFF');
  const [transferLinkCopied, setTransferLinkCopied] = useState(false);
  const [transferStatus, setTransferStatus] = useState<'IDLE' | 'WAITING' | 'TRANSFERRED'>('IDLE');

  // Scoring lock — prevents race conditions from rapid clicks
  const isProcessingBall = useRef(false);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Always save — including COMPLETED so we know the match is done
    localStorage.setItem('22YARDS_ACTIVE_MATCH', JSON.stringify(match));
  }, [match]);

  // Keep match.status in sync with the UI status state
  useEffect(() => {
    if (status && status !== match.status && status !== 'SUMMARY') {
      setMatch(m => {
        if (m.status === status) return m;
        return { ...m, status };
      });
    }
  }, [status]);

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
    if (!match.matchId || (status !== 'LIVE' && status !== 'INNINGS_BREAK' && status !== 'COMPLETED' && status !== 'SUMMARY')) return;
    pushLiveMatchState(match);
    liveChannelRef.current?.send({
      type: 'broadcast',
      event: 'score_update',
      payload: match,
    });
  }, [match.liveScore.balls, match.liveScore.wickets, match.currentInnings, status]);

  useEffect(() => {
    if (status === 'SUMMARY' && winnerTeam) {
      persistToGlobalVault(match, winnerTeam.name, winnerTeam.margin);
    }
  }, [status, winnerTeam]);

  // Summary reveal animation sequence
  useEffect(() => {
    if (status !== 'SUMMARY') { setSummaryPhase('SKELETON'); return; }

    // Phase 1: Skeleton shimmer (1.5s)
    setSummaryPhase('SKELETON');
    const t1 = setTimeout(() => setSummaryPhase('COUNTING'), 1500);

    // Phase 2: Counting numbers (1.5s more = 3s total)
    const t2 = setTimeout(() => setSummaryPhase('REVEAL'), 3000);

    // Phase 3: Ready
    const t3 = setTimeout(() => { setSummaryPhase('READY'); setScorecardReady(true); }, 3500);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [status]);

  // Counting animation for runs
  useEffect(() => {
    if (summaryPhase !== 'COUNTING') return;
    const inn1Target = match.config.innings1Score || 0;
    const inn2Target = match.liveScore.runs;
    const duration = 1200;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCountingRuns({
        inn1: Math.round(inn1Target * eased),
        inn2: Math.round(inn2Target * eased),
      });
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [summaryPhase, match.config.innings1Score, match.liveScore.runs]);

  // FIRE MODE + ICE MODE: Monitor CRR during live scoring (with hysteresis to prevent flicker)
  useEffect(() => {
    if (status !== 'LIVE') return;
    const balls = match.liveScore.balls || 0;
    const crr = balls > 0 ? (match.liveScore.runs / balls) * 6 : 0;

    // FIRE MODE: CRR >= 15 to trigger, < 12 to revert (hysteresis band)
    if (crr >= 15 && !fireMode && !fireModeDeclined && !fireModeBanner) {
      if (iceMode) { setIceMode(false); setIceModeDeclined(false); }
      setFireModeBanner(true);
    }
    if (crr < 12 && fireMode) {
      setFireMode(false);
    }

    // ICE MODE: CRR < 4 to trigger, >= 5.5 to revert (hysteresis band)
    // Only after 6+ balls, and only if fire mode isn't active
    if (balls >= 6 && crr < 4 && crr > 0 && !iceMode && !iceModeDeclined && !iceModeBanner && !fireMode) {
      setIceModeBanner(true);
    }
    if (crr >= 5.5 && iceMode) {
      setIceMode(false);
    }
  }, [match.liveScore.runs, match.liveScore.balls, status]);

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
    // Race condition guard: block scoring while a ball is being processed
    if (isProcessingBall.current) return;

    if (!match.crease.bowlerId) {
       setSelectionTarget('NEXT_BOWLER');
       return;
    }

    if (!match.crease.strikerId) {
       setSelectionTarget('NEW_BATSMAN');
       return;
    }

    // Block scoring if innings is already over (overs exhausted or all out)
    const battingTeamKey = match.teams.battingTeamId === 'A' ? 'teamA' : 'teamB';
    const squadSize = (match.teams[battingTeamKey]?.squad || []).length;
    const allOutWickets = Math.max(1, squadSize - 1);
    const totalOversCompleted = Math.floor(match.liveScore.balls / 6);
    const ballsInCurrentOver = match.liveScore.balls % 6;
    if (match.liveScore.wickets >= allOutWickets) return;
    if (match.liveScore.balls >= match.config.overs * 6) return;
    if (match.status === 'COMPLETED' || match.status === 'INNINGS_BREAK') return;

    // Lock scoring
    isProcessingBall.current = true;
    setTimeout(() => { isProcessingBall.current = false; }, 150);

    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    if (pendingExtra === 'NB') {
       setOverlayAnim('FREE_HIT');
       overlayTimerRef.current = setTimeout(() => setOverlayAnim(null), 2500);
    } else if (runs === 4) {
       setOverlayAnim('FOUR');
       overlayTimerRef.current = setTimeout(() => setOverlayAnim(null), 1500);
    } else if (runs === 6) {
       setOverlayAnim('SIX');
       overlayTimerRef.current = setTimeout(() => setOverlayAnim(null), 1500);
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
        commitBall(0, pendingExtra || undefined, true, 'STUMPED', wk.id);
        setPendingExtra(null);
      } else {
        setWicketWizard({ open: false, type: 'STUMPED' });
        setSelectionTarget('FIELDER');
      }
      return;
    }

    setWicketWizard({ open: false });
    commitBall(runs, pendingExtra || undefined, true, type);
    setPendingExtra(null);
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
    commitBall(0, pendingExtra || undefined, true, wType, fielderId);
    setPendingExtra(null);
  };

  const handleUndo = () => {
    if (!match.history || match.history.length === 0) return;

    setMatch(m => {
      const lastBall = m.history[m.history.length - 1];
      if (!lastBall) return m;

      const battingTeamKey = m.teams.battingTeamId === 'A' ? 'teamA' : 'teamB';
      const bowlingTeamKey = m.teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB';
      const isLegalDelivery = !lastBall.type || lastBall.type === 'LEGAL' || lastBall.type === 'BYE' || lastBall.type === 'LB';
      const isNoBallOrWide = lastBall.type === 'WD' || lastBall.type === 'NB';

      const updatedBattingSquad = (m.teams[battingTeamKey]?.squad || []).map(p => {
        if (p.id === lastBall.strikerId) {
          return {
            ...p,
            runs: Math.max(0, (p.runs || 0) - (lastBall.type === 'BYE' || lastBall.type === 'LB' ? 0 : (lastBall.runsScored || 0))),
            balls: Math.max(0, (p.balls || 0) - (isLegalDelivery ? 1 : 0)),
            fours: lastBall.runsScored === 4 && lastBall.type !== 'BYE' && lastBall.type !== 'LB' ? Math.max(0, (p.fours || 0) - 1) : (p.fours || 0),
            sixes: lastBall.runsScored === 6 && lastBall.type !== 'BYE' && lastBall.type !== 'LB' ? Math.max(0, (p.sixes || 0) - 1) : (p.sixes || 0),
            isOut: lastBall.isWicket ? false : p.isOut,
            wicketType: lastBall.isWicket ? undefined : p.wicketType,
          };
        }
        return p;
      });

      const updatedBowlingSquad = (m.teams[bowlingTeamKey]?.squad || []).map(p => {
        if (p.id === lastBall.bowlerId) {
          return {
            ...p,
            wickets: lastBall.isWicket ? Math.max(0, (p.wickets || 0) - 1) : (p.wickets || 0),
            runs_conceded: Math.max(0, (p.runs_conceded || 0) - (lastBall.type === 'BYE' || lastBall.type === 'LB' ? 0 : (lastBall.runsScored || 0)) - (isNoBallOrWide ? 1 : 0)),
            balls_bowled: Math.max(0, (p.balls_bowled || 0) - (isLegalDelivery ? 1 : 0)),
          };
        }
        // Reverse fielder stats
        if (lastBall.fielderId && p.id === lastBall.fielderId) {
          return {
            ...p,
            catches: lastBall.wicketType === 'CAUGHT' ? Math.max(0, (p.catches || 0) - 1) : (p.catches || 0),
            run_outs: lastBall.wicketType === 'RUN OUT' ? Math.max(0, (p.run_outs || 0) - 1) : (p.run_outs || 0),
            stumpings: lastBall.wicketType === 'STUMPED' ? Math.max(0, (p.stumpings || 0) - 1) : (p.stumpings || 0),
          };
        }
        return p;
      });

      // Restore crease positions from the ball event
      const restoredCrease = {
        ...m.crease,
        strikerId: lastBall.strikerId,
        nonStrikerId: lastBall.nonStrikerId || m.crease.nonStrikerId,
        bowlerId: lastBall.bowlerId,
      };

      return {
        ...m,
        teams: {
          ...m.teams,
          [battingTeamKey]: { ...m.teams[battingTeamKey], squad: updatedBattingSquad },
          [bowlingTeamKey]: { ...m.teams[bowlingTeamKey], squad: updatedBowlingSquad },
        },
        liveScore: {
          runs: Math.max(0, m.liveScore.runs - (lastBall.runsScored || 0) - (isNoBallOrWide ? 1 : 0)),
          wickets: Math.max(0, m.liveScore.wickets - (lastBall.isWicket ? 1 : 0)),
          balls: Math.max(0, m.liveScore.balls - (isLegalDelivery ? 1 : 0)),
        },
        history: m.history.slice(0, -1),
        crease: restoredCrease,
      };
    });
    // Clear any pending selection targets
    setSelectionTarget(null);
  };

  const persistToGlobalVault = (finalMatchState: MatchState, winnerName = '', winnerMargin = '') => {
    const globalVault = JSON.parse(localStorage.getItem('22YARDS_GLOBAL_VAULT') || '{}');

    const teamA = finalMatchState.teams.teamA;
    const teamB = finalMatchState.teams.teamB;

    const buildMatchRecord = (playerObj: any, playerTeamId: 'A' | 'B') => {
      const myTeamObj = playerTeamId === 'A' ? teamA : teamB;
      const oppTeamObj = playerTeamId === 'A' ? teamB : teamA;

      // Compute innings scores
      const inn1Score = finalMatchState.config.innings1Score || 0;
      const inn1Wickets = finalMatchState.config.innings1Wickets || 0;
      const inn1Balls = finalMatchState.config.innings1Balls || 0;
      const inn2Score = finalMatchState.liveScore.runs;
      const inn2Wickets = finalMatchState.liveScore.wickets;
      const inn2Balls = finalMatchState.liveScore.balls;

      // Which team batted first? bowlingTeamId in final state = team that batted 1st
      const inn1BattingTeamId = finalMatchState.teams.bowlingTeamId;
      const inn1BattingKey = inn1BattingTeamId === 'A' ? 'teamA' : 'teamB';
      const inn1BowlingKey = inn1BattingTeamId === 'A' ? 'teamB' : 'teamA';
      const inn2BattingKey = finalMatchState.teams.battingTeamId === 'A' ? 'teamA' : 'teamB';
      const inn2BowlingKey = finalMatchState.teams.battingTeamId === 'A' ? 'teamB' : 'teamA';

      // Determine if this player's team batted first
      const myTeamBattedFirst = inn1BattingTeamId === playerTeamId;
      const myTeamScore = myTeamBattedFirst ? inn1Score : inn2Score;
      const myTeamWickets = myTeamBattedFirst ? inn1Wickets : inn2Wickets;
      const myTeamBalls = myTeamBattedFirst ? inn1Balls : inn2Balls;
      const oppTeamScore = myTeamBattedFirst ? inn2Score : inn1Score;
      const oppTeamWickets = myTeamBattedFirst ? inn2Wickets : inn1Wickets;
      const oppTeamBalls = myTeamBattedFirst ? inn2Balls : inn1Balls;

      // Result — fix: use actual score comparison, not target-1
      let result = 'DREW';
      if (finalMatchState.status === 'COMPLETED') {
        if (inn2Score > inn1Score) {
          // Chasing team won
          result = finalMatchState.teams.battingTeamId === playerTeamId ? 'WON' : 'LOST';
        } else if (inn2Score === inn1Score) {
          result = 'TIED';
        } else {
          // Defending team won
          result = finalMatchState.teams.bowlingTeamId === playerTeamId ? 'WON' : 'LOST';
        }
      }

      // Not-out detection: player batted but wasn't dismissed
      const notOut = (playerObj.balls > 0 || playerObj.runs > 0) && !playerObj.isOut;

      const formatOvers = (balls: number) => {
        const overs = Math.floor(balls / 6);
        const rem = balls % 6;
        return rem > 0 ? `${overs}.${rem}` : `${overs}`;
      };

      return {
        id: finalMatchState.matchId,
        date: finalMatchState.config.dateTime,
        opponent: oppTeamObj.name,
        result,
        // Player individual stats
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
        notOut,
        asCaptain: playerObj.isCaptain,
        asKeeper: playerObj.isWicketKeeper,
        matchWon: result === 'WON',
        tossWon: finalMatchState.toss.winnerId === playerTeamId,
        // Team-level scores for Archive display
        myTeamName: myTeamObj.name,
        myTeamScore,
        myTeamWickets,
        myTeamOvers: formatOvers(myTeamBalls),
        oppTeamName: oppTeamObj.name,
        oppTeamScore,
        oppTeamWickets,
        oppTeamOvers: formatOvers(oppTeamBalls),
        matchResult: winnerName ? `${winnerName} - ${winnerMargin}` : result,
        overs: finalMatchState.config.overs,
        // Full scorecard with innings totals
        fullScorecard: {
          // Legacy format (battingTeam/bowlingTeam) — used by Archive.tsx ScorecardView & PDF
          battingTeam: {
            name: finalMatchState.teams[inn1BattingKey].name,
            squad: finalMatchState.teams[inn1BattingKey].squad || [],
          },
          bowlingTeam: {
            name: finalMatchState.teams[inn1BowlingKey].name,
            squad: finalMatchState.teams[inn1BowlingKey].squad || [],
          },
          // New format with per-innings totals
          innings1: {
            teamName: finalMatchState.teams[inn1BattingKey].name,
            batters: finalMatchState.teams[inn1BattingKey].squad || [],
            bowlers: finalMatchState.teams[inn1BowlingKey].squad || [],
            runs: inn1Score,
            wickets: inn1Wickets,
            balls: inn1Balls,
            overs: formatOvers(inn1Balls),
          },
          innings2: {
            teamName: finalMatchState.teams[inn2BattingKey].name,
            batters: finalMatchState.teams[inn2BattingKey].squad || [],
            bowlers: finalMatchState.teams[inn2BowlingKey].squad || [],
            runs: inn2Score,
            wickets: inn2Wickets,
            balls: inn2Balls,
            overs: formatOvers(inn2Balls),
          },
          inn1Total: { runs: inn1Score, wickets: inn1Wickets, balls: inn1Balls },
          inn2Total: { runs: inn2Score, wickets: inn2Wickets, balls: inn2Balls },
          matchResult: winnerName ? `${winnerName} - ${winnerMargin}` : result,
          target: finalMatchState.config.target || inn1Score + 1,
        },
      };
    };

    // Helper: save a match record for a single player by phone
    const saveForPlayer = (playerObj: any, teamId: 'A' | 'B', teamObj: any) => {
      const phone = playerObj.phone;
      if (!phone) return; // skip players without phone numbers

      if (!globalVault[phone]) {
        globalVault[phone] = { history: [], teams: [], name: playerObj.name || '' };
      }

      // Deduplicate — don't add same match twice
      const alreadySaved = globalVault[phone].history.some((h: any) => h.id === finalMatchState.matchId);
      if (!alreadySaved) {
        globalVault[phone].history.push(buildMatchRecord(playerObj, teamId));
      }

      // Upsert team entry for this player
      const existingTeamIdx = globalVault[phone].teams.findIndex(
        (t: any) => t.name.toUpperCase() === teamObj.name.toUpperCase()
      );
      const teamEntry = {
        id: existingTeamIdx >= 0 ? (globalVault[phone].teams[existingTeamIdx].id || `T-${Date.now()}`) : `T-${Date.now()}`,
        name: teamObj.name,
        city: teamObj.city || '',
        players: teamObj.squad || [],
        dateLastPlayed: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
      };
      if (existingTeamIdx >= 0) {
        globalVault[phone].teams[existingTeamIdx] = teamEntry;
      } else {
        globalVault[phone].teams.push(teamEntry);
      }

      // Cloud sync: push to Supabase if connected (fire-and-forget)
      try {
        syncMatchToSupabase(phone, buildMatchRecord(playerObj, teamId), globalVault[phone].history).catch(() => {});
      } catch (_) {}
    };

    // Save for EVERY player in both teams
    (teamA.squad || []).forEach((p: any) => saveForPlayer(p, 'A', teamA));
    (teamB.squad || []).forEach((p: any) => saveForPlayer(p, 'B', teamB));

    localStorage.setItem('22YARDS_GLOBAL_VAULT', JSON.stringify(globalVault));

    // Also save match record to Supabase matches table
    try {
      saveMatchRecord(finalMatchState, winnerName, winnerMargin).catch(() => {});
    } catch (_) {}
  };

  // Strip match-specific stats from players when importing from vault
  const resetPlayerStats = (players: any[]) =>
    players.map(p => ({
      ...p,
      runs: 0, balls: 0, fours: 0, sixes: 0,
      isOut: false, wicketType: undefined,
      wickets: 0, runs_conceded: 0, balls_bowled: 0,
      catches: 0, stumpings: 0, run_outs: 0,
    }));

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

      // GUARD: Reject ball if innings is already complete (prevents race condition from queued state updates)
      if (m.status === 'COMPLETED' || m.status === 'INNINGS_BREAK') return m;
      const _bKey = m.teams.battingTeamId === 'A' ? 'teamA' : 'teamB';
      const _sqSize = (m.teams[_bKey]?.squad || []).length;
      const _allOut = Math.max(1, _sqSize - 1);
      if (m.liveScore.wickets >= _allOut) return m;
      if (m.liveScore.balls >= m.config.overs * 6) return m;

      const battingTeamKey = m.teams.battingTeamId === 'A' ? 'teamA' : 'teamB';
      const bowlingTeamKey = m.teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB';
      const isLegalDelivery = !extra || (extra === 'BYE' || extra === 'LB');
      const isNoBallOrWide = extra === 'WD' || extra === 'NB';

      const updatedBattingSquad = (m.teams[battingTeamKey]?.squad || []).map(p => {
        if (p.id === m.crease.strikerId) {
          return {
            ...p,
            runs: (p.runs || 0) + (extra === 'BYE' || extra === 'LB' ? 0 : runs),
            balls: (p.balls || 0) + (isLegalDelivery ? 1 : 0),
            fours: runs === 4 && extra !== 'BYE' && extra !== 'LB' ? (p.fours || 0) + 1 : (p.fours || 0),
            sixes: runs === 6 && extra !== 'BYE' && extra !== 'LB' ? (p.sixes || 0) + 1 : (p.sixes || 0),
            isOut: isWicket ? true : p.isOut,
            wicketType: isWicket ? wicketType : p.wicketType,
          };
        }
        return p;
      });

      const updatedBowlingSquad = (m.teams[bowlingTeamKey]?.squad || []).map(p => {
        if (p.id === m.crease.bowlerId) {
          return {
            ...p,
            wickets: isWicket ? (p.wickets || 0) + 1 : (p.wickets || 0),
            runs_conceded: (p.runs_conceded || 0) + (extra === 'BYE' || extra === 'LB' ? 0 : runs) + (isNoBallOrWide ? 1 : 0),
            balls_bowled: (p.balls_bowled || 0) + (isLegalDelivery ? 1 : 0),
          };
        }
        return p;
      });

      const newLiveScore = {
        runs: m.liveScore.runs + runs + (isNoBallOrWide ? 1 : 0),
        wickets: m.liveScore.wickets + (isWicket ? 1 : 0),
        balls: m.liveScore.balls + (isLegalDelivery ? 1 : 0),
      };

      const ballEvent: BallEvent = {
        ballId: `${m.matchId}-${m.currentInnings}-${m.history.length}`,
        overNumber: Math.floor(m.liveScore.balls / 6),
        ballNumber: (m.liveScore.balls % 6) + 1,
        bowlerId: m.crease.bowlerId!,
        strikerId: m.crease.strikerId!,
        nonStrikerId: m.crease.nonStrikerId,
        fielderId,
        runsScored: runs,
        totalValue: runs + (isNoBallOrWide ? 1 : 0),
        extras: isNoBallOrWide || extra === 'BYE' || extra === 'LB' ? 1 : 0,
        isWicket: isWicket || false,
        type: extra ? (extra as any) : 'LEGAL',
        zone: undefined,
        wicketType,
        innings: m.currentInnings,
        teamId: m.teams.battingTeamId,
        teamTotalAtThisBall: newLiveScore.runs,
        wicketsAtThisBall: newLiveScore.wickets,
      };

      // --- STRIKE ROTATION ---
      let newStrikerId = m.crease.strikerId;
      let newNonStrikerId = m.crease.nonStrikerId;
      const isOddRuns = runs % 2 === 1;

      // Swap on odd runs (but not if wicket fell — new batsman selection handles that)
      if (isOddRuns && !isWicket) {
        newStrikerId = m.crease.nonStrikerId;
        newNonStrikerId = m.crease.strikerId;
      }

      // --- OVER COMPLETION ---
      const newBallsInOver = newLiveScore.balls % 6;
      const isOverComplete = isLegalDelivery && newBallsInOver === 0 && newLiveScore.balls > 0;

      // Swap at end of over (on top of any odd-run swap)
      if (isOverComplete && !isWicket) {
        const temp = newStrikerId;
        newStrikerId = newNonStrikerId;
        newNonStrikerId = temp;
      }

      // --- INNINGS TRANSITION ---
      const totalOvers = Math.floor(newLiveScore.balls / 6);
      const battingSquadSize = (m.teams[battingTeamKey]?.squad || []).length;
      const allOutWickets = Math.max(1, battingSquadSize - 1);
      const shouldTransition = newLiveScore.wickets >= allOutWickets || (totalOvers >= m.config.overs && newBallsInOver === 0);

      let newStatus = m.status;
      let newCurrentInnings = m.currentInnings;

      // Save innings 1 data immediately so it survives crashes
      let newConfig = m.config;
      if (shouldTransition && m.currentInnings === 1) {
        newStatus = 'INNINGS_BREAK';
        newCurrentInnings = 1; // stays 1 until user clicks "Start Innings 2"
        newConfig = { ...m.config, innings1Score: newLiveScore.runs, innings1Wickets: newLiveScore.wickets, innings1Balls: newLiveScore.balls };
        setOverlayAnim('INNINGS_BREAK');
        setTimeout(() => { setOverlayAnim(null); setStatus('INNINGS_BREAK'); }, 2000);
      }

      if (shouldTransition && m.currentInnings === 2) {
        newStatus = 'COMPLETED';
        // Determine winner
        const inn1Score = m.config.innings1Score || 0;
        const inn2Score = newLiveScore.runs;
        const battingTeamName = getTeamObj(m.teams.battingTeamId)?.name || 'Team';
        const bowlingTeamName = getTeamObj(m.teams.bowlingTeamId)?.name || 'Team';

        if (inn2Score >= (m.config.target || inn1Score + 1)) {
          const battingTeamKey = m.teams.battingTeamId === 'A' ? 'teamA' : 'teamB';
          const battingSquadSize = (m.teams[battingTeamKey]?.squad || []).length;
          const wicketsLeft = Math.max(0, battingSquadSize - 1 - newLiveScore.wickets);
          setWinnerTeam({ name: battingTeamName, id: m.teams.battingTeamId, margin: `Won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}` });
        } else if (inn2Score === inn1Score) {
          setWinnerTeam({ name: 'Match Tied', id: null, margin: `Both teams scored ${inn1Score} runs` });
        } else {
          const runDiff = inn1Score - inn2Score;
          setWinnerTeam({ name: bowlingTeamName, id: m.teams.bowlingTeamId, margin: `Won by ${runDiff} run${runDiff !== 1 ? 's' : ''}` });
        }
        setTimeout(() => setStatus('SUMMARY'), 100);
      }

      // Target chase mid-over
      if (!shouldTransition && m.currentInnings === 2 && m.config.target && newLiveScore.runs >= m.config.target) {
        newStatus = 'COMPLETED';
        const battingTeamName = getTeamObj(m.teams.battingTeamId)?.name || 'Team';
        const _battingTeamKey2 = m.teams.battingTeamId === 'A' ? 'teamA' : 'teamB';
        const _battingSquadSize2 = (m.teams[_battingTeamKey2]?.squad || []).length;
        const wicketsLeft = Math.max(0, _battingSquadSize2 - 1 - newLiveScore.wickets);
        setWinnerTeam({ name: battingTeamName, id: m.teams.battingTeamId, margin: `Won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}` });
        setTimeout(() => setStatus('SUMMARY'), 100);
      }

      // --- NEW BATSMAN after wicket ---
      let newCrease = {
        ...m.crease,
        strikerId: newStrikerId,
        nonStrikerId: newNonStrikerId,
        previousBowlerId: isOverComplete ? m.crease.bowlerId : m.crease.previousBowlerId,
        bowlerId: isOverComplete && newStatus === 'LIVE' ? null : m.crease.bowlerId,
      };

      if (isWicket && newStatus !== 'COMPLETED' && newStatus !== 'INNINGS_BREAK') {
        // Need to select new batsman — set striker to null, will trigger NEW_BATSMAN selection
        newCrease.strikerId = null;
        setTimeout(() => setSelectionTarget('NEW_BATSMAN'), 50);
      }

      // Need new bowler after over completes
      if (isOverComplete && newStatus !== 'COMPLETED' && newStatus !== 'INNINGS_BREAK' && !isWicket) {
        setTimeout(() => setSelectionTarget('NEXT_BOWLER'), 50);
      }

      // If wicket falls ON the last ball of an over, need both new batsman AND new bowler
      if (isWicket && isOverComplete && newStatus !== 'COMPLETED' && newStatus !== 'INNINGS_BREAK') {
        newCrease.bowlerId = null;
        // NEW_BATSMAN first, then NEXT_BOWLER will be triggered after batsman is selected
      }

      return {
        ...m,
        status: newStatus,
        config: newConfig,
        teams: {
          ...m.teams,
          [battingTeamKey]: { ...m.teams[battingTeamKey], squad: updatedBattingSquad },
          [bowlingTeamKey]: { ...m.teams[bowlingTeamKey], squad: updatedBowlingSquad },
        },
        liveScore: newLiveScore,
        history: [...(m.history || []), ballEvent],
        currentInnings: newCurrentInnings,
        crease: newCrease,
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
    const followUrl = `${window.location.origin}${window.location.pathname}?watch=${match.matchId}`;
    return `${battingTeam.name} ${match.liveScore.runs}/${match.liveScore.wickets} (${overs}.${balls}) vs ${bowlingTeam.name} | 22 Yards\n\n📺 Follow live:\n${followUrl}`;
  };

  const innings1TeamId = match.currentInnings === 1 ? match.teams.battingTeamId : match.teams.bowlingTeamId;
  const innings2TeamId = match.currentInnings === 1 ? match.teams.bowlingTeamId : match.teams.battingTeamId;

  const calculateMOTM = () => {
    const allPlayers = [...(match.teams.teamA.squad || []), ...(match.teams.teamB.squad || [])];
    return allPlayers.reduce((best, p) => {
      const impact = (p.runs || 0) + (p.wickets || 0) * 25 + (p.catches || 0) * 10 + (p.stumpings || 0) * 10 + (p.run_outs || 0) * 10;
      const bestImpact = (best.runs || 0) + (best.wickets || 0) * 25 + (best.catches || 0) * 10 + (best.stumpings || 0) * 10 + (best.run_outs || 0) * 10;
      return impact > bestImpact ? p : best;
    }, allPlayers[0] || {});
  };

  const generateScorecardPDF = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const margin = 12;
      let y = 15;

      // Background
      doc.setFillColor(10, 10, 10);
      doc.rect(0, 0, pw, ph, 'F');

      // 22 YARDS watermark (subtle, centered)
      doc.setFontSize(60);
      doc.setTextColor(255, 255, 255);
      doc.setGState(new (doc as any).GState({ opacity: 0.03 }));
      doc.text('22 YARDS', pw / 2, ph / 2, { align: 'center', angle: 30 });
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      // Branding top
      doc.setFontSize(10);
      doc.setTextColor(0, 240, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('22 YARDS', margin, y);
      y += 4;
      doc.setFontSize(6);
      doc.setTextColor(150, 150, 150);
      doc.text(match.config.dateTime || '', margin, y);
      doc.text(match.config.ground || match.config.city || '', pw - margin, y, { align: 'right' });
      y += 10;

      // Title
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text(`${match.teams.teamA.name} v/s ${match.teams.teamB.name}`, pw / 2, y, { align: 'center' });
      y += 6;

      // Result
      if (winnerTeam) {
        doc.setFontSize(10);
        doc.setTextColor(57, 255, 20);
        doc.text(`${winnerTeam.name} ${winnerTeam.margin}`, pw / 2, y, { align: 'center' });
      }
      y += 10;

      // Helper to draw a table
      const drawTable = (headers: string[], rows: string[][], startY: number, headerBg: [number, number, number] = [0, 100, 50]) => {
        let ty = startY;
        const colWidths = headers.map((_, i) => i === 0 ? 50 : (pw - 2 * margin - 50) / (headers.length - 1));
        const rowH = 6;

        // Header
        doc.setFillColor(...headerBg);
        doc.rect(margin, ty, pw - 2 * margin, rowH, 'F');
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        let x = margin + 2;
        headers.forEach((h, i) => {
          const align = i === 0 ? 'left' : 'right';
          const xPos = i === 0 ? x : margin + colWidths.slice(0, i).reduce((a, b) => a + b, 0) + colWidths[i] - 2;
          doc.text(h, xPos, ty + 4, { align });
        });
        ty += rowH;

        // Rows
        rows.forEach((row, ri) => {
          if (ri % 2 === 0) {
            doc.setFillColor(20, 20, 20);
            doc.rect(margin, ty, pw - 2 * margin, rowH, 'F');
          }
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6);
          row.forEach((cell, i) => {
            const isName = i === 0;
            doc.setTextColor(isName ? 255 : 200, isName ? 255 : 200, isName ? 255 : 200);
            const align = i === 0 ? 'left' : 'right';
            const xPos = i === 0 ? margin + 2 : margin + colWidths.slice(0, i).reduce((a, b) => a + b, 0) + colWidths[i] - 2;
            doc.text(String(cell), xPos, ty + 4, { align });
          });
          ty += rowH;
        });
        return ty;
      };

      // INNINGS 1
      const inn1BattingTeamId = innings1TeamId;
      const inn1BowlingTeamId = innings2TeamId;
      const inn1BattingTeam = getTeamObj(inn1BattingTeamId);
      const inn1BowlingTeam = getTeamObj(inn1BowlingTeamId);
      const inn1Score = match.config.innings1Score || 0;
      const inn1Wickets = match.config.innings1Wickets || 0;
      const inn1Balls = match.config.innings1Balls || 0;
      const inn1Overs = `${Math.floor(inn1Balls / 6)}.${inn1Balls % 6}`;

      // Innings 1 header
      doc.setFillColor(0, 80, 40);
      doc.rect(margin, y, pw - 2 * margin, 7, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(inn1BattingTeam.name, margin + 2, y + 5);
      doc.text(`${inn1Score}-${inn1Wickets} (${inn1Overs})`, pw - margin - 2, y + 5, { align: 'right' });
      y += 9;

      // Batting table
      const inn1Batters = (inn1BattingTeam.squad || []).filter(p => (p.runs || 0) > 0 || (p.balls || 0) > 0 || p.isOut);
      const battingHeaders = ['Batsman', 'R', 'B', '4s', '6s', 'SR'];
      const battingRows = inn1Batters.map(p => {
        const sr = (p.balls || 0) > 0 ? (((p.runs || 0) / (p.balls || 0)) * 100).toFixed(2) : '0.00';
        return [p.name, String(p.runs || 0), String(p.balls || 0), String(p.fours || 0), String(p.sixes || 0), sr];
      });
      y = drawTable(battingHeaders, battingRows, y);

      // Extras row
      const inn1History = (match.history || []).filter(b => b.innings === 1);
      const inn1Wides = inn1History.filter(b => b.type === 'WD').length;
      const inn1NoBalls = inn1History.filter(b => b.type === 'NB').length;
      const inn1Byes = inn1History.filter(b => b.type === 'BYE').reduce((s, b) => s + (b.runsScored || 0), 0);
      const inn1LBs = inn1History.filter(b => b.type === 'LB').reduce((s, b) => s + (b.runsScored || 0), 0);
      const inn1TotalExtras = inn1Wides + inn1NoBalls + inn1Byes + inn1LBs;

      doc.setFillColor(25, 25, 25);
      doc.rect(margin, y, pw - 2 * margin, 5.5, 'F');
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(180, 180, 180);
      doc.text('Extras', margin + 2, y + 4);
      doc.text(`(${inn1TotalExtras}) ${inn1Byes} B, ${inn1LBs} LB, ${inn1Wides} WD, ${inn1NoBalls} NB`, pw - margin - 2, y + 4, { align: 'right' });
      y += 6;

      // Total
      const inn1RR = inn1Balls > 0 ? ((inn1Score / inn1Balls) * 6).toFixed(2) : '0.00';
      doc.setFillColor(25, 25, 25);
      doc.rect(margin, y, pw - 2 * margin, 5.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Total', margin + 2, y + 4);
      doc.text(`${inn1Score}-${inn1Wickets} (${inn1Overs}) ${inn1RR}`, pw - margin - 2, y + 4, { align: 'right' });
      y += 8;

      // Bowling table
      const inn1Bowlers = (inn1BowlingTeam.squad || []).filter(p => (p.balls_bowled || 0) > 0);
      const bowlingHeaders = ['Bowler', 'O', 'M', 'R', 'W', 'ER'];
      const inn1BowlingRows = inn1Bowlers.map(p => {
        const ov = `${Math.floor((p.balls_bowled || 0) / 6)}.${(p.balls_bowled || 0) % 6}`;
        const econ = (p.balls_bowled || 0) > 0 ? (((p.runs_conceded || 0) / (p.balls_bowled || 0)) * 6).toFixed(2) : '0.00';
        return [p.name, ov, '0', String(p.runs_conceded || 0), String(p.wickets || 0), econ];
      });
      y = drawTable(bowlingHeaders, inn1BowlingRows, y);
      y += 4;

      // Fall of Wickets
      const inn1FoW = inn1History.filter(b => b.isWicket).map((b, idx) => {
        const batter = getPlayer(b.strikerId);
        return { name: batter?.name || 'Unknown', score: `${b.teamTotalAtThisBall}/${idx + 1}`, over: `${b.overNumber}.${b.ballNumber}` };
      });
      if (inn1FoW.length > 0) {
        const fowHeaders = ['Fall of wickets', 'Score', 'Over'];
        const fowRows = inn1FoW.map(f => [f.name, f.score, f.over]);
        y = drawTable(fowHeaders, fowRows, y, [80, 100, 60]);
        y += 6;
      }

      // Check if we need a new page for innings 2
      if (y > ph - 80) {
        doc.addPage();
        doc.setFillColor(10, 10, 10);
        doc.rect(0, 0, pw, ph, 'F');
        y = 15;
      }

      // INNINGS 2
      const inn2BattingTeam = getTeamObj(match.teams.battingTeamId);
      const inn2BowlingTeam = getTeamObj(match.teams.bowlingTeamId);
      const inn2Score = match.liveScore.runs;
      const inn2Wickets = match.liveScore.wickets;
      const inn2Balls = match.liveScore.balls;
      const inn2Overs = `${Math.floor(inn2Balls / 6)}.${inn2Balls % 6}`;

      // Innings 2 header
      doc.setFillColor(0, 80, 40);
      doc.rect(margin, y, pw - 2 * margin, 7, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(inn2BattingTeam.name, margin + 2, y + 5);
      doc.text(`${inn2Score}-${inn2Wickets} (${inn2Overs})`, pw - margin - 2, y + 5, { align: 'right' });
      y += 9;

      // Inn2 batting
      const inn2Batters = (inn2BattingTeam.squad || []).filter(p => (p.runs || 0) > 0 || (p.balls || 0) > 0 || p.isOut);
      const inn2BattingRows = inn2Batters.map(p => {
        const sr = (p.balls || 0) > 0 ? (((p.runs || 0) / (p.balls || 0)) * 100).toFixed(2) : '0.00';
        return [p.name, String(p.runs || 0), String(p.balls || 0), String(p.fours || 0), String(p.sixes || 0), sr];
      });
      y = drawTable(battingHeaders, inn2BattingRows, y);

      // Inn2 extras
      const inn2History = (match.history || []).filter(b => b.innings === 2);
      const inn2Wides = inn2History.filter(b => b.type === 'WD').length;
      const inn2NoBalls = inn2History.filter(b => b.type === 'NB').length;
      const inn2Byes = inn2History.filter(b => b.type === 'BYE').reduce((s, b) => s + (b.runsScored || 0), 0);
      const inn2LBs = inn2History.filter(b => b.type === 'LB').reduce((s, b) => s + (b.runsScored || 0), 0);
      const inn2TotalExtras = inn2Wides + inn2NoBalls + inn2Byes + inn2LBs;

      doc.setFillColor(25, 25, 25);
      doc.rect(margin, y, pw - 2 * margin, 5.5, 'F');
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(180, 180, 180);
      doc.text('Extras', margin + 2, y + 4);
      doc.text(`(${inn2TotalExtras}) ${inn2Byes} B, ${inn2LBs} LB, ${inn2Wides} WD, ${inn2NoBalls} NB`, pw - margin - 2, y + 4, { align: 'right' });
      y += 6;

      // Total
      const inn2RR = inn2Balls > 0 ? ((inn2Score / inn2Balls) * 6).toFixed(2) : '0.00';
      doc.setFillColor(25, 25, 25);
      doc.rect(margin, y, pw - 2 * margin, 5.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Total', margin + 2, y + 4);
      doc.text(`${inn2Score}-${inn2Wickets} (${inn2Overs}) ${inn2RR}`, pw - margin - 2, y + 4, { align: 'right' });
      y += 8;

      // Inn2 bowling
      const inn2Bowlers = (inn2BowlingTeam.squad || []).filter(p => (p.balls_bowled || 0) > 0);
      const inn2BowlingRows = inn2Bowlers.map(p => {
        const ov = `${Math.floor((p.balls_bowled || 0) / 6)}.${(p.balls_bowled || 0) % 6}`;
        const econ = (p.balls_bowled || 0) > 0 ? (((p.runs_conceded || 0) / (p.balls_bowled || 0)) * 6).toFixed(2) : '0.00';
        return [p.name, ov, '0', String(p.runs_conceded || 0), String(p.wickets || 0), econ];
      });
      y = drawTable(bowlingHeaders, inn2BowlingRows, y);
      y += 4;

      // Inn2 Fall of Wickets
      const inn2FoW = inn2History.filter(b => b.isWicket).map((b, idx) => {
        const batter = getPlayer(b.strikerId);
        return { name: batter?.name || 'Unknown', score: `${b.teamTotalAtThisBall}/${idx + 1}`, over: `${b.overNumber}.${b.ballNumber}` };
      });
      if (inn2FoW.length > 0) {
        const fowHeaders = ['Fall of wickets', 'Score', 'Over'];
        const fowRows = inn2FoW.map(f => [f.name, f.score, f.over]);
        y = drawTable(fowHeaders, fowRows, y, [80, 100, 60]);
        y += 6;
      }

      // HIGHLIGHTS section
      if (y > ph - 40) { doc.addPage(); doc.setFillColor(10, 10, 10); doc.rect(0, 0, pw, ph, 'F'); y = 15; }

      doc.setDrawColor(0, 240, 255);
      doc.line(margin, y, pw - margin, y);
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(255, 214, 0);
      doc.setFont('helvetica', 'bold');
      doc.text('HIGHLIGHTS', pw / 2, y, { align: 'center' });
      y += 6;

      const motm = calculateMOTM();
      const allPlayers = [...(match.teams.teamA.squad || []), ...(match.teams.teamB.squad || [])];
      const topScorer = allPlayers.reduce((b, p) => (p.runs || 0) > (b.runs || 0) ? p : b, allPlayers[0] || {});
      const topBowler = allPlayers.filter(p => (p.wickets || 0) > 0).reduce((b, p) => (p.wickets || 0) > (b.wickets || 0) ? p : b, {} as any);

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 200, 200);
      if (topScorer?.name) {
        doc.text(`Top Scorer: ${topScorer.name} - ${topScorer.runs}(${topScorer.balls})`, margin + 2, y);
        y += 5;
      }
      if (topBowler?.name) {
        doc.text(`Best Bowler: ${topBowler.name} - ${topBowler.wickets}-${topBowler.runs_conceded}`, margin + 2, y);
        y += 5;
      }
      if (motm?.name) {
        doc.setTextColor(255, 214, 0);
        doc.setFont('helvetica', 'bold');
        doc.text(`Man of the Match: ${motm.name}`, margin + 2, y);
        y += 5;
      }

      // Footer branding
      y = ph - 8;
      doc.setDrawColor(0, 240, 255);
      doc.line(margin, y - 3, pw - margin, y - 3);
      doc.setFontSize(7);
      doc.setTextColor(0, 240, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('22 YARDS', pw / 2 - 15, y);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text('Scored on 22yards', pw / 2 + 3, y);

      // Save and share
      const pdfBlob = doc.output('blob');
      const fileName = `${match.teams.teamA.name}_vs_${match.teams.teamB.name}_${Date.now()}.pdf`;

      if (navigator.share && navigator.canShare) {
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: '22 Yards Scorecard' });
          setIsCapturing(false);
          return;
        }
      }
      // Fallback: download
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error('PDF generation failed:', e); }
    setIsCapturing(false);
  };


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

  // Add player mid-match
  const handleAddPlayerMidMatch = () => {
    if (!addPlayerName.trim() || !showAddPlayer.team) return;
    const teamKey = showAddPlayer.team === 'batting'
      ? (match.teams.battingTeamId === 'A' ? 'teamA' : 'teamB')
      : (match.teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB');
    const newPlayer = {
      id: generatePlayerId(addPlayerPhone || `${Date.now()}`),
      name: addPlayerName.trim(),
      phone: addPlayerPhone.trim(),
      isCaptain: false,
      isWicketKeeper: false,
      runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false,
      wickets: 0, runs_conceded: 0, balls_bowled: 0, catches: 0, stumpings: 0, run_outs: 0,
    };
    setMatch(m => ({
      ...m,
      teams: { ...m.teams, [teamKey]: { ...m.teams[teamKey], squad: [...(m.teams[teamKey].squad || []), newPlayer] } }
    }));
    setAddPlayerName('');
    setAddPlayerPhone('');
    setShowAddPlayer({ open: false, team: null });
  };

  // ABANDON MATCH handler
  const handleAbandonMatch = () => {
    const teamAName = match.teams.teamA?.name || 'Team A';
    const teamBName = match.teams.teamB?.name || 'Team B';
    const reason = abandonReason.trim() || 'Match abandoned';
    setWinnerTeam({ name: 'Match Abandoned', id: null, margin: reason });
    setMatch(m => ({ ...m, status: 'COMPLETED' }));
    setShowMatchSettings(false);
    setAbandonConfirm(false);
    setAbandonReason('');
    setTimeout(() => setStatus('SUMMARY'), 100);
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

  const startQRScanner = async () => {
    setShowQRScanner(true);
    setQrScanStatus('SCANNING');
    setQrScanError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } }
      });
      qrStreamRef.current = stream;
      // Wait for the video element to be available in DOM
      setTimeout(() => {
        if (qrVideoRef.current) {
          qrVideoRef.current.srcObject = stream;
          qrVideoRef.current.play();
          // Start scanning loop
          scanQRFrame();
        }
      }, 300);
    } catch (err) {
      setQrScanStatus('ERROR');
      setQrScanError('Camera access denied. Please allow camera permission.');
    }
  };

  const scanQRFrame = async () => {
    if (!qrVideoRef.current || !qrCanvasRef.current) return;
    const video = qrVideoRef.current;
    const canvas = qrCanvasRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      qrAnimRef.current = requestAnimationFrame(scanQRFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    try {
      const jsQR = (await import('jsqr')).default;
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) {
        // Try to parse as 22YARDS player JSON
        try {
          const playerData = JSON.parse(code.data);
          if (playerData.app === '22YARDS' && playerData.name) {
            setQrScanStatus('SUCCESS');
            // Fill player name and phone
            setNewName(playerData.name);
            setPhoneQuery(playerData.phone || '');
            // Vibrate for feedback
            if (navigator.vibrate) navigator.vibrate(100);
            // Auto-close after short delay
            setTimeout(() => closeQRScanner(), 800);
            return; // Stop scanning
          }
        } catch {}
        // Not valid 22YARDS QR — try raw text as name
        setQrScanStatus('ERROR');
        setQrScanError('Not a valid 22 Yards player QR code.');
        setTimeout(() => { setQrScanStatus('SCANNING'); setQrScanError(''); }, 2000);
      }
    } catch {}
    // Continue scanning
    qrAnimRef.current = requestAnimationFrame(scanQRFrame);
  };

  const closeQRScanner = () => {
    // Stop camera stream
    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach(t => t.stop());
      qrStreamRef.current = null;
    }
    // Cancel animation frame
    if (qrAnimRef.current) {
      cancelAnimationFrame(qrAnimRef.current);
      qrAnimRef.current = null;
    }
    setShowQRScanner(false);
    setQrScanStatus('SCANNING');
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

  const getQRCodeUrl = (data: string) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}&bgcolor=ffffff&color=000000&margin=10`;
  };

  // Compress match state to a URL-safe base64 string
  const compressMatchState = () => {
    try {
      const matchState = JSON.parse(localStorage.getItem('22YARDS_ACTIVE_MATCH') || '{}');
      // Strip heavy fields to keep QR scannable — keep only what's needed to resume scoring
      const slim = {
        ...matchState,
        // Remove history array items' heavy fields if too many
        history: (matchState.history || []).map((h: any) => ({
          runs: h.runs, extras: h.extras, wicket: h.wicket,
          batsmanId: h.batsmanId, bowlerId: h.bowlerId,
          overNum: h.overNum, ballNum: h.ballNum,
          isBoundary: h.isBoundary, isExtra: h.isExtra,
          extraType: h.extraType, timestamp: h.timestamp
        }))
      };
      const json = JSON.stringify(slim);
      // Use btoa with URI encoding for safety
      const b64 = btoa(unescape(encodeURIComponent(json)));
      return b64;
    } catch (e) {
      console.error('Failed to compress match state:', e);
      return null;
    }
  };

  const getTransferUrl = () => {
    const b64 = compressMatchState();
    if (!b64) return null;
    const baseUrl = window.location.origin;
    return `${baseUrl}?transfer=${b64}`;
  };

  const openTransferModal = () => {
    setTransferStatus('WAITING');
    setTransferTab('HANDOFF');
    setMatchCode(''); // Not needed for direct transfer
    setMatchPasscode('');
    setShowTransferModal(true);
  };

  const copyTransferCode = () => {
    // Not applicable for direct transfer mode
  };

  const copyTransferLink = () => {
    const link = getTransferUrl();
    if (link) {
      navigator.clipboard.writeText(link);
      setTransferLinkCopied(true);
      setTimeout(() => setTransferLinkCopied(false), 2000);
    }
  };

  const isAddPlayerDisabled = !newName.trim() || (phoneQuery.length > 0 && phoneQuery.length !== 10);

  return (
    <div className="h-full w-full bg-[#050505] text-white flex flex-col overflow-hidden relative font-sans max-h-[100dvh]">
      <input type="file" ref={logoInputRef} onChange={handleLogoFileChange} className="hidden" accept="image/*" />

      {/* HEADER */}
      <div className="h-14 flex items-center px-6 border-b border-white/5 bg-black/50 backdrop-blur-md z-[100] shrink-0">
        <button onClick={() => {
          if (status === 'LIVE' || status === 'INNINGS_BREAK' || status === 'OPENERS') {
            if (!window.confirm('Match in progress! Are you sure you want to leave? Your match is auto-saved and you can resume later.')) return;
          }
          if (status === 'SUMMARY') {
            localStorage.setItem('22YARDS_ACTIVE_MATCH', JSON.stringify({ ...match, status: 'COMPLETED' }));
          }
          onBack();
        }} className="p-2 -ml-2 text-[#00F0FF] hover:bg-white/5 rounded-full transition-all"><ChevronLeft size={20} /></button>
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
            <button onClick={() => setShowMatchSettings(true)} className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all" title="Match Settings"><Settings size={18} /></button>
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
                              className="w-full bg-white/5 border border-white/10 rounded-[20px] p-3 text-white font-bold outline-none focus:border-[#00F0FF]/40 placeholder:text-white/25"
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
                        className="w-full bg-white/5 border border-white/10 rounded-[20px] p-3 pl-10 text-white font-bold outline-none focus:border-[#00F0FF]/40 placeholder:text-white/25"
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
                              className="w-full bg-white/5 border border-white/10 rounded-[20px] p-3 text-white font-bold outline-none focus:border-[#00F0FF]/40 placeholder:text-white/25"
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
                              className="w-full bg-white/5 border border-white/10 rounded-[20px] p-3 text-white font-bold outline-none focus:border-[#00F0FF]/40 placeholder:text-white/25"
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
                  <div className="flex flex-col lg:flex-row gap-0 lg:gap-6">
                    {(['A', 'B'] as const).map((teamId, idx) => {
                      const team = getTeamObj(teamId);
                      const isTeamSelected = !!team.name;

                      return (
                        <React.Fragment key={teamId}>
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="relative flex-1"
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
                                  <Plus size={48} className="text-white/40 mb-4" />
                                </motion.div>
                                <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Tap to select</p>
                                <p className="text-[8px] text-white/25 uppercase tracking-widest small-caps mt-6 absolute top-6">Team {teamId}</p>
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
                        {idx === 0 && (
                          <div className="flex justify-center items-center py-2 lg:hidden">
                            <AnimatePresence>
                              {match.teams.teamA.name && match.teams.teamB.name && (
                                <motion.div
                                  key="vs-badge-mobile"
                                  initial={{ scale: 0, rotate: -20 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                  onAnimationComplete={() => {
                                    setVsRevealed(true);
                                    try { window.navigator.vibrate?.(50); } catch {}
                                  }}
                                >
                                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FFD600] to-[#FF6D00] flex items-center justify-center shadow-[0_0_40px_rgba(255,214,0,0.5)]">
                                    <span className="font-heading text-xl text-black font-black italic">VS</span>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* THE VS BADGE CLIMAX */}
                  <div className="relative h-32 flex items-center justify-center">
                    <AnimatePresence>
                      {match.teams.teamA.name && match.teams.teamB.name && (
                        <>
                          <motion.div
                            key="vs-badge-desktop"
                            initial={{ scale: 0, rotate: -20 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            onAnimationComplete={() => {
                              setVsRevealed(true);
                              try {
                                window.navigator.vibrate?.(50);
                              } catch {}
                            }}
                            className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
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
                                    className="w-full bg-white/5 border border-white/10 rounded-[20px] pl-12 pr-4 py-3 text-white outline-none focus:border-[#00F0FF]/40 placeholder:text-white/40 text-sm"
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
                                        <Shield size={48} className="text-white/25 mb-4" />
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
                                                  squad: resetPlayerStats(team.squad || [])
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
                                    className="w-full bg-white/5 border border-white/10 rounded-[20px] px-4 py-3 text-white font-black uppercase outline-none focus:border-[#00F0FF]/40 placeholder:text-white/25 text-sm"
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
                                    <Camera size={32} className="text-white/40 mb-2" />
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
                                      : 'bg-white/5 text-white/40 cursor-not-allowed'
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
                      isConfigValid() ? 'bg-[#39FF14] text-black shadow-[0_12px_40px_rgba(57,255,20,0.4)]' : 'bg-white/5 text-white/25'
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
                    <p className="text-[10px] font-black text-white/40 uppercase leading-relaxed tracking-widest">
                      THIS TEAM ALREADY EXISTS IN YOUR CAREER ARCHIVE
                    </p>
                  </div>
                  <div className="p-5 bg-white/5 rounded-3xl border border-white/10 space-y-4">
                    <div className="flex justify-between items-center px-2">
                      <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.3em]">Archived Roster</span>
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
                      className="w-full text-white/40 hover:text-white py-4 font-black uppercase text-[9px] tracking-[0.4em] transition-all"
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
                          status: 'OPENERS',
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
                          status: 'OPENERS',
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
                      className="text-[11px] font-black text-white/40 uppercase tracking-[0.1em] hover:text-white/50 transition-all"
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

              {/* Share Follow Link */}
              {(() => {
                const followUrl = `${window.location.origin}${window.location.pathname}?watch=${match.matchId}`;
                const tossWinner = getTeamObj(match.toss.winnerId)?.name || 'Team';
                const decision = match.toss.decision === 'BAT' ? 'bat' : 'bowl';
                return (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        const text = `🏏 Match Starting!\n\n${match.teams.teamA.name} vs ${match.teams.teamB.name}\n${tossWinner} won the toss and elected to ${decision}.\n\n📍 ${match.config.ground || match.config.city}\n\n📺 Follow live:\n${followUrl}`;
                        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
                      }}
                      className="w-full p-4 rounded-[20px] bg-[#25D366]/15 border border-[#25D366]/40 flex items-center justify-center gap-3 transition-all active:scale-95"
                    >
                      <Share2 size={16} className="text-[#25D366]" />
                      <span className="text-[12px] font-black text-[#25D366] uppercase tracking-[0.1em]">Share Match on WhatsApp</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(followUrl); }}
                      className="w-full p-3 rounded-[16px] bg-white/5 border border-white/10 flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                      <ClipboardList size={14} className="text-white/50" />
                      <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.1em]">Copy Follow Link</span>
                    </button>
                  </div>
                );
              })()}

              {/* Step Progress */}
              <div className="flex items-center gap-2">
                {stepLabels.map((step, i) => (
                  <div key={step.key} className="flex items-center gap-2 flex-1">
                    <div className={`h-1 flex-1 rounded-full transition-all ${
                      i <= currentStepIdx ? 'bg-[#00F0FF]' : 'bg-white/10'
                    }`} />
                    <p className={`text-[8px] font-black uppercase tracking-[0.1em] shrink-0 ${
                      i === currentStepIdx ? 'text-[#00F0FF]' : i < currentStepIdx ? 'text-[#39FF14]' : 'text-white/40'
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
                    <ChevronRight size={16} className="text-white/40" />
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
                    <ChevronRight size={16} className="text-white/40" />
                  </button>
                ))}

                {activeTarget === 'BOWLER' && bowlingSquad.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => {
                      setMatch(m => ({ ...m, status: 'LIVE', crease: { ...m.crease, bowlerId: player.id } }));
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
                    <ChevronRight size={16} className="text-white/40" />
                  </button>
                ))}

                {/* Empty state if no players in squad */}
                {((activeTarget === 'STRIKER' || activeTarget === 'NON_STRIKER') && battingSquad.length === 0) && (
                  <div className="p-8 text-center space-y-3">
                    <Users size={32} className="text-white/40 mx-auto" />
                    <p className="text-[12px] text-white/40 font-black uppercase">No players in batting squad</p>
                    <p className="text-[10px] text-white/40">Go back and add players first</p>
                  </div>
                )}
                {(activeTarget === 'BOWLER' && bowlingSquad.length === 0) && (
                  <div className="p-8 text-center space-y-3">
                    <Users size={32} className="text-white/40 mx-auto" />
                    <p className="text-[12px] text-white/40 font-black uppercase">No players in bowling squad</p>
                    <p className="text-[10px] text-white/40">Go back and add players first</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })()}

        {/* LIVE SCORING SCREEN */}
        {status === 'LIVE' && (() => {
          const striker = getPlayer(match.crease.strikerId);
          const nonStriker = getPlayer(match.crease.nonStrikerId);
          const bowler = getPlayer(match.crease.bowlerId);
          const battingTeamName = getTeamObj(match.teams.battingTeamId)?.name || 'Batting';
          const bowlingTeamName = getTeamObj(match.teams.bowlingTeamId)?.name || 'Bowling';
          const overs = Math.floor(match.liveScore.balls / 6);
          const ballsInOver = match.liveScore.balls % 6;
          const crr = match.liveScore.balls > 0 ? ((match.liveScore.runs / match.liveScore.balls) * 6).toFixed(2) : '0.00';
          const target = match.config.target || 0;
          const need = target > 0 ? Math.max(0, target - match.liveScore.runs) : 0;
          const ballsRemaining = target > 0 ? Math.max(0, (match.config.overs * 6) - match.liveScore.balls) : 0;
          const rrr = ballsRemaining > 0 && need > 0 ? ((need / ballsRemaining) * 6).toFixed(2) : '0.00';

          // Partnership calculation
          const currentHistory = (match.history || []).filter(b => b.innings === match.currentInnings);
          const lastWicketIdx = [...currentHistory].reverse().findIndex(b => b.isWicket);
          const partnershipBalls = lastWicketIdx >= 0 ? currentHistory.slice(currentHistory.length - lastWicketIdx) : currentHistory;
          const partnershipRuns = partnershipBalls.reduce((sum, b) => sum + (b.runsScored || 0) + (b.type === 'WD' || b.type === 'NB' ? 1 : 0), 0);
          const partnershipBallCount = partnershipBalls.filter(b => !b.type || b.type === 'LEGAL' || b.type === 'BYE' || b.type === 'LB').length;
          const wicketNumber = match.liveScore.wickets + 1;

          // Current over balls display
          const currentOverBalls = (() => {
            const allBalls = currentHistory;
            if (allBalls.length === 0) return [];
            const result = [];
            let legalCount = 0;
            for (let i = allBalls.length - 1; i >= 0; i--) {
              const b = allBalls[i];
              const isLegal = !b.type || b.type === 'LEGAL' || b.type === 'BYE' || b.type === 'LB';
              result.unshift(b);
              if (isLegal) legalCount++;
              if (legalCount >= 6) break;
            }
            return result;
          })();

          // Bowler stats
          const bowlerOvers = bowler ? `${Math.floor((bowler.balls_bowled || 0) / 6)}.${(bowler.balls_bowled || 0) % 6}` : '0.0';
          const bowlerEcon = bowler && (bowler.balls_bowled || 0) > 0 ? (((bowler.runs_conceded || 0) / (bowler.balls_bowled || 0)) * 6).toFixed(1) : '0.0';
          const bowlerMaxOvers = match.config.oversPerBowler || 99;
          const bowlerOversComplete = bowler ? Math.floor((bowler.balls_bowled || 0) / 6) : 0;

          // Striker SR
          const strikerSR = striker && (striker.balls || 0) > 0 ? (((striker.runs || 0) / (striker.balls || 0)) * 100).toFixed(0) : '0';
          const nonStrikerSR = nonStriker && (nonStriker.balls || 0) > 0 ? (((nonStriker.runs || 0) / (nonStriker.balls || 0)) * 100).toFixed(0) : '0';

          return (
            <div className={`flex-1 flex flex-col overflow-hidden relative ${fireMode ? 'bg-[#1a0500]' : iceMode ? 'bg-[#000a1a]' : 'bg-black'}`}>
              {/* Fire mode ambient effects */}
              {fireMode && (
                <>
                  <div className="absolute inset-0 z-0 pointer-events-none opacity-20" style={{
                    background: 'radial-gradient(ellipse at bottom, rgba(255,109,0,0.4) 0%, rgba(255,0,60,0.2) 40%, transparent 70%)'
                  }} />
                  <div className="absolute bottom-0 left-0 right-0 h-32 z-0 pointer-events-none opacity-30" style={{
                    background: 'linear-gradient(to top, rgba(255,109,0,0.5), transparent)'
                  }} />
                </>
              )}
              {/* Ice mode ambient effects */}
              {iceMode && (
                <>
                  <div className="absolute inset-0 z-0 pointer-events-none opacity-25" style={{
                    background: 'radial-gradient(ellipse at top, rgba(100,180,255,0.3) 0%, rgba(0,100,200,0.15) 40%, transparent 70%)'
                  }} />
                  <div className="absolute top-0 left-0 right-0 h-40 z-0 pointer-events-none opacity-20" style={{
                    background: 'linear-gradient(to bottom, rgba(100,200,255,0.4), transparent)'
                  }} />
                  <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.03]" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0L30 60M0 30L60 30M8.8 8.8L51.2 51.2M51.2 8.8L8.8 51.2' stroke='%2380D0FF' stroke-width='0.5'/%3E%3C/svg%3E")`,
                    backgroundSize: '30px 30px'
                  }} />
                </>
              )}

              {/* FIRE MODE BANNER */}
              <AnimatePresence>
                {fireModeBanner && (
                  <motion.div
                    initial={{ y: -80, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -80, opacity: 0 }}
                    className="absolute top-0 left-0 right-0 z-[100] p-3 bg-gradient-to-r from-[#FF003C] via-[#FF6D00] to-[#FFD600] shadow-[0_4px_20px_rgba(255,109,0,0.5)]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        <Flame size={20} className="text-white animate-pulse" />
                        <div>
                          <p className="text-[11px] font-black text-white uppercase">Run Rate on Fire!</p>
                          <p className="text-[8px] text-white/80">Switch to BLAZE MODE?</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setFireMode(true); setFireModeBanner(false); }}
                          className="px-4 py-2 rounded-lg bg-white text-black font-black text-[10px] uppercase active:scale-95"
                        >
                          LET'S GO
                        </button>
                        <button
                          onClick={() => { setFireModeBanner(false); setFireModeDeclined(true); }}
                          className="px-3 py-2 rounded-lg bg-black/30 text-white font-black text-[10px] uppercase active:scale-95"
                        >
                          NAH
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ICE MODE BANNER */}
              <AnimatePresence>
                {iceModeBanner && (
                  <motion.div
                    initial={{ y: -80, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -80, opacity: 0 }}
                    className="absolute top-0 left-0 right-0 z-[100] p-3 bg-gradient-to-r from-[#1a3a5c] via-[#2196F3] to-[#80D8FF] shadow-[0_4px_20px_rgba(33,150,243,0.4)]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        <ZapOff size={20} className="text-white animate-pulse" />
                        <div>
                          <p className="text-[11px] font-black text-white uppercase">Run rate freezing!</p>
                          <p className="text-[8px] text-white/80">Switch to FROST MODE?</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setIceMode(true); setIceModeBanner(false); }}
                          className="px-4 py-2 rounded-lg bg-white text-[#1565C0] font-black text-[10px] uppercase active:scale-95"
                        >
                          FREEZE
                        </button>
                        <button
                          onClick={() => { setIceModeBanner(false); setIceModeDeclined(true); }}
                          className="px-3 py-2 rounded-lg bg-black/30 text-white font-black text-[10px] uppercase active:scale-95"
                        >
                          NAH
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* TOP STATUS BAR */}
              <div className="shrink-0 px-4 py-3 bg-black/60 backdrop-blur border-b border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-black text-white/60 uppercase tracking-wider">
                    {getTeamInitials(battingTeamName)}
                  </div>
                  <div className="text-center">
                    <div className={`font-numbers text-2xl font-black ${fireMode ? 'text-[#FF6D00]' : iceMode ? 'text-[#80D8FF]' : 'text-[#00F0FF]'}`}>
                      {match.liveScore.runs}/{match.liveScore.wickets}
                    </div>
                    <div className={`text-[9px] ${fireMode ? 'text-[#FF6D00]/60' : iceMode ? 'text-[#80D8FF]/80' : 'text-white/50'}`}>
                      {overs}.{ballsInOver} | CRR {crr}
                    </div>
                  </div>
                  <div className="text-[10px] font-black text-white/60 uppercase tracking-wider">
                    {getTeamInitials(bowlingTeamName)}
                  </div>
                </div>
                {match.currentInnings === 2 && target > 0 && (
                  <div className="text-[8px] text-white/70 uppercase tracking-wider text-center py-1 bg-white/[0.08] rounded">
                    Need {need} off {ballsRemaining}b | RRR: {rrr}
                  </div>
                )}
              </div>

              {/* BATSMAN PANEL */}
              <div className="shrink-0 px-4 py-3 border-b border-white/5 bg-white/[0.01]">
                {/* Striker Row */}
                {striker && (
                  <div className="mb-2 pb-2 border-b border-white/10">
                    <div className="flex items-center gap-2 text-[9px]">
                      <div className="w-5 h-5 flex items-center justify-center rounded-full bg-[#00F0FF]/20">
                        <Zap size={12} className="text-[#00F0FF]" />
                      </div>
                      <div className="flex-1 font-black text-white uppercase min-w-0 truncate">
                        {striker.name}
                      </div>
                      <div className="font-numbers font-black text-white/80 text-right">
                        {striker.runs || 0}
                      </div>
                      <div className="font-numbers font-black text-white/60 w-8 text-right">
                        ({striker.balls || 0})
                      </div>
                      <div className="font-numbers font-black text-white/60 w-6 text-right">
                        {striker.fours || 0}4
                      </div>
                      <div className="font-numbers font-black text-white/60 w-6 text-right">
                        {striker.sixes || 0}6
                      </div>
                      <div className={`font-numbers font-black w-10 text-right ${fireMode ? 'text-[#FFD600]' : iceMode ? 'text-[#E1BEE7]' : 'text-[#BC13FE]'}`}>
                        {strikerSR}
                      </div>
                    </div>
                  </div>
                )}
                {/* Non-Striker Row */}
                {nonStriker && (
                  <div className="mb-2">
                    <div className="flex items-center gap-2 text-[8px] text-white/60">
                      <div className="w-5" />
                      <div className="flex-1 font-black uppercase min-w-0 truncate">
                        {nonStriker.name}
                      </div>
                      <div className="font-numbers font-black text-right">
                        {nonStriker.runs || 0}
                      </div>
                      <div className="font-numbers font-black w-8 text-right">
                        ({nonStriker.balls || 0})
                      </div>
                      <div className="font-numbers font-black w-6 text-right">
                        {nonStriker.fours || 0}4
                      </div>
                      <div className="font-numbers font-black w-6 text-right">
                        {nonStriker.sixes || 0}6
                      </div>
                      <div className="font-numbers font-black w-10 text-right">
                        {nonStrikerSR}
                      </div>
                    </div>
                  </div>
                )}
                {/* Partnership Band */}
                <div className="text-[8px] px-2 py-1 rounded bg-gradient-to-r from-[#4DB6AC]/30 to-[#4DB6AC]/10 border border-[#4DB6AC]/20 text-white/70 font-black uppercase">
                  P'ship: {partnershipRuns}({partnershipBallCount}b) | {wicketNumber}th Wkt
                </div>
              </div>

              {/* BOWLER PANEL */}
              {bowler && (
                <div className="shrink-0 px-4 py-3 border-b border-white/5 bg-white/[0.01]">
                  <div className="flex items-center gap-2 text-[9px] mb-2">
                    <div className="flex-1 font-black text-white uppercase min-w-0 truncate">
                      {bowler.name}
                    </div>
                    <div className="font-numbers font-black text-white/80">
                      {bowlerOvers} ov
                    </div>
                    <div className="font-numbers font-black text-white/80 w-8 text-right">
                      {bowler.runs_conceded || 0}r
                    </div>
                    <div className="font-numbers font-black text-white/80 w-6 text-right">
                      {bowler.wickets || 0}w
                    </div>
                    <div className={`font-numbers font-black w-10 text-right ${fireMode ? 'text-[#FFD600]' : iceMode ? 'text-[#E1BEE7]' : 'text-[#BC13FE]'}`}>
                      {bowlerEcon}
                    </div>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-[#BC13FE] h-full transition-all"
                      style={{ width: `${Math.min(100, (bowlerOversComplete / bowlerMaxOvers) * 100)}%` }}
                    />
                  </div>
                  <div className="text-[7px] text-white/60 mt-1 uppercase font-black">
                    {bowlerOversComplete}/{bowlerMaxOvers} overs
                  </div>
                </div>
              )}

              {/* CURRENT OVER TICKER */}
              <div className="shrink-0 px-4 py-3 border-b border-white/5 bg-white/[0.01] flex justify-center gap-2">
                {currentOverBalls.map((ball, idx) => {
                  let bgColor = 'bg-white/20';
                  let displayText = '0';

                  if (ball.isWicket) {
                    bgColor = 'bg-[#FF003C]';
                    displayText = 'W';
                  } else if (ball.type === 'WD') {
                    bgColor = 'bg-[#FF6D00]';
                    displayText = 'Wd';
                  } else if (ball.type === 'NB') {
                    bgColor = 'bg-[#FF6D00]';
                    displayText = 'Nb';
                  } else if (ball.runsScored === 4) {
                    bgColor = 'bg-[#BC13FE]';
                    displayText = '4';
                  } else if (ball.runsScored === 6) {
                    bgColor = 'bg-[#FFD600]';
                    displayText = '6';
                  } else if (ball.runsScored > 0) {
                    bgColor = 'bg-white/30';
                    displayText = String(ball.runsScored);
                  }

                  return (
                    <div
                      key={idx}
                      className={`w-8 h-8 ${bgColor} rounded-full flex items-center justify-center text-[9px] font-black text-white/90`}
                    >
                      {displayText}
                    </div>
                  );
                })}
              </div>

              {/* SCORING BUTTONS */}
              <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
                {/* Row 1: 0, 1, 4, WD */}
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleScore(0)}
                    className="min-h-[56px] bg-white/10 hover:bg-white/20 text-white font-black rounded-lg border border-white/20 active:scale-95 transition-all select-none touch-manipulation text-sm"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScore(1)}
                    className="min-h-[56px] bg-white/10 hover:bg-white/20 text-white font-black rounded-lg border border-white/20 active:scale-95 transition-all select-none touch-manipulation text-sm"
                  >
                    1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScore(4)}
                    className="min-h-[56px] bg-[#BC13FE]/20 hover:bg-[#BC13FE]/30 text-[#BC13FE] font-black rounded-lg border border-[#BC13FE]/40 active:scale-95 transition-all select-none touch-manipulation text-sm"
                  >
                    4
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingExtra('WD')}
                    className={`min-h-[56px] rounded-lg border active:scale-95 transition-all select-none touch-manipulation text-sm font-black ${
                      pendingExtra === 'WD'
                        ? 'bg-[#FF6D00] text-black border-[#FF6D00]'
                        : 'bg-[#FF6D00]/40 text-[#FF6D00] border-[#FF6D00]/60 hover:bg-[#FF6D00]/50'
                    }`}
                  >
                    WD
                  </button>
                </div>

                {/* Row 2: 2, 3, 6, NB */}
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleScore(2)}
                    className="min-h-[48px] bg-white/10 hover:bg-white/20 text-white font-black rounded-lg border border-white/20 active:scale-95 transition-all select-none touch-manipulation text-sm"
                  >
                    2
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScore(3)}
                    className="min-h-[48px] bg-white/10 hover:bg-white/20 text-white font-black rounded-lg border border-white/20 active:scale-95 transition-all select-none touch-manipulation text-sm"
                  >
                    3
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScore(6)}
                    className="min-h-[48px] bg-[#FFD600]/20 hover:bg-[#FFD600]/30 text-[#FFD600] font-black rounded-lg border border-[#FFD600]/40 active:scale-95 transition-all select-none touch-manipulation text-sm"
                  >
                    6
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingExtra('NB')}
                    className={`min-h-[48px] rounded-lg border active:scale-95 transition-all select-none touch-manipulation text-sm font-black ${
                      pendingExtra === 'NB'
                        ? 'bg-[#FF6D00] text-black border-[#FF6D00]'
                        : 'bg-[#FF6D00]/40 text-[#FF6D00] border-[#FF6D00]/60 hover:bg-[#FF6D00]/50'
                    }`}
                  >
                    NB
                  </button>
                </div>

                {/* Row 3: BYE, LB, 5, 7 */}
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setPendingExtra('BYE')}
                    className={`min-h-[40px] rounded-lg border active:scale-95 transition-all select-none touch-manipulation font-black text-xs ${
                      pendingExtra === 'BYE'
                        ? 'bg-[#FF6D00] text-black border-[#FF6D00]'
                        : 'bg-[#FF6D00]/30 text-[#FF6D00] border-[#FF6D00]/50 hover:bg-[#FF6D00]/40'
                    }`}
                  >
                    BYE
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingExtra('LB')}
                    className={`min-h-[40px] rounded-lg border active:scale-95 transition-all select-none touch-manipulation font-black text-xs ${
                      pendingExtra === 'LB'
                        ? 'bg-[#FF6D00] text-black border-[#FF6D00]'
                        : 'bg-[#FF6D00]/30 text-[#FF6D00] border-[#FF6D00]/50 hover:bg-[#FF6D00]/40'
                    }`}
                  >
                    LB
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScore(5)}
                    className="min-h-[40px] bg-white/10 hover:bg-white/20 text-white font-black rounded-lg border border-white/20 active:scale-95 transition-all select-none touch-manipulation text-xs"
                  >
                    5
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScore(7)}
                    className="min-h-[40px] bg-white/10 hover:bg-white/20 text-white font-black rounded-lg border border-white/20 active:scale-95 transition-all select-none touch-manipulation text-xs"
                  >
                    7
                  </button>
                </div>

                {/* Row 4: WICKET, SWAP, UNDO */}
                <div className="grid grid-cols-4 gap-2 mt-auto">
                  <button
                    type="button"
                    onClick={() => setWicketWizard({ open: true })}
                    className="col-span-2 min-h-[48px] bg-[#FF003C] hover:bg-[#FF003C]/90 text-white font-black rounded-lg border border-[#FF003C]/60 active:scale-95 transition-all select-none touch-manipulation"
                  >
                    WICKET
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMatch(m => ({
                        ...m,
                        crease: { ...m.crease, strikerId: m.crease.nonStrikerId, nonStrikerId: m.crease.strikerId }
                      }));
                    }}
                    className="min-h-[48px] bg-[#4DB6AC]/20 hover:bg-[#4DB6AC]/30 text-[#4DB6AC] font-black rounded-lg border border-[#4DB6AC]/40 active:scale-95 transition-all select-none touch-manipulation text-sm"
                  >
                    SWAP
                  </button>
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!match.history || match.history.length === 0}
                    className="min-h-[48px] bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-[#FF6D00] font-black rounded-lg border border-white/20 active:scale-95 transition-all select-none touch-manipulation text-sm"
                  >
                    UNDO
                  </button>
                </div>
              </div>

              {/* WICKET WIZARD */}
              <AnimatePresence>
                {wicketWizard.open && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[5000] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => { setWicketWizard({ open: false }); setPendingExtra(null); }}
                  >
                    <motion.div
                      initial={{ scale: 0.9, y: 40 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0.9, y: 40 }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-sm bg-[#0A0A0A] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
                    >
                      <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                        <h3 className="font-heading text-2xl uppercase italic text-[#FF003C]">Wicket Type</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-3 p-4">
                        {[
                          { type: 'BOWLED', icon: '🎳' },
                          { type: 'CAUGHT', icon: '🤚' },
                          { type: 'LBW', icon: '🦵' },
                          { type: 'STUMPED', icon: '🏏' },
                          { type: 'RUN OUT', icon: '💨' },
                          { type: 'HIT WICKET', icon: '💥' },
                        ].map((item) => (
                          <motion.button
                            key={item.type}
                            onClick={() => handleWicketAction(item.type)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-[#FF003C]/40 hover:bg-white/10 font-black uppercase text-xs flex flex-col items-center gap-2 transition-all"
                          >
                            <span className="text-2xl">{item.icon}</span>
                            {item.type}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* FIELDER SELECTION */}
              <AnimatePresence>
                {selectionTarget === 'FIELDER' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => { setSelectionTarget(null); setPendingExtra(null); }}
                    className="fixed inset-0 z-[5000] bg-black/95 backdrop-blur-sm flex items-end justify-center p-4"
                  >
                    <motion.div
                      initial={{ y: 100 }}
                      animate={{ y: 0 }}
                      exit={{ y: 100 }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-t-3xl overflow-hidden max-h-[70vh] flex flex-col"
                    >
                      <div className="p-4 border-b border-white/5">
                        <h3 className="font-heading text-lg uppercase italic text-[#FFD600]">Select Fielder</h3>
                        <p className="text-[9px] text-white/40 uppercase mt-1">Who took the {wicketWizard.type === 'CAUGHT' ? 'catch' : wicketWizard.type === 'RUN OUT' ? 'run out' : 'stumping'}?</p>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3">
                        <div className="grid grid-cols-3 gap-2">
                          {(getTeamObj(match.teams.bowlingTeamId)?.squad || []).map(player => (
                            <motion.button
                              key={player.id}
                              type="button"
                              onClick={() => handleFielderSelected(player.id)}
                              whileTap={{ scale: 0.95 }}
                              className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-[#FFD600]/40 flex flex-col items-center gap-1 transition-all"
                            >
                              <img src={getPlayerAvatar(player)} className="w-10 h-10 rounded-full" />
                              <p className="text-[9px] font-black text-white uppercase text-center leading-tight">{player.name}</p>
                              {player.isWicketKeeper && (
                                <span className="text-[7px] text-[#FFD600] font-black">WK</span>
                              )}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* NEW BATSMAN SELECTION */}
              <AnimatePresence>
                {selectionTarget === 'NEW_BATSMAN' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setSelectionTarget(null)}
                    className="fixed inset-0 z-[5000] bg-black/95 backdrop-blur-sm flex items-end justify-center p-4"
                  >
                    <motion.div
                      initial={{ y: 100 }}
                      animate={{ y: 0 }}
                      exit={{ y: 100 }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-t-3xl overflow-hidden max-h-[70vh] flex flex-col"
                    >
                      <div className="p-4 border-b border-white/5">
                        <h3 className="font-heading text-lg uppercase italic text-[#FF003C]">New Batsman</h3>
                        <p className="text-[9px] text-white/40 uppercase mt-1">Select who comes in next</p>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3">
                        <div className="space-y-2">
                          {(getTeamObj(match.teams.battingTeamId)?.squad || [])
                            .filter(p => !p.isOut && p.id !== match.crease.nonStrikerId && p.id !== match.crease.strikerId)
                            .map(player => (
                            <motion.button
                              key={player.id}
                              type="button"
                              onClick={() => {
                                setMatch(m => {
                                  const updated = { ...m, crease: { ...m.crease, strikerId: player.id } };
                                  if (!updated.crease.bowlerId) {
                                    setTimeout(() => setSelectionTarget('NEXT_BOWLER'), 50);
                                  } else {
                                    setTimeout(() => setSelectionTarget(null), 0);
                                  }
                                  return updated;
                                });
                              }}
                              whileTap={{ scale: 0.95 }}
                              className="w-full p-3 rounded-xl bg-white/5 border border-white/10 hover:border-[#00F0FF]/40 flex items-center gap-3 transition-all"
                            >
                              <img src={getPlayerAvatar(player)} className="w-10 h-10 rounded-full" />
                              <div className="flex-1 text-left">
                                <p className="text-[11px] font-black text-white uppercase">{player.name}</p>
                                <p className="text-[9px] text-white/40">{player.runs || 0}({player.balls || 0})</p>
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* NEXT BOWLER SELECTION */}
              <AnimatePresence>
                {selectionTarget === 'NEXT_BOWLER' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setSelectionTarget(null)}
                    className="fixed inset-0 z-[5000] bg-black/95 backdrop-blur-sm flex items-end justify-center p-4"
                  >
                    <motion.div
                      initial={{ y: 100 }}
                      animate={{ y: 0 }}
                      exit={{ y: 100 }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-t-3xl overflow-hidden max-h-[70vh] flex flex-col"
                    >
                      <div className="p-4 border-b border-white/5">
                        <h3 className="font-heading text-lg uppercase italic text-[#BC13FE]">Next Bowler</h3>
                        <p className="text-[9px] text-white/40 uppercase mt-1">Over {Math.floor(match.liveScore.balls / 6)} complete</p>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3">
                        <div className="space-y-2">
                          {(getTeamObj(match.teams.bowlingTeamId)?.squad || [])
                            .sort((a, b) => {
                              // Prev bowler last
                              if (a.id === match.crease.previousBowlerId) return 1;
                              if (b.id === match.crease.previousBowlerId) return -1;
                              // Max reached last
                              const aMax = Math.floor((a.balls_bowled || 0) / 6) >= bowlerMaxOvers;
                              const bMax = Math.floor((b.balls_bowled || 0) / 6) >= bowlerMaxOvers;
                              if (aMax && !bMax) return 1;
                              if (!aMax && bMax) return -1;
                              // Fewest overs first
                              return (a.balls_bowled || 0) - (b.balls_bowled || 0);
                            })
                            .map(player => {
                              const playerOversComplete = Math.floor((player.balls_bowled || 0) / 6);
                              const isMaxReached = playerOversComplete >= bowlerMaxOvers;
                              const isLastBowler = player.id === match.crease.previousBowlerId;
                              const isOneOverLeft = playerOversComplete === bowlerMaxOvers - 1;

                              return (
                                <motion.button
                                  key={player.id}
                                  type="button"
                                  onClick={() => {
                                    setMatch(m => ({ ...m, crease: { ...m.crease, bowlerId: player.id, previousBowlerId: m.crease.bowlerId || m.crease.previousBowlerId } }));
                                    setSelectionTarget(null);
                                  }}
                                  disabled={isLastBowler || isMaxReached}
                                  whileTap={{ scale: isLastBowler || isMaxReached ? 1 : 0.95 }}
                                  className={`w-full p-3 rounded-xl border flex items-center gap-3 transition-all ${
                                    isLastBowler || isMaxReached
                                      ? 'bg-white/5 border-white/10 opacity-40 cursor-not-allowed'
                                      : 'bg-white/5 border-white/10 hover:border-[#BC13FE]/40 hover:bg-white/10'
                                  }`}
                                >
                                  <img src={getPlayerAvatar(player)} className="w-10 h-10 rounded-full" />
                                  <div className="flex-1 text-left">
                                    <p className="text-[11px] font-black text-white uppercase">{player.name}</p>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <div className="flex-1 bg-white/20 rounded-full h-1 overflow-hidden">
                                        <div
                                          className="bg-[#BC13FE] h-full"
                                          style={{ width: `${Math.min(100, (playerOversComplete / bowlerMaxOvers) * 100)}%` }}
                                        />
                                      </div>
                                      <p className="text-[8px] text-white/60 w-8 text-right">{playerOversComplete}/{bowlerMaxOvers}</p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[8px] text-white/60 font-black">
                                      {player.wickets || 0}-{player.runs_conceded || 0}
                                    </p>
                                    {isLastBowler && (
                                      <span className="text-[7px] text-[#FF003C] font-black uppercase">Last</span>
                                    )}
                                    {isMaxReached && (
                                      <span className="text-[7px] text-[#FF6D00] font-black uppercase">Max</span>
                                    )}
                                    {isOneOverLeft && (
                                      <span className="text-[7px] text-[#FFD600] font-black uppercase">1 left</span>
                                    )}
                                  </div>
                                </motion.button>
                              );
                            })}
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* INNINGS BREAK */}
        {status === 'INNINGS_BREAK' && (() => {
          const battingTeamName = getTeamObj(match.teams.battingTeamId)?.name || 'Team';
          const overs = Math.floor(match.liveScore.balls / 6);
          const balls = match.liveScore.balls % 6;

          // Find top performer (highest scorer)
          const topPerformer = (getTeamObj(match.teams.battingTeamId)?.squad || [])
            .reduce((best, p) => (p.runs || 0) > (best.runs || 0) ? p : best, {} as any);
          const topPerformerInfo = topPerformer?.name ? `${topPerformer.name} ${topPerformer.runs}(${topPerformer.balls})` : 'N/A';

          // Find best bowler
          const bowlers = (getTeamObj(match.teams.bowlingTeamId)?.squad || []).filter(p => (p.wickets || 0) > 0);
          const bestBowler = bowlers.reduce((best, p) => (p.wickets || 0) > (best.wickets || 0) ? p : best, {} as any);
          const bestBowlerInfo = bestBowler?.name ? `${bestBowler.name} ${bestBowler.wickets}-${bestBowler.runs_conceded || 0} (${Math.floor((bestBowler.balls_bowled || 0) / 6)}.${(bestBowler.balls_bowled || 0) % 6})` : 'N/A';

          // Key partnerships (> 20 runs)
          const currentHistory = (match.history || []).filter(b => b.innings === match.currentInnings);
          const partnerships: any[] = [];
          let currentPartnershipRuns = 0;
          let lastWicketIndex = 0;
          for (let i = 0; i < currentHistory.length; i++) {
            const ball = currentHistory[i];
            currentPartnershipRuns += (ball.runsScored || 0) + (ball.type === 'WD' || ball.type === 'NB' ? 1 : 0);
            if (ball.isWicket) {
              if (currentPartnershipRuns > 20) {
                partnerships.push({ runs: currentPartnershipRuns, wicket: i });
              }
              currentPartnershipRuns = 0;
              lastWicketIndex = i + 1;
            }
          }
          if (currentPartnershipRuns > 20) {
            partnerships.push({ runs: currentPartnershipRuns });
          }

          // Current over display (for summary)
          const lastOverBalls = currentHistory.slice(-6);
          // Run rate
          const runRate = match.liveScore.balls > 0 ? ((match.liveScore.runs / match.liveScore.balls) * 6).toFixed(2) : '0.00';
          // Extras and boundaries
          const totalExtras = currentHistory.reduce((sum, b) => sum + (b.type === 'WD' || b.type === 'NB' ? 1 : 0) + (b.type === 'BYE' || b.type === 'LB' ? (b.runsScored || 0) : 0), 0);
          const totalFours = currentHistory.filter(b => b.runsScored === 4 && !b.isWicket && b.type !== 'BYE' && b.type !== 'LB').length;
          const totalSixes = currentHistory.filter(b => b.runsScored === 6 && !b.isWicket && b.type !== 'BYE' && b.type !== 'LB').length;
          const target = match.config.target || match.liveScore.runs + 1;

          return (
            <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar bg-black">
              <div className="flex-1 p-4 pb-10 space-y-4">

                {/* HERO SCORE CARD */}
                <motion.div
                  initial={{ scale: 0.92, opacity: 0, y: 30 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 180 }}
                  className="relative overflow-hidden rounded-[28px] border border-white/10"
                  style={{ background: 'linear-gradient(135deg, rgba(0,240,255,0.12) 0%, rgba(188,19,254,0.15) 50%, rgba(255,214,0,0.08) 100%)' }}
                >
                  {/* Decorative glow */}
                  <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-[#00F0FF]/10 blur-3xl" />
                  <div className="absolute -bottom-16 -left-16 w-32 h-32 rounded-full bg-[#BC13FE]/10 blur-3xl" />

                  <div className="relative z-10 p-6 text-center space-y-1">
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">Innings {match.currentInnings} Complete</p>
                    <h2 className="font-heading text-2xl uppercase italic text-white leading-tight">{battingTeamName}</h2>
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                      className="py-2"
                    >
                      <span className="font-numbers text-6xl font-black text-[#00F0FF] leading-none">{match.liveScore.runs}</span>
                      <span className="font-numbers text-3xl font-black text-white/40 mx-1">/</span>
                      <span className="font-numbers text-4xl font-black text-[#FF003C] leading-none">{match.liveScore.wickets}</span>
                    </motion.div>
                    <p className="text-[10px] text-white/50 font-black">{overs}.{balls} overs &bull; RR {runRate}</p>
                  </div>

                  {/* Quick Stats Row */}
                  <div className="relative z-10 grid grid-cols-4 border-t border-white/10">
                    <div className="p-3 text-center border-r border-white/5">
                      <p className="font-numbers text-lg font-black text-[#BC13FE]">{totalFours}</p>
                      <p className="text-[7px] font-black text-white/40 uppercase">Fours</p>
                    </div>
                    <div className="p-3 text-center border-r border-white/5">
                      <p className="font-numbers text-lg font-black text-[#FFD600]">{totalSixes}</p>
                      <p className="text-[7px] font-black text-white/40 uppercase">Sixes</p>
                    </div>
                    <div className="p-3 text-center border-r border-white/5">
                      <p className="font-numbers text-lg font-black text-[#FF6D00]">{totalExtras}</p>
                      <p className="text-[7px] font-black text-white/40 uppercase">Extras</p>
                    </div>
                    <div className="p-3 text-center">
                      <p className="font-numbers text-lg font-black text-[#4DB6AC]">{partnerships.length}</p>
                      <p className="text-[7px] font-black text-white/40 uppercase">P'ships</p>
                    </div>
                  </div>
                </motion.div>

                {/* TOP PERFORMER + BEST BOWLER — side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="p-4 rounded-2xl bg-[#FFD600]/5 border border-[#FFD600]/20 space-y-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <Star size={12} className="text-[#FFD600]" />
                      <p className="text-[8px] font-black text-[#FFD600] uppercase tracking-wider">Star</p>
                    </div>
                    <p className="text-[12px] font-black text-white leading-tight">{topPerformer?.name || 'N/A'}</p>
                    {topPerformer?.name && (
                      <p className="font-numbers text-[10px] text-white/50 font-black">
                        {topPerformer.runs}({topPerformer.balls}) {topPerformer.fours ? `${topPerformer.fours}x4` : ''} {topPerformer.sixes ? `${topPerformer.sixes}x6` : ''}
                      </p>
                    )}
                  </motion.div>
                  <motion.div
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.35 }}
                    className="p-4 rounded-2xl bg-[#BC13FE]/5 border border-[#BC13FE]/20 space-y-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <Target size={12} className="text-[#BC13FE]" />
                      <p className="text-[8px] font-black text-[#BC13FE] uppercase tracking-wider">Best Bowl</p>
                    </div>
                    <p className="text-[12px] font-black text-white leading-tight">{bestBowler?.name || 'N/A'}</p>
                    {bestBowler?.name && (
                      <p className="font-numbers text-[10px] text-white/50 font-black">
                        {bestBowler.wickets}-{bestBowler.runs_conceded} ({Math.floor((bestBowler.balls_bowled || 0) / 6)}.{(bestBowler.balls_bowled || 0) % 6})
                      </p>
                    )}
                  </motion.div>
                </div>

                {/* PARTNERSHIPS */}
                {partnerships.length > 0 && (
                  <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="p-4 rounded-2xl bg-white/[0.02] border border-[#4DB6AC]/15 space-y-3"
                  >
                    <div className="flex items-center gap-1.5">
                      <Users size={12} className="text-[#4DB6AC]" />
                      <p className="text-[8px] font-black text-[#4DB6AC] uppercase tracking-wider">Key Partnerships</p>
                    </div>
                    {partnerships.slice(0, 3).map((p, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 bg-white/10 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, (p.runs / Math.max(1, match.liveScore.runs)) * 100)}%` }}
                            transition={{ delay: 0.5 + idx * 0.1, duration: 0.6 }}
                            className="h-full bg-[#4DB6AC] rounded-full"
                          />
                        </div>
                        <span className="font-numbers text-[11px] font-black text-white w-10 text-right">{p.runs}</span>
                      </div>
                    ))}
                  </motion.div>
                )}

                {/* LAST OVER */}
                {lastOverBalls.length > 0 && (
                  <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5"
                  >
                    <p className="text-[8px] font-black text-white/40 uppercase shrink-0">Last Over</p>
                    <div className="flex gap-1.5 flex-1 justify-center">
                      {lastOverBalls.map((ball, idx) => {
                        let bgColor = 'bg-white/15';
                        let displayText = '0';
                        if (ball.isWicket) { bgColor = 'bg-[#FF003C]'; displayText = 'W'; }
                        else if (ball.type === 'WD') { bgColor = 'bg-[#FF6D00]/60'; displayText = 'Wd'; }
                        else if (ball.type === 'NB') { bgColor = 'bg-[#FF6D00]/60'; displayText = 'Nb'; }
                        else if (ball.runsScored === 4) { bgColor = 'bg-[#BC13FE]'; displayText = '4'; }
                        else if (ball.runsScored === 6) { bgColor = 'bg-[#FFD600]'; displayText = '6'; }
                        else if (ball.runsScored > 0) { bgColor = 'bg-white/25'; displayText = String(ball.runsScored); }
                        return (
                          <div key={idx} className={`w-7 h-7 ${bgColor} rounded-full flex items-center justify-center text-[9px] font-black text-white`}>
                            {displayText}
                          </div>
                        );
                      })}
                    </div>
                    <p className="font-numbers text-[11px] font-black text-white/50 shrink-0">
                      {lastOverBalls.reduce((s, b) => s + (b.runsScored || 0) + (b.type === 'WD' || b.type === 'NB' ? 1 : 0), 0)}r
                    </p>
                  </motion.div>
                )}

                {/* TARGET BANNER */}
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.55 }}
                  className="p-5 rounded-2xl bg-gradient-to-r from-[#39FF14]/10 to-[#39FF14]/5 border border-[#39FF14]/30 text-center"
                >
                  <p className="text-[8px] font-black text-[#39FF14]/60 uppercase tracking-[0.3em] mb-1">Target Set</p>
                  <p className="font-numbers text-4xl font-black text-[#39FF14]">{target}</p>
                </motion.div>

                {/* BUTTONS */}
                <div className="space-y-3 pt-2 pb-6">
                  <motion.button
                    onClick={() => {
                      const followUrl = `${window.location.origin}${window.location.pathname}?watch=${match.matchId}`;
                      const msg = encodeURIComponent(
                        `🏏 ${battingTeamName} scored ${match.liveScore.runs}/${match.liveScore.wickets} in ${overs}.${balls} overs\n\nTarget: ${target}\n\n📺 Follow live:\n${followUrl}`
                      );
                      window.open(`https://wa.me/?text=${msg}`);
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-full py-4 rounded-2xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/30 text-[#25D366] font-black text-[12px] uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                  >
                    <Share2 size={16} />
                    Share on WhatsApp
                  </motion.button>

                  <motion.button
                    onClick={() => {
                      setMatch(m => ({
                        ...m,
                        status: 'OPENERS',
                        config: { ...m.config, target: target, innings1Score: m.liveScore.runs, innings1Wickets: m.liveScore.wickets, innings1Balls: m.liveScore.balls },
                        teams: { ...m.teams, battingTeamId: m.teams.bowlingTeamId, bowlingTeamId: m.teams.battingTeamId },
                        liveScore: { runs: 0, wickets: 0, balls: 0 },
                        crease: { strikerId: null, nonStrikerId: null, bowlerId: null, previousBowlerId: null },
                        currentInnings: 2,
                      }));
                      setSelectionTarget('STRIKER');
                      setStatus('OPENERS');
                      setFireMode(false);
                      setFireModeBanner(false);
                      setFireModeDeclined(false);
                      setIceMode(false);
                      setIceModeBanner(false);
                      setIceModeDeclined(false);
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-full py-5 rounded-2xl bg-[#39FF14] text-black font-black text-[13px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(57,255,20,0.3)]"
                  >
                    <Zap size={18} />
                    Start Innings 2
                  </motion.button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* SUMMARY SCREEN */}
        {status === 'SUMMARY' && (
          <>
            <style>{`
              @keyframes shimmer {
                0% { background-position: -400px 0; }
                100% { background-position: 400px 0; }
              }
              .skeleton-shimmer {
                background: linear-gradient(90deg, #111 25%, #1a1a1a 50%, #111 75%);
                background-size: 800px 100%;
                animation: shimmer 1.5s infinite linear;
              }
            `}</style>

            {/* VISIBLE SUMMARY SCREEN */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Notification Banner */}
              {scorecardReady && (
                <motion.div
                  initial={{ y: -60, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="bg-[#00F0FF]/10 border-b border-[#00F0FF]/20 px-6 py-3 text-center text-[12px] font-black text-[#00F0FF] uppercase tracking-[0.2em]"
                >
                  Your match card is ready — tap to share
                </motion.div>
              )}

              {/* TAB BAR - Sticky at top */}
              {summaryPhase !== 'SKELETON' && (
                <div className="sticky top-0 z-40 bg-[#050505] border-b border-white/5 px-4 pt-4">
                  <div className="flex gap-1 overflow-x-auto no-scrollbar pb-4">
                    {['SUMMARY', 'SCORECARD', 'COMMS', 'ANALYSIS', 'MVP'].map((tab) => (
                      <motion.button
                        key={tab}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSummaryTab(tab as any)}
                        className={`px-4 py-2 rounded-full font-black text-[11px] uppercase tracking-[0.15em] transition-all whitespace-nowrap border-b-2 relative ${
                          summaryTab === tab
                            ? 'text-[#00F0FF] border-[#00F0FF]'
                            : 'text-white/40 border-transparent hover:text-white/60'
                        }`}
                      >
                        {tab}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6 pb-24">
                {/* Phase 1: Skeleton Shimmer */}
                {summaryPhase === 'SKELETON' && (
                  <div className="space-y-4">
                    <div className="skeleton-shimmer h-32 rounded-[32px]" />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="skeleton-shimmer h-20 rounded-[16px]" />
                      <div className="skeleton-shimmer h-20 rounded-[16px]" />
                    </div>
                    <div className="skeleton-shimmer h-40 rounded-[20px]" />
                  </div>
                )}

                {/* Phase 2-3: Content */}
                {summaryPhase !== 'SKELETON' && (
                  <>
                    {/* Result Banner */}
                    <motion.div
                      initial={summaryPhase === 'COUNTING' ? { scale: 0.9, opacity: 0 } : { scale: 1, opacity: 1 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: summaryPhase === 'COUNTING' ? 0.2 : 0 }}
                      className="p-8 rounded-[40px] bg-gradient-to-br from-[#00F0FF]/10 to-[#FFD600]/10 border border-white/10 space-y-4 text-center"
                    >
                      <h2 className="font-heading text-4xl uppercase italic text-[#00F0FF]">Match Complete</h2>
                      {winnerTeam ? (
                        <>
                          <h3 className={`font-heading text-5xl uppercase italic ${winnerTeam.id ? 'text-[#39FF14]' : 'text-[#FFD600]'}`}>
                            {winnerTeam.name}
                          </h3>
                          <p className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em]">{winnerTeam.margin}</p>
                        </>
                      ) : (
                        <p className="text-[13px] text-white/40 font-black uppercase">Calculating result...</p>
                      )}
                    </motion.div>

                    {/* SUMMARY TAB */}
                    {summaryTab === 'SUMMARY' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                      >
                        {/* Result Card */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-6 rounded-[32px] bg-white/5 border border-white/10 text-center space-y-3">
                            <p className="text-[10px] font-black text-white/60 uppercase">{getTeamObj(innings1TeamId).name}</p>
                            <p className="font-numbers text-4xl font-black text-[#00F0FF]">{countingRuns.inn1}</p>
                            <p className="text-[8px] text-white/40">
                              {match.config.innings1Wickets || 0} wickets
                            </p>
                          </div>
                          <div className="p-6 rounded-[32px] bg-white/5 border border-white/10 text-center space-y-3">
                            <p className="text-[10px] font-black text-white/60 uppercase">{getTeamObj(innings2TeamId).name}</p>
                            <p className="font-numbers text-4xl font-black text-[#00F0FF]">{countingRuns.inn2}</p>
                            <p className="text-[8px] text-white/40">
                              {match.liveScore.wickets || 0} wickets
                            </p>
                          </div>
                        </div>

                        {/* Heroes of the Match Section */}
                        {(() => {
                          const motm = calculateMOTM();
                          const topScorer = [...(match.teams.teamA.squad || []), ...(match.teams.teamB.squad || [])].reduce((best, p) => (p.runs || 0) > (best.runs || 0) ? p : best, {});
                          const bestBowler = [...(match.teams.teamA.squad || []), ...(match.teams.teamB.squad || [])].reduce((best, p) => (p.wickets || 0) > (best.wickets || 0) ? p : best, {});

                          return (
                            <div className="space-y-4">
                              <h3 className="text-[12px] font-black text-[#FFD600] uppercase tracking-[0.2em]">Heroes of the Match</h3>

                              {/* MOTM Card - Large */}
                              {motm?.name && (
                                <div className="p-6 rounded-[24px] bg-gradient-to-br from-[#FFD600]/20 to-[#FF6D00]/10 border border-[#FFD600]/30 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-[#FFD600] uppercase">Man of the Match</p>
                                    <Trophy size={16} className="text-[#FFD600]" />
                                  </div>
                                  <div className="space-y-2">
                                    <p className="text-[14px] font-black text-white">{motm.name}</p>
                                    <p className="text-[9px] text-white/50">{getTeamObj(motm.teamId || innings1TeamId).name}</p>
                                    <div className="flex gap-2 pt-1">
                                      {motm.runs !== undefined && <span className="text-[10px] font-numbers text-[#00F0FF]">{motm.runs}R</span>}
                                      {motm.wickets !== undefined && <span className="text-[10px] font-numbers text-[#FF6D00]">{motm.wickets}W</span>}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Best Batter & Best Bowler - Side by side */}
                              <div className="grid grid-cols-2 gap-3">
                                {topScorer?.name && (
                                  <div className="p-4 rounded-[20px] bg-white/5 border border-white/10 space-y-2">
                                    <p className="text-[9px] font-black text-[#00F0FF] uppercase">Best Batter</p>
                                    <p className="text-[12px] font-black text-white">{topScorer.name}</p>
                                    <p className="text-[8px] text-white/50">{getTeamObj(topScorer.teamId || innings1TeamId).name}</p>
                                    <div className="flex gap-1 text-[9px] font-numbers pt-1">
                                      <span className="text-[#00F0FF]">{topScorer.runs || 0}R</span>
                                      <span className="text-white/40">{topScorer.balls || 0}B</span>
                                    </div>
                                  </div>
                                )}
                                {bestBowler?.name && (
                                  <div className="p-4 rounded-[20px] bg-white/5 border border-white/10 space-y-2">
                                    <p className="text-[9px] font-black text-[#FF6D00] uppercase">Best Bowler</p>
                                    <p className="text-[12px] font-black text-white">{bestBowler.name}</p>
                                    <p className="text-[8px] text-white/50">{getTeamObj(bestBowler.teamId || innings2TeamId).name}</p>
                                    <div className="flex gap-1 text-[9px] font-numbers pt-1">
                                      <span className="text-[#FF6D00]">{bestBowler.wickets || 0}W</span>
                                      <span className="text-white/40">{bestBowler.runs_conceded || 0}R</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Star Performances Grid */}
                        {(() => {
                          const allPlayers = [...(match.teams.teamA.squad || []), ...(match.teams.teamB.squad || [])]
                            .map(p => ({
                              ...p,
                              impact: (p.runs || 0) + (p.wickets || 0) * 25 + (p.catches || 0) * 10 + (p.stumpings || 0) * 10 + (p.run_outs || 0) * 10
                            }))
                            .sort((a, b) => b.impact - a.impact)
                            .slice(0, 4);

                          return allPlayers.length > 0 ? (
                            <div className="space-y-3">
                              <h3 className="text-[12px] font-black text-[#FFD600] uppercase tracking-[0.2em]">Star Performances</h3>
                              <div className="grid grid-cols-2 gap-3">
                                {allPlayers.map((player) => (
                                  <div key={player.id} className="p-3 rounded-[16px] bg-white/5 border border-white/10 space-y-1">
                                    <p className="text-[10px] font-black text-white truncate">{player.name}</p>
                                    <p className="text-[8px] text-white/60">{getTeamObj(player.teamId || innings1TeamId).name}</p>
                                    <div className="flex gap-1 text-[8px] font-numbers text-[#00F0FF]">
                                      {player.runs > 0 && <span>{player.runs}R</span>}
                                      {player.wickets > 0 && <span>{player.wickets}W</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null;
                        })()}
                      </motion.div>
                    )}

                    {/* SCORECARD TAB */}
                    {summaryTab === 'SCORECARD' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                      >
                        {/* Innings 1 */}
                        <div className="space-y-3">
                          <button className="w-full p-3 rounded-[16px] bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-left">
                            <p className="text-[11px] font-black text-[#00F0FF] uppercase">{getTeamObj(innings1TeamId).name}</p>
                            <p className="text-[9px] text-white/40 mt-1">{countingRuns.inn1}/{match.config.innings1Wickets || 0}</p>
                          </button>
                          <div className="space-y-2">
                            {(getTeamObj(innings1TeamId).squad || []).map((player) => (
                              <div key={player.id} className="p-3 rounded-[16px] bg-white/5 border border-white/10">
                                <div className="flex justify-between items-start mb-1">
                                  <div>
                                    <p className="text-[9px] font-black text-white">{player.name}</p>
                                    <p className="text-[8px] text-white/40">{player.isOut ? getWicketDetail(player, 1) : 'not out'}</p>
                                  </div>
                                  <p className="text-[9px] font-numbers text-[#00F0FF]">{player.runs || 0}({player.balls || 0})</p>
                                </div>
                                <div className="flex gap-2 text-[8px] text-white/40">
                                  {player.fours > 0 && <span>{player.fours}x4</span>}
                                  {player.sixes > 0 && <span>{player.sixes}x6</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Innings 2 */}
                        <div className="space-y-3">
                          <button className="w-full p-3 rounded-[16px] bg-[#39FF14]/10 border border-[#39FF14]/20 text-left">
                            <p className="text-[11px] font-black text-[#39FF14] uppercase">{getTeamObj(innings2TeamId).name}</p>
                            <p className="text-[9px] text-white/40 mt-1">{countingRuns.inn2}/{match.liveScore.wickets || 0}</p>
                          </button>
                          <div className="space-y-2">
                            {(getTeamObj(innings2TeamId).squad || []).map((player) => (
                              <div key={player.id} className="p-3 rounded-[16px] bg-white/5 border border-white/10">
                                <div className="flex justify-between items-start mb-1">
                                  <div>
                                    <p className="text-[9px] font-black text-white">{player.name}</p>
                                    <p className="text-[8px] text-white/40">{player.isOut ? getWicketDetail(player, 2) : 'not out'}</p>
                                  </div>
                                  <p className="text-[9px] font-numbers text-[#39FF14]">{player.runs || 0}({player.balls || 0})</p>
                                </div>
                                <div className="flex gap-2 text-[8px] text-white/40">
                                  {player.fours > 0 && <span>{player.fours}x4</span>}
                                  {player.sixes > 0 && <span>{player.sixes}x6</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Bowlers Section */}
                        <div className="space-y-3 pt-4 border-t border-white/10">
                          <h4 className="text-[10px] font-black text-[#00F0FF] uppercase">Bowling</h4>
                          {(getTeamObj(innings2TeamId).squad || []).filter(p => (p.wickets || 0) > 0 || (p.balls_bowled || 0) > 0).map((player) => (
                            <div key={player.id} className="p-3 rounded-[16px] bg-white/5 border border-white/10 text-[8px]">
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="font-black text-white">{player.name}</p>
                                  <p className="text-white/40">{Math.floor((player.balls_bowled || 0) / 6)}.{(player.balls_bowled || 0) % 6}</p>
                                </div>
                                <p className="font-numbers text-[#FF6D00]">{player.wickets || 0}-{player.runs_conceded || 0}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* COMMS TAB */}
                    {summaryTab === 'COMMS' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        {(() => {
                          const comms = (match.history || [])
                            .sort((a, b) => {
                              if (b.innings !== a.innings) return b.innings - a.innings;
                              if (b.overNumber !== a.overNumber) return b.overNumber - a.overNumber;
                              return (b.ballNumber || 0) - (a.ballNumber || 0);
                            })
                            .reduce((acc, ball) => {
                              const ballNum = `${ball.overNumber}.${ball.ballNumber}`;
                              let desc = '';
                              if (ball.isWicket) {
                                desc = `WICKET - ${ball.wicketType || 'out'}`;
                              } else if (ball.runsScored) {
                                desc = `${ball.runsScored} runs`;
                              } else if (ball.type === 'WD') {
                                desc = 'Wide';
                              } else if (ball.type === 'NB') {
                                desc = 'No Ball';
                              } else {
                                desc = 'Dot';
                              }
                              acc.push({ ballNum, desc, innings: ball.innings });
                              return acc;
                            }, [] as any[]);

                          const groupedByOver = comms.reduce((acc, c) => {
                            const key = `Innings ${c.innings} - Over ${Math.floor(parseFloat(c.ballNum))}`;
                            if (!acc[key]) acc[key] = [];
                            acc[key].push(c);
                            return acc;
                          }, {} as Record<string, any[]>);

                          return (
                            <>
                              {Object.entries(groupedByOver).map(([overKey, balls]) => (
                                <div key={overKey} className="space-y-2">
                                  <p className="text-[9px] font-black text-[#00F0FF] uppercase">{overKey}</p>
                                  {balls.map((ball, idx) => (
                                    <div key={idx} className="p-2 rounded-[12px] bg-white/5 border border-white/10">
                                      <p className="text-[8px] text-white/60">{ball.ballNum}</p>
                                      <p className="text-[9px] font-black text-white">{ball.desc}</p>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </>
                          );
                        })()}
                      </motion.div>
                    )}

                    {/* ANALYSIS TAB */}
                    {summaryTab === 'ANALYSIS' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                      >
                        {(() => {
                          const inn1History = (match.history || []).filter(b => b.innings === 1);
                          const inn2History = (match.history || []).filter(b => b.innings === 2);

                          // Build per-over data
                          const buildPerOverData = (history: any[]) => {
                            const overs: {over: string, runs: number}[] = [];
                            let currentOver = -1;
                            let currentRuns = 0;
                            history.forEach(b => {
                              if (b.overNumber !== currentOver) {
                                if (currentOver >= 0) overs.push({ over: `${currentOver}`, runs: currentRuns });
                                currentOver = b.overNumber;
                                currentRuns = 0;
                              }
                              currentRuns += b.runsScored || 0;
                              if (b.type === 'WD' || b.type === 'NB') currentRuns += 1;
                            });
                            if (currentOver >= 0) overs.push({ over: `${currentOver}`, runs: currentRuns });
                            return overs;
                          };

                          // Build cumulative data
                          const buildCumulativeData = (history: any[]) => {
                            const overs: {over: string, cumulative: number}[] = [];
                            let currentOver = -1;
                            let cumulative = 0;
                            let currentRuns = 0;
                            history.forEach(b => {
                              if (b.overNumber !== currentOver) {
                                if (currentOver >= 0) {
                                  cumulative += currentRuns;
                                  overs.push({ over: `${currentOver}`, cumulative });
                                }
                                currentOver = b.overNumber;
                                currentRuns = 0;
                              }
                              currentRuns += b.runsScored || 0;
                              if (b.type === 'WD' || b.type === 'NB') currentRuns += 1;
                            });
                            if (currentOver >= 0) {
                              cumulative += currentRuns;
                              overs.push({ over: `${currentOver}`, cumulative });
                            }
                            return overs;
                          };

                          // Build scoring breakdown
                          const buildScoringBreakdown = (history: any[]) => {
                            const counts = {
                              'Dots': 0,
                              '1s': 0,
                              '2s': 0,
                              '3s': 0,
                              '4s': 0,
                              '6s': 0,
                              'Extras': 0
                            };
                            history.forEach(b => {
                              const isExtra = b.type === 'WD' || b.type === 'NB' || b.type === 'BYE' || b.type === 'LB';
                              if (isExtra) {
                                if (b.type === 'WD' || b.type === 'NB') counts['Extras'] += 1 + (b.runsScored || 0);
                                else counts['Extras'] += (b.runsScored || 0);
                              } else {
                                if (b.runsScored === 0) counts['Dots']++;
                                else if (b.runsScored === 1) counts['1s']++;
                                else if (b.runsScored === 2) counts['2s']++;
                                else if (b.runsScored === 3) counts['3s']++;
                                else if (b.runsScored === 4) counts['4s']++;
                                else if (b.runsScored === 6) counts['6s']++;
                              }
                            });
                            return Object.entries(counts).map(([type, count]) => ({ type, count }));
                          };

                          // Build wicket timeline
                          const buildWicketData = (history: any[]) => {
                            const data: {over: string, wickets: number}[] = [];
                            let currentOver = -1;
                            let wickets = 0;
                            history.forEach(b => {
                              if (b.overNumber !== currentOver) {
                                if (currentOver >= 0) data.push({ over: `${currentOver}`, wickets });
                                currentOver = b.overNumber;
                                wickets = 0;
                              }
                              if (b.isWicket) wickets++;
                            });
                            if (currentOver >= 0) data.push({ over: `${currentOver}`, wickets });
                            return data;
                          };

                          // Combine data for overlaid charts
                          const buildManhattanData = () => {
                            const inn1 = buildPerOverData(inn1History);
                            const inn2 = buildPerOverData(inn2History);
                            const maxOvers = Math.max(inn1.length, inn2.length);
                            const combined = [];
                            for (let i = 0; i < maxOvers; i++) {
                              combined.push({
                                over: `${i}`,
                                inn1Runs: inn1[i]?.runs || 0,
                                inn2Runs: inn2[i]?.runs || 0
                              });
                            }
                            return combined;
                          };

                          const buildRunProgressionData = () => {
                            const inn1 = buildCumulativeData(inn1History);
                            const inn2 = buildCumulativeData(inn2History);
                            const maxOvers = Math.max(inn1.length, inn2.length);
                            const combined = [];
                            for (let i = 0; i < maxOvers; i++) {
                              combined.push({
                                over: `${i}`,
                                inn1Cumulative: inn1[i]?.cumulative || 0,
                                inn2Cumulative: inn2[i]?.cumulative || 0
                              });
                            }
                            return combined;
                          };

                          const inn1Data = buildPerOverData(inn1History);
                          const inn2Data = buildPerOverData(inn2History);
                          const inn1Cumulative = buildCumulativeData(inn1History);
                          const inn2Cumulative = buildCumulativeData(inn2History);
                          const inn1Scoring = buildScoringBreakdown(inn1History);
                          const inn2Scoring = buildScoringBreakdown(inn2History);
                          const inn1Wickets = buildWicketData(inn1History);
                          const inn2Wickets = buildWicketData(inn2History);
                          const manhattanData = buildManhattanData();
                          const runProgressionData = buildRunProgressionData();

                          return (
                            <div className="space-y-6">
                              {/* CHART 1: MANHATTAN */}
                              {manhattanData.length > 0 && (
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-[20px] p-4 space-y-3">
                                  <p className="text-[11px] font-black text-white/70 uppercase tracking-[0.15em]">Manhattan</p>
                                  <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={manhattanData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                      <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                                      <XAxis dataKey="over" stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                                      <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                                      <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#fff', fontSize: 11 }} itemStyle={{ fontSize: 10 }} />
                                      <Bar dataKey="inn1Runs" fill="#00F0FF" />
                                      <Bar dataKey="inn2Runs" fill="#39FF14" />
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              )}

                              {/* CHART 2: WORM (Run Progression) */}
                              {runProgressionData.length > 0 && (
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-[20px] p-4 space-y-3">
                                  <p className="text-[11px] font-black text-white/70 uppercase tracking-[0.15em]">Run Progression</p>
                                  <ResponsiveContainer width="100%" height={200}>
                                    <AreaChart data={runProgressionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                      <defs>
                                        <linearGradient id="gradInn1" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.3}/>
                                          <stop offset="95%" stopColor="#00F0FF" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="gradInn2" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor="#39FF14" stopOpacity={0.3}/>
                                          <stop offset="95%" stopColor="#39FF14" stopOpacity={0}/>
                                        </linearGradient>
                                      </defs>
                                      <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                                      <XAxis dataKey="over" stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                                      <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                                      <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#fff', fontSize: 11 }} itemStyle={{ fontSize: 10 }} />
                                      <Area type="monotone" dataKey="inn1Cumulative" stroke="#00F0FF" fill="url(#gradInn1)" />
                                      <Area type="monotone" dataKey="inn2Cumulative" stroke="#39FF14" fill="url(#gradInn2)" />
                                    </AreaChart>
                                  </ResponsiveContainer>
                                </div>
                              )}

                              {/* CHART 3: RUN RATE PER OVER */}
                              {(() => {
                                const buildRRData = () => {
                                  const inn1 = buildPerOverData(inn1History);
                                  const inn2 = buildPerOverData(inn2History);
                                  const maxOvers = Math.max(inn1.length, inn2.length);
                                  const combined = [];
                                  let inn1Total = 0, inn2Total = 0;
                                  for (let i = 0; i < maxOvers; i++) {
                                    inn1Total += inn1[i]?.runs || 0;
                                    inn2Total += inn2[i]?.runs || 0;
                                    combined.push({
                                      over: `${i + 1}`,
                                      inn1CRR: i >= 0 && inn1[i] ? +((inn1Total / (i + 1)).toFixed(2)) : null,
                                      inn2CRR: i >= 0 && inn2[i] ? +((inn2Total / (i + 1)).toFixed(2)) : null,
                                    });
                                  }
                                  return combined;
                                };
                                const rrData = buildRRData();
                                return rrData.length > 0 ? (
                                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-[20px] p-4 space-y-3">
                                    <p className="text-[11px] font-black text-white/70 uppercase tracking-[0.15em]">Run Rate</p>
                                    <ResponsiveContainer width="100%" height={200}>
                                      <LineChart data={rrData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                                        <XAxis dataKey="over" stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                                        <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                                        <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#fff', fontSize: 11 }} itemStyle={{ fontSize: 10 }} />
                                        <Line type="monotone" dataKey="inn1CRR" stroke="#00F0FF" strokeWidth={2} dot={{ r: 3, fill: '#00F0FF' }} name={getTeamObj(innings1TeamId).name} connectNulls />
                                        <Line type="monotone" dataKey="inn2CRR" stroke="#39FF14" strokeWidth={2} dot={{ r: 3, fill: '#39FF14' }} name={getTeamObj(innings2TeamId).name} connectNulls />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                ) : null;
                              })()}

                              {/* CHART 4: SCORING BREAKDOWN */}
                              {(inn1Scoring.length > 0 || inn2Scoring.length > 0) && (
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-[20px] p-4 space-y-3">
                                  <p className="text-[11px] font-black text-white/70 uppercase tracking-[0.15em]">Scoring Breakdown</p>
                                  <div className="grid grid-cols-1 gap-4">
                                    {/* Innings 1 */}
                                    <div>
                                      <p className="text-[9px] text-white/60 mb-2">{getTeamObj(innings1TeamId).name}</p>
                                      <ResponsiveContainer width="100%" height={120}>
                                        <BarChart data={inn1Scoring} layout="vertical" margin={{ top: 5, right: 10, left: 40, bottom: 5 }}>
                                          <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                                          <XAxis type="number" stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 9 }} />
                                          <YAxis dataKey="type" type="category" stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 9 }} />
                                          <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#fff', fontSize: 10 }} />
                                          <Bar dataKey="count" fill="#00F0FF" />
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                    {/* Innings 2 */}
                                    <div>
                                      <p className="text-[9px] text-white/60 mb-2">{getTeamObj(innings2TeamId).name}</p>
                                      <ResponsiveContainer width="100%" height={120}>
                                        <BarChart data={inn2Scoring} layout="vertical" margin={{ top: 5, right: 10, left: 40, bottom: 5 }}>
                                          <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                                          <XAxis type="number" stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 9 }} />
                                          <YAxis dataKey="type" type="category" stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 9 }} />
                                          <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#fff', fontSize: 10 }} />
                                          <Bar dataKey="count" fill="#39FF14" />
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* CHART 5: WICKET MAP */}
                              {(inn1Wickets.length > 0 || inn2Wickets.length > 0) && (
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-[20px] p-4 space-y-3">
                                  <p className="text-[11px] font-black text-white/70 uppercase tracking-[0.15em]">Wicket Map</p>
                                  <div className="grid grid-cols-1 gap-4">
                                    {/* Innings 1 */}
                                    <div>
                                      <p className="text-[9px] text-white/60 mb-2">{getTeamObj(innings1TeamId).name}</p>
                                      <ResponsiveContainer width="100%" height={100}>
                                        <BarChart data={inn1Wickets} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                          <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                                          <XAxis dataKey="over" stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 9 }} />
                                          <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 9 }} />
                                          <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#fff', fontSize: 10 }} />
                                          <Bar dataKey="wickets" fill="#FF6D00" />
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                    {/* Innings 2 */}
                                    <div>
                                      <p className="text-[9px] text-white/60 mb-2">{getTeamObj(innings2TeamId).name}</p>
                                      <ResponsiveContainer width="100%" height={100}>
                                        <BarChart data={inn2Wickets} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                          <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                                          <XAxis dataKey="over" stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 9 }} />
                                          <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 9 }} />
                                          <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#fff', fontSize: 10 }} />
                                          <Bar dataKey="wickets" fill="#FF6D00" />
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </motion.div>
                    )}

                    {/* MVP TAB */}
                    {summaryTab === 'MVP' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3"
                      >
                        {(() => {
                          const mvpList = [...(match.teams.teamA.squad || []), ...(match.teams.teamB.squad || [])]
                            .map(p => ({
                              ...p,
                              impact: (p.runs || 0) + (p.wickets || 0) * 25 + (p.catches || 0) * 10 + (p.stumpings || 0) * 10 + (p.run_outs || 0) * 10
                            }))
                            .sort((a, b) => b.impact - a.impact);

                          return mvpList.map((player, idx) => (
                            <div key={player.id} className="p-4 rounded-[16px] bg-white/5 border border-white/10 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#00F0FF]/20 flex items-center justify-center">
                                <p className="text-[10px] font-black text-[#00F0FF]">#{idx + 1}</p>
                              </div>
                              <div className="flex-1">
                                <p className="text-[10px] font-black text-white">{player.name}</p>
                                <p className="text-[8px] text-white/60">{getTeamObj(player.teamId || innings1TeamId).name}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[11px] font-black text-[#FFD600]">{Math.round(player.impact)}</p>
                                <p className="text-[7px] text-white/40">impact</p>
                              </div>
                            </div>
                          ));
                        })()}
                      </motion.div>
                    )}

                    {/* Action Buttons - Bottom */}
                    <div className="space-y-3 pt-6 border-t border-white/10">
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowShareSheet(true)}
                        className="w-full py-4 rounded-[20px] bg-gradient-to-r from-[#00F0FF] to-[#39FF14] text-black font-black uppercase text-[12px] tracking-[0.2em] flex items-center justify-center gap-2 transition-all shadow-[0_0_30px_rgba(0,240,255,0.2)]"
                      >
                        <Share2 size={16} />
                        Share
                      </motion.button>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const freshState = createInitialState();
                            localStorage.setItem('22YARDS_ACTIVE_MATCH', JSON.stringify(freshState));
                            setMatch(freshState);
                            setStatus('CONFIG');
                            setWinnerTeam(null);
                            setSelectionTarget(null);
                            setConfigStep(1);
                            setVsRevealed(false);
                            setOverlayAnim(null);
                            setSummaryTab('SUMMARY');
                            setShowShareSheet(false);
                            setFireMode(false);
                            setFireModeBanner(false);
                            setFireModeDeclined(false);
                            setIceMode(false);
                            setIceModeBanner(false);
                            setIceModeDeclined(false);
                            setSummaryPhase('SKELETON');
                            setScorecardReady(false);
                            setPendingExtra(null);
                            isProcessingBall.current = false;
                          }}
                          className="flex-1 py-3 rounded-[16px] bg-[#00F0FF]/10 border border-[#00F0FF]/30 text-[#00F0FF] font-black uppercase text-[10px] tracking-[0.15em] flex items-center justify-center gap-2 active:scale-95 transition-all"
                        >
                          <Swords size={14} />
                          New Match
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            localStorage.setItem('22YARDS_ACTIVE_MATCH', JSON.stringify({ ...match, status: 'COMPLETED' }));
                            onBack();
                          }}
                          className="flex-1 py-3 rounded-[16px] bg-white/5 border border-white/10 text-white/40 font-black uppercase text-[10px] tracking-[0.15em] flex items-center justify-center gap-2 active:scale-95 transition-all"
                        >
                          <ChevronLeft size={14} />
                          Dugout
                        </button>
                      </div>

                      {/* Quick-nav to Performance Hub & Personal Archive */}
                      {onNavigate && (
                        <div className="flex gap-3 mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.setItem('22YARDS_ACTIVE_MATCH', JSON.stringify({ ...match, status: 'COMPLETED' }));
                              onNavigate('PERFORMANCE');
                            }}
                            className="flex-1 py-3 rounded-[16px] bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] font-black uppercase text-[10px] tracking-[0.15em] flex items-center justify-center gap-2 active:scale-95 transition-all"
                          >
                            <BarChart2 size={14} />
                            Performance Hub
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              localStorage.setItem('22YARDS_ACTIVE_MATCH', JSON.stringify({ ...match, status: 'COMPLETED' }));
                              onNavigate('HISTORY');
                            }}
                            className="flex-1 py-3 rounded-[16px] bg-[#FFD600]/10 border border-[#FFD600]/30 text-[#FFD600] font-black uppercase text-[10px] tracking-[0.15em] flex items-center justify-center gap-2 active:scale-95 transition-all"
                          >
                            <History size={14} />
                            Personal Archive
                          </button>
                        </div>
                      )}

                      {/* Share Match Record Link (offline cross-device) */}
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const vault = JSON.parse(localStorage.getItem('22YARDS_GLOBAL_VAULT') || '{}');
                            // Build a compact shareable payload with all player records from this match
                            const matchRecords: any[] = [];
                            Object.keys(vault).forEach(phone => {
                              const entry = vault[phone];
                              const matchRec = (entry.history || []).find((h: any) => h.id === match.matchId);
                              if (matchRec) matchRecords.push({ phone, name: entry.name, record: matchRec });
                            });
                            if (matchRecords.length === 0) return;
                            const payload = { matchId: match.matchId, records: matchRecords, ts: Date.now() };
                            const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
                            const url = `${window.location.origin}${window.location.pathname}?importMatch=${b64}`;
                            if (navigator.share) {
                              navigator.share({ title: '22 Yards Match Record', text: 'Import this match to your 22 Yards app', url });
                            } else {
                              navigator.clipboard.writeText(url);
                              setTransferLinkCopied(true);
                              setTimeout(() => setTransferLinkCopied(false), 2000);
                            }
                          } catch (_) {}
                        }}
                        className="w-full py-3 rounded-[16px] bg-[#BC13FE]/10 border border-[#BC13FE]/30 text-[#BC13FE] font-black uppercase text-[10px] tracking-[0.15em] flex items-center justify-center gap-2 active:scale-95 transition-all mt-2"
                      >
                        <Share2 size={14} />
                        {transferLinkCopied ? 'Link Copied!' : 'Share Match Record to Players'}
                      </button>
                    </div>

                    {/* Share Bottom Sheet */}
                    <AnimatePresence>
                      {showShareSheet && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => setShowShareSheet(false)}
                          className="fixed inset-0 z-[5000] bg-black/80 backdrop-blur-sm flex items-end justify-center"
                        >
                          <motion.div
                            initial={{ y: 300, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 300, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-md bg-[#0A0A0A] border-t border-white/10 rounded-t-[32px] p-6 pb-10 space-y-4"
                          >
                            {/* Handle bar */}
                            <div className="flex justify-center">
                              <div className="w-10 h-1 rounded-full bg-white/20" />
                            </div>
                            <h3 className="text-[13px] font-black text-white uppercase tracking-[0.2em] text-center">Share Match</h3>

                            <div className="space-y-2">
                              {/* Share Full Scorecard PDF */}
                              <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={() => { setShowShareSheet(false); generateScorecardPDF(); }}
                                disabled={isCapturing}
                                className="w-full p-4 rounded-[16px] bg-white/5 border border-white/10 flex items-center gap-4 active:bg-white/10 transition-all disabled:opacity-50"
                              >
                                <div className="w-10 h-10 rounded-full bg-[#39FF14]/15 flex items-center justify-center">
                                  <ClipboardList size={18} className="text-[#39FF14]" />
                                </div>
                                <div className="text-left">
                                  <p className="text-[11px] font-black text-white uppercase tracking-[0.1em]">{isCapturing ? 'Generating...' : 'Full Scorecard PDF'}</p>
                                  <p className="text-[9px] text-white/40 mt-0.5">Download or share detailed scorecard</p>
                                </div>
                              </motion.button>

                              {/* Share to WhatsApp */}
                              <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={() => {
                                  setShowShareSheet(false);
                                  const followUrl = `${window.location.origin}${window.location.pathname}?watch=${match.matchId}`;
                                  const result = winnerTeam ? `${winnerTeam.name} ${winnerTeam.margin}` : 'Match Complete';
                                  const text = `*${match.teams.teamA.name} vs ${match.teams.teamB.name}*\n\n${result}\n\nFull Scorecard: ${followUrl}\n\n_Scored on 22 Yards_`;
                                  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
                                }}
                                className="w-full p-4 rounded-[16px] bg-white/5 border border-white/10 flex items-center gap-4 active:bg-white/10 transition-all"
                              >
                                <div className="w-10 h-10 rounded-full bg-[#25D366]/15 flex items-center justify-center">
                                  <Share2 size={18} className="text-[#25D366]" />
                                </div>
                                <div className="text-left">
                                  <p className="text-[11px] font-black text-white uppercase tracking-[0.1em]">Share on WhatsApp</p>
                                  <p className="text-[9px] text-white/40 mt-0.5">Send result with match link</p>
                                </div>
                              </motion.button>

                              {/* Copy Link */}
                              <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={() => {
                                  const followUrl = `${window.location.origin}${window.location.pathname}?watch=${match.matchId}`;
                                  navigator.clipboard.writeText(followUrl);
                                  setShareCopied(true);
                                  setTimeout(() => { setShareCopied(false); setShowShareSheet(false); }, 1200);
                                }}
                                className="w-full p-4 rounded-[16px] bg-white/5 border border-white/10 flex items-center gap-4 active:bg-white/10 transition-all"
                              >
                                <div className="w-10 h-10 rounded-full bg-[#00F0FF]/15 flex items-center justify-center">
                                  {shareCopied ? <Check size={18} className="text-[#39FF14]" /> : <Coins size={18} className="text-[#00F0FF]" />}
                                </div>
                                <div className="text-left">
                                  <p className="text-[11px] font-black text-white uppercase tracking-[0.1em]">{shareCopied ? 'Link Copied!' : 'Copy Match Link'}</p>
                                  <p className="text-[9px] text-white/40 mt-0.5">Copy scorecard URL to clipboard</p>
                                </div>
                              </motion.button>
                            </div>
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </div>
            </div>
          </>
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
                      className="w-full px-3 py-3 min-h-[48px] rounded-[12px] bg-white/10 border border-white/20 text-[13px] text-white placeholder:text-white/40 outline-none"
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
                    type="tel"
                    inputMode="numeric"
                    placeholder="Phone (10 digits)"
                    value={phoneQuery}
                    onChange={(e) => setPhoneQuery(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    maxLength={10}
                    className="w-full px-3 py-3 min-h-[48px] rounded-[12px] bg-white/10 border border-white/20 text-[13px] text-white placeholder:text-white/40 outline-none"
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
                      ? 'bg-white/5 text-white/40 pointer-events-none'
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
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-black text-[#00F0FF] uppercase tracking-[0.2em]">Batting</p>
                  <button
                    onClick={() => { setShowLiveScorecard(false); setShowAddPlayer({ open: true, team: 'batting' }); }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#00F0FF]/10 border border-[#00F0FF]/30 text-[#00F0FF] text-[9px] font-black uppercase tracking-wider active:scale-95 transition-all"
                  >
                    <UserPlus size={12} />
                    Add Player
                  </button>
                </div>
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
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-black text-[#39FF14] uppercase tracking-[0.2em]">Bowling</p>
                  <button
                    onClick={() => { setShowLiveScorecard(false); setShowAddPlayer({ open: true, team: 'bowling' }); }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] text-[9px] font-black uppercase tracking-wider active:scale-95 transition-all"
                  >
                    <UserPlus size={12} />
                    Add Player
                  </button>
                </div>
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

      {/* MATCH SETTINGS MODAL (mid-match) */}
      <AnimatePresence>
        {showMatchSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setShowMatchSettings(false); setAbandonConfirm(false); setAbandonReason(''); }}
            className="fixed inset-0 z-[5000] bg-black/90 flex items-end justify-center"
          >
            <motion.div
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-[#0A0A0A] border-t border-white/10 rounded-t-[32px] p-6 space-y-5"
            >
              {/* Handle bar */}
              <div className="flex justify-center">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg uppercase italic text-[#00F0FF]">Match Settings</h3>
                <button onClick={() => { setShowMatchSettings(false); setAbandonConfirm(false); setAbandonReason(''); }} className="p-2 text-white/40 hover:text-white"><X size={18} /></button>
              </div>

              {/* TRANSFER SCORING — Device Handoff */}
              <button
                onClick={() => { setShowMatchSettings(false); openTransferModal(); }}
                className="w-full py-4 rounded-[20px] bg-[#00F0FF]/10 border border-[#00F0FF]/30 text-[#00F0FF] font-black text-[12px] uppercase tracking-wider hover:bg-[#00F0FF]/20 transition-all flex items-center justify-center gap-3"
              >
                <Smartphone size={18} />
                Transfer Scoring to Another Device
              </button>
              {match.config.scorerName && (
                <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider text-center">Current scorer: {match.config.scorerName}</p>
              )}

              {/* DIVIDER */}
              <div className="h-px bg-white/10" />

              {/* ABANDON MATCH */}
              {!abandonConfirm ? (
                <button
                  onClick={() => setAbandonConfirm(true)}
                  className="w-full py-4 rounded-[20px] bg-[#FF003C]/10 border border-[#FF003C]/30 text-[#FF003C] font-black text-[12px] uppercase tracking-wider hover:bg-[#FF003C]/20 transition-all flex items-center justify-center gap-3"
                >
                  <ShieldAlert size={18} />
                  Abandon Match
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3 p-4 rounded-[20px] bg-[#FF003C]/5 border border-[#FF003C]/20"
                >
                  <div className="flex items-center gap-2 text-[#FF003C]">
                    <ShieldAlert size={16} />
                    <span className="text-[11px] font-black uppercase tracking-wider">Are you sure?</span>
                  </div>
                  <p className="text-[10px] text-white/50">This action cannot be undone. The match will be recorded as abandoned.</p>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.15em]">Reason (optional)</label>
                    <select
                      value={abandonReason}
                      onChange={(e) => setAbandonReason(e.target.value)}
                      className="w-full px-4 py-3 rounded-[12px] bg-white/5 border border-white/10 text-white text-[12px] focus:outline-none focus:border-[#FF003C]/50 appearance-none"
                    >
                      <option value="">Select reason...</option>
                      <option value="Rain / Bad weather">Rain / Bad weather</option>
                      <option value="Bad light">Bad light</option>
                      <option value="Player injury">Player injury</option>
                      <option value="Unplayable pitch">Unplayable pitch</option>
                      <option value="Mutual agreement">Mutual agreement</option>
                      <option value="Insufficient players">Insufficient players</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => { setAbandonConfirm(false); setAbandonReason(''); }}
                      className="flex-1 py-3 rounded-[16px] bg-white/5 border border-white/10 text-white text-[11px] font-black uppercase tracking-wider hover:bg-white/10 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAbandonMatch}
                      className="flex-1 py-3 rounded-[16px] bg-[#FF003C] text-white text-[11px] font-black uppercase tracking-wider hover:bg-[#FF003C]/90 transition-all active:scale-[0.98]"
                    >
                      Confirm Abandon
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ADD PLAYER MID-MATCH MODAL */}
      <AnimatePresence>
        {showAddPlayer.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setShowAddPlayer({ open: false, team: null }); setAddPlayerName(''); setAddPlayerPhone(''); }}
            className="fixed inset-0 z-[5000] bg-black/90 flex items-end justify-center"
          >
            <motion.div
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-[#0A0A0A] border-t border-white/10 rounded-t-[32px] p-6 space-y-5"
            >
              {/* Handle bar */}
              <div className="flex justify-center">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg uppercase italic text-[#00F0FF]">
                  Add to {showAddPlayer.team === 'batting' ? 'Batting' : 'Bowling'} Team
                </h3>
                <button
                  onClick={() => { setShowAddPlayer({ open: false, team: null }); setAddPlayerName(''); setAddPlayerPhone(''); }}
                  className="p-2 text-white/40 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Player Name */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-white/50 uppercase tracking-[0.15em]">Player Name *</label>
                <input
                  type="text"
                  value={addPlayerName}
                  onChange={(e) => setAddPlayerName(e.target.value)}
                  placeholder="Enter player name"
                  className="w-full px-4 py-3 rounded-[16px] bg-white/5 border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-[#00F0FF]/50"
                  autoFocus
                />
              </div>

              {/* Phone Number */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-white/50 uppercase tracking-[0.15em]">Phone Number (10 digits)</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={addPlayerPhone}
                  onChange={(e) => setAddPlayerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  maxLength={10}
                  placeholder="Enter 10-digit number"
                  className="w-full px-4 py-3 rounded-[16px] bg-white/5 border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-[#00F0FF]/50"
                />
              </div>

              {/* Add Button */}
              <button
                onClick={handleAddPlayerMidMatch}
                disabled={!addPlayerName.trim() || (addPlayerPhone.length > 0 && addPlayerPhone.length !== 10)}
                className={`w-full py-4 rounded-[20px] font-black text-[13px] uppercase tracking-wider transition-all ${
                  addPlayerName.trim() && !(addPlayerPhone.length > 0 && addPlayerPhone.length !== 10)
                    ? 'bg-[#00F0FF] text-black active:scale-[0.98]'
                    : 'bg-white/5 text-white/20 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <UserPlus size={16} />
                  Add Player
                </div>
              </button>
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
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={closeQRScanner}
            className="fixed inset-0 z-[8000] bg-black/95 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 28, stiffness: 350, mass: 0.8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#0A0A0A] border border-white/10 rounded-[32px] overflow-hidden"
            >
              {/* Header */}
              <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-9 h-9 rounded-full bg-[#00F0FF]/10 flex items-center justify-center"
                  >
                    <Camera size={16} className="text-[#00F0FF]" />
                  </motion.div>
                  <div>
                    <h3 className="font-heading text-base uppercase italic text-[#00F0FF]">QR Scanner</h3>
                    <p className="text-[8px] text-white/30 uppercase tracking-widest">Scan player ID</p>
                  </div>
                </div>
                <button onClick={closeQRScanner} className="p-2 text-white/40 hover:text-white rounded-full hover:bg-white/5 transition-all">
                  <X size={18} />
                </button>
              </div>

              {/* Scanner viewport */}
              <div className="px-5 pb-2">
                <div className="relative w-full aspect-square rounded-[20px] bg-black overflow-hidden">
                  <video ref={qrVideoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline />

                  {/* Corner brackets instead of full border */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-52 h-52 relative">
                      {/* Top-left */}
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-[#00F0FF] rounded-tl-lg" />
                      {/* Top-right */}
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-[#00F0FF] rounded-tr-lg" />
                      {/* Bottom-left */}
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-[#00F0FF] rounded-bl-lg" />
                      {/* Bottom-right */}
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-[#00F0FF] rounded-br-lg" />

                      {/* Animated scan line */}
                      <motion.div
                        animate={{ y: [0, 192, 0] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                        className="absolute left-2 right-2 h-[2px] bg-gradient-to-r from-transparent via-[#00F0FF] to-transparent shadow-[0_0_12px_rgba(0,240,255,0.6)]"
                      />
                    </div>
                  </div>

                  {/* Dim overlay outside scan area */}
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background: 'radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.6) 65%)'
                  }} />
                </div>
              </div>

              {/* Status text */}
              <div className="p-5 pt-3 text-center">
                <motion.p
                  key={qrScanStatus}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`text-[11px] font-bold uppercase tracking-wider ${
                    qrScanStatus === 'SCANNING' ? 'text-white/40' :
                    qrScanStatus === 'SUCCESS' ? 'text-[#39FF14]' : 'text-[#FF003C]'
                  }`}
                >
                  {qrScanStatus === 'SCANNING' ? 'Point camera at QR code' :
                   qrScanStatus === 'SUCCESS' ? 'Player found!' : qrScanError || 'Scan failed'}
                </motion.p>
                {qrScanStatus === 'SCANNING' && (
                  <div className="flex items-center justify-center gap-1.5 mt-2">
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} className="w-1.5 h-1.5 rounded-full bg-[#00F0FF]" />
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }} className="w-1.5 h-1.5 rounded-full bg-[#00F0FF]" />
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }} className="w-1.5 h-1.5 rounded-full bg-[#00F0FF]" />
                  </div>
                )}
              </div>
              <canvas ref={qrCanvasRef} className="hidden" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TRANSFER SCORING MODAL — Device Handoff */}
      <AnimatePresence>
        {showTransferModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setShowTransferModal(false); setTransferStatus('IDLE'); }}
            className="fixed inset-0 z-[6000] bg-black/95 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-[32px] overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#00F0FF]/10 flex items-center justify-center">
                    <Smartphone size={18} className="text-[#00F0FF]" />
                  </div>
                  <div>
                    <h3 className="font-heading text-base uppercase italic text-[#00F0FF]">Transfer Scoring</h3>
                    <p className="text-[9px] text-white/40 uppercase tracking-wider">Hand off to another device</p>
                  </div>
                </div>
                <button onClick={() => { setShowTransferModal(false); setTransferStatus('IDLE'); }} className="p-2 text-white/40 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              {/* Tab Selector */}
              <div className="flex p-2 bg-white/5 mx-5 mt-4 rounded-[16px]">
                <button
                  onClick={() => setTransferTab('HANDOFF')}
                  className={`flex-1 py-2.5 rounded-[12px] text-[11px] font-black uppercase tracking-wider transition-all ${
                    transferTab === 'HANDOFF' ? 'bg-[#00F0FF] text-black' : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  <ArrowLeftRight size={14} className="inline mr-2" />
                  Handoff
                </button>
                <button
                  onClick={() => setTransferTab('SPECTATOR')}
                  className={`flex-1 py-2.5 rounded-[12px] text-[11px] font-black uppercase tracking-wider transition-all ${
                    transferTab === 'SPECTATOR' ? 'bg-[#00F0FF] text-black' : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  <Users size={14} className="inline mr-2" />
                  Spectator Link
                </button>
              </div>

              <div className="p-5 space-y-4">
                {transferTab === 'HANDOFF' ? (
                  <>
                    {/* How it works */}
                    <div className="p-3 rounded-[16px] bg-[#00F0FF]/5 border border-[#00F0FF]/10">
                      <p className="text-[10px] text-[#00F0FF]/70 font-bold uppercase tracking-wider mb-2">How it works</p>
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-white/50">1. Show this QR to the new scorer</p>
                        <p className="text-[11px] text-white/50">2. They scan it with their phone camera</p>
                        <p className="text-[11px] text-white/50">3. They confirm "Take over scoring"</p>
                        <p className="text-[11px] text-white/50">4. Match continues on their device instantly</p>
                      </div>
                    </div>

                    {/* QR Code — encodes full transfer URL with match state */}
                    {(() => {
                      const transferUrl = getTransferUrl();
                      return transferUrl ? (
                        <>
                          <div className="flex justify-center">
                            <div className="bg-white rounded-[20px] p-3 shadow-lg shadow-[#00F0FF]/10">
                              <img
                                src={getQRCodeUrl(transferUrl)}
                                alt="Scan to take over scoring"
                                className="w-48 h-48 rounded-[12px]"
                              />
                            </div>
                          </div>
                          <p className="text-[9px] text-white/30 text-center uppercase tracking-widest">Scan with phone camera or QR app</p>

                          {/* Match info display */}
                          <div className="p-4 rounded-[16px] bg-white/5 border border-white/10 text-center">
                            <p className="text-[9px] text-white/40 uppercase tracking-widest mb-1">Transferring Match</p>
                            <p className="font-heading text-lg text-white">
                              {match.teams?.teamA?.name || 'Team A'} vs {match.teams?.teamB?.name || 'Team B'}
                            </p>
                            <p className="text-[10px] text-[#00F0FF] mt-1">
                              {match.liveScore?.runs || 0}/{match.liveScore?.wickets || 0} ({Math.floor((match.liveScore?.balls || 0) / 6)}.{(match.liveScore?.balls || 0) % 6} ov)
                            </p>
                          </div>

                          {/* Copy link button */}
                          <button
                            onClick={copyTransferLink}
                            className="w-full py-3 rounded-[16px] bg-[#00F0FF] text-black font-black text-[11px] uppercase tracking-wider hover:bg-[#00F0FF]/90 transition-all flex items-center justify-center gap-2"
                          >
                            {transferLinkCopied ? <><Check size={14} /> Link Copied!</> : <><Share2 size={14} /> Copy Transfer Link</>}
                          </button>
                          <p className="text-[9px] text-white/20 text-center">Or share the link via WhatsApp, message, etc.</p>
                        </>
                      ) : (
                        <div className="p-6 text-center">
                          <p className="text-[11px] text-[#FF003C]">Could not generate transfer data. Try again.</p>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    {/* Spectator mode info */}
                    <div className="p-3 rounded-[16px] bg-[#BC13FE]/5 border border-[#BC13FE]/10">
                      <p className="text-[10px] text-[#BC13FE]/70 font-bold uppercase tracking-wider mb-2">Spectator Mode</p>
                      <p className="text-[11px] text-white/50">Share this link so others can watch the match live. They'll see a read-only view of the scores.</p>
                    </div>

                    {/* Spectator QR — just the app URL for now */}
                    <div className="flex justify-center">
                      <div className="bg-white rounded-[20px] p-3 shadow-lg shadow-[#BC13FE]/10">
                        <img
                          src={getQRCodeUrl(`${window.location.origin}`)}
                          alt="Spectator QR"
                          className="w-48 h-48 rounded-[12px]"
                        />
                      </div>
                    </div>

                    {/* Spectator link copy */}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.origin);
                        setTransferLinkCopied(true);
                        setTimeout(() => setTransferLinkCopied(false), 2000);
                      }}
                      className="w-full py-3 rounded-[16px] bg-[#BC13FE] text-white font-black text-[11px] uppercase tracking-wider hover:bg-[#BC13FE]/90 transition-all flex items-center justify-center gap-2"
                    >
                      {transferLinkCopied ? <><Check size={14} /> Link Copied!</> : <><Share2 size={14} /> Copy Spectator Link</>}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MatchCenter;
