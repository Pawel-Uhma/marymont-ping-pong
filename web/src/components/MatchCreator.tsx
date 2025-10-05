import { useState, useEffect } from 'react';
import { dataService } from '../api';
import type { Player, Category, GroupMatch, EliminationMatch, Group, Match } from '../api/types';
import { AddMatchModal } from './AddMatchModal';
import { EditMatchModal } from './EditMatchModal';

interface MatchCreatorProps {
  onMatchesCreated: () => void;
}

export function MatchCreator({ onMatchesCreated }: MatchCreatorProps) {
  const [selectedCategory, setSelectedCategory] = useState<Category>('man');
  const [groupMatches, setGroupMatches] = useState<GroupMatch[]>([]);
  const [eliminationMatches, setEliminationMatches] = useState<EliminationMatch[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [showAddMatchModal, setShowAddMatchModal] = useState(false);
  const [showEditMatchModal, setShowEditMatchModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Load matches when category changes
  useEffect(() => {
    loadMatches();
  }, [selectedCategory]);

  const loadMatches = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const [groupMatchesData, eliminationMatchesData, playersData] = await Promise.all([
        dataService.getGroupMatches(selectedCategory),
        dataService.getEliminationMatches(selectedCategory),
        dataService.getPlayers(selectedCategory)
      ]);
      
      setGroupMatches(groupMatchesData);
      setEliminationMatches(eliminationMatchesData);
      setAllPlayers(playersData);
    } catch (error) {
      console.error('Load matches error:', error);
      setError('Failed to load matches');
    } finally {
      setIsLoading(false);
    }
  };

  // Get player name by ID
  const getPlayerName = (playerId: string): string => {
    const player = allPlayers.find(p => p.id === playerId);
    return player ? `${player.name} ${player.surname}` : 'Unknown Player';
  };

  const handleMatchAdded = () => {
    loadMatches(); // Reload matches after adding
    onMatchesCreated(); // Refresh dashboard
  };

  const handleMatchUpdated = () => {
    loadMatches(); // Reload matches after updating
    onMatchesCreated(); // Refresh dashboard
    setShowEditMatchModal(false);
    setSelectedMatch(null);
  };

  const handleEditMatch = (match: Match) => {
    setSelectedMatch(match);
    setShowEditMatchModal(true);
  };

  const handleDeleteMatch = async (matchId: string, phase: 'group' | 'elim') => {
    try {
      setIsDeleting(matchId);
      setError('');
      
      let success = false;
      if (phase === 'group') {
        success = await dataService.deleteGroupMatch(selectedCategory, matchId);
      } else {
        success = await dataService.deleteEliminationMatch(selectedCategory, matchId);
      }
      
      if (success) {
        loadMatches(); // Reload matches after deletion
        onMatchesCreated(); // Refresh dashboard
      } else {
        setError('Failed to delete match');
      }
    } catch (error) {
      console.error('Delete match error:', error);
      setError('An error occurred while deleting the match');
    } finally {
      setIsDeleting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="match-creator-loading">
        <div className="loading">Loading matches...</div>
      </div>
    );
  }

  return (
    <div className="match-creator">
      <div className="match-creator-header">
        <div className="match-creator-info">
          <h3>Match Management</h3>
          <p>View and manage matches by category</p>
        </div>
        <div className="match-creator-actions">
          <button 
            className="primary-btn"
            onClick={() => setShowAddMatchModal(true)}
          >
            Add Match
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

      {/* Matches List */}
      <div className="matches-container">
        <h4>{selectedCategory === 'man' ? 'Men' : 'Women'} Matches ({groupMatches.length + eliminationMatches.length})</h4>
        <div className="matches-list">
          {groupMatches.map((match) => (
            <div key={match.id} className="match-card">
              <div className="match-info">
                <div className="match-players">
                  <span className="player-name">{getPlayerName(match.p1)}</span>
                  <span className="vs-divider">VS</span>
                  <span className="player-name">{getPlayerName(match.p2)}</span>
                </div>
                <div className="match-status">
                  <span className={`status-badge ${match.status}`}>
                    {match.status}
                  </span>
                  <span className="phase-badge">{match.phase}</span>
                </div>
              </div>
              <div className="match-actions">
                <button 
                  className="edit-match-btn"
                  onClick={() => handleEditMatch(match)}
                  title="Edit match"
                >
                  ✏️
                </button>
                <button 
                  className="delete-match-btn"
                  onClick={() => handleDeleteMatch(match.id, 'group')}
                  disabled={isDeleting === match.id}
                  title="Delete match"
                >
                  {isDeleting === match.id ? '⏳' : '🗑️'}
                </button>
              </div>
            </div>
          ))}
          
          {eliminationMatches.map((match) => (
            <div key={match.id} className="match-card">
              <div className="match-info">
                <div className="match-players">
                  <span className="player-name">{getPlayerName(match.p1)}</span>
                  <span className="vs-divider">VS</span>
                  <span className="player-name">{getPlayerName(match.p2)}</span>
                </div>
                <div className="match-status">
                  <span className={`status-badge ${match.status}`}>
                    {match.status}
                  </span>
                  <span className="phase-badge">{match.phase}</span>
                </div>
              </div>
              <div className="match-actions">
                <button 
                  className="edit-match-btn"
                  onClick={() => handleEditMatch(match)}
                  title="Edit match"
                >
                  ✏️
                </button>
                <button 
                  className="delete-match-btn"
                  onClick={() => handleDeleteMatch(match.id, 'elim')}
                  disabled={isDeleting === match.id}
                  title="Delete match"
                >
                  {isDeleting === match.id ? '⏳' : '🗑️'}
                </button>
              </div>
            </div>
          ))}
          
          {groupMatches.length === 0 && eliminationMatches.length === 0 && (
            <div className="empty-matches">
              <p>No matches found for {selectedCategory === 'man' ? 'men' : 'women'} category.</p>
              <p>Click "Add Match" to create new matches.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Match Modal */}
      {showAddMatchModal && (
        <div className="modal-overlay" onClick={() => setShowAddMatchModal(false)}>
          <div className="modal-content add-match-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Match</h2>
              <button 
                className="modal-close" 
                onClick={() => setShowAddMatchModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <AddMatchModal 
                category={selectedCategory}
                onMatchAdded={handleMatchAdded}
                onClose={() => setShowAddMatchModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Match Modal */}
      {showEditMatchModal && selectedMatch && (
        <div className="modal-overlay" onClick={() => setShowEditMatchModal(false)}>
          <div className="modal-content add-match-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Match</h2>
              <button 
                className="modal-close" 
                onClick={() => setShowEditMatchModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <EditMatchModal 
                category={selectedCategory}
                match={selectedMatch}
                onMatchUpdated={handleMatchUpdated}
                onClose={() => setShowEditMatchModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
