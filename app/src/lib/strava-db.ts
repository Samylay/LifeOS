// Local SQLite store for Strava activities, in the same DB as the rest of
// LifeOS (see server-db.ts for the path resolution pattern).
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let _db: Database.Database | null = null;

export interface StravaActivitySummary {
  id: number;
  name?: string;
  sport_type?: string;
  type?: string;
  start_date: string;
  start_date_local?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  kilojoules?: number;
  suffer_score?: number;
  kudos_count?: number;
  achievement_count?: number;
  gear_id?: string;
  map?: { summary_polyline?: string };
  start_latlng?: [number, number];
}

export interface ActivityRow {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  start_date_local: string | null;
  distance_m: number;
  moving_time_s: number;
  elapsed_time_s: number;
  total_elevation_gain_m: number;
  average_speed_mps: number | null;
  max_speed_mps: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  average_cadence: number | null;
  average_watts: number | null;
  kilojoules: number | null;
  suffer_score: number | null;
  kudos_count: number;
  achievement_count: number;
  gear_id: string | null;
  polyline: string | null;
  start_lat: number | null;
  start_lng: number | null;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS strava_activities (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      sport_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      start_date_local TEXT,
      distance_m REAL NOT NULL DEFAULT 0,
      moving_time_s INTEGER NOT NULL DEFAULT 0,
      elapsed_time_s INTEGER NOT NULL DEFAULT 0,
      total_elevation_gain_m REAL NOT NULL DEFAULT 0,
      average_speed_mps REAL,
      max_speed_mps REAL,
      average_heartrate REAL,
      max_heartrate REAL,
      average_cadence REAL,
      average_watts REAL,
      kilojoules REAL,
      suffer_score INTEGER,
      kudos_count INTEGER DEFAULT 0,
      achievement_count INTEGER DEFAULT 0,
      gear_id TEXT,
      polyline TEXT,
      start_lat REAL,
      start_lng REAL,
      raw_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_strava_activities_start_date ON strava_activities(start_date);
    CREATE INDEX IF NOT EXISTS idx_strava_activities_sport_start ON strava_activities(sport_type, start_date);

    CREATE TABLE IF NOT EXISTS strava_sync_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

export function getStravaDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.LIFEOS_DB_PATH || path.join(process.cwd(), "data", "lifeos.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  _db = db;
  return db;
}

const upsertSql = `
  INSERT INTO strava_activities (
    id, name, sport_type, start_date, start_date_local,
    distance_m, moving_time_s, elapsed_time_s, total_elevation_gain_m,
    average_speed_mps, max_speed_mps, average_heartrate, max_heartrate,
    average_cadence, average_watts, kilojoules, suffer_score,
    kudos_count, achievement_count, gear_id, polyline,
    start_lat, start_lng, raw_json
  ) VALUES (
    @id, @name, @sport_type, @start_date, @start_date_local,
    @distance_m, @moving_time_s, @elapsed_time_s, @total_elevation_gain_m,
    @average_speed_mps, @max_speed_mps, @average_heartrate, @max_heartrate,
    @average_cadence, @average_watts, @kilojoules, @suffer_score,
    @kudos_count, @achievement_count, @gear_id, @polyline,
    @start_lat, @start_lng, @raw_json
  )
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    sport_type=excluded.sport_type,
    start_date=excluded.start_date,
    start_date_local=excluded.start_date_local,
    distance_m=excluded.distance_m,
    moving_time_s=excluded.moving_time_s,
    elapsed_time_s=excluded.elapsed_time_s,
    total_elevation_gain_m=excluded.total_elevation_gain_m,
    average_speed_mps=excluded.average_speed_mps,
    max_speed_mps=excluded.max_speed_mps,
    average_heartrate=excluded.average_heartrate,
    max_heartrate=excluded.max_heartrate,
    average_cadence=excluded.average_cadence,
    average_watts=excluded.average_watts,
    kilojoules=excluded.kilojoules,
    suffer_score=excluded.suffer_score,
    kudos_count=excluded.kudos_count,
    achievement_count=excluded.achievement_count,
    gear_id=excluded.gear_id,
    polyline=excluded.polyline,
    start_lat=excluded.start_lat,
    start_lng=excluded.start_lng,
    raw_json=excluded.raw_json
`;

/** Upsert a batch of activities. Returns the number of rows touched. */
export function upsertActivities(activities: StravaActivitySummary[]): number {
  if (activities.length === 0) return 0;
  const db = getStravaDb();
  const upsert = db.prepare(upsertSql);
  const tx = db.transaction((items: StravaActivitySummary[]) => {
    for (const a of items) {
      upsert.run({
        id: a.id,
        name: a.name ?? "",
        sport_type: a.sport_type ?? a.type ?? "Workout",
        start_date: a.start_date,
        start_date_local: a.start_date_local ?? null,
        distance_m: a.distance ?? 0,
        moving_time_s: a.moving_time ?? 0,
        elapsed_time_s: a.elapsed_time ?? 0,
        total_elevation_gain_m: a.total_elevation_gain ?? 0,
        average_speed_mps: a.average_speed ?? null,
        max_speed_mps: a.max_speed ?? null,
        average_heartrate: a.average_heartrate ?? null,
        max_heartrate: a.max_heartrate ?? null,
        average_cadence: a.average_cadence ?? null,
        average_watts: a.average_watts ?? null,
        kilojoules: a.kilojoules ?? null,
        suffer_score: a.suffer_score ?? null,
        kudos_count: a.kudos_count ?? 0,
        achievement_count: a.achievement_count ?? 0,
        gear_id: a.gear_id ?? null,
        polyline: a.map?.summary_polyline ?? null,
        start_lat: a.start_latlng?.[0] ?? null,
        start_lng: a.start_latlng?.[1] ?? null,
        raw_json: JSON.stringify(a),
      });
    }
  });
  tx(activities);
  return activities.length;
}

export function getMaxStartDate(): string | null {
  const row = getStravaDb()
    .prepare("SELECT MAX(start_date) as m FROM strava_activities")
    .get() as { m: string | null };
  return row.m;
}

export function countActivities(): number {
  const row = getStravaDb().prepare("SELECT COUNT(*) as c FROM strava_activities").get() as {
    c: number;
  };
  return row.c;
}

export function getActivitiesSince(afterIso: string, limit?: number): ActivityRow[] {
  const db = getStravaDb();
  const sql =
    "SELECT * FROM strava_activities WHERE start_date >= ? ORDER BY start_date DESC" +
    (typeof limit === "number" ? " LIMIT ?" : "");
  const stmt = db.prepare(sql);
  return (typeof limit === "number" ? stmt.all(afterIso, limit) : stmt.all(afterIso)) as ActivityRow[];
}

export function getActivitiesInRange(afterIso: string, beforeIso: string): ActivityRow[] {
  return getStravaDb()
    .prepare("SELECT * FROM strava_activities WHERE start_date >= ? AND start_date < ? ORDER BY start_date DESC")
    .all(afterIso, beforeIso) as ActivityRow[];
}

export function getSyncState(key: string): string | null {
  const row = getStravaDb().prepare("SELECT value FROM strava_sync_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSyncState(key: string, value: string): void {
  getStravaDb()
    .prepare(
      "INSERT INTO strava_sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    )
    .run(key, value);
}
