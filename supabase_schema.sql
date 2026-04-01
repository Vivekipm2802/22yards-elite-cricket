-- ============================================================
-- 22YARDS SUPABASE SCHEMA
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PLAYERS TABLE
-- Central player profile - one row per phone number
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  player_id           TEXT UNIQUE NOT NULL,         -- 22Y-XXXX-X format
  phone               TEXT UNIQUE NOT NULL,          -- 10-digit mobile number (primary key for lookup)
  name                TEXT NOT NULL,
  city                TEXT DEFAULT '',
  role                TEXT DEFAULT 'All-Rounder',    -- All-Rounder | Batsman | Bowler | Wicket Keeper
  avatar_url          TEXT DEFAULT '',
  batting_style       TEXT DEFAULT '',
  bowling_style       TEXT DEFAULT '',

  -- ââ BATTING ââââââââââââââââââââââââââââââââââââââââââââââ
  matches_played      INTEGER DEFAULT 0,
  career_runs         INTEGER DEFAULT 0,
  balls_faced         INTEGER DEFAULT 0,
  innings_played      INTEGER DEFAULT 0,
  not_outs            INTEGER DEFAULT 0,
  total_fours         INTEGER DEFAULT 0,
  total_sixes         INTEGER DEFAULT 0,
  batting_average     NUMERIC(7,2) DEFAULT 0.00,     -- runs / (innings - not_outs)
  strike_rate         NUMERIC(7,2) DEFAULT 0.00,     -- (runs / balls_faced) * 100

  -- ââ BOWLING ââââââââââââââââââââââââââââââââââââââââââââââ
  total_wickets       INTEGER DEFAULT 0,
  overs_bowled        NUMERIC(7,1) DEFAULT 0.0,      -- stored as decimal overs (e.g. 4.3)
  balls_bowled_raw    INTEGER DEFAULT 0,              -- raw ball count for internal calc
  runs_conceded       INTEGER DEFAULT 0,
  best_figures        TEXT DEFAULT '0/0',             -- e.g. "5/12"
  best_figures_wickets INTEGER DEFAULT 0,             -- for sorting
  best_figures_runs    INTEGER DEFAULT 999,           -- for sorting (lower is better)
  three_w_hauls       INTEGER DEFAULT 0,
  five_w_hauls        INTEGER DEFAULT 0,
  bowling_average     NUMERIC(7,2) DEFAULT 0.00,     -- runs_conceded / wickets
  bowling_economy     NUMERIC(7,2) DEFAULT 0.00,     -- (runs_conceded / balls_bowled) * 6

  -- ââ FIELDING âââââââââââââââââââââââââââââââââââââââââââââ
  total_catches       INTEGER DEFAULT 0,
  run_outs            INTEGER DEFAULT 0,
  stumpings           INTEGER DEFAULT 0,
  fielding_impact     NUMERIC(7,2) DEFAULT 0.00,     -- (catches*1 + stumpings*1.2 + runouts*1.2)/matches * 10

  -- ââ CAPTAINCY & LEADERSHIP âââââââââââââââââââââââââââââââ
  toss_wins           INTEGER DEFAULT 0,
  matches_led         INTEGER DEFAULT 0,
  captaincy_wins      INTEGER DEFAULT 0,

  -- ââ RANKINGS & META ââââââââââââââââââââââââââââââââââââââ
  elite_rank          TEXT DEFAULT 'Cadet',           -- Cadet | Lieutenant | Captain | Major | Colonel | General
  total_victories     INTEGER DEFAULT 0,
  total_defeats       INTEGER DEFAULT 0,
  last_login          TIMESTAMPTZ DEFAULT NOW(),

  -- ââ VAULT ââââââââââââââââââââââââââââââââââââââââââââââââ
  archive_vault       JSONB DEFAULT '[]'::jsonb,      -- full match history array

  -- ââ TIMESTAMPS âââââââââââââââââââââââââââââââââââââââââââ
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MATCHES TABLE (optional â for cross-player analytics later)
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  match_id        TEXT UNIQUE NOT NULL,
  date_played     TIMESTAMPTZ DEFAULT NOW(),
  team_a_name     TEXT DEFAULT '',
  team_b_name     TEXT DEFAULT '',
  team_a_score    INTEGER DEFAULT 0,
  team_a_wickets  INTEGER DEFAULT 0,
  team_b_score    INTEGER DEFAULT 0,
  team_b_wickets  INTEGER DEFAULT 0,
  winner_name     TEXT DEFAULT '',
  margin          TEXT DEFAULT '',
  overs           INTEGER DEFAULT 5,
  city            TEXT DEFAULT '',
  ground          TEXT DEFAULT '',
  full_state      JSONB DEFAULT '{}'::jsonb,   -- complete MatchState snapshot
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES for fast lookup
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_players_phone ON players(phone);
CREATE INDEX IF NOT EXISTS idx_players_player_id ON players(player_id);
CREATE INDEX IF NOT EXISTS idx_players_career_runs ON players(career_runs DESC);
CREATE INDEX IF NOT EXISTS idx_players_total_wickets ON players(total_wickets DESC);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date_played DESC);

-- ============================================================
-- UPDATED_AT auto-trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON players
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Players can read ALL profiles (for leaderboards)
-- Players can only write/update their OWN profile
-- ============================================================
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Allow anyone to SELECT all players (public leaderboard)
CREATE POLICY "Public read access to players"
  ON players FOR SELECT
  USING (true);

-- Allow insert/update only via service role (server-side upsert by phone)
-- In the app we use anon key with upsert by phone â so we allow anon write
-- Tighten this in production by adding JWT-based auth
CREATE POLICY "Allow upsert by phone"
  ON players FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update by phone"
  ON players FOR UPDATE
  USING (true);

-- Allow anyone to read matches
CREATE POLICY "Public read access to matches"
  ON matches FOR SELECT
  USING (true);

CREATE POLICY "Allow match insert"
  ON matches FOR INSERT
  WITH CHECK (true);
