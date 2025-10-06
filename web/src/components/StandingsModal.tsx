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
  const getPlayerName = (playerId: string): string => {
    const player = players.find(p => p.id === playerId);
    return player ? `${player.name} ${player.surname}` : 'Nieznany Gracz';
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
          existingPlayer.setsFor += player.setsFor;
          existingPlayer.setsAgainst += player.setsAgainst;
          existingPlayer.pointsFor += player.pointsFor;
          existingPlayer.pointsAgainst += player.pointsAgainst;
        } else {
          // Add new player
          allPlayers.set(player.playerId, { ...player });
        }
      });
    });

    // Convert to array and sort by wins/losses
    const combinedPlayers = Array.from(allPlayers.values());
    return combinedPlayers.sort((a, b) => {
      // Primary: Wins - Losses
      const aRecord = a.wins - a.losses;
      const bRecord = b.wins - b.losses;
      if (aRecord !== bRecord) return bRecord - aRecord;
      
      // Secondary: Sets difference
      const aSetsDiff = (a.setsFor - a.setsAgainst) - (b.setsFor - b.setsAgainst);
      if (aSetsDiff !== 0) return aSetsDiff;
      
      // Tertiary: Points difference
      return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
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
        title: `${selectedCategory === 'man' ? 'Mężczyźni' : 'Kobiety'} - Grupa ${selectedGroupId}`,
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
                    Grupa {group.groupId}
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
                <p>Ładowanie klasyfikacji...</p>
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
                        const winPercentage = (player.wins + player.losses) > 0 
                          ? ((player.wins / (player.wins + player.losses)) * 100).toFixed(1)
                          : '0.0';
                        
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
                                <span className="player-name">{getPlayerName(player.playerId)}</span>
                                <span className="player-id">#{player.playerId}</span>
                              </div>
                            </td>
                            <td className="record-cell">
                              <span className="wins">{player.wins}</span>-
                              <span className="losses">{player.losses}</span>
                            </td>
                            <td className="sets-cell">
                              <span className={`sets-diff ${(player.setsFor - player.setsAgainst) > 0 ? 'positive' : 'negative'}`}>
                                {(player.setsFor - player.setsAgainst) > 0 ? '+' : ''}{player.setsFor - player.setsAgainst}
                              </span>
                            </td>
                            <td className="points-cell">
                              <span className={`points-diff ${(player.pointsFor - player.pointsAgainst) > 0 ? 'positive' : 'negative'}`}>
                                {(player.pointsFor - player.pointsAgainst) > 0 ? '+' : ''}{player.pointsFor - player.pointsAgainst}
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
