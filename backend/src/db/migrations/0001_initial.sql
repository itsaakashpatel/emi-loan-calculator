-- One row per Google-authenticated user. Everything else hangs off this.
CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  google_id    TEXT NOT NULL UNIQUE,
  email        TEXT NOT NULL,
  display_name TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- A person whose holdings the user tracks: themselves, a spouse, a child.
CREATE TABLE members (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  relation   TEXT,
  -- sha256 of the PAN. Matches CAS folios to a member without storing the
  -- PAN itself; nothing needs to read it back.
  pan_hash   TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_members_user ON members(user_id);

-- user_id is denormalised onto both holdings tables so listing a whole
-- portfolio stays one indexed read instead of a join through members.
CREATE TABLE mf_holdings (
  id             TEXT PRIMARY KEY,
  member_id      TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  amfi_code      TEXT NOT NULL,
  scheme_name    TEXT NOT NULL,
  folio_number   TEXT,
  units          REAL NOT NULL,
  avg_nav        REAL,
  invested_value REAL,
  source         TEXT NOT NULL DEFAULT 'manual',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_mf_holdings_member ON mf_holdings(member_id);
CREATE INDEX idx_mf_holdings_user ON mf_holdings(user_id);
-- CAS re-imports must update a folio's row, not add a second one.
CREATE UNIQUE INDEX idx_mf_holdings_folio
  ON mf_holdings(member_id, amfi_code, IFNULL(folio_number, ''));

CREATE TABLE stock_holdings (
  id             TEXT PRIMARY KEY,
  member_id      TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  -- Yahoo Finance ticker, exchange suffix included: RELIANCE.NS, TCS.BO.
  symbol         TEXT NOT NULL,
  exchange       TEXT NOT NULL DEFAULT 'NSE',
  stock_name     TEXT NOT NULL,
  quantity       REAL NOT NULL,
  avg_price      REAL,
  invested_value REAL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_stock_holdings_member ON stock_holdings(member_id);
CREATE INDEX idx_stock_holdings_user ON stock_holdings(user_id);
CREATE UNIQUE INDEX idx_stock_holdings_symbol
  ON stock_holdings(member_id, symbol);

-- Prices are the same for everyone, so both caches are global, not per-user.
-- The daily cron fills them for held instruments only.
CREATE TABLE nav_cache (
  amfi_code   TEXT PRIMARY KEY,
  scheme_name TEXT NOT NULL,
  nav         REAL NOT NULL,
  nav_date    TEXT NOT NULL,
  fetched_at  TEXT NOT NULL
);

CREATE TABLE stock_price_cache (
  symbol     TEXT PRIMARY KEY,
  price      REAL NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'INR',
  price_date TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

-- Tracks one CAS PDF from upload through parsing to the user confirming
-- which of the parsed holdings to keep.
CREATE TABLE cas_uploads (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  member_id      TEXT,
  r2_key         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  error          TEXT,
  holdings_json  TEXT,
  holdings_count INTEGER,
  created_at     TEXT NOT NULL,
  processed_at   TEXT
);
CREATE INDEX idx_cas_uploads_user ON cas_uploads(user_id);
