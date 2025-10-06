import { useState, useEffect } from 'react';
import { dataService } from '../api';
import type { Player, Category, GroupMatch, EliminationMatch, Match } from '../api/types';
import { AddMatchModal } from './AddMatchModal';
import { EditMatchModal } from './EditMatchModal';

interface MatchCreatorProps {
  onMatchesCreated: () => void;
  onEditScore?: (match: Match) => void;
}

export function MatchCreator({ onMatchesCreated, onEditScore }: MatchCreatorProps) {
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
    console.log('MatchCreator - loadMatches called for category:', selectedCategory);
    try {
      setIsLoading(true);
      setError('');
      
      const [groupMatchesData, eliminationMatchesData, playersData] = await Promise.all([
        dataService.getGroupMatches(selectedCategory),
        dataService.getEliminationMatches(selectedCategory),
        dataService.getPlayers(selectedCategory)
      ]);
      
      console.log('MatchCreator - Loaded group matches:', groupMatchesData);
      console.log('MatchCreator - Loaded elimination matches:', eliminationMatchesData);
      
      setGroupMatches(groupMatchesData);
      setEliminationMatches(eliminationMatchesData);
      setAllPlayers(playersData);
    } catch (error) {
      console.error('Load matches error:', error);
      setError('Nie udało się załadować meczów');
    } finally {
      setIsLoading(false);
    }
  };

  // Get player name by ID
  const getPlayerName = (playerId: string): string => {
    const player = allPlayers.find(p => p.id === playerId);
    return player ? `${player.name} ${player.surname}` : 'Nieznany Gracz';
  };

  const handleMatchAdded = () => {
    console.log('MatchCreator - handleMatchAdded called');
    loadMatches(); // Reload matches after adding
    onMatchesCreated(); // Refresh dashboard
  };

  const handleMatchUpdated = () => {
    loadMatches(); // Reload matches after updating
    onMatchesCreated(); // Refresh dashboard
    setShowEditMatchModal(false);
    setSelectedMatch(null);
  };

  const handleEditScore = (match: Match) => {
    if (onEditScore) {
      onEditScore(match);
    }
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
        setError('Nie udało się usunąć meczu');
      }
    } catch (error) {
      console.error('Delete match error:', error);
      setError('Wystąpił błąd podczas usuwania meczu');
    } finally {
      setIsDeleting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="match-creator-loading">
        <div className="loading">Ładowanie meczów...</div>
      </div>
    );
  }

  return (
    <div className="match-creator">
      <div className="match-creator-header">
        <div className="match-creator-info">
          <h3>Zarządzanie Meczami</h3>
          <p>Wyświetlaj i zarządzaj meczami według kategorii</p>
        </div>
        <div className="match-creator-actions">
          <button 
            className="primary-btn"
            onClick={() => setShowAddMatchModal(true)}
          >
            Dodaj Mecz
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
          Mężczyźni
        </button>
        <button 
          className={`category-tab ${selectedCategory === 'woman' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('woman')}
        >
          Kobiety
        </button>
      </div>

      {/* Matches List */}
      <div className="matches-container">
        <h4>{selectedCategory === 'man' ? 'Mężczyźni' : 'Kobiety'} Mecze ({groupMatches.length + eliminationMatches.length})</h4>
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
                  title="Edytuj szczegóły meczu"
                >
                  ✏️ Edytuj
                </button>
                <button 
                  className="edit-score-btn"
                  onClick={() => handleEditScore(match)}
                  title="Edytuj wynik meczu"
                >
                  🏓 Wynik
                </button>
                <button 
                  className="delete-match-btn"
                  onClick={() => handleDeleteMatch(match.id, 'group')}
                  disabled={isDeleting === match.id}
                  title="Usuń mecz"
                >
                  {isDeleting === match.id ? '⏳ Usuwanie...' : '🗑️ Usuń'}
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
                  title="Edytuj szczegóły meczu"
                >
                  ✏️ Edytuj
                </button>
                <button 
                  className="edit-score-btn"
                  onClick={() => handleEditScore(match)}
                  title="Edytuj wynik meczu"
                >
                  🏓 Wynik
                </button>
                <button 
                  className="delete-match-btn"
                  onClick={() => handleDeleteMatch(match.id, 'elim')}
                  disabled={isDeleting === match.id}
                  title="Usuń mecz"
                >
                  {isDeleting === match.id ? '⏳ Usuwanie...' : '🗑️ Usuń'}
                </button>
              </div>
            </div>
          ))}
          
          {groupMatches.length === 0 && eliminationMatches.length === 0 && (
            <div className="empty-matches">
              <p>Nie znaleziono meczów dla kategorii {selectedCategory === 'man' ? 'mężczyzn' : 'kobiet'}.</p>
              <p>Kliknij "Dodaj Mecz", aby utworzyć nowe mecze.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Match Modal */}
      {showAddMatchModal && (
        <div className="modal-overlay" onClick={() => setShowAddMatchModal(false)}>
          <div className="modal-content add-match-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Dodaj Nowy Mecz</h2>
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
              <h2>Edytuj Mecz</h2>
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
