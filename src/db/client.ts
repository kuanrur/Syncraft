import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'xiami.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initDb(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      slack_user_id     TEXT PRIMARY KEY,
      display_name      TEXT NOT NULL DEFAULT '',
      timezone          TEXT NOT NULL DEFAULT 'America/Los_Angeles',
      work_start        TEXT NOT NULL DEFAULT '09:00',
      work_end          TEXT NOT NULL DEFAULT '17:00',
      sleep_start       TEXT NOT NULL DEFAULT '23:00',
      sleep_end         TEXT NOT NULL DEFAULT '07:00',
      role              TEXT NOT NULL DEFAULT '',
      response_speed    TEXT NOT NULL DEFAULT 'medium' CHECK(response_speed IN ('fast','medium','slow')),
      sharing_enabled   INTEGER NOT NULL DEFAULT 1,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS message_observations (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      slack_user_id     TEXT NOT NULL,
      channel_id        TEXT NOT NULL,
      thread_ts         TEXT,
      parent_user_id    TEXT,
      word_count        INTEGER NOT NULL,
      has_greeting      INTEGER NOT NULL DEFAULT 0,
      has_signoff       INTEGER NOT NULL DEFAULT 0,
      has_emoji         INTEGER NOT NULL DEFAULT 0,
      formality_score   INTEGER NOT NULL DEFAULT 0,
      detected_intent   TEXT NOT NULL DEFAULT 'general',
      is_question       INTEGER NOT NULL DEFAULT 0,
      is_thread_reply   INTEGER NOT NULL DEFAULT 0,
      is_weekend        INTEGER NOT NULL DEFAULT 0,
      hour_local        INTEGER,
      timestamp_utc     TEXT NOT NULL,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_comm_traits (
      slack_user_id              TEXT PRIMARY KEY,
      avg_message_length         REAL NOT NULL DEFAULT 0,
      length_bucket              TEXT NOT NULL DEFAULT 'moderate' CHECK(length_bucket IN ('terse','moderate','verbose')),
      uses_greetings             INTEGER NOT NULL DEFAULT 0,
      uses_signoffs              INTEGER NOT NULL DEFAULT 0,
      uses_emoji                 INTEGER NOT NULL DEFAULT 0,
      formality                  TEXT NOT NULL DEFAULT 'mixed' CHECK(formality IN ('casual','mixed','formal')),
      peak_active_hours_json     TEXT NOT NULL DEFAULT '[]',
      avg_response_time_min      REAL NOT NULL DEFAULT 0,
      responds_on_weekends       INTEGER NOT NULL DEFAULT 0,
      top_intents_sent_json      TEXT NOT NULL DEFAULT '[]',
      top_intents_received_json  TEXT NOT NULL DEFAULT '[]',
      asks_clarifying_questions  INTEGER NOT NULL DEFAULT 0,
      prefers_threads            INTEGER NOT NULL DEFAULT 0,
      meeting_request_style      TEXT NOT NULL DEFAULT 'unknown',
      preferred_meeting_times_json TEXT NOT NULL DEFAULT '[]',
      stated_preferences_json    TEXT NOT NULL DEFAULT '[]',
      messages_sampled           INTEGER NOT NULL DEFAULT 0,
      updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (slack_user_id) REFERENCES profiles(slack_user_id)
    );

    CREATE TABLE IF NOT EXISTS pair_comm_traits (
      user_a                     TEXT NOT NULL,
      user_b                     TEXT NOT NULL,
      total_interactions         INTEGER NOT NULL DEFAULT 0,
      avg_response_a_to_b_min    REAL NOT NULL DEFAULT 0,
      avg_response_b_to_a_min    REAL NOT NULL DEFAULT 0,
      dominant_requester         TEXT,
      dominant_intent_a_to_b     TEXT NOT NULL DEFAULT 'general',
      dominant_intent_b_to_a     TEXT NOT NULL DEFAULT 'general',
      formality_match            INTEGER NOT NULL DEFAULT 1,
      length_match               INTEGER NOT NULL DEFAULT 1,
      common_topics_json         TEXT NOT NULL DEFAULT '[]',
      last_interaction           TEXT,
      messages_sampled           INTEGER NOT NULL DEFAULT 0,
      updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_a, user_b)
    );

    CREATE TABLE IF NOT EXISTS team_comm_traits (
      workspace_id               TEXT PRIMARY KEY,
      avg_message_length         REAL NOT NULL DEFAULT 0,
      dominant_formality         TEXT NOT NULL DEFAULT 'mixed',
      common_meeting_pattern     TEXT NOT NULL DEFAULT 'mixed',
      peak_hours_utc_json        TEXT NOT NULL DEFAULT '[]',
      avg_response_time_min      REAL NOT NULL DEFAULT 0,
      updated_at                 TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Cleanup observations older than 30 days
  db.prepare(`DELETE FROM message_observations WHERE created_at < datetime('now', '-30 days')`).run();

  console.log('Database initialized');
}
