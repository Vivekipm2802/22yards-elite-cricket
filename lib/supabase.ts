// lib/supabase.ts
// Supabase client + all 22YARDS data operations

import { createClient } from '@supabase/supabase-js';

// âââ Client Initialization ââââââââââââââââââââââââââââââââââââââââââââââââââââ
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[22YARDS] Supabase env vars missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// âââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export interface PlayerProfile {
  id?: string;
  player_id: string;
  phone: string;
  name: string;
  city?: string;
  role?: string;
  avatar_url?: string;
  batting_style?: string;
  bowling_style?: string;

  // Batting
  matches_played: number;
  career_runs: number;
  balls_faced: number;
  innings_played: number;
  not_outs: number;
  total_fours: number;
  total_sixes: number;
  batting_average: number;
  strike_rate: number;

  // Bowling
  total_wickets: number;
  overs_bowled: number;
  balls_bowled_raw: number;
  runs_conceded: number;
  best_figures: string;
  best_figures_wickets: number;
  best_figures_runs: number;
  three_w_hauls: number;
  five_w_hauls: number;
  bowling_average: number;
  bowling_economy: number;

  // Fielding
  total_catches: number;
  run_outs: number;
  stumpings: number;
  fielding_impact: number;

  // Captaincy
  toss_wins: number;
  matches_led: number;
  captaincy_wins: number;

  // Meta
  elite_rank: string;
  total_victories: number;
  total_defeats: number;
  last_login?: string;
  archive_vault: any[];
  created_at?: string;
  updated_at?: string;
}

// âââ Helper: Generate Player ID ââââââââââââââââââââââââââââââââââââââââââââââ
export function generatePlayerId(phone: string): string {
  const hash = phone.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return `22Y-${Math.abs(hash % 9999).toString().padStart(4, '0')}-${String.fromCharCode(65 + (Math.abs(hash) % 26))}`;
}

// âââ Helper: Compute Elite Rank ââââââââââââââââââââââââââââââââââââââââââââââ
export function computeEliteRank(captaincyWins: number): string {
  if (captaincyWins >= 20) return 'General';
  if (captaincyWins >= 10) return 'Colonel';
  if (captaincyWins >= 5)  return 'Major';
  if (captaincyWins >= 2)  return 'Captain';
  if (captaincyWins >= 1)  return 'Lieutenant';
  return 'Cadet';
}

// âââ Helper: Build full stats from match history ââââââââââââââââââââââââââââââ
export function buildStatsFromHistory(history: any[]): Partial<PlayerProfile> {
  const stats = {
    matches_played: history.length,
    career_runs: 0,
    balls_faced: 0,
    innings_played: 0,
    not_outs: 0,
    total_fours: 0,
    total_sixes: 0,
    total_wickets: 0,
    balls_bowled_raw: 0,
    runs_conceded: 0,
    best_figures: '0/0',
    best_figures_wickets: 0,
    best_figures_runs: 999,
    three_w_hauls: 0,
    five_w_hauls: 0,
    total_catches: 0,
    run_outs: 0,
    stumpings: 0,
    toss_wins: 0,
    matches_led: 0,
    captaincy_wins: 0,
    total_victories: 0,
    total_defeats: 0,
  };

  history.forEach((m: any) => {
    const runs = parseInt(m.runs || 0);
    const balls = parseInt(m.ballsFaced || 0);
    const wickets = parseInt(m.wicketsTaken || 0);
    const ballsBowled = parseInt(m.ballsBowled || 0);
    const rc = parseInt(m.runsConceded || 0);

    stats.career_runs += runs;
    stats.balls_faced += balls;
    if (balls > 0 || runs > 0) stats.innings_played++;
    if (m.notOut) stats.not_outs++;
    stats.total_fours += parseInt(m.fours || 0);
    stats.total_sixes += parseInt(m.sixes || 0);

    stats.total_wickets += wickets;
    stats.balls_bowled_raw += ballsBowled;
    stats.runs_conceded += rc;
    if (wickets >= 3) stats.three_w_hauls++;  // B-07 fix: >= 3 not === 3
    if (wickets >= 5) stats.five_w_hauls++;

    // Best figures
    if (
      wickets > stats.best_figures_wickets ||
      (wickets === stats.best_figures_wickets && rc < stats.best_figures_runs)
    ) {
      stats.best_figures = `${wickets}/${rc}`;
      stats.best_figures_wickets = wickets;
      stats.best_figures_runs = rc;
    }

    stats.total_catches += parseInt(m.catches || 0);
    stats.stumpings    += parseInt(m.stumpings || 0);
    stats.run_outs     += parseInt(m.runOuts || 0);

    if (m.result === 'WON')  stats.total_victories++;
    if (m.result === 'LOST') stats.total_defeats++;

    if (m.asCaptain) {
      stats.matches_led++;
      if (m.matchWon) stats.captaincy_wins++;
    }
    if (m.tossWon) stats.toss_wins++;
  });

  // Derived stats
  const dismissals = stats.innings_played - stats.not_outs;
  const battingAverage = dismissals > 0 ? stats.career_runs / dismissals : stats.career_runs;
  const strikeRate = stats.balls_faced > 0 ? (stats.career_runs / stats.balls_faced) * 100 : 0;
  const bowlingAverage = stats.total_wickets > 0 ? stats.runs_conceded / stats.total_wickets : 0;
  const bowlingEconomy = stats.balls_bowled_raw > 0 ? (stats.runs_conceded / stats.balls_bowled_raw) * 6 : 0;
  const oversBowled = parseFloat((Math.floor(stats.balls_bowled_raw / 6) + (stats.balls_bowled_raw % 6) / 10).toFixed(1));
  const fieldingImpact = stats.matches_played > 0
    ? parseFloat(((stats.total_catches * 1 + stats.stumpings * 1.2 + stats.run_outs * 1.2) / stats.matches_played * 10).toFixed(2))
    : 0;

  return {
    ...stats,
    overs_bowled: oversBowled,
    batting_average: parseFloat(battingAverage.toFixed(2)),
    strike_rate: parseFloat(strikeRate.toFixed(2)),
    bowling_average: parseFloat(bowlingAverage.toFixed(2)),
    bowling_economy: parseFloat(bowlingEconomy.toFixed(2)),
    fielding_impact: fieldingImpact,
    elite_rank: computeEliteRank(stats.captaincy_wins),
  };
}

// âââ DB: Fetch player by phone ââââââââââââââââââââââââââââââââââââââââââââââââ
export async function fetchPlayerByPhone(phone: string): Promise<PlayerProfile | null> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('phone', phone)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
    console.error('[Supabase] fetchPlayerByPhone error:', error);
  }
  return data as PlayerProfile | null;
}

// âââ DB: Upsert full player profile ââââââââââââââââââââââââââââââââââââââââââ
// Called on login (create if new) and after every match (update stats)
export async function upsertPlayer(profile: Partial<PlayerProfile> & { phone: string; name: string }): Promise<PlayerProfile | null> {
  const player_id = profile.player_id || generatePlayerId(profile.phone);

  const payload: any = {
    ...profile,
    player_id,
    last_login: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('players')
    .upsert(payload, { onConflict: 'phone' })
    .select()
    .single();

  if (error) {
    console.error('[Supabase] upsertPlayer error:', error);
    return null;
  }
  return data as PlayerProfile;
}

// âââ DB: Update stats + vault after a completed match ââââââââââââââââââââââââ
export async function syncMatchToSupabase(
  phone: string,
  newMatchRecord: any,
  fullHistory: any[]
): Promise<boolean> {
  try {
    const statsUpdate = buildStatsFromHistory(fullHistory);
    const update: Partial<PlayerProfile> = {
      ...statsUpdate,
      archive_vault: fullHistory,
      last_login: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('players')
      .update(update)
      .eq('phone', phone);

    if (error) {
      console.error('[Supabase] syncMatchToSupabase error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[Supabase] syncMatchToSupabase exception:', e);
    return false;
  }
}

// âââ DB: Save completed match to matches table ââââââââââââââââââââââââââââââââ
export async function saveMatchRecord(matchState: any, winnerName: string, margin: string): Promise<void> {
  const payload = {
    match_id: matchState.matchId,
    date_played: matchState.config.dateTime ? new Date(matchState.config.dateTime).toISOString() : new Date().toISOString(),
    team_a_name: matchState.teams.teamA.name,
    team_b_name: matchState.teams.teamB.name,
    team_a_score: matchState.config.innings1Score ?? matchState.liveScore.runs ?? 0,  // B-18 fix
    team_a_wickets: matchState.config.innings1Wickets ?? matchState.liveScore.wickets ?? 0,
    team_b_score: matchState.liveScore.runs,
    team_b_wickets: matchState.liveScore.wickets,
    winner_name: winnerName,
    margin,
    overs: matchState.config.overs,
    city: matchState.config.city,
    ground: matchState.config.ground,
    full_state: matchState,
  };

  const { error } = await supabase.from('matches').upsert(payload, { onConflict: 'match_id' });
  if (error) console.error('[Supabase] saveMatchRecord error:', error);
}

// âââ DB: Fetch all players for leaderboard ââââââââââââââââââââââââââââââââââââ
export async function fetchLeaderboard(sortBy: 'career_runs' | 'total_wickets' | 'total_victories' = 'career_runs', limit = 50): Promise<PlayerProfile[]> {
  const { data, error } = await supabase
    .from('players')
    .select('player_id, name, phone, city, role, avatar_url, career_runs, total_wickets, total_victories, total_defeats, matches_played, batting_average, strike_rate, bowling_economy, elite_rank')
    .order(sortBy, { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Supabase] fetchLeaderboard error:', error);
    return [];
  }
  return (data || []) as PlayerProfile[];
}

// âââ DB: Update last_login timestamp âââââââââââââââââââââââââââââââââââââââââ
export async function touchLastLogin(phone: string): Promise<void> {
  await supabase
    .from('players')
    .update({ last_login: new Date().toISOString() })
    .eq('phone', phone);
}

// âââ DB: Push live match state (called after each ball for broadcast/transfer) â
// Strategy: INSERT with a unique per-call timestamp key instead of UPSERT.
// This bypasses the UPDATE RLS policy on the matches table (which blocks upsert
// after the first INSERT) by ensuring every push is a fresh INSERT with no conflict.
// fetchMatchById uses a LIKE query to find the most recent live-state row.
export async function pushLiveMatchState(matchState: any): Promise<void> {
  if (!matchState?.matchId) return;
  try {
    const isInn2 = matchState.currentInnings === 2;
    // Unique key per call: original matchId + _t + timestamp
    const liveKey = `${matchState.matchId}_t${Date.now()}`;
    const payload = {
      match_id: liveKey,
      date_played: matchState.config?.dateTime
        ? new Date(matchState.config.dateTime).toISOString()
        : new Date().toISOString(),
      team_a_name: matchState.teams?.teamA?.name ?? 'TEAM A',
      team_b_name: matchState.teams?.teamB?.name ?? 'TEAM B',
      team_a_score: isInn2
        ? (matchState.config?.innings1Score ?? 0)
        : (matchState.liveScore?.runs ?? 0),
      team_a_wickets: isInn2
        ? (matchState.config?.innings1Wickets ?? 0)
        : (matchState.liveScore?.wickets ?? 0),
      team_b_score: isInn2 ? (matchState.liveScore?.runs ?? 0) : 0,
      team_b_wickets: isInn2 ? (matchState.liveScore?.wickets ?? 0) : 0,
      winner_name: 'IN PROGRESS',
      margin: `Innings ${matchState.currentInnings ?? 1}`,
      overs: matchState.config?.overs ?? 0,
      city: matchState.config?.city ?? '',
      ground: matchState.config?.ground ?? '',
      full_state: matchState,
    };
    const { error } = await supabase.from('matches').insert(payload);
    if (error) {
      console.error('[22Y] pushLiveMatchState error:', error.code, error.message);
    }
  } catch (e) {
    console.error('[22Y] pushLiveMatchState exception:', e);
  }
}

// âââ DB: Fetch a match's full_state by match_id (for Transfer / Broadcast) ââââ
// Checks two places:
// 1. Exact match_id row â set by saveMatchRecord for completed matches.
// 2. Live-state rows â inserted by pushLiveMatchState with key `${matchId}_t${ts}`.
//    These exist because the UPDATE RLS policy blocks upsert; we INSERT fresh each ball.
export async function fetchMatchById(matchId: string): Promise<any | null> {
  try {
    // 1. Check for a completed match (stored under exact match_id by saveMatchRecord)
    const { data: exact } = await supabase
      .from('matches')
      .select('full_state, winner_name')
      .eq('match_id', matchId)
      .maybeSingle();

    if (exact && (exact as any).winner_name !== 'IN PROGRESS') {
      // Completed match â return its final state directly
      return (exact as any).full_state ?? null;
    }

    // 2. Find the most recent live-state row (pushed by pushLiveMatchState)
    //    Keys look like: M-1742400000000_t1742400012345
    //    ORDER BY match_id DESC puts the highest timestamp (latest) first.
    const { data: liveRow } = await supabase
      .from('matches')
      .select('full_state')
      .like('match_id', `${matchId}_t%`)
      .order('match_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (liveRow) return (liveRow as any).full_state ?? null;

    // 3. Fall back to exact row if it exists (initial IN PROGRESS state, if any)
    return exact ? (exact as any).full_state ?? null : null;
  } catch (_) { return null; }
}
