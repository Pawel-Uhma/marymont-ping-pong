import type { EliminationMatch, Player } from '../api/types';

interface BracketViewProps {
  bracket: any;
  matches: EliminationMatch[];
  players: Player[];
  title: string;
  isAdmin: boolean;
  onMatchClick?: (match: EliminationMatch) => void;
}

export function BracketView({ bracket, matches, players, title, isAdmin, onMatchClick }: BracketViewProps) {
  const getPlayerName = (playerId: string, match?: EliminationMatch): string => {
    if (!playerId) return 'Do ustalenia';
    // Try match-level names first (from backend join)
    if (match) {
      if (playerId === match.p1 && match.p1Name) return match.p1Name;
      if (playerId === match.p2 && match.p2Name) return match.p2Name;
    }
    const player = players.find(p => p.id === playerId || String(p.id) === String(playerId));
    return player ? `${player.name} ${player.surname}` : playerId;
  };

  const getMatchById = (matchId: string | number): EliminationMatch | undefined => {
    return matches.find(m => m.id === matchId || String(m.id) === String(matchId));
  };

  const getSetScore = (match: EliminationMatch): string => {
    if (!match.sets) return '';
    const p1Wins = match.sets.filter(s => {
      const a = Number(s.p1), b = Number(s.p2);
      return a > 0 && b > 0 && a > b && a >= 11 && (a - b) >= 2;
    }).length;
    const p2Wins = match.sets.filter(s => {
      const a = Number(s.p1), b = Number(s.p2);
      return a > 0 && b > 0 && b > a && b >= 11 && (b - a) >= 2;
    }).length;
    if (p1Wins === 0 && p2Wins === 0) return '';
    return `${p1Wins}-${p2Wins}`;
  };

  if (!bracket || !bracket.rounds) {
    return (
      <div className="bracket-empty">
        <p>Drabinka nie została jeszcze utworzona</p>
      </div>
    );
  }

  return (
    <div className="bracket-view">
      <h3 className="bracket-title">{title}</h3>
      <div className="bracket-grid">
        {bracket.rounds.map((round: any, roundIndex: number) => (
          <div key={roundIndex} className="bracket-column">
            <div className="bracket-round-name">{round.name}</div>
            <div className="bracket-column-matches">
              {round.matchIds.map((matchId: string | number) => {
                const match = getMatchById(matchId);
                if (!match) return <div key={matchId} className="bracket-matchup empty" />;

                const score = getSetScore(match);
                const isClickable = isAdmin && match.p1 && match.p2;

                return (
                  <div
                    key={matchId}
                    className={`bracket-matchup ${match.status === 'final' ? 'final' : ''} ${isClickable ? 'clickable' : ''}`}
                    onClick={() => isClickable && onMatchClick?.(match)}
                  >
                    <div className={`bracket-player ${match.winner && match.winner === match.p1 ? 'winner' : ''} ${!match.p1 ? 'tbd' : ''}`}>
                      <span className="bracket-player-name">{getPlayerName(match.p1, match)}</span>
                      {score && <span className="bracket-player-score">{match.sets?.filter(s => Number(s.p1) > Number(s.p2) && Number(s.p1) >= 11).length}</span>}
                    </div>
                    <div className={`bracket-player ${match.winner && match.winner === match.p2 ? 'winner' : ''} ${!match.p2 ? 'tbd' : ''}`}>
                      <span className="bracket-player-name">{getPlayerName(match.p2, match)}</span>
                      {score && <span className="bracket-player-score">{match.sets?.filter(s => Number(s.p2) > Number(s.p1) && Number(s.p2) >= 11).length}</span>}
                    </div>
                    {score && <div className="bracket-match-score">{score}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
