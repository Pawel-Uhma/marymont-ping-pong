import { useState, useEffect } from 'react';
import { dataService } from '../api';
import type { GroupStanding, Player, Category, PlayerStanding } from '../api/types';

interface StandingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
}

export function StandingsModal({ isOpen, onClose, players }: StandingsModalProps) {
  const [standings, setStandings] = useState<GroupStanding[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category>('man');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load standings when modal opens or category changes
  useEffect(() => {
    if (isOpen) {
      loadStandings();
    }
  }, [isOpen, selectedCategory]);

  // Reset group selection when category changes
  useEffect(() => {
    setSelectedGroupId('all');
  }, [selectedCategory]);

  const loadStandings = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      // Automatically recalculate standings when modal opens
      // If recalculation fails (e.g., non-admin user), just load existing standings
      try {
        await dataService.recalculateStandings(selectedCategory);
      } catch (recalcError) {
        // Silently fail recalculation - will just load existing standings
        console.log('Recalculation not available, loading existing standings');
      }
      
      // Load the standings (either newly calculated or existing)
      const standingsData = await dataService.getStandings(selectedCategory);
      setStandings(standingsData);
    } catch (error) {
      console.error('Load standings error:', error);
      setError('Nie udało się załadować klasyfikacji');
    } finally {
      setIsLoading(false);
    }
  };

  // Get player name by ID
  const getPlayerName = (player: PlayerStanding): string => {
    // Use the name from the standings data if available
    if (player.name && player.surname) {
      return `${player.name} ${player.surname}`;
    }
    // Fallback to lookup in players array
    const playerData = players.find(p => p.id === player.playerId);
    return playerData ? `${playerData.name} ${playerData.surname}` : 'Nieznany Gracz';
  };

  // Get all players from all groups combined
  const getAllPlayersStandings = (): PlayerStanding[] => {
    const allPlayers = new Map<string, PlayerStanding>();
    
    standings.forEach(group => {
      group.table.forEach(player => {
        const existingPlayer = allPlayers.get(player.playerId);
        if (existingPlayer) {
          // Combine stats
          existingPlayer.wins += player.wins;
          existingPlayer.losses += player.losses;
          existingPlayer.setsWon += player.setsWon;
          existingPlayer.setsLost += player.setsLost;
          existingPlayer.pointsWon += player.pointsWon;
          existingPlayer.pointsLost += player.pointsLost;
          // Recalculate differences
          existingPlayer.setDifference = existingPlayer.setsWon - existingPlayer.setsLost;
          existingPlayer.pointDifference = existingPlayer.pointsWon - existingPlayer.pointsLost;
          // Recalculate win percentage
          const totalMatches = existingPlayer.wins + existingPlayer.losses;
          existingPlayer.winPercentage = totalMatches > 0 ? (existingPlayer.wins / totalMatches) * 100 : 0;
          // Update legacy fields for backward compatibility
          existingPlayer.setsFor = existingPlayer.setsWon;
          existingPlayer.setsAgainst = existingPlayer.setsLost;
          existingPlayer.pointsFor = existingPlayer.pointsWon;
          existingPlayer.pointsAgainst = existingPlayer.pointsLost;
        } else {
          // Add new player with legacy field mapping
          allPlayers.set(player.playerId, { 
            ...player,
            setsFor: player.setsWon,
            setsAgainst: player.setsLost,
            pointsFor: player.pointsWon,
            pointsAgainst: player.pointsLost
          });
        }
      });
    });

    // Convert to array and sort by rank (since API already provides ranking)
    const combinedPlayers = Array.from(allPlayers.values());
    return combinedPlayers.sort((a, b) => {
      // Use the rank from API if available, otherwise sort by record
      if (a.rank && b.rank) {
        return a.rank - b.rank;
      }
      
      // Fallback sorting logic
      const aRecord = a.wins - a.losses;
      const bRecord = b.wins - b.losses;
      if (aRecord !== bRecord) return bRecord - aRecord;
      
      // Secondary: Sets difference
      if (a.setDifference !== b.setDifference) return b.setDifference - a.setDifference;
      
      // Tertiary: Points difference
      return b.pointDifference - a.pointDifference;
    });
  };

  // Get standings to display
  const getDisplayStandings = (): { title: string; standings: PlayerStanding[] } => {
    if (selectedGroupId === 'all') {
      return {
        title: `${selectedCategory === 'man' ? 'Mężczyźni' : 'Kobiety'} - Wszystkie Grupy Łącznie`,
        standings: getAllPlayersStandings()
      };
    } else {
      const group = standings.find(g => g.groupId === selectedGroupId);
      return {
        title: `${selectedCategory === 'man' ? 'Mężczyźni' : 'Kobiety'} - ${selectedGroupId === 'nogroup' ? 'Brak Grupy' : `Grupa ${selectedGroupId}`}`,
        standings: group ? group.table : []
      };
    }
  };

  // Handle category change
  const handleCategoryChange = (category: Category) => {
    setSelectedCategory(category);
  };

  // Handle group change
  const handleGroupChange = (groupId: string) => {
    setSelectedGroupId(groupId);
  };

  // Handle close
  const handleClose = () => {
    if (!isLoading) {
      setError('');
      onClose();
    }
  };

  if (!isOpen) return null;

  const displayData = getDisplayStandings();

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content standings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Klasyfikacja Turnieju</h2>
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

          {/* Category Selection */}
          <div className="standings-controls">
            <div className="category-tabs">
              <button 
                className={`category-tab ${selectedCategory === 'man' ? 'active' : ''}`}
                onClick={() => handleCategoryChange('man')}
                disabled={isLoading}
              >
                Mężczyźni
              </button>
              <button 
                className={`category-tab ${selectedCategory === 'woman' ? 'active' : ''}`}
                onClick={() => handleCategoryChange('woman')}
                disabled={isLoading}
              >
                Kobiety
              </button>
            </div>

            {/* Group Selection */}
            <div className="group-selection">
              <label className="group-label">Widok:</label>
              <div className="group-tabs">
                <button 
                  className={`group-tab ${selectedGroupId === 'all' ? 'active' : ''}`}
                  onClick={() => handleGroupChange('all')}
                  disabled={isLoading}
                >
                  Wszystkie Grupy
                </button>
                {standings.map((group) => (
                  <button 
                    key={group.groupId}
                    className={`group-tab ${selectedGroupId === group.groupId ? 'active' : ''}`}
                    onClick={() => handleGroupChange(group.groupId)}
                    disabled={isLoading}
                  >
                    {group.groupId === 'nogroup' ? 'Brak Grupy' : `Grupa ${group.groupId}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Standings Table */}
          <div className="standings-content">
            {isLoading ? (
              <div className="loading">
                <div className="loading-spinner"></div>
                <p>Przeliczanie i ładowanie klasyfikacji...</p>
              </div>
            ) : (
              <div className="standings-table-container">
                <h3 className="standings-title">{displayData.title}</h3>
                {displayData.standings.length > 0 ? (
                  <table className="standings-table">
                    <thead>
                      <tr>
                        <th>Miejsce</th>
                        <th>Gracz</th>
                        <th>W-P</th>
                        <th>Sety +/-</th>
                        <th>Punkty +/-</th>
                        <th>% Zwycięstw</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayData.standings.map((player, index) => {
                        // Use winPercentage from API if available, otherwise calculate
                        // Handle both old format (0-1) and new format (0-100)
                        let winPercentage: string;
                        if (player.winPercentage !== undefined) {
                          // If value is <= 1, it's in old format (0-1), multiply by 100
                          const percentage = player.winPercentage <= 1.0 ? player.winPercentage * 100 : player.winPercentage;
                          winPercentage = percentage.toFixed(1);
                        } else {
                          winPercentage = (player.wins + player.losses) > 0 
                            ? ((player.wins / (player.wins + player.losses)) * 100).toFixed(1)
                            : '0.0';
                        }
                        
                        return (
                          <tr key={player.playerId} className={index < 3 ? `top-${index + 1}` : ''}>
                            <td className="rank-cell">
                              {index + 1}
                              {index === 0 && ' 🥇'}
                              {index === 1 && ' 🥈'}
                              {index === 2 && ' 🥉'}
                            </td>
                            <td className="player-cell">
                              <div className="player-info">
                                <span className="player-name">{getPlayerName(player)}</span>
                                <span className="player-id">#{player.playerId}</span>
                              </div>
                            </td>
                            <td className="record-cell">
                              <span className="wins">{player.wins}</span>-
                              <span className="losses">{player.losses}</span>
                            </td>
                            <td className="sets-cell">
                              <span className={`sets-diff ${player.setDifference > 0 ? 'positive' : 'negative'}`}>
                                {player.setDifference > 0 ? '+' : ''}{player.setDifference}
                              </span>
                            </td>
                            <td className="points-cell">
                              <span className={`points-diff ${player.pointDifference > 0 ? 'positive' : 'negative'}`}>
                                {player.pointDifference > 0 ? '+' : ''}{player.pointDifference}
                              </span>
                            </td>
                            <td className="percentage-cell">
                              <span className="win-percentage">{winPercentage}%</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="no-standings">
                    <div className="no-standings-icon">📊</div>
                    <h3>Brak Dostępnej Klasyfikacji</h3>
                    <p>Nie znaleziono danych klasyfikacji dla wybranej kategorii i grupy.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
