// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Activity, Disc, Zap, Target, RefreshCcw, User, Wifi } from 'lucide-react';
import { fetchMatchById, supabase } from '../lib/supabase';

const LiveScoreboard: React.FC<{ matchId: string }> = ({ matchId }) => {
  const [matchState, setMatchState] = useState<any | null>(null);
  const [loading, setLoading]       = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scoreFlash, setScoreFlash] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const intervalRef  = useRef<any>(null);
  const prevRunsRef  = useRef<number | null>(null);
  const prevBallsRef = useRef<number | null>(null);

  // Shared state-update logic â used by both Realtime and polling paths
  const applyNewState = (state: any, triggerFlash = true) => {
    if (!state) return;
    const newRuns  = state.liveScore?.runs  ?? 0;
    const newBalls = state.liveScore?.balls ?? 0;
    if (
      triggerFlash &&
      prevRunsRef.current !== null &&
      (prevRunsRef.current !== newRuns || prevBallsRef.current !== newBalls)
    ) {
      setScoreFlash(true);
      setTimeout(() => setScoreFlash(false), 900);
    }
    prevRunsRef.current  = newRuns;
    prevBallsRef.current = newBalls;
    setMatchState(state);
    setLastUpdated(new Date());
  };

  // Manual / fallback poll â always flashes when the score actually changes
  const refresh = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const state = await fetchMatchById(matchId);
      applyNewState(state, true); // flash whenever score differs from last seen
    } catch (_) {}
    setLoading(false);
    if (isManual) setRefreshing(false);
  };

  useEffect(() => {
    // 1. Immediate initial fetch so the page isn't blank
    (async () => {
      try {
        const state = await fetchMatchById(matchId);
        if (state) {
          prevRunsRef.current  = state.liveScore?.runs  ?? 0;
          prevBallsRef.current = state.liveScore?.balls ?? 0;
          setMatchState(state);
          setLastUpdated(new Date());
        }
      } catch (_) {}
      setLoading(false);
    })();

    // 2a. Supabase Broadcast â PRIMARY real-time path.
    //     The scorer app sends state through channel `live:<matchId>` after every ball.
    //     This works instantly (~50 ms) with zero Postgres/replication configuration.
    //     Channel name MUST match the one used in MatchCenter.tsx.
    const broadcastChannel = supabase
      .channel(`live:${matchId}`)
      .on('broadcast', { event: 'score_update' }, (msg) => {
        const newState = msg.payload;
        if (newState) applyNewState(newState, true);
      })
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    // 2b. Supabase postgres_changes â SECONDARY path.
    //     Listens for INSERTs into the matches table (live-state rows pushed by
    //     pushLiveMatchState use key `${matchId}_t${ts}` â always INSERT, never UPDATE).
    //     Also listens for the completed-match UPDATE on the original match_id row.
    //     Requires the `matches` table to be in the supabase_realtime publication.
    const dbChannel = supabase
      .channel(`db-match-${matchId}`)
      // Live-state INSERTs: no server-side filter possible for LIKE, so filter client-side
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches' },
        (payload) => {
          const row = payload.new as any;
          // Only handle live-state rows for THIS match (key starts with matchId + '_t')
          if (row?.match_id?.startsWith(matchId + '_t') && row?.winner_name === 'IN PROGRESS') {
            const newState = row.full_state;
            if (newState) applyNewState(newState, true);
          }
        }
      )
      // Completed-match UPDATE on original match_id (set by saveMatchRecord)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `match_id=eq.${matchId}` },
        (payload) => {
          const newState = (payload.new as any)?.full_state;
          if (newState) applyNewState(newState, true);
        }
      )
      .subscribe();

    // 3. Fallback poll every 5 s â catches DB updates when broadcast is unavailable
    //    (WebSocket blocked by network, old client tab, etc.)
    intervalRef.current = setInterval(() => refresh(false), 5000);

    return () => {
      supabase.removeChannel(broadcastChannel);
      supabase.removeChannel(dbChannel);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [matchId]);

  /* ââ loading ââ */
  if (loading) return (
    <div className="h-screen bg-[#050505] flex flex-col items-center justify-center space-y-4">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
        <Activity size={36} className="text-[#CC1010]" />
      </motion.div>
      <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Loading Live Matchâ¦</p>
    </div>
  );

  /* ââ not found ââ */
  if (!matchState) return (
    <div className="h-screen bg-[#050505] flex flex-col items-center justify-center space-y-4 p-8 text-center">
      <Target size={48} className="text-white/10" />
      <h3 className="font-heading text-4xl uppercase italic text-white/30">Match Not Found</h3>
      <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Check the link and try again</p>
    </div>
  );

  const { liveScore, teams, config, currentInnings, history, crease, status } = matchState;
  const battingKey  = teams.battingTeamId === 'A' ? 'teamA' : 'teamB';
  const bowlingKey  = teams.bowlingTeamId === 'A' ? 'teamA' : 'teamB';
  const battingTeam = teams[battingKey];
  const bowlingTeam = teams[bowlingKey];
  const striker    = (battingTeam?.squad || []).find(p => p.id === crease?.strikerId);
  const nonStriker = (battingTeam?.squad || []).find(p => p.id === crease?.nonStrikerId);
  const bowler     = (bowlingTeam?.squad || []).find(p => p.id === crease?.bowlerId);
  const isCompleted = status === 'COMPLETED';

  /* last 6 balls of current innings (for "this over" display) */
  const currentOverStart = Math.floor(liveScore.balls / 6) * 6;
  const recentBalls = (history || [])
    .filter(b => b.innings === currentInnings && b.ballNumber > currentOverStart)
    .slice(-6);

  const ballLabel = (b: any) => {
    if (b.isWicket) return 'W';
    if (b.type === 'WD') return 'Wd';
    if (b.type === 'NB') return 'NB';
    if (b.type === 'BYE') return 'By';
    if (b.type === 'LB')  return 'Lb';
    if (b.type === 'PENALTY_RUNS') return 'P';
    return String(b.runsScored ?? 0);
  };

  const ballColor = (b: any) => {
    if (b.isWicket) return '#CC1010';
    if (b.runsScored === 6) return '#CC1010';
    if (b.runsScored === 4) return '#994040';
    if (b.type === 'WD' || b.type === 'NB') return '#555';
    return '#ffffff';
  };

  /* inn-1 setting team (for display in inn-2) */
  const inn1BowlingKey = teams.battingTeamId === 'A' ? 'teamA' : 'teamB'; // in inn-2, bowlingTeam batted in inn-1
  const inn1TeamName   = currentInnings === 2
    ? (teams[inn1BowlingKey]?.name ?? '')
    : '';

  return (
    <div className="h-screen bg-[#050505] flex flex-col overflow-hidden font-sans">

      {/* ââ Top bar ââ */}
      <div className="px-6 pt-8 pb-4 bg-black border-b border-white/5 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(204,16,16,0.9)] ${isCompleted ? 'bg-white/20' : 'bg-[#CC1010] animate-pulse'}`} />
            <span className="text-[9px] font-black text-[#CC1010] uppercase tracking-widest">
              {isCompleted ? 'MATCH COMPLETE' : 'LIVE'}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            {/* Realtime connection indicator */}
            <div className="flex items-center space-x-1">
              <Wifi size={10} className={realtimeConnected ? 'text-[#CC1010]' : 'text-white/20'} />
              <span className="text-[7px] font-black uppercase tracking-widest" style={{ color: realtimeConnected ? '#CC1010' : 'rgba(255,255,255,0.2)' }}>
                {realtimeConnected ? 'LIVE' : 'SYNCING'}
              </span>
            </div>
            {lastUpdated && (
              <span className="text-[7px] font-black text-white/20 uppercase tracking-widest">
                {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button onClick={() => refresh(true)} className="p-1.5 bg-white/5 border border-white/5 rounded-full">
              <motion.div
                animate={refreshing ? { rotate: 360 } : {}}
                transition={{ duration: 0.6, repeat: refreshing ? Infinity : 0, ease: 'linear' }}
              >
                <RefreshCcw size={12} className="text-white/30" />
              </motion.div>
            </button>
          </div>
        </div>

        {/* team names */}
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-3xl italic uppercase leading-none text-white">{teams.teamA.name}</h2>
          <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">VS</span>
          <h2 className="font-heading text-3xl italic uppercase leading-none text-white text-right">{teams.teamB.name}</h2>
        </div>
      </div>

      {/* ââ Main scrollable ââ */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-5 space-y-4 pb-20"
           style={{ scrollbarWidth: 'none' }}>

        {/* Score card â flashes on every score update */}
        <motion.div
          animate={scoreFlash ? { scale: [1, 1.03, 1], borderColor: ['rgba(204,16,16,0.1)', 'rgba(204,16,16,0.6)', 'rgba(204,16,16,0.1)'] } : {}}
          transition={{ duration: 0.5 }}
          className="bg-[#121212] border border-white/5 rounded-[28px] p-6 space-y-3 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-5"><Activity size={80} /></div>

          <p className="text-[8px] font-black text-white/30 uppercase tracking-widest relative z-10">
            {battingTeam?.name ?? ''} â INN {currentInnings}
          </p>

          <div className="flex justify-between items-baseline relative z-10">
            <div>
              <motion.span
                key={liveScore.runs}
                initial={{ scale: 1.25, color: '#ffffff' }}
                animate={{ scale: 1, color: '#ffffff' }}
                transition={{ duration: 0.35 }}
                className="font-numbers text-[52px] font-black leading-none inline-block"
              >{liveScore.runs}</motion.span>
              <span className="font-numbers text-3xl text-white/20 mx-2">/</span>
              <motion.span
                key={`w${liveScore.wickets}`}
                initial={{ scale: 1.3, color: '#ff4444' }}
                animate={{ scale: 1, color: '#CC1010' }}
                transition={{ duration: 0.35 }}
                className="font-numbers text-[52px] font-black leading-none inline-block"
              >{liveScore.wickets}</motion.span>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-[#CC1010] uppercase tracking-widest mb-1">OVERS</p>
              <p className="font-numbers text-3xl font-bold text-white/80 leading-none">
                {Math.floor(Math.max(0, liveScore.balls) / 6)}.{Math.max(0, liveScore.balls) % 6}
              </p>
            </div>
          </div>

          {/* Chase telemetry */}
          {currentInnings === 2 && config?.target && (
            <div className="pt-3 border-t border-white/5 space-y-2 relative z-10">
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                <span className="text-white/40">Target {config.target}</span>
                <span className="text-[#CC1010]">
                  Need {Math.max(0, config.target - liveScore.runs)} in {Math.max(0, config.overs * 6 - liveScore.balls)} balls
                </span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (liveScore.runs / config.target) * 100)}%` }}
                  transition={{ duration: 0.8 }}
                  className="h-full bg-[#CC1010] rounded-full"
                />
              </div>
            </div>
          )}

          {/* Inn-1 score banner in inn-2 */}
          {currentInnings === 2 && config?.innings1Score !== undefined && (
            <div className="pt-2 border-t border-white/5 relative z-10">
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">
                {inn1TeamName} INN 1 Â· {config.innings1Score}/{config.innings1Wickets ?? ''}
                {' '}({Math.floor((config.innings1Balls || 0) / 6)}.{(config.innings1Balls || 0) % 6} ov)
              </p>
            </div>
          )}
        </motion.div>

        {/* At crease */}
        {!isCompleted && (striker || nonStriker) && (
          <div className="space-y-2">
            <p className="text-[7px] font-black text-white/20 uppercase tracking-widest ml-1">AT CREASE</p>
            {striker && (
              <div className="h-14 bg-[#121212] border-l-4 border-[#CC1010] rounded-r-2xl flex items-center justify-between px-5 shadow-lg">
                <div className="flex items-center space-x-2">
                  <Zap size={12} className="text-[#CC1010]" />
                  <span className="text-sm font-black text-white uppercase">{striker.name}</span>
                  <span className="text-[8px] text-white/30 font-black">*</span>
                </div>
                <div className="text-right">
                  <span className="font-numbers text-xl font-black text-white">{striker.runs || 0}</span>
                  <span className="font-numbers text-xs text-white/40 ml-1">({striker.balls || 0})</span>
                </div>
              </div>
            )}
            {nonStriker && (
              <div className="h-14 bg-[#121212] border-l-4 border-white/10 rounded-r-2xl flex items-center justify-between px-5">
                <div className="flex items-center space-x-2">
                  <User size={12} className="text-white/20" />
                  <span className="text-sm font-bold text-white/60 uppercase">{nonStriker.name}</span>
                </div>
                <div className="text-right">
                  <span className="font-numbers text-xl font-bold text-white/40">{nonStriker.runs || 0}</span>
                  <span className="font-numbers text-xs text-white/20 ml-1">({nonStriker.balls || 0})</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Current bowler */}
        {!isCompleted && bowler && (
          <div className="h-14 bg-[#121212] border-r-4 border-white/10 rounded-l-2xl flex items-center justify-between px-5">
            <div className="flex items-center space-x-2">
              <Disc size={12} className="text-white/20" />
              <span className="text-sm font-black text-white/60 uppercase">{bowler.name}</span>
            </div>
            <div className="text-right">
              <span className="font-numbers text-lg font-black text-white/50">{bowler.wickets || 0}</span>
              <span className="font-numbers text-sm text-white/20 mx-1">â</span>
              <span className="font-numbers text-lg font-black text-white/40">{bowler.runs_conceded || 0}</span>
              <span className="font-numbers text-xs text-white/30 ml-1">
                ({Math.floor((bowler.balls_bowled || 0) / 6)}.{(bowler.balls_bowled || 0) % 6})
              </span>
            </div>
          </div>
        )}

        {/* This over */}
        {recentBalls.length > 0 && (
          <div className="space-y-2">
            <p className="text-[7px] font-black text-white/20 uppercase tracking-widest ml-1">THIS OVER</p>
            <div className="flex space-x-2">
              {recentBalls.map((b, i) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-full bg-[#1a1a1a] border flex items-center justify-center"
                  style={{ borderColor: ballColor(b) + '50' }}
                >
                  <span className="font-numbers text-xs font-black" style={{ color: ballColor(b) }}>
                    {ballLabel(b)}
                  </span>
                </div>
              ))}
              {/* empty placeholders for remaining balls in over */}
              {Array.from({ length: Math.max(0, 6 - recentBalls.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="w-10 h-10 rounded-full border border-white/5 flex items-center justify-center">
                  <span className="font-numbers text-xs text-white/10">Â·</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Match result */}
        {isCompleted && (
          <div className="py-8 text-center space-y-2 border border-[#CC1010]/20 rounded-[28px] bg-[#CC1010]/5">
            <p className="text-[8px] font-black text-[#CC1010] uppercase tracking-[0.4em]">MATCH COMPLETE</p>
            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest px-4">
              Check the 22YARDS app for the full scorecard
            </p>
          </div>
        )}

        {/* CRR / RRR mini stats */}
        {!isCompleted && liveScore.balls > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-[#121212] border border-white/5 rounded-2xl text-center">
              <p className="font-numbers text-2xl font-black text-white">
                {(liveScore.runs / (liveScore.balls / 6 || 1)).toFixed(2)}
              </p>
              <p className="text-[7px] font-black text-white/30 uppercase tracking-widest mt-1">CRR</p>
            </div>
            {currentInnings === 2 && config?.target && config.overs * 6 - liveScore.balls > 0 && (
              <div className="p-4 bg-[#121212] border border-white/5 rounded-2xl text-center">
                <p className="font-numbers text-2xl font-black text-[#CC1010]">
                  {((config.target - liveScore.runs) / ((config.overs * 6 - liveScore.balls) / 6)).toFixed(2)}
                </p>
                <p className="text-[7px] font-black text-white/30 uppercase tracking-widest mt-1">RRR</p>
              </div>
            )}
          </div>
        )}

        {/* Branding */}
        <div className="py-6 text-center space-y-1">
          <p className="font-heading text-xl italic text-white/20 uppercase tracking-widest">22YARDS</p>
          <p className="text-[7px] font-black text-white/10 uppercase tracking-widest">
            Real-time Â· Powered by 22YARDS
          </p>
        </div>
      </div>
    </div>
  );
};

export default LiveScoreboard;
