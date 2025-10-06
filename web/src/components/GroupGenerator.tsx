import { useState, useEffect } from 'react';
import { dataService } from '../api';
import type { Player, Category, Group } from '../api/types';

interface GroupGeneratorProps {
  onGroupsUpdated: () => void;
}

export function GroupGenerator({ onGroupsUpdated }: GroupGeneratorProps) {
  const [selectedCategory, setSelectedCategory] = useState<Category>('man');
  const [players, setPlayers] = useState<Player[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [playerGroupAssignments, setPlayerGroupAssignments] = useState<{[playerId: string]: number}>({});
  const [numberOfGroups, setNumberOfGroups] = useState<number>(4);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Load data when category changes
  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  // Update player assignments when groups change
  useEffect(() => {
    updatePlayerAssignments();
  }, [groups]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const [playersData, groupsData] = await Promise.all([
        dataService.getPlayers(selectedCategory),
        dataService.getGroups(selectedCategory)
      ]);
      
      setPlayers(playersData);
      setGroups(groupsData);
      
      // Initialize player assignments based on current groups
      const assignments: {[playerId: string]: number} = {};
      playersData.forEach(player => {
        const assignedGroup = groupsData.find(group => 
          group.players.includes(player.id)
        );
        assignments[player.id] = assignedGroup ? parseInt(assignedGroup.id) : 0;
      });
      setPlayerGroupAssignments(assignments);
      
    } catch (error) {
      console.error('Load data error:', error);
      setError('Nie udało się załadować graczy i grup');
    } finally {
      setIsLoading(false);
    }
  };

  const updatePlayerAssignments = () => {
    const assignments: {[playerId: string]: number} = {};
    players.forEach(player => {
      const assignedGroup = groups.find(group => 
        group.players.includes(player.id)
      );
      assignments[player.id] = assignedGroup ? parseInt(assignedGroup.id) : 0;
    });
    setPlayerGroupAssignments(assignments);
  };

  const handleCategoryChange = (category: Category) => {
    setSelectedCategory(category);
  };

  const handlePlayerGroupChange = (playerId: string, groupId: number) => {
    setPlayerGroupAssignments(prev => ({
      ...prev,
      [playerId]: groupId
    }));
  };

  const handleNumberOfGroupsChange = (value: number) => {
    setNumberOfGroups(Math.max(1, Math.min(10, value)));
  };

  const handleResetAndCreateGroups = async () => {
    try {
      setIsSaving(true);
      setError('');

      // Create empty groups based on the number selected
      const newGroups: Group[] = [];
      for (let i = 1; i <= numberOfGroups; i++) {
        newGroups.push({
          id: i.toString(),
          players: []
        });
      }

      // Save the new groups (this will clear existing groups)
      await dataService.saveGroups(selectedCategory, newGroups);
      
      // Update local state
      setGroups(newGroups);
      
      // Clear all player assignments
      const clearedAssignments: {[playerId: string]: number} = {};
      players.forEach(player => {
        clearedAssignments[player.id] = 0;
      });
      setPlayerGroupAssignments(clearedAssignments);
      
      onGroupsUpdated();
      
    } catch (error) {
      console.error('Reset groups error:', error);
      setError('Nie udało się zresetować grup');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveGroups = async () => {
    try {
      setIsSaving(true);
      setError('');

      // Create groups based on current assignments
      const newGroups: Group[] = [];
      const groupMap: {[groupId: number]: string[]} = {};

      // Initialize empty groups
      for (let i = 1; i <= numberOfGroups; i++) {
        groupMap[i] = [];
        newGroups.push({
          id: i.toString(),
          players: []
        });
      }

      // Assign players to groups
      Object.entries(playerGroupAssignments).forEach(([playerId, groupId]) => {
        if (groupId > 0 && groupMap[groupId]) {
          groupMap[groupId].push(playerId);
        }
      });

      // Update groups with assigned players
      newGroups.forEach(group => {
        const groupIdNum = parseInt(group.id);
        group.players = groupMap[groupIdNum] || [];
      });

      // Save groups
      await dataService.saveGroups(selectedCategory, newGroups);
      
      // Update local state
      setGroups(newGroups);
      
      onGroupsUpdated();
      
    } catch (error) {
      console.error('Save groups error:', error);
      setError('Nie udało się zapisać grup');
    } finally {
      setIsSaving(false);
    }
  };

  // Get group options for the combobox
  const getGroupOptions = () => {
    const options = [{ value: 0, label: 'Brak Grupy' }];
    for (let i = 1; i <= numberOfGroups; i++) {
      const playerCount = Object.values(playerGroupAssignments).filter(id => id === i).length;
      options.push({
        value: i,
        label: `Grupa ${i} (${playerCount} graczy)`
      });
    }
    return options;
  };

  // Get players by group
  const getPlayersByGroup = () => {
    const grouped: {[groupId: number]: Player[]} = {};
    
    // Initialize empty groups
    for (let i = 1; i <= numberOfGroups; i++) {
      grouped[i] = [];
    }
    
    // Add players to their assigned groups
    players.forEach(player => {
      const groupId = playerGroupAssignments[player.id];
      if (groupId > 0 && grouped[groupId]) {
        grouped[groupId].push(player);
      }
    });
    
    return grouped;
  };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Loading players and groups...</p>
      </div>
    );
  }

  return (
    <div className="group-generator">
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError('')} className="error-close">×</button>
        </div>
      )}

      {/* Header Controls */}
      <div className="groups-header">
        <div className="category-selector">
          <label className="category-label">Kategoria:</label>
          <div className="category-tabs">
            <button 
              className={`category-tab ${selectedCategory === 'man' ? 'active' : ''}`}
              onClick={() => handleCategoryChange('man')}
              disabled={isSaving}
            >
              Mężczyźni
            </button>
            <button 
              className={`category-tab ${selectedCategory === 'woman' ? 'active' : ''}`}
              onClick={() => handleCategoryChange('woman')}
              disabled={isSaving}
            >
              Kobiety
            </button>
          </div>
        </div>

        <div className="groups-controls">
          <div className="group-count-selector">
            <label htmlFor="groupCount" className="group-count-label">Liczba Grup:</label>
            <input
              id="groupCount"
              type="number"
              min="1"
              max="10"
              value={numberOfGroups}
              onChange={(e) => handleNumberOfGroupsChange(parseInt(e.target.value) || 1)}
              className="group-count-input"
              disabled={isSaving}
            />
          </div>
          
          <button 
            className="reset-groups-btn"
            onClick={handleResetAndCreateGroups}
            disabled={isSaving}
          >
            {isSaving ? 'Resetowanie...' : 'Resetuj i Utwórz Grupy'}
          </button>
        </div>
      </div>

      {/* Players List */}
      <div className="players-section">
        <h3>Przypisz Graczy do Grup</h3>
        <div className="players-list">
          {players.length === 0 ? (
            <div className="no-players">
              <p>Nie znaleziono graczy dla kategorii {selectedCategory}</p>
              <p>Liczba graczy: {players.length}</p>
            </div>
          ) : (
            players.map((player) => (
            <div key={player.id} className="player-assignment">
              <div className="player-info">
                <span className="player-name">{player.name} {player.surname}</span>
                <span className="player-id">#{player.id}</span>
              </div>
              <select
                value={playerGroupAssignments[player.id] || 0}
                onChange={(e) => handlePlayerGroupChange(player.id, parseInt(e.target.value))}
                className="group-select"
                disabled={isSaving}
              >
                {getGroupOptions().map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            ))
          )}
        </div>
      </div>

      {/* Groups Overview */}
      <div className="groups-overview">
        <h3>Przegląd Grup</h3>
        <div className="groups-grid">
          {Array.from({ length: numberOfGroups }, (_, i) => {
            const groupId = i + 1;
            const playersInGroup = getPlayersByGroup()[groupId] || [];
            
            return (
              <div key={groupId} className="group-card">
                <div className="group-header">
                  <h4>Grupa {groupId}</h4>
                  <span className="player-count">({playersInGroup.length} graczy)</span>
                </div>
                <div className="group-players">
                  {playersInGroup.length > 0 ? (
                    playersInGroup.map(player => (
                      <div key={player.id} className="group-player">
                        <span className="player-name">{player.name} {player.surname}</span>
                        <span className="player-id">#{player.id}</span>
                      </div>
                    ))
                  ) : (
                    <div className="empty-group">
                      <span>Brak przypisanych graczy</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save Button */}
      <div className="groups-actions">
        <button 
          className="save-groups-btn"
          onClick={handleSaveGroups}
          disabled={isSaving}
        >
          {isSaving ? 'Zapisywanie...' : 'Zapisz Grupy'}
        </button>
      </div>
    </div>
  );
}