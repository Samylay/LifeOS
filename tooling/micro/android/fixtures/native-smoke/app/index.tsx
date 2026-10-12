import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

type Row = { id: string; value: number };
const IDS = ['counter-a', 'counter-b', 'sentinel'];

async function read(database: SQLiteDatabase): Promise<Row[]> {
  const rows = await database.getAllAsync<Row>('SELECT id, value FROM fixture_rows ORDER BY id');
  if (rows.length < 2 || rows.length > 3 || !rows.some(row => row.id === 'counter-a') || !rows.some(row => row.id === 'counter-b') || rows.some(row => !IDS.includes(row.id) || !Number.isSafeInteger(row.value) || row.value < 0)) {
    throw new Error('Fixture records are invalid');
  }
  return rows;
}

export default function Fixture() {
  const dark = useColorScheme() === 'dark';
  const database = useRef<SQLiteDatabase | null>(null);
  const pending = useRef(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const colors = dark ? { background: '#141414', text: '#fafafa', surface: '#303030' } : { background: '#fafafa', text: '#141414', surface: '#eeeeee' };

  useEffect(() => {
    let mounted = true;
    let initialized = false;
    let opened: SQLiteDatabase | null = null;
    const initialize = async () => {
      try {
        opened = await openDatabaseAsync('factory-fixture.db');
        const version = await opened.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
        if (version?.user_version === 0) {
          await opened.withExclusiveTransactionAsync(async transaction => {
            await transaction.execAsync("CREATE TABLE fixture_rows (id TEXT PRIMARY KEY NOT NULL, value INTEGER NOT NULL CHECK(value >= 0)); INSERT INTO fixture_rows VALUES ('counter-a',0),('counter-b',0); PRAGMA user_version=1;");
          });
        } else if (version?.user_version !== 1) {
          throw new Error('Fixture schema version is incompatible');
        }
        const stored = await read(opened);
        if (mounted) { database.current = opened; setRows(stored); setError(null); setReady(true); }
      } catch (failure) {
        if (mounted) { setReady(false); setError(failure instanceof Error ? failure.message : 'Fixture initialization failed'); }
      } finally {
        initialized = true;
        if (!mounted && opened) void opened.closeAsync().catch(() => {});
      }
    };
    void initialize();
    return () => {
      mounted = false;
      if (database.current === opened) database.current = null;
      if (initialized && opened) void opened.closeAsync().catch(() => {});
    };
  }, [attempt]);

  const mutate = async (id: string) => {
    const db = database.current;
    if (!db || pending.current || !IDS.includes(id)) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      await db.withExclusiveTransactionAsync(async transaction => {
        const current = await transaction.getFirstAsync<Row>('SELECT id,value FROM fixture_rows WHERE id=?', id);
        if (id === 'sentinel') {
          await transaction.runAsync("INSERT INTO fixture_rows(id,value) VALUES ('sentinel',1) ON CONFLICT(id) DO UPDATE SET value=1");
        } else {
          if (!current || !Number.isSafeInteger(current.value) || current.value >= Number.MAX_SAFE_INTEGER) throw new Error('Counter cannot be incremented safely');
          await transaction.runAsync('UPDATE fixture_rows SET value=? WHERE id=?', current.value + 1, id);
        }
      });
      setRows(await read(db));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Fixture write failed');
    } finally { pending.current = false; setBusy(false); }
  };

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Native factory fixture</Text>
      {rows.length === 0 && !error ? <Text style={{ color: colors.text }}>Opening fixture store</Text> : null}
      <View style={styles.rows}>
        {rows.map(row => <Text key={row.id} testID={`value-${row.id}`} style={{ color: colors.text }}>{row.id}: {row.value}</Text>)}
      </View>
      {IDS.map(id => (
        <Pressable key={id} testID={`write-${id}`} accessibilityRole="button" accessibilityLabel={`Write ${id}`} disabled={busy || !ready} onPress={() => void mutate(id)} style={({ pressed }) => [styles.button, { backgroundColor: colors.surface, opacity: busy ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
          <Text style={{ color: colors.text }}>Write {id}</Text>
        </Pressable>
      ))}
      {error ? <Text testID="fixture-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.text }}>{error}</Text> : null}
      {error && !ready ? (
        <Pressable testID="fixture-retry" accessibilityRole="button" accessibilityLabel="Retry opening fixture" onPress={() => setAttempt(value => value + 1)} style={({ pressed }) => [styles.button, { backgroundColor: colors.surface, transform: [{ scale: pressed ? 0.97 : 1 }] }]}><Text style={{ color: colors.text }}>Retry opening fixture</Text></Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '600' },
  rows: { gap: 12 },
  button: { minHeight: 48, padding: 12, justifyContent: 'center', borderRadius: 8 },
});
