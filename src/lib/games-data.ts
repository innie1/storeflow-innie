import { StoreData, GameService, GameSession } from '@/types/store';
import { saveStore } from '@/lib/store-data';

function gid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const DEFAULT_GAMES: Omit<GameService, 'id'>[] = [
  { name: 'PlayStation', icon: '🎮', price: 500, enabled: true, order: 0 },
  { name: 'Snooker', icon: '🎱', price: 1000, enabled: true, order: 1 },
  { name: 'Xbox', icon: '🎮', price: 500, enabled: true, order: 2 },
  { name: 'Table Tennis', icon: '🏓', price: 300, enabled: true, order: 3 },
  { name: 'Darts', icon: '🎯', price: 200, enabled: true, order: 4 },
  { name: 'Karaoke', icon: '🎤', price: 1500, enabled: true, order: 5 },
  { name: 'VR Games', icon: '🥽', price: 2000, enabled: true, order: 6 },
];

export function ensureDefaultGames(store: StoreData): StoreData {
  if (store.category !== 'games' && store.storeType !== 'games') return store;
  if (store.games && store.games.length > 0) return store;
  const games: GameService[] = DEFAULT_GAMES.map(g => ({ ...g, id: gid() }));
  const updated = { ...store, games };
  saveStore(updated);
  return updated;
}

export function getGames(store: StoreData): GameService[] {
  return [...(store.games || [])].sort((a, b) => a.order - b.order);
}

export function getEnabledGames(store: StoreData): GameService[] {
  return getGames(store).filter(g => g.enabled);
}

export function addGame(store: StoreData, partial: Omit<GameService, 'id' | 'order'>): StoreData {
  const games = getGames(store);
  const next: GameService = { ...partial, id: gid(), order: games.length };
  const updated = { ...store, games: [...games, next] };
  saveStore(updated);
  return updated;
}

export function updateGame(store: StoreData, id: string, updates: Partial<GameService>): StoreData {
  const updated = {
    ...store,
    games: (store.games || []).map(g => (g.id === id ? { ...g, ...updates } : g)),
  };
  saveStore(updated);
  return updated;
}

export function deleteGame(store: StoreData, id: string): StoreData {
  const updated = { ...store, games: (store.games || []).filter(g => g.id !== id) };
  saveStore(updated);
  return updated;
}

export function moveGame(store: StoreData, id: string, dir: -1 | 1): StoreData {
  const sorted = getGames(store);
  const idx = sorted.findIndex(g => g.id === id);
  if (idx < 0) return store;
  const swap = idx + dir;
  if (swap < 0 || swap >= sorted.length) return store;
  const next = [...sorted];
  [next[idx], next[swap]] = [next[swap], next[idx]];
  const reordered = next.map((g, i) => ({ ...g, order: i }));
  const updated = { ...store, games: reordered };
  saveStore(updated);
  return updated;
}

export function recordGameSession(
  store: StoreData,
  gameId: string,
  opts: { players?: number; duration?: number; notes?: string; amount?: number } = {}
): StoreData {
  const game = (store.games || []).find(g => g.id === gameId);
  if (!game) return store;
  const players = Math.max(1, Math.round(opts.players ?? 1));
  const amount = opts.amount ?? game.price * players;
  const session: GameSession = {
    id: gid(),
    gameId,
    gameName: game.name,
    amount,
    players,
    duration: opts.duration,
    notes: opts.notes?.trim() || undefined,
    date: new Date().toISOString(),
  };
  const updated = {
    ...store,
    gameSessions: [session, ...(store.gameSessions || [])],
  };
  saveStore(updated);
  return updated;
}

export function deleteSession(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    gameSessions: (store.gameSessions || []).filter(s => s.id !== id),
  };
  saveStore(updated);
  return updated;
}

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

export function getSessionsInRange(store: StoreData, sinceMs: number): GameSession[] {
  return (store.gameSessions || []).filter(s => new Date(s.date).getTime() >= sinceMs);
}

export function getDailyStats(store: StoreData) {
  const today = getSessionsInRange(store, startOfDay());
  const total = today.reduce((s, x) => s + x.amount, 0);
  const players = today.reduce((s, x) => s + x.players, 0);
  return { total, players, count: today.length, sessions: today };
}

export function getAnalytics(store: StoreData) {
  const all = store.gameSessions || [];
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const dayTotal = all.filter(s => now - new Date(s.date).getTime() < day).reduce((a, s) => a + s.amount, 0);
  const weekTotal = all.filter(s => now - new Date(s.date).getTime() < 7 * day).reduce((a, s) => a + s.amount, 0);
  const monthTotal = all.filter(s => now - new Date(s.date).getTime() < 30 * day).reduce((a, s) => a + s.amount, 0);

  const byGame = new Map<string, { name: string; sessions: number; players: number; revenue: number }>();
  all.forEach(s => {
    const cur = byGame.get(s.gameId) || { name: s.gameName, sessions: 0, players: 0, revenue: 0 };
    cur.sessions += 1;
    cur.players += s.players;
    cur.revenue += s.amount;
    byGame.set(s.gameId, cur);
  });
  const games = Array.from(byGame.values());
  const mostPlayed = [...games].sort((a, b) => b.sessions - a.sessions)[0];
  const topEarning = [...games].sort((a, b) => b.revenue - a.revenue)[0];

  const days: { label: string; amount: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const start = d.getTime();
    const end = start + day;
    const amount = all
      .filter(s => {
        const t = new Date(s.date).getTime();
        return t >= start && t < end;
      })
      .reduce((a, s) => a + s.amount, 0);
    days.push({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), amount });
  }

  return { dayTotal, weekTotal, monthTotal, mostPlayed, topEarning, days, games };
}
