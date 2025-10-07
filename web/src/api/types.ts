// API Types - Updated to match S3 schemas

// Account types - now includes player information
export interface Account {
  username: string;
  password: string;
  name: string;
  surname: string;
  role: 'admin' | 'player';
  playerId: number | null;
  category: 'man' | 'woman';
}

export interface AccountsData {
  users: Account[];
  updatedAt: string;
  version: number;
}

// Player type for backward compatibility (derived from Account)
export interface Player {
  id: string;
  name: string;
  surname: string;
  category: 'man' | 'woman';
}

export interface PlayersData {
  players: Player[];
  updatedAt: string;
  version: number;
}

// Group types
export interface Group {
  id: string;
  players: string[]; // player IDs
}

export interface GroupsData {
  groups: Group[];
  updatedAt: string;
  version: number;
}

// Match types
export interface Set {
  p1: number;
  p2: number;
}

export interface GroupMatch {
  id: string;
  phase: 'group';
  groupId: string;
  p1: string; // player ID
  p2: string; // player ID
  sets: Set[];
  winner: string | null; // player ID
  status: 'scheduled' | 'in_progress' | 'final';
  scheduledAt: string | null;
  updatedBy: string | null;
}

export interface EliminationMatch {
  id: string;
  phase: 'elim';
  roundName: string;
  p1: string; // player ID
  p2: string; // player ID
  sets: Set[];
  winner: string | null; // player ID
  status: 'scheduled' | 'in_progress' | 'final';
  advancesTo: {
    matchId: string;
    as: 'p1' | 'p2';
  } | null;
  scheduledAt: string | null;
  updatedBy: string | null;
}

export interface GroupMatchesData {
  matches: GroupMatch[];
  updatedAt: string;
  version: number;
}

export interface EliminationMatchesData {
  matches: EliminationMatch[];
  updatedAt: string;
  version: number;
}

// Union type for all matches
export type Match = GroupMatch | EliminationMatch;

// Standings types
export interface PlayerStanding {
  playerId: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
  setDifference: number;
  pointDifference: number;
  winPercentage: number;
  rank: number;
  name: string;
  surname: string;
  username: string;
  group: string;
  // Legacy fields for backward compatibility
  setsFor?: number;
  setsAgainst?: number;
  pointsFor?: number;
  pointsAgainst?: number;
}

export interface GroupStanding {
  groupId: string;
  table: PlayerStanding[];
}

export interface StandingsData {
  groups: GroupStanding[];
  tiebreakers: string[];
  updatedAt: string;
  version: number;
}

// Bracket types
export interface BracketSeed {
  slot: number;
  playerId: string;
}

export interface BracketRound {
  name: string;
  matchIds: string[];
}

export interface BracketData {
  seeds: BracketSeed[];
  rounds: BracketRound[];
  updatedAt: string;
  version: number;
}

// Common types
export interface S3Config {
  bucketName: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: {
    username: string;
    role: 'admin' | 'player';
    playerId: string | null;
  };
  error?: string;
}

// Lambda API Response types
export interface LambdaAuthResponse {
  success: boolean;
  token?: string;
  username?: string;
  role?: 'admin' | 'player';
  playerId?: string | null;
  error?: string;
}

export interface LambdaPlayersResponse {
  success: boolean;
  players?: Player[];
  error?: string;
}

export interface LambdaGroupsResponse {
  success: boolean;
  groups?: Group[];
  error?: string;
}

export interface LambdaMatchesResponse {
  success: boolean;
  matches?: (GroupMatch | EliminationMatch)[];
  error?: string;
}

export interface LambdaStandingsResponse {
  success: boolean;
  players?: PlayerStanding[];
  groups?: GroupStanding[]; // Legacy support
  error?: string;
}

export interface LambdaBracketResponse {
  success: boolean;
  bracket?: BracketData;
  error?: string;
}

export interface LambdaAccountsResponse {
  success: boolean;
  accounts?: Account[];
  error?: string;
}

// Category type
export type Category = 'man' | 'woman';

