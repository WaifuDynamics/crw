import { API, request } from './api';

// The rep counter (camera, pose model, the race screen) ships inside the app - see
// src/reps/embedded.ts - and matchmaking is part of the CRW+ API. Nothing about Play
// depends on a site of its own any more.
export const MATCH_API = `${API}/reps/match`;

export type Exercise = 'pushup' | 'squat';
export type GameMode = 'solo' | '1v1' | '2v2';

export const EXERCISE_LABEL: Record<Exercise, string> = {
  pushup: 'Push-ups',
  squat: 'Squats',
};

export const MODE_LABEL: Record<GameMode, string> = {
  solo: 'Solo',
  '1v1': '1v1',
  '2v2': '2v2',
};

// Wins and rankings are stored in the CRW+ database against real accounts.
export type SoloRecord = {
  sessions: number;
  reps: number;
  bestSet: number;
  bestSession: number;
  seconds: number;
  lastAt: string | null;
};

export type RepStats = {
  matches: number;
  wins: number;
  reps: number;
  byMode: Record<'1v1' | '2v2', number>;
  byExercise: Record<Exercise, number>;
  solo: Record<Exercise, SoloRecord>;
};

export type SoloSession = {
  sessionId: string;
  exercise: Exercise;
  reps: number;
  bestSet: number;
  seconds: number;
};

export type RankedPlayer = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  wins: number;
  matches: number;
  reps: number;
  rank: number;
};

export type MatchResult = {
  matchId: string;
  mode: '1v1' | '2v2';
  exercise: Exercise;
  won: boolean;
  reason: 'target' | 'walkover';
  reps: number;
  score: [number, number];
  opponents: string[];
};

export const fetchMyStats = () => request<RepStats>('/reps/me');

export async function fetchTop(limit = 3): Promise<RankedPlayer[]> {
  return (await request<{ top: RankedPlayer[] }>(`/reps/leaderboard?limit=${limit}`)).top;
}

export const recordResult = (result: MatchResult) =>
  request<{ recorded: boolean; stats: RepStats }>('/reps/results', {
    method: 'POST',
    body: JSON.stringify(result),
  });

export const recordSolo = (session: SoloSession) =>
  request<{ recorded: boolean; solo: Record<Exercise, SoloRecord> }>('/reps/sessions', {
    method: 'POST',
    body: JSON.stringify(session),
  });

export type Queues = {
  waiting: Record<'1v1' | '2v2', Record<Exercise, number>>;
  needed: Record<'1v1' | '2v2', number>;
  playing: number;
  online: number;
  target: number;
};

export async function fetchQueues(): Promise<Queues> {
  const r = await fetch(`${MATCH_API}/queues`);
  if (!r.ok) throw new Error(`queues: ${r.status}`);
  return r.json();
}
