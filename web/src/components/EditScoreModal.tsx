import { useState, useEffect } from 'react';
import { dataService } from '../api';
import type { GroupMatch, EliminationMatch, Player } from '../api/types';

interface EditScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScoreUpdated: () => void;
  match: GroupMatch | EliminationMatch;
  players: Player[];
}

interface SetScore {
  p1: number;
  p2: number;
}

export function EditScoreModal({ isOpen, onClose, onScoreUpdated, match, players }: EditScoreModalProps) {
  const [scores, setScores] = useState<SetScore[]>([
    { p1: 0, p2: 0 },
    { p1: 0, p2: 0 },
    { p1: 0, p2: 0 },
    { p1: 0, p2: 0 },
    { p1: 0, p2: 0 }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [matchStatus, setMatchStatus] = useState<'scheduled' | 'in_progress' | 'final'>(match.status);

  // Initialize scores when modal opens
  useEffect(() => {
    if (isOpen && match.sets) {
      const initializedScores = [...scores];
      match.sets.forEach((set, index) => {
        if (index < 5) {
          initializedScores[index] = { p1: set.p1, p2: set.p2 };
        }
      });
      setScores(initializedScores);
      setMatchStatus(match.status);
    }
  }, [isOpen, match]);

  // Get player names
  const getPlayerName = (playerId: string): string => {
    const player = players.find(p => p.id === playerId);
    return player ? `${player.name} ${player.surname}` : 'Unknown Player';
  };

  // Validate set score
  const isValidSetScore = (p1Score: number, p2Score: number): boolean => {
    if (p1Score < 0 || p2Score < 0) return false;
    if (p1Score > 50 || p2Score > 50) return false; // Reasonable upper limit
    if (p1Score === 0 && p2Score === 0) return true; // Empty set is valid
    if (p1Score === p2Score) return false; // No ties allowed
    
    // At least one player must have scored
    if (p1Score === 0 && p2Score === 0) return true; // Empty set is valid
    
    const maxScore = Math.max(p1Score, p2Score);
    const minScore = Math.min(p1Score, p2Score);
    
    // Must win by at least 2 points and reach at least 11 points
    return maxScore >= 11 && (maxScore - minScore) >= 2;
  };

  // Calculate match winner
  const calculateMatchWinner = (): string | null => {
    let p1Wins = 0;
    let p2Wins = 0;
    
    scores.forEach(score => {
      if (isValidSetScore(score.p1, score.p2)) {
        if (score.p1 > score.p2) {
          p1Wins++;
        } else if (score.p2 > score.p1) {
          p2Wins++;
        }
      }
    });
    
    if (p1Wins >= 3) return match.p1;
    if (p2Wins >= 3) return match.p2;
    return null;
  };

  // Check if match is complete
  const isMatchComplete = (): boolean => {
    let completedSets = 0;
    scores.forEach(score => {
      if (isValidSetScore(score.p1, score.p2) && (score.p1 > 0 || score.p2 > 0)) {
        completedSets++;
      }
    });
    
    const winner = calculateMatchWinner();
    return completedSets >= 3 && winner !== null;
  };

  // Handle score input change
  const handleScoreChange = (setIndex: number, player: 'p1' | 'p2', value: string) => {
    const numValue = parseInt(value) || 0;
    setScores(prev => {
      const newScores = [...prev];
      newScores[setIndex] = { ...newScores[setIndex], [player]: numValue };
      return newScores;
    });
    setError('');
  };

  // Handle status change
  const handleStatusChange = (newStatus: 'scheduled' | 'in_progress' | 'final') => {
    setMatchStatus(newStatus);
  };

  // Handle save
  const handleSave = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Validate all non-empty sets
      for (let i = 0; i < scores.length; i++) {
        const score = scores[i];
        // Check if this is a played set (at least one player scored)
        if (score.p1 > 0 || score.p2 > 0) {
          if (!isValidSetScore(score.p1, score.p2)) {
            setError(`Set ${i + 1} has an invalid score. Scores must be at least 11 points with a 2-point difference.`);
            return;
          }
        }
      }

      // Determine final status
      const finalStatus = isMatchComplete() ? 'final' : matchStatus;
      const winner = isMatchComplete() ? calculateMatchWinner() : null;

      // Prepare match data for update
      const matchData = {
        id: match.id,
        player1: match.p1,
        player2: match.p2,
        winner: winner,
        status: finalStatus,
        sets: scores,
        category: match.phase === 'group' ? 'man' : 'woman', // This might need to be determined differently
        phase: match.phase,
        groupId: match.phase === 'group' ? (match as GroupMatch).groupId : undefined,
        scheduledAt: match.scheduledAt,
        advancesTo: match.phase === 'elim' ? (match as EliminationMatch).advancesTo : undefined
      };

      // Update match
      const success = await dataService.updateMatch(matchData);
      
      if (success) {
        onScoreUpdated();
        onClose();
      } else {
        setError('Failed to update match score');
      }
    } catch (error) {
      console.error('Update score error:', error);
      setError('An error occurred while updating the score');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle close
  const handleClose = () => {
    if (!isLoading) {
      setError('');
      onClose();
    }
  };

  if (!isOpen) return null;

  const p1Name = getPlayerName(match.p1);
  const p2Name = getPlayerName(match.p2);
  const winner = calculateMatchWinner();
  const matchComplete = isMatchComplete();

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content edit-score-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Match Score</h2>
          <button className="modal-close" onClick={handleClose} disabled={isLoading}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Match Info */}
          <div className="match-info-section">
            <div className="match-players">
              <div className="player-info">
                <div className="player-name">{p1Name}</div>
                <div className="player-id">#{match.p1}</div>
              </div>
              <div className="vs-divider">VS</div>
              <div className="player-info">
                <div className="player-name">{p2Name}</div>
                <div className="player-id">#{match.p2}</div>
              </div>
            </div>
            
            {matchComplete && winner && (
              <div className="match-winner">
                🏆 Winner: {winner === match.p1 ? p1Name : p2Name}
              </div>
            )}
          </div>

          {/* Status Selector */}
          <div className="input-group">
            <label htmlFor="status" className="input-label">Match Status</label>
            <select
              id="status"
              value={matchStatus}
              onChange={(e) => handleStatusChange(e.target.value as any)}
              className="input-field"
              disabled={isLoading}
            >
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="final">Final</option>
            </select>
          </div>

          {/* Sets Score Input */}
          <div className="sets-scoring">
            <h3>Set Scores</h3>
            <div className="sets-container">
              {scores.map((score, index) => (
                <div key={index} className="set-input">
                  <div className="set-number">Set {index + 1}</div>
                  <div className="score-inputs">
                    <div className="score-input-group">
                      <label className="score-label">{p1Name}</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={score.p1}
                        onChange={(e) => handleScoreChange(index, 'p1', e.target.value)}
                        className="score-input"
                        disabled={isLoading}
                      />
                    </div>
                    <div className="score-separator">-</div>
                    <div className="score-input-group">
                      <label className="score-label">{p2Name}</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={score.p2}
                        onChange={(e) => handleScoreChange(index, 'p2', e.target.value)}
                        className="score-input"
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                  <div className="set-status">
                    {(score.p1 > 0 || score.p2 > 0) ? (
                      isValidSetScore(score.p1, score.p2) ? (
                        <span className="set-valid">✓ Valid</span>
                      ) : (
                        <span className="set-invalid">✗ Invalid</span>
                      )
                    ) : (
                      <span className="set-empty">Empty</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Match Summary */}
          <div className="match-summary">
            <h4>Match Summary</h4>
            <div className="summary-stats">
              <div className="stat">
                <span className="stat-label">Completed Sets:</span>
                <span className="stat-value">
                  {scores.filter(s => isValidSetScore(s.p1, s.p2) && (s.p1 > 0 || s.p2 > 0)).length}/5
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Match Status:</span>
                <span className={`stat-value ${matchComplete ? 'complete' : 'incomplete'}`}>
                  {matchComplete ? 'Complete' : 'Incomplete'}
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div className="error-message">
              {error}
              <button onClick={() => setError('')} className="error-close">×</button>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            onClick={handleClose}
            className="secondary-btn"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="primary-btn"
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Save Score'}
          </button>
        </div>
      </div>
    </div>
  );
}
