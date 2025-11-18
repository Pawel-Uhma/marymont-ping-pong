import { useState, useEffect } from 'react';
import { dataService } from '../api';
import type { Category, Group, Player } from '../api/types';

interface GenerateGroupMatchesModalProps {
  onMatchesGenerated: () => void;
  onClose: () => void;
}

export function GenerateGroupMatchesModal({ onMatchesGenerated, onClose }: GenerateGroupMatchesModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<Category>('man');
  const [groups, setGroups] = useState<Group[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Calculate date 2 weeks from now
  const getDateTwoWeeksFromNow = (): string => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().split('T')[0];
  };

  // Load groups and players when category changes
  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError('');
      setSuccess('');
      
      const [groupsData, playersData] = await Promise.all([
        dataService.getGroups(selectedCategory),
        dataService.getPlayers(selectedCategory)
      ]);
      
      setGroups(groupsData);
      setPlayers(playersData);
    } catch (error) {
      console.error('Load data error:', error);
      setError('Nie udało się załadować grup i graczy');
    } finally {
      setIsLoading(false);
    }
  };

  const generateMatches = async () => {
    try {
      setIsGenerating(true);
      setError('');
      setSuccess('');

      // Check if there are any groups
      if (groups.length === 0) {
        setError('Brak grup dla wybranej kategorii. Najpierw utwórz grupy.');
        return;
      }

      // Check if groups have players
      const groupsWithPlayers = groups.filter(group => group.players.length > 0);
      if (groupsWithPlayers.length === 0) {
        setError('Brak graczy w grupach. Najpierw przypisz graczy do grup.');
        return;
      }

      // Check if groups have at least 2 players (needed for matches)
      const validGroups = groupsWithPlayers.filter(group => group.players.length >= 2);
      if (validGroups.length === 0) {
        setError('Grupy muszą mieć co najmniej 2 graczy, aby wygenerować mecze.');
        return;
      }

      // Get existing matches to avoid duplicates
      const existingMatches = await dataService.getGroupMatches(selectedCategory);
      const existingMatchKeys = new Set(
        existingMatches.map(m => `${m.p1}-${m.p2}-${m.groupId || ''}`)
      );

      // Calculate date 2 weeks from now
      const scheduledDate = getDateTwoWeeksFromNow();

      // Generate round-robin matches for each group
      let matchesCreated = 0;
      let matchesSkipped = 0;

      for (const group of validGroups) {
        const groupPlayers = group.players;
        
        // Generate all pairs (round-robin: each player plays with each player)
        for (let i = 0; i < groupPlayers.length; i++) {
          for (let j = i + 1; j < groupPlayers.length; j++) {
            const player1Id = groupPlayers[i];
            const player2Id = groupPlayers[j];
            
            // Check if match already exists
            const matchKey = `${player1Id}-${player2Id}-${group.id}`;
            const reverseMatchKey = `${player2Id}-${player1Id}-${group.id}`;
            
            if (existingMatchKeys.has(matchKey) || existingMatchKeys.has(reverseMatchKey)) {
              matchesSkipped++;
              continue;
            }

            // Create match data
            const matchData = {
              player1: player1Id,
              player2: player2Id,
              winner: null,
              status: 'scheduled' as const,
              sets: [],
              category: selectedCategory,
              type: 'group' as const,
              group: group.id,
              scheduledAt: scheduledDate
            };

            // Create the match
            const success = await dataService.createMatch(matchData);
            if (success) {
              matchesCreated++;
            } else {
              console.error(`Failed to create match: ${player1Id} vs ${player2Id} in group ${group.id}`);
            }
          }
        }
      }

      if (matchesCreated > 0) {
        setSuccess(`Pomyślnie wygenerowano ${matchesCreated} mecz${matchesCreated !== 1 ? 'ów' : ''} dla kategorii ${selectedCategory === 'man' ? 'mężczyzn' : 'kobiet'}.${matchesSkipped > 0 ? ` Pominięto ${matchesSkipped} mecz${matchesSkipped !== 1 ? 'ów' : ''} (już istnieją).` : ''}`);
        onMatchesGenerated();
        
        // Close modal after a short delay
        setTimeout(() => {
          onClose();
        }, 2000);
      } else if (matchesSkipped > 0) {
        setError(`Wszystkie mecze dla tej kategorii już istnieją.`);
      } else {
        setError('Nie udało się wygenerować meczów.');
      }
    } catch (error) {
      console.error('Generate matches error:', error);
      setError('Wystąpił błąd podczas generowania meczów');
    } finally {
      setIsGenerating(false);
    }
  };

  // Get summary of matches that will be generated
  const getMatchesSummary = () => {
    if (groups.length === 0) return { totalMatches: 0, groupsWithMatches: 0 };
    
    let totalMatches = 0;
    let groupsWithMatches = 0;
    
    groups.forEach(group => {
      if (group.players.length >= 2) {
        // Round-robin: n players = n*(n-1)/2 matches
        const matchesInGroup = (group.players.length * (group.players.length - 1)) / 2;
        totalMatches += matchesInGroup;
        groupsWithMatches++;
      }
    });
    
    return { totalMatches, groupsWithMatches };
  };

  const summary = getMatchesSummary();

  if (isLoading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content generate-matches-modal" onClick={(e) => e.stopPropagation()}>
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Ładowanie grup i graczy...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content generate-matches-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Wygeneruj Mecze dla Grup</h2>
          <button onClick={onClose} className="modal-close">×</button>
        </div>

        {error && (
          <div className="error-message">
            {error}
            <button onClick={() => setError('')} className="error-close">×</button>
          </div>
        )}

        {success && (
          <div className="success-message">
            {success}
          </div>
        )}

        <div className="generate-matches-content">
          {/* Category Selector */}
          <div className="category-selector">
            <label className="category-label">Kategoria:</label>
            <div className="category-tabs">
              <button 
                className={`category-tab ${selectedCategory === 'man' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('man')}
                disabled={isGenerating}
              >
                Mężczyźni
              </button>
              <button 
                className={`category-tab ${selectedCategory === 'woman' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('woman')}
                disabled={isGenerating}
              >
                Kobiety
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="matches-summary">
            <h3>Podsumowanie</h3>
            <div className="summary-info">
              <p><strong>Liczba grup:</strong> {groups.length}</p>
              <p><strong>Grupy z graczami (≥2):</strong> {summary.groupsWithMatches}</p>
              <p><strong>Mecze do wygenerowania:</strong> {summary.totalMatches}</p>
              <p><strong>Data meczów:</strong> {getDateTwoWeeksFromNow()} (za 2 tygodnie)</p>
            </div>
          </div>

          {/* Groups Preview */}
          {groups.length > 0 && (
            <div className="groups-preview">
              <h3>Grupy</h3>
              <div className="groups-list">
                {groups.map(group => {
                  const playersInGroup = players.filter(p => group.players.includes(p.id));
                  const matchesInGroup = playersInGroup.length >= 2 
                    ? (playersInGroup.length * (playersInGroup.length - 1)) / 2 
                    : 0;
                  
                  return (
                    <div key={group.id} className="group-preview-item">
                      <div className="group-preview-header">
                        <span className="group-name">Grupa {group.id}</span>
                        <span className="group-stats">
                          {playersInGroup.length} gracz{playersInGroup.length !== 1 ? 'y' : ''} → {matchesInGroup} mecz{matchesInGroup !== 1 ? 'ów' : ''}
                        </span>
                      </div>
                      {playersInGroup.length === 0 && (
                        <div className="group-warning">Brak graczy w grupie</div>
                      )}
                      {playersInGroup.length === 1 && (
                        <div className="group-warning">Za mało graczy (minimum 2)</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {groups.length === 0 && (
            <div className="no-groups-message">
              <p>Brak grup dla wybranej kategorii. Najpierw utwórz grupy w oknie "Grupy".</p>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button 
            className="secondary-btn"
            onClick={onClose}
            disabled={isGenerating}
          >
            Anuluj
          </button>
          <button 
            className="primary-btn"
            onClick={generateMatches}
            disabled={isGenerating || groups.length === 0 || summary.totalMatches === 0}
          >
            {isGenerating ? 'Generowanie...' : 'Wygeneruj Mecze'}
          </button>
        </div>
      </div>
    </div>
  );
}

