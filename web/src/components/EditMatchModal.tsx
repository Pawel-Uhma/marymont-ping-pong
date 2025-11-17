import { useState, useEffect } from 'react';
import { dataService } from '../api';
import type { Player, Category, GroupMatch, EliminationMatch, Group, Match } from '../api/types';

interface EditMatchModalProps {
  category: Category;
  match: Match;
  onMatchUpdated: () => void;
  onClose: () => void;
}

// Removed DraggedPlayer interface - no longer needed

interface MatchDraft {
  player1: Player | null;
  player2: Player | null;
  scheduledAt: string;
  status: 'scheduled' | 'in_progress' | 'final';
  phase: 'group' | 'elim';
  groupId?: string;
}

export function EditMatchModal({ category, match, onMatchUpdated, onClose }: EditMatchModalProps) {
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  // Removed draggedPlayer state - no longer needed
  const [matchDraft, setMatchDraft] = useState<MatchDraft>({
    player1: null,
    player2: null,
    scheduledAt: match.scheduledAt || new Date().toISOString().split('T')[0],
    status: match.status,
    phase: match.phase,
    groupId: match.phase === 'group' ? (match as GroupMatch).groupId : undefined
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Helper function to format date for display
  const formatDateForInput = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  };

  // Load players and groups when component mounts
  useEffect(() => {
    loadData();
  }, [category]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const [playersData, groupsData] = await Promise.all([
        dataService.getPlayers(category),
        dataService.getGroups(category)
      ]);
      
      setAllPlayers(playersData);
      setGroups(groupsData);

      // Find current players in the match
      const player1 = playersData.find(p => p.id === match.p1);
      const player2 = playersData.find(p => p.id === match.p2);

      setMatchDraft(prev => ({
        ...prev,
        player1: player1 || null,
        player2: player2 || null,
        scheduledAt: match.scheduledAt || new Date().toISOString().split('T')[0],
        status: match.status,
        phase: match.phase,
        groupId: match.phase === 'group' ? (match as GroupMatch).groupId : undefined
      }));
    } catch (error) {
      console.error('Load data error:', error);
      setError('Failed to load players and groups');
    } finally {
      setIsLoading(false);
    }
  };

  // Get available players based on match type and group
  const getAvailablePlayers = (): Player[] => {
    if (matchDraft.phase === 'group' && matchDraft.groupId) {
      // For group matches, only show players from the selected group
      const selectedGroup = groups.find(g => g.id === matchDraft.groupId);
      if (selectedGroup) {
        return allPlayers.filter(player => selectedGroup.players.includes(player.id));
      }
      return [];
    } else {
      // For elimination matches, show all players
      return allPlayers;
    }
  };

  // Handle player selection
  const handlePlayerSelect = (playerSlot: 'player1' | 'player2', playerId: string) => {
    if (playerId === '') {
      setMatchDraft(prev => ({
        ...prev,
        [playerSlot]: null
      }));
    } else {
      const selectedPlayer = allPlayers.find(p => p.id === playerId);
      if (selectedPlayer) {
        setMatchDraft(prev => ({
          ...prev,
          [playerSlot]: selectedPlayer
        }));
      }
    }
  };

  // Removed removePlayerFromMatch function - no longer needed

  // Handle date change
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMatchDraft(prev => ({
      ...prev,
      scheduledAt: e.target.value
    }));
  };

  // Handle status change
  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMatchDraft(prev => ({
      ...prev,
      status: e.target.value as 'scheduled' | 'in_progress' | 'final'
    }));
  };

  // Handle phase change
  const handlePhaseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const phase = e.target.value as 'group' | 'elim';
    setMatchDraft(prev => ({
      ...prev,
      phase,
      groupId: phase === 'group' ? prev.groupId : undefined
    }));
  };

  // Save match to database
  const handleSaveMatch = async () => {
    try {
      setIsSaving(true);
      setError('');
      
      if (!matchDraft.player1 || !matchDraft.player2) {
        setError('Proszę wybrać obu graczy do meczu');
        return;
      }

      if (matchDraft.player1.id === matchDraft.player2.id) {
        setError('Gracz nie może grać przeciwko sobie');
        return;
      }
      
      // Validate group match requirements
      if (matchDraft.phase === 'group') {
        if (!matchDraft.groupId) {
          setError('ID Grupy jest wymagane dla meczów grupowych');
          return;
        }
        
        // Check if both players are in the same group
        const group = groups.find(g => g.id === matchDraft.groupId);
        if (group) {
          const player1InGroup = group.players.includes(matchDraft.player1.id);
          const player2InGroup = group.players.includes(matchDraft.player2.id);
          
          if (!player1InGroup || !player2InGroup) {
            setError('Obaj gracze muszą być w tej samej grupie dla meczów grupowych');
            return;
          }
        }
      }
      
      // Create match data for API (using player1/player2 field names expected by Lambda)
      const matchData = {
        id: match.id,
        player1: matchDraft.player1.id,
        player2: matchDraft.player2.id,
        winner: match.winner,
        status: matchDraft.status,
        sets: match.sets,
        category: category,
        phase: matchDraft.phase,
        groupId: matchDraft.phase === 'group' ? matchDraft.groupId : undefined,
        scheduledAt: matchDraft.scheduledAt,
        advancesTo: matchDraft.phase === 'elim' ? (match as EliminationMatch).advancesTo : undefined
      };
      
      const success = await dataService.updateMatch(matchData);
      
      if (success) {
        onMatchUpdated();
      } else {
        setError('Nie udało się zaktualizować meczu');
      }
    } catch (error) {
      console.error('Update match error:', error);
      setError('Wystąpił błąd podczas aktualizacji meczu');
    } finally {
      setIsSaving(false);
    }
  };


  // Removed getPlayersInGroup function - no longer needed

  if (isLoading) {
    return (
      <div className="add-match-loading">
        <div className="loading">Ładowanie graczy i grup...</div>
      </div>
    );
  }

  return (
    <div className="add-match-modal">
      <div className="edit-match-modal-content">
        {/* Match Setup */}
        <div className="match-setup">
          <h4>Konfiguracja Meczu</h4>
          
          {/* Phase Selector */}
          <div className="input-group">
            <label htmlFor="phase" className="input-label">Faza Meczu *</label>
            <select
              id="phase"
              value={matchDraft.phase}
              onChange={handlePhaseChange}
              className="input-field"
              required
              disabled={isSaving}
            >
              <option value="group">Grupa</option>
              <option value="elim">Faza Pucharowa</option>
            </select>
          </div>

          {/* Group Selector (only for group matches) */}
          {matchDraft.phase === 'group' && (
            <div className="input-group">
              <label htmlFor="groupId" className="input-label">Grupa *</label>
              <select
                id="groupId"
                value={matchDraft.groupId || ''}
                onChange={(e) => setMatchDraft(prev => ({ ...prev, groupId: e.target.value }))}
                className="input-field"
                required
                disabled={isSaving}
              >
                <option value="">Wybierz Grupę</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>
                    Grupa {group.id.replace('group_', '')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Picker */}
          <div className="input-group">
            <label htmlFor="scheduledAt" className="input-label">Data Meczu *</label>
            <input
              type="date"
              id="scheduledAt"
              value={formatDateForInput(matchDraft.scheduledAt)}
              onChange={handleDateChange}
              className="input-field"
              required
              disabled={isSaving}
            />

          </div>

          {/* Status Selector */}
          <div className="input-group">
            <label htmlFor="status" className="input-label">Status Meczu *</label>
            <select
              id="status"
              value={matchDraft.status}
              onChange={handleStatusChange}
              className="input-field"
              required
              disabled={isSaving}
            >
              <option value="scheduled">Zaplanowany</option>
              <option value="in_progress">W trakcie</option>
              <option value="final">Zakończony</option>
            </select>
          </div>

          {/* Player Selection */}
          <div className="player-selection">
            <div className="player-slot-container">
              <label className="slot-label">Gracz 1</label>
              <select
                value={matchDraft.player1?.id || ''}
                onChange={(e) => handlePlayerSelect('player1', e.target.value)}
                className="player-select"
              >
                <option value="">Wybierz Gracza 1</option>
                {getAvailablePlayers().map(player => (
                  <option key={player.id} value={player.id}>
                    {player.name} {player.surname} (#{player.id})
                  </option>
                ))}
              </select>
            </div>

            <div className="vs-divider">VS</div>

            <div className="player-slot-container">
              <label className="slot-label">Gracz 2</label>
              <select
                value={matchDraft.player2?.id || ''}
                onChange={(e) => handlePlayerSelect('player2', e.target.value)}
                className="player-select"
              >
                <option value="">Wybierz Gracza 2</option>
                {getAvailablePlayers().map(player => (
                  <option key={player.id} value={player.id}>
                    {player.name} {player.surname} (#{player.id})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Available Players Info */}
        <div className="available-players-info">
          <h4>Dostępni Gracze</h4>
          <p>
            {matchDraft.phase === 'group' 
              ? `Pokazywanie graczy z wybranej grupy (${matchDraft.groupId || 'brak wybranej'})`
              : 'Pokazywanie wszystkich graczy dla meczu eliminacyjnego'
            }
          </p>
          <p className="player-count">
            {getAvailablePlayers().length} gracz{getAvailablePlayers().length !== 1 ? 'y' : ''} dostępn{getAvailablePlayers().length !== 1 ? 'i' : 'y'}
          </p>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError('')} className="error-close">×</button>
        </div>
      )}

      <div className="modal-actions">
        <button 
          className="secondary-btn"
          onClick={onClose}
          disabled={isSaving}
        >
          Anuluj
        </button>
        <button 
          className="primary-btn"
          onClick={handleSaveMatch}
          disabled={isSaving || !matchDraft.player1 || !matchDraft.player2}
        >
          {isSaving ? 'Zapisywanie...' : 'Zaktualizuj Mecz'}
        </button>
      </div>
    </div>
  );
}
