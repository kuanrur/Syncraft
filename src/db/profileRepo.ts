import { getDb } from './client';
import { SyncraftProfile } from '../types';

interface ProfileRow {
  slack_user_id: string;
  display_name: string;
  timezone: string;
  work_start: string;
  work_end: string;
  sleep_start: string;
  sleep_end: string;
  role: string;
  response_speed: string;
  sharing_enabled: number;
}

function rowToProfile(row: ProfileRow): SyncraftProfile {
  return {
    slackUserId: row.slack_user_id,
    displayName: row.display_name,
    timezone: row.timezone,
    workStart: row.work_start,
    workEnd: row.work_end,
    sleepStart: row.sleep_start,
    sleepEnd: row.sleep_end,
    role: row.role,
    responseSpeed: row.response_speed as SyncraftProfile['responseSpeed'],
    sharingEnabled: row.sharing_enabled === 1,
  };
}

export function getProfile(slackUserId: string): SyncraftProfile | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM profiles WHERE slack_user_id = ?').get(slackUserId) as ProfileRow | undefined;
  return row ? rowToProfile(row) : null;
}

export function upsertProfile(profile: SyncraftProfile): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO profiles (slack_user_id, display_name, timezone, work_start, work_end, sleep_start, sleep_end, role, response_speed, sharing_enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(slack_user_id) DO UPDATE SET
      display_name = excluded.display_name,
      timezone = excluded.timezone,
      work_start = excluded.work_start,
      work_end = excluded.work_end,
      sleep_start = excluded.sleep_start,
      sleep_end = excluded.sleep_end,
      role = excluded.role,
      response_speed = excluded.response_speed,
      sharing_enabled = excluded.sharing_enabled,
      updated_at = datetime('now')
  `).run(
    profile.slackUserId,
    profile.displayName,
    profile.timezone,
    profile.workStart,
    profile.workEnd,
    profile.sleepStart,
    profile.sleepEnd,
    profile.role,
    profile.responseSpeed,
    profile.sharingEnabled ? 1 : 0,
  );
}
