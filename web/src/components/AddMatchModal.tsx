import { useState, useEffect } from 'react';
import { dataService } from '../api';
import type { Player, Category, Group } from '../api/types';

interface AddMatchModalProps {
  category: Category;
  onMatchAdded: () => void;
  onClose: () => void;
}

interface DraggedPlayer {
  player: Player;
  sourceGroup: string;
  sourceIndex: number;
}

interface MatchDraft {
  player1: Player | null;
  player2: Player | null;
  scheduledAt: string;
  status: 'scheduled' | 'in_progress' | 'final';
  phase: 'group' | 'elim';
  groupId?: string;
}

export function AddMatchModal({ category, onMatchAdded, onClose }: AddMatchModalProps) {
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [draggedPlayer, setDraggedPlayer] = useState<DraggedPlayer | null>(null);
  const [matchDraft, setMatchDraft] = useState<MatchDraft>({
    player1: null,
    player2: null,
    scheduledAt: new Date().toISOString().split('T')[0], // Today's date
    status: 'scheduled',
    phase: 'group',
    groupId: ''
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

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, player: Player, sourceGroup: string, sourceIndex: number) => {
    setDraggedPlayer({ player, sourceGroup, sourceIndex });
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Handle drop on player slot
  const handleDropOnPlayer = (e: React.DragEvent, playerSlot: 'player1' | 'player2') => {
    e.preventDefault();
    
    if (!draggedPlayer) return;

    const { player } = draggedPlayer;
    
    setMatchDraft(prev => ({
      ...prev,
      [playerSlot]: player
    }));
    
    setDraggedPlayer(null);
  };

  // Remove player from match
  const removePlayerFromMatch = (playerSlot: 'player1' | 'player2') => {
    setMatchDraft(prev => ({
      ...prev,
      [playerSlot]: null
    }));
  };

  // Handle date change
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMatchDraft(prev => ({
      ...prev,
      scheduledAt: e.target.value
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
        setError('Please select both players for the match');
        return;
      }

      if (matchDraft.player1.id === matchDraft.player2.id) {
        setError('A player cannot play against themselves');
        return;
      }

      // Validate group match requirements
      if (matchDraft.phase === 'group') {
        if (!matchDraft.groupId) {
          setError('Group ID is required for group matches');
          return;
        }
        
        // Check if both players are in the same group
        const group = groups.find(g => g.id === matchDraft.groupId);
        if (group) {
          const player1InGroup = group.players.includes(matchDraft.player1.id);
          const player2InGroup = group.players.includes(matchDraft.player2.id);
          
          if (!player1InGroup || !player2InGroup) {
            setError('Both players must be in the same group for group matches');
            return;
          }
        }
      }
      
      // Create new match based on phase
      let success = false;
      
      // Create match data for API (using player1/player2 field names expected by Lambda)
      const matchData = {
        id: `match_${Date.now()}`,
        player1: matchDraft.player1.id,
        player2: matchDraft.player2.id,
        winner: null,
        status: matchDraft.status,
        sets: [],
        category: category,
        phase: matchDraft.phase,
        groupId: matchDraft.phase === 'group' ? matchDraft.groupId : undefined,
        scheduledAt: matchDraft.scheduledAt,
        advancesTo: matchDraft.phase === 'elim' ? null : undefined
      };
      
      if (matchDraft.phase === 'group') {
        success = await dataService.saveGroupMatches(category, [matchData as any]);
      } else {
        success = await dataService.saveEliminationMatches(category, [matchData as any]);
      }
      
      if (success) {
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


  // Get players in a group
  const getPlayersInGroup = (group: Group): Player[] => {
    return group.players
      .map(playerId => allPlayers.find(p => p.id === playerId))
      .filter((player): player is Player => player !== undefined);
  };

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
          
          {/* Phase Selector */}
          <div className="input-group">
            <label htmlFor="phase" className="input-label">Match Phase *</label>
            <select
              id="phase"
              value={matchDraft.phase}
              onChange={handlePhaseChange}
              className="input-field"
              required
              disabled={isSaving}
            >
              <option value="group">Group</option>
              <option value="elim">Elimination</option>
            </select>
          </div>

          {/* Group Selector (only for group matches) */}
          {matchDraft.phase === 'group' && (
            <div className="input-group">
              <label htmlFor="groupId" className="input-label">Group *</label>
              <select
                id="groupId"
                value={matchDraft.groupId || ''}
                onChange={(e) => setMatchDraft(prev => ({ ...prev, groupId: e.target.value }))}
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

          {/* Player Slots */}
          <div className="match-slots">
            <div className="slot-container">
              <label className="slot-label">Player 1</label>
              <div 
                className={`player-slot ${matchDraft.player1 ? 'filled' : 'empty'}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDropOnPlayer(e, 'player1')}
              >
                {matchDraft.player1 ? (
                  <div className="player-in-slot">
                    <span className="player-name">{matchDraft.player1.name} {matchDraft.player1.surname}</span>
                    <button 
                      className="remove-player-btn"
                      onClick={() => removePlayerFromMatch('player1')}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="empty-slot">
                    <span>Drop Player 1 here</span>
                  </div>
                )}
              </div>
            </div>

            <div className="vs-divider">VS</div>

            <div className="slot-container">
              <label className="slot-label">Player 2</label>
              <div 
                className={`player-slot ${matchDraft.player2 ? 'filled' : 'empty'}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDropOnPlayer(e, 'player2')}
              >
                {matchDraft.player2 ? (
                  <div className="player-in-slot">
                    <span className="player-name">{matchDraft.player2.name} {matchDraft.player2.surname}</span>
                    <button 
                      className="remove-player-btn"
                      onClick={() => removePlayerFromMatch('player2')}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="empty-slot">
                    <span>Drop Player 2 here</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Players by Groups */}
        <div className="players-by-groups">
          <h4>Players by Groups</h4>
          <div className="groups-container">
            {groups.map((group) => {
              const playersInGroup = getPlayersInGroup(group);
              return (
                <div key={group.id} className="group-section">
                  <h5>Group {group.id.replace('group_', '')}</h5>
                  <div className="group-players">
                    {playersInGroup.map((player, index) => (
                      <div
                        key={player.id}
                        className="player-card"
                        draggable
                        onDragStart={(e) => handleDragStart(e, player, group.id, index)}
                      >
                        <span className="player-name">{player.name} {player.surname}</span>
                        <span className="player-id">#{player.id}</span>
                      </div>
                    ))}
                    {playersInGroup.length === 0 && (
                      <div className="empty-group">
                        <p>No players in this group</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {groups.length === 0 && (
              <div className="no-groups">
                <p>No groups found. Please create groups first.</p>
              </div>
            )}
          </div>
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
          disabled={isSaving || !matchDraft.player1 || !matchDraft.player2 || (matchDraft.phase === 'group' && !matchDraft.groupId)}
        >
          {isSaving ? 'Saving...' : 'Create Match'}
        </button>
      </div>
    </div>
  );
}
