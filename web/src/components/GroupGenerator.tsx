import { useState, useEffect } from 'react';
import { dataService } from '../api';
import type { Player, Category, Group } from '../api/types';

interface GroupGeneratorProps {
  onGroupsGenerated: () => void;
}

interface DraggedPlayer {
  player: Player;
  sourceGroup: string | null;
  sourceIndex: number;
}

export function GroupGenerator({ onGroupsGenerated }: GroupGeneratorProps) {
  const [selectedCategory, setSelectedCategory] = useState<Category>('man');
  const [allPlayers, setAllPlayers] = useState<Player[]>([]); // All players for reference
  const [unassignedPlayers, setUnassignedPlayers] = useState<Player[]>([]); // Players not in groups
  const [groups, setGroups] = useState<Group[]>([]);
  const [draggedPlayer, setDraggedPlayer] = useState<DraggedPlayer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Load players and existing groups
  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const [playersData, groupsData] = await Promise.all([
        dataService.getPlayers(selectedCategory),
        dataService.getGroups(selectedCategory)
      ]);
      
      setAllPlayers(playersData);
      
      // Find unassigned players (not in any group)
      const assignedPlayerIds = new Set<string>();
      groupsData.forEach(group => {
        group.players.forEach(playerId => assignedPlayerIds.add(playerId));
      });
      
      const unassigned = playersData.filter(player => !assignedPlayerIds.has(player.id));
      setUnassignedPlayers(unassigned);
      setGroups(groupsData);
    } catch (error) {
      console.error('Load data error:', error);
      setError('Failed to load players and groups');
    } finally {
      setIsLoading(false);
    }
  };

  // Create initial groups if none exist
  const createInitialGroups = () => {
    const numGroups = Math.ceil(allPlayers.length / 4); // 4 players per group
    const newGroups: Group[] = [];
    
    for (let i = 0; i < numGroups; i++) {
      newGroups.push({
        id: `group_${String.fromCharCode(65 + i)}`, // A, B, C, etc.
        players: []
      });
    }
    
    setGroups(newGroups);
  };

  // Add a new group
  const addNewGroup = () => {
    const existingGroupIds = groups.map(g => g.id);
    let groupNumber = 1;
    let newGroupId = `group_${groupNumber}`;
    
    // Find the next available group number
    while (existingGroupIds.includes(newGroupId)) {
      groupNumber++;
      newGroupId = `group_${groupNumber}`;
    }
    
    const newGroup: Group = {
      id: newGroupId,
      players: []
    };
    
    setGroups(prev => [...prev, newGroup]);
  };

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, player: Player, sourceGroup: string | null, sourceIndex: number) => {
    setDraggedPlayer({ player, sourceGroup, sourceIndex });
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent, targetGroupId: string, targetIndex?: number) => {
    e.preventDefault();
    
    if (!draggedPlayer) return;

    const { player, sourceGroup, sourceIndex } = draggedPlayer;
    
    // Remove player from source
    let newGroups = [...groups];
    
    if (sourceGroup) {
      // Remove from existing group
      const sourceGroupIndex = newGroups.findIndex(g => g.id === sourceGroup);
      if (sourceGroupIndex !== -1) {
        newGroups[sourceGroupIndex].players.splice(sourceIndex, 1);
      }
    } else {
      // Remove from unassigned players
      setUnassignedPlayers(prev => prev.filter(p => p.id !== player.id));
    }
    
    // Add player to target group
    const targetGroupIndex = newGroups.findIndex(g => g.id === targetGroupId);
    if (targetGroupIndex !== -1) {
      if (targetIndex !== undefined) {
        newGroups[targetGroupIndex].players.splice(targetIndex, 0, player.id);
      } else {
        newGroups[targetGroupIndex].players.push(player.id);
      }
    }
    
    setGroups(newGroups);
    setDraggedPlayer(null);
  };

  // Handle drop on unassigned area
  const handleDropUnassigned = (e: React.DragEvent) => {
    e.preventDefault();
    
    if (!draggedPlayer) return;

    const { player, sourceGroup, sourceIndex } = draggedPlayer;
    
    // Remove from source group
    if (sourceGroup) {
      const newGroups = [...groups];
      const sourceGroupIndex = newGroups.findIndex(g => g.id === sourceGroup);
      if (sourceGroupIndex !== -1) {
        newGroups[sourceGroupIndex].players.splice(sourceIndex, 1);
        setGroups(newGroups);
      }
    }
    
    // Add back to unassigned players
    setUnassignedPlayers(prev => [...prev, player]);
    setDraggedPlayer(null);
  };

  // Save groups to database
  const handleSaveGroups = async () => {
    try {
      setIsSaving(true);
      setError('');
      
      // Filter out empty groups
      const nonEmptyGroups = groups.filter(group => group.players.length > 0);
      
      if (nonEmptyGroups.length === 0) {
        setError('No groups with players to save');
        return;
      }
      
      const success = await dataService.saveGroups(selectedCategory, nonEmptyGroups);
      
      if (success) {
        onGroupsGenerated();
        // Close modal or show success message
      } else {
        setError('Failed to save groups');
      }
    } catch (error) {
      console.error('Save groups error:', error);
      setError('An error occurred while saving groups');
    } finally {
      setIsSaving(false);
    }
  };

  // Get player name by ID
  const getPlayerName = (playerId: string): string => {
    const player = allPlayers.find(p => p.id === playerId);
    return player ? `${player.name} ${player.surname}` : 'Unknown Player';
  };

  if (isLoading) {
    return (
      <div className="group-generator-loading">
        <div className="loading">Loading players and groups...</div>
      </div>
    );
  }

  return (
    <div className="group-generator">
      <div className="group-generator-header">
        <div className="group-generator-info">
          <h3>Group Generation</h3>
          <p>Drag and drop players to create groups</p>
        </div>
        <div className="group-generator-actions">
          <button 
            className="secondary-btn"
            onClick={createInitialGroups}
            disabled={groups.length > 0}
          >
            Create Groups
          </button>
          <button 
            className="secondary-btn"
            onClick={addNewGroup}
          >
            Add Group
          </button>
          <button 
            className="primary-btn"
            onClick={handleSaveGroups}
            disabled={isSaving || groups.length === 0}
          >
            {isSaving ? 'Saving...' : 'Save Groups'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError('')} className="error-close">×</button>
        </div>
      )}

      {/* Category Tabs */}
      <div className="category-tabs">
        <button 
          className={`category-tab ${selectedCategory === 'man' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('man')}
        >
          Men
        </button>
        <button 
          className={`category-tab ${selectedCategory === 'woman' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('woman')}
        >
          Women
        </button>
      </div>

      <div className="group-generator-content">
        {/* Unassigned Players */}
        <div className="unassigned-players">
          <h4>Unassigned Players ({unassignedPlayers.length})</h4>
          <div 
            className="unassigned-area"
            onDragOver={handleDragOver}
            onDrop={handleDropUnassigned}
          >
            {unassignedPlayers.map((player, index) => (
              <div
                key={player.id}
                className="player-card"
                draggable
                onDragStart={(e) => handleDragStart(e, player, null, index)}
              >
                <span className="player-name">{player.name} {player.surname}</span>
                <span className="player-id">#{player.id}</span>
              </div>
            ))}
            {unassignedPlayers.length === 0 && (
              <div className="empty-area">
                <p>All players assigned to groups</p>
              </div>
            )}
          </div>
        </div>

        {/* Groups */}
        <div className="groups-container">
          <h4>Groups ({groups.length})</h4>
          <div className="groups-grid">
            {groups.map((group) => (
              <div key={group.id} className="group-card">
                <div className="group-header">
                  <h5>Group {group.id.replace('group_', '')}</h5>
                  <span className="group-count">({group.players.length} players)</span>
                </div>
                <div 
                  className="group-players"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, group.id)}
                >
                  {group.players.map((playerId, index) => (
                    <div
                      key={playerId}
                      className="player-card"
                      draggable
                      onDragStart={(e) => {
                        const player = allPlayers.find(p => p.id === playerId);
                        if (player) {
                          handleDragStart(e, player, group.id, index);
                        }
                      }}
                    >
                      <span className="player-name">{getPlayerName(playerId)}</span>
                      <span className="player-id">#{playerId}</span>
                    </div>
                  ))}
                  {group.players.length === 0 && (
                    <div className="empty-group">
                      <p>Drop players here</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
