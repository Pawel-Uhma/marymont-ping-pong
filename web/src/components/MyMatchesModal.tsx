import { useState, useEffect } from 'react';
import { dataService } from '../api';
import type { GroupMatch, EliminationMatch, Player, Category } from '../api/types';

interface MyMatchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMatchEdited: (match: GroupMatch | EliminationMatch) => void;
  userId: string;
  category: Category;
  players: Player[];
}

export function MyMatchesModal({ isOpen, onClose, onMatchEdited, userId, category, players }: MyMatchesModalProps) {
  const [matches, setMatches] = useState<(GroupMatch | EliminationMatch)[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load matches when modal opens
  useEffect(() => {
    if (isOpen) {
      loadMatches();
    }
  }, [isOpen, userId, category]);

  const loadMatches = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      // Get all matches for the user
      const userMatches = await dataService.getMatchesForPlayer(category, userId);
      
      // Sort matches by date (most recent first)
      const sortedMatches = userMatches.sort((a, b) => {
        const dateA = new Date(a.scheduledAt || '1970-01-01');
        const dateB = new Date(b.scheduledAt || '1970-01-01');
        return dateB.getTime() - dateA.getTime();
      });
      
      setMatches(sortedMatches);
    } catch (error) {
      console.error('Load matches error:', error);
      setError('Nie udało się załadować meczów');
    } finally {
      setIsLoading(false);
    }
  };

  // Get player name by ID
  const getPlayerName = (playerId: string): string => {
    const player = players.find(p => p.id === playerId);
    return player ? `${player.name} ${player.surname}` : 'Nieznany Gracz';
  };

  // Check if user won the match
  const didUserWin = (match: GroupMatch | EliminationMatch): boolean => {
    return match.winner === userId;
  };

  // Check if match is in the past
  const isPastMatch = (match: GroupMatch | EliminationMatch): boolean => {
    if (!match.scheduledAt) return false;
    return new Date(match.scheduledAt) < new Date();
  };

  // Get match status color
  const getMatchStatusColor = (match: GroupMatch | EliminationMatch): string => {
    if (match.status === 'final') {
      return didUserWin(match) ? 'var(--green)' : 'var(--red)';
    }
    if (match.status === 'in_progress') {
      return 'var(--blue)';
    }
    return 'var(--dark-gray)';
  };

  // Get match status text
  const getMatchStatusText = (match: GroupMatch | EliminationMatch): string => {
    if (match.status === 'final') {
      return didUserWin(match) ? 'Wygrana' : 'Przegrana';
    }
    if (match.status === 'in_progress') {
      return 'W trakcie';
    }
      return 'Zaplanowany';
  };

  // Get opponent name
  const getOpponentName = (match: GroupMatch | EliminationMatch): string => {
    return match.p1 === userId ? getPlayerName(match.p2) : getPlayerName(match.p1);
  };

  // Handle edit match
  const handleEditMatch = (match: GroupMatch | EliminationMatch) => {
    onMatchEdited(match);
    onClose(); // Close this modal to open the edit score modal
  };

  // Handle close
  const handleClose = () => {
    if (!isLoading) {
      setError('');
      onClose();
    }
  };

  // Format date
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  };

  // Get match sets summary
  const getSetsSummary = (match: GroupMatch | EliminationMatch): string => {
    if (!match.sets || match.sets.length === 0) return 'No scores';
    
    // Filter out completely empty sets (0-0) but include sets with at least one score > 0
    const playedSets = match.sets.filter(set => set.p1 > 0 || set.p2 > 0);
    if (playedSets.length === 0) return 'No scores';
    
    return playedSets.map(set => `${set.p1}-${set.p2}`).join(', ');
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content my-matches-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Moje Mecze</h2>
          <button className="modal-close" onClick={handleClose} disabled={isLoading}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error-message">
              {error}
              <button onClick={() => setError('')} className="error-close">×</button>
            </div>
          )}

          {isLoading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
              <p>Ładowanie meczów...</p>
            </div>
          ) : (
            <div className="matches-list-container">
              {matches.length > 0 ? (
                <div className="matches-grid">
                  {matches.map((match) => (
                    <div key={match.id} className="match-card">
                      <div className="match-header">
                        <div className="match-phase">
                          <span className={`phase-badge ${match.phase}`}>
                            {match.phase === 'group' ? 'Grupa' : 'Faza Pucharowa'}
                          </span>
                        </div>
                        <div className="match-date">
                          {formatDate(match.scheduledAt)}
                        </div>
                      </div>

                      <div className="match-content">
                        <div className="match-players">
                          <div className="player-info">
                            <div className="player-name">
                              {getPlayerName(userId)}
                            </div>
                            <div className="player-label">Ty</div>
                          </div>
                          
                          <div className="vs-section">
                            <div className="vs-divider">VS</div>
                            <div className="sets-summary">
                              {getSetsSummary(match)}
                            </div>
                          </div>
                          
                          <div className="player-info">
                            <div className="player-name">
                              {getOpponentName(match)}
                            </div>
                            <div className="player-label">Przeciwnik</div>
                          </div>
                        </div>

                        <div className="match-status-section">
                          <div 
                            className="status-indicator"
                            style={{ backgroundColor: getMatchStatusColor(match) }}
                          >
                            {match.status === 'final' && (
                              <span className="status-icon">
                                {didUserWin(match) ? '🏆' : '💔'}
                              </span>
                            )}
                            <span className="status-text">
                              {getMatchStatusText(match)}
                            </span>
                          </div>

                          <button
                            className="edit-match-btn"
                            onClick={() => handleEditMatch(match)}
                            title={match.status === 'scheduled' ? 'Edytuj Szczegóły Meczu' : 'Edytuj Wynik'}
                          >
                            {match.status === 'scheduled' ? '📅 Edytuj' : '✏️ Edytuj'}
                          </button>
                        </div>
                      </div>

                      <div className="match-footer">
                        <div className={`time-indicator ${isPastMatch(match) ? 'past' : 'future'}`}>
                          {isPastMatch(match) ? 'Mecz Zakończony' : 'Mecz Przyszły'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-matches">
                  <div className="no-matches-icon">🏓</div>
                  <h3>Nie Znaleziono Meczów</h3>
                  <p>Nie masz jeszcze zaplanowanych meczów.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
