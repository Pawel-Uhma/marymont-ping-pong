import { useState, useEffect } from 'react';
import { dataService } from '../api';
import type { Player, Category, Group } from '../api/types';

interface AddMatchModalProps {
  category: Category;
  onMatchAdded: () => void;
  onClose: () => void;
}

// Removed DraggedPlayer interface - no longer needed

interface MatchDraft {
  player1: Player | null;
  player2: Player | null;
  scheduledAt: string;
  status: 'scheduled' | 'in_progress' | 'final';
  type: 'group' | 'elimination';
  group?: string;
  round?: number;
}

export function AddMatchModal({ category, onMatchAdded, onClose }: AddMatchModalProps) {
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  // Removed draggedPlayer state - no longer needed
  const [matchDraft, setMatchDraft] = useState<MatchDraft>({
    player1: null,
    player2: null,
    scheduledAt: new Date().toISOString().split('T')[0], // Today's date
    status: 'scheduled',
    type: 'group',
    group: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Helper function to format date for display
  const formatDateForInput = (dateStr: string): string => {
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
    } catch (error) {
      console.error('Load data error:', error);
      setError('Failed to load players and groups');
    } finally {
      setIsLoading(false);
    }
  };

  // Get available players based on match type and group
  const getAvailablePlayers = (): Player[] => {
    if (matchDraft.type === 'group' && matchDraft.group) {
      // For group matches, only show players from the selected group
      const selectedGroup = groups.find(g => g.id === matchDraft.group);
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

  // Handle phase change
  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value as 'group' | 'elimination';
    setMatchDraft(prev => ({
      ...prev,
      type,
      group: type === 'group' ? prev.group : undefined,
      round: type === 'elimination' ? prev.round : undefined
    }));
  };

  // Save match to database
  const handleSaveMatch = async () => {
    console.log('AddMatchModal - handleSaveMatch called');
    try {
      setIsSaving(true);
      setError('');
      
      if (!matchDraft.player1 || !matchDraft.player2) {
        setError('Please select both players for the match');
        return;
      }

      if (matchDraft.player1.id === matchDraft.player2.id) {
        setError('A player cannot play against themselves');
        return;
      }

      // Validate group match requirements
      if (matchDraft.type === 'group') {
        if (!matchDraft.group) {
          setError('Group is required for group matches');
          return;
        }
        
        // Check if both players are in the same group
        const group = groups.find(g => g.id === matchDraft.group);
        if (group) {
          const player1InGroup = group.players.includes(matchDraft.player1.id);
          const player2InGroup = group.players.includes(matchDraft.player2.id);
          
          if (!player1InGroup || !player2InGroup) {
            setError('Both players must be in the same group for group matches');
            return;
          }
        }
      }
      
      // Validate elimination match requirements
      if (matchDraft.type === 'elimination') {
        if (!matchDraft.round) {
          setError('Round is required for elimination matches');
          return;
        }
      }
      
      // Create new match based on type
      let success = false;
      
      // Create match data for API (using player1/player2 field names expected by Lambda)
      const matchData = {
        player1: matchDraft.player1.id,
        player2: matchDraft.player2.id,
        winner: null,
        status: matchDraft.status,
        sets: [],
        category: category,
        type: matchDraft.type,
        group: matchDraft.type === 'group' ? matchDraft.group : undefined,
        round: matchDraft.type === 'elimination' ? matchDraft.round : undefined,
        scheduledAt: matchDraft.scheduledAt,
        advancesTo: matchDraft.type === 'elimination' ? null : undefined
      };
      
      // Use the unified match creation endpoint
      console.log('AddMatchModal - Calling dataService.createMatch with:', matchData);
      success = await dataService.createMatch(matchData);
      console.log('AddMatchModal - dataService.createMatch result:', success);
      
      if (success) {
        console.log('AddMatchModal - Match created successfully, calling onMatchAdded');
        onMatchAdded();
        onClose();
      } else {
        setError('Failed to save match');
      }
    } catch (error) {
      console.error('Save match error:', error);
      setError('An error occurred while saving the match');
    } finally {
      setIsSaving(false);
    }
  };


  // Removed getPlayersInGroup function - no longer needed

  if (isLoading) {
    return (
      <div className="add-match-loading">
        <div className="loading">Loading players and groups...</div>
      </div>
    );
  }

  return (
    <div className="add-match-modal">
      <div className="add-match-content">
        {/* Match Setup */}
        <div className="match-setup">
          <h4>Match Setup</h4>
          
          {/* Type Selector */}
          <div className="input-group">
            <label htmlFor="type" className="input-label">Match Type *</label>
            <select
              id="type"
              value={matchDraft.type}
              onChange={handleTypeChange}
              className="input-field"
              required
              disabled={isSaving}
            >
              <option value="group">Group</option>
              <option value="elimination">Elimination</option>
            </select>
          </div>

          {/* Group Selector (only for group matches) */}
          {matchDraft.type === 'group' && (
            <div className="input-group">
              <label htmlFor="group" className="input-label">Group *</label>
              <select
                id="group"
                value={matchDraft.group || ''}
                onChange={(e) => setMatchDraft(prev => ({ ...prev, group: e.target.value }))}
                className="input-field"
                required
                disabled={isSaving}
              >
                <option value="">Select Group</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>
                    Group {group.id.replace('group_', '')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Round Selector (only for elimination matches) */}
          {matchDraft.type === 'elimination' && (
            <div className="input-group">
              <label htmlFor="round" className="input-label">Round *</label>
              <input
                id="round"
                type="number"
                min="1"
                value={matchDraft.round || ''}
                onChange={(e) => setMatchDraft(prev => ({ ...prev, round: parseInt(e.target.value) || undefined }))}
                className="input-field"
                required
                disabled={isSaving}
                placeholder="Enter round number (1, 2, 3...)"
              />
            </div>
          )}

          {/* Date Picker */}
          <div className="input-group">
            <label htmlFor="scheduledAt" className="input-label">Match Date *</label>
            <input
              type="date"
              id="scheduledAt"
              value={formatDateForInput(matchDraft.scheduledAt)}
              onChange={handleDateChange}
              className="input-field"
              required
              disabled={isSaving}
              placeholder="DD/MM/YYYY"
            />
            <small className="input-help">
              Scheduled date for the match (DD/MM/YYYY format)
            </small>
          </div>

          {/* Player Selection */}
          <div className="player-selection">
            <div className="player-slot-container">
              <label className="slot-label">Player 1</label>
              <select
                value={matchDraft.player1?.id || ''}
                onChange={(e) => handlePlayerSelect('player1', e.target.value)}
                className="player-select"
              >
                <option value="">Select Player 1</option>
                {getAvailablePlayers().map(player => (
                  <option key={player.id} value={player.id}>
                    {player.name} {player.surname} (#{player.id})
                  </option>
                ))}
              </select>
            </div>

            <div className="vs-divider">VS</div>

            <div className="player-slot-container">
              <label className="slot-label">Player 2</label>
              <select
                value={matchDraft.player2?.id || ''}
                onChange={(e) => handlePlayerSelect('player2', e.target.value)}
                className="player-select"
              >
                <option value="">Select Player 2</option>
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
          <h4>Available Players</h4>
          <p>
            {matchDraft.type === 'group' 
              ? `Showing players from selected group (${matchDraft.group || 'none selected'})`
              : 'Showing all players for elimination match'
            }
          </p>
          <p className="player-count">
            {getAvailablePlayers().length} player{getAvailablePlayers().length !== 1 ? 's' : ''} available
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
          Cancel
        </button>
        <button 
          className="primary-btn"
          onClick={handleSaveMatch}
          disabled={isSaving || !matchDraft.player1 || !matchDraft.player2 || (matchDraft.type === 'group' && !matchDraft.group) || (matchDraft.type === 'elimination' && !matchDraft.round)}
        >
          {isSaving ? 'Saving...' : 'Create Match'}
        </button>
      </div>
    </div>
  );
}
