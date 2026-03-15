import { useState, useEffect } from 'react'
import './App.css'
import { userService, dataService } from './api'
import type { LoginCredentials, Category, Player, GroupMatch, EliminationMatch, PlayerStanding, GroupStanding } from './api/types'
import { AddPlayerModal } from './components/AddPlayerModal'
import { AccountManagement } from './components/AccountManagement'
import { GroupGenerator } from './components/GroupGenerator'
import { MatchCreator } from './components/MatchCreator'
import { EditScoreModal } from './components/EditScoreModal'
import { MyMatchesModal } from './components/MyMatchesModal'
import { StandingsModal } from './components/StandingsModal'
import { ChangePasswordModal } from './components/ChangePasswordModal'
import { BracketView } from './components/BracketView'
import { BracketAdmin } from './components/BracketAdmin'
import { getGroupLetter } from './utils/groupUtils'

interface User {
  username: string;
  role: 'admin' | 'player';
  playerId: string | null;
  category?: Category;
}

type ViewType = 'dashboard' | 'matches' | 'standings' | 'brackets' | 'admin'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [credentials, setCredentials] = useState<LoginCredentials>({ username: '' })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Dashboard data
  const [players, setPlayers] = useState<Player[]>([])
  const [nextMatch, setNextMatch] = useState<GroupMatch | EliminationMatch | null>(null)
  const [upcomingMatches, setUpcomingMatches] = useState<(GroupMatch | EliminationMatch)[]>([])
  const [myMatches, setMyMatches] = useState<(GroupMatch | EliminationMatch)[]>([])
  const [standings, setStandings] = useState<GroupStanding[]>([])
  const [standingsCategory, setStandingsCategory] = useState<Category>('man')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all')

  // Modal states
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false)
  const [showAccountManagement, setShowAccountManagement] = useState(false)
  const [showGroupGenerator, setShowGroupGenerator] = useState(false)
  const [showMatchCreator, setShowMatchCreator] = useState(false)
  const [showEditScoreModal, setShowEditScoreModal] = useState(false)
  const [selectedMatchForScore, setSelectedMatchForScore] = useState<GroupMatch | EliminationMatch | null>(null)
  const [showMyMatchesModal, setShowMyMatchesModal] = useState(false)
  const [showStandingsModal, setShowStandingsModal] = useState(false)
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showBracketAdmin, setShowBracketAdmin] = useState(false)

  // Sidebar navigation
  const [activeView, setActiveView] = useState<ViewType>('matches')

  // Bracket data for all three brackets
  const [manBracketData, setManBracketData] = useState<{ bracket: any; matches: EliminationMatch[] } | null>(null)
  const [womanBracketData, setWomanBracketData] = useState<{ bracket: any; matches: EliminationMatch[] } | null>(null)
  const [tdsBracketData, setTdsBracketData] = useState<{ bracket: any; matches: EliminationMatch[] } | null>(null)
  const [activeBracketTab, setActiveBracketTab] = useState<'man' | 'woman' | 'tds'>('man')

  // Tournament matches data
  const [tournamentMatches, setTournamentMatches] = useState<{ match: GroupMatch | EliminationMatch, category: Category }[]>([])
  const [tournamentPage, setTournamentPage] = useState(0)
  const [tournamentCategoryFilter, setTournamentCategoryFilter] = useState<'all' | Category>('all')
  const [tournamentStatusFilter, setTournamentStatusFilter] = useState<'all' | 'scheduled' | 'final'>('all')

  // Helper function to get user's category
  const getUserCategory = async (playerId: string | null): Promise<Category> => {
    if (!playerId) return 'man' // Default category

    try {
      // Try to find the user in both categories
      const [manPlayers, womanPlayers] = await Promise.all([
        dataService.getPlayers('man'),
        dataService.getPlayers('woman')
      ])

      const allPlayers = [...manPlayers, ...womanPlayers]
      const userPlayer = allPlayers.find(p => p.id === playerId)

      return userPlayer?.category || 'man'
    } catch (error) {
      console.error('Error getting user category:', error)
      return 'man' // Default fallback
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const response = await userService.login(credentials)

      if (response.success && response.user) {
        // Get user's category from their account data
        try {
          const userCategory = await getUserCategory(response.user.playerId)
          const userWithCategory = {
            ...response.user,
            category: userCategory
          }
          setUser(userWithCategory)
          setIsLoggedIn(true)
          setCredentials({ username: '', password: '' })
          setShowLoginModal(false)
          setError('')
          setActiveView('dashboard')

          // Load dashboard data after successful login
          loadDashboardData()
        } catch (error) {
          console.error('Error getting user category:', error)
          // Still login but without category
          setUser(response.user)
          setIsLoggedIn(true)
          setCredentials({ username: '', password: '' })
          setShowLoginModal(false)
          setError('')
          setActiveView('dashboard')
          loadDashboardData()
        }
      } else {
        setError(response.error || 'Login failed')
      }
    } catch (error) {
      console.error('Login error:', error)
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
    setUser(null)
    setCredentials({ username: '', password: '' })
    setError('')
    setActiveView('matches')
  }

  // Handle Edit Score
  const handleEditScore = (match: GroupMatch | EliminationMatch) => {
    setSelectedMatchForScore(match)
    setShowEditScoreModal(true)
  }

  const handleScoreUpdated = () => {
    loadDashboardData() // Reload dashboard data after score update
  }

  // Handle match edited from My Matches
  const handleMatchEdited = (match: GroupMatch | EliminationMatch) => {
    setSelectedMatchForScore(match)
    setShowEditScoreModal(true)
  }

  // Handle standings category change
  const handleStandingsCategoryChange = async (category: Category) => {
    setStandingsCategory(category)
    setSelectedGroupId('all') // Reset to 'all' when category changes
    await loadStandingsData(category)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setCredentials(prev => ({ ...prev, [name]: value }))
    setError('') // Clear error when user types
  }

  // Get all players from all groups combined
  const getAllPlayersStandings = (): PlayerStanding[] => {
    const allPlayers = new Map<string, PlayerStanding>();

    standings
      .forEach(group => {
        group.table.forEach(player => {
          const existingPlayer = allPlayers.get(player.playerId);
          if (existingPlayer) {
            // Combine stats
            existingPlayer.wins += player.wins;
            existingPlayer.losses += player.losses;
            existingPlayer.setsWon = (existingPlayer.setsWon || 0) + (player.setsWon || 0);
            existingPlayer.setsLost = (existingPlayer.setsLost || 0) + (player.setsLost || 0);
            existingPlayer.pointsWon = (existingPlayer.pointsWon || 0) + (player.pointsWon || 0);
            existingPlayer.pointsLost = (existingPlayer.pointsLost || 0) + (player.pointsLost || 0);
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
              setsFor: player.setsWon || player.setsFor || 0,
              setsAgainst: player.setsLost || player.setsAgainst || 0,
              pointsFor: player.pointsWon || player.pointsFor || 0,
              pointsAgainst: player.pointsLost || player.pointsAgainst || 0,
              setsWon: player.setsWon || player.setsFor || 0,
              setsLost: player.setsLost || player.setsAgainst || 0,
              pointsWon: player.pointsWon || player.pointsFor || 0,
              pointsLost: player.pointsLost || player.pointsAgainst || 0
            });
          }
        });
      });

    // Convert to array and sort
    const combinedPlayers = Array.from(allPlayers.values());
    return combinedPlayers.sort((a, b) => {
      // Primary: Win record
      const aRecord = a.wins - a.losses;
      const bRecord = b.wins - b.losses;
      if (aRecord !== bRecord) return bRecord - aRecord;

      // Secondary: Sets difference
      const aSetDiff = (a.setsFor || 0) - (a.setsAgainst || 0);
      const bSetDiff = (b.setsFor || 0) - (b.setsAgainst || 0);
      if (aSetDiff !== bSetDiff) return bSetDiff - aSetDiff;

      // Tertiary: Points difference
      const aPointDiff = (a.pointsFor || 0) - (a.pointsAgainst || 0);
      const bPointDiff = (b.pointsFor || 0) - (b.pointsAgainst || 0);
      return bPointDiff - aPointDiff;
    }).map((player, index) => ({
      ...player,
      rank: index + 1
    }));
  };

  // Load standings data (available for both logged in and logged out users)
  const loadStandingsData = async (category: Category) => {
    try {
      const standingsData = await dataService.getStandings(category)
      setStandings(standingsData)

      // Set 'all' as selected if no group is selected or if selectedGroupId is invalid
      if (standingsData.length > 0 && (!selectedGroupId || selectedGroupId === '')) {
        setSelectedGroupId('all')
      }
    } catch (error) {
      console.error('Error loading standings data:', error)
    }
  }

  // Load tournament matches data
  const loadTournamentData = async () => {
    try {
      const allMatches = await dataService.getAllTournamentMatches();
      setTournamentMatches(allMatches);
    } catch (error) {
      console.error('Error loading tournament data:', error);
    }
  }

  // Load dashboard data
  const loadDashboardData = async () => {
    console.log('App - loadDashboardData called');
    if (!user) return;

    try {
      // Load players from both categories for upcoming matches
      const [manPlayers, womanPlayers] = await Promise.all([
        dataService.getPlayers('man'),
        dataService.getPlayers('woman')
      ])
      const allPlayers = [...manPlayers, ...womanPlayers]
      console.log('Loaded players data:', allPlayers)
      setPlayers(allPlayers)

      // Load next match for player
      if (user.playerId && user.category) {
        const nextMatchData = await dataService.getNextMatchForPlayer(user.category, user.playerId)
        setNextMatch(nextMatchData)

        // Load player's matches
        const myMatchesData = await dataService.getMatchesForPlayer(user.category, user.playerId)
        setMyMatches(myMatchesData)
      }

      // Load upcoming matches from both categories
      const upcomingMatchesData = await dataService.getUpcomingMatches()
      console.log('App - Loaded upcoming matches:', upcomingMatchesData)
      setUpcomingMatches(upcomingMatchesData)

      // Load standings
      await loadStandingsData(standingsCategory)

      // Load all three brackets in parallel
      const [manBr, womanBr, tdsBr] = await Promise.all([
        dataService.getBracketWithMatches('man', 'main'),
        dataService.getBracketWithMatches('woman', 'main'),
        dataService.getBracketWithMatches('man', 'tds'),
      ])
      setManBracketData(manBr)
      setWomanBracketData(womanBr)
      setTdsBracketData(tdsBr)

    } catch (error) {
      console.error('Error loading dashboard data:', error)
    }
    // Also refresh tournament matches
    loadTournamentData()
  }

  const loadBracketData = async () => {
    const [manBr, womanBr, tdsBr] = await Promise.all([
      dataService.getBracketWithMatches('man', 'main'),
      dataService.getBracketWithMatches('woman', 'main'),
      dataService.getBracketWithMatches('man', 'tds'),
    ])
    setManBracketData(manBr)
    setWomanBracketData(womanBr)
    setTdsBracketData(tdsBr)
  }

  // Load public data on initial mount (even when not logged in)
  useEffect(() => {
    loadStandingsData(standingsCategory)
    loadTournamentData()
    loadBracketData()
    // Load players for tournament match name resolution
    Promise.all([
      dataService.getPlayers('man'),
      dataService.getPlayers('woman')
    ]).then(([manPlayers, womanPlayers]) => {
      setPlayers([...manPlayers, ...womanPlayers])
    }).catch(err => console.error('Error loading players:', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load data when user logs in or category changes
  useEffect(() => {
    if (isLoggedIn && user) {
      loadDashboardData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, user])

  // Load standings when category changes
  useEffect(() => {
    loadStandingsData(standingsCategory)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standingsCategory])

  // Helper functions
  const getPlayerName = (playerId: string): string => {
    console.log('getPlayerName called with playerId:', playerId, 'players array:', players)
    const player = players.find(p => p.id === playerId)
    console.log('Found player:', player)
    return player ? `${player.name} ${player.surname}` : 'Nieznany Gracz'
  }

  const getMatchStatus = (match: GroupMatch | EliminationMatch): string => {
    if (match.status === 'final') {
      return match.winner ? `Wygrana przez ${getPlayerName(match.winner)}` : 'Zakończony'
    }
    if (match.status === 'in_progress') {
      return 'W trakcie'
    }
    return 'Zaplanowany'
  }

  const getSetScores = (match: GroupMatch | EliminationMatch): string[] => {
    return match.sets.map((set, index) => {
      if (set.p1 === 0 && set.p2 === 0) return `Set ${index + 1}: -`
      return `Set ${index + 1}: ${set.p1}-${set.p2}`
    })
  }

  // Tournament matches helpers
  const getSetWins = (match: GroupMatch | EliminationMatch): [number, number] => {
    let p1Wins = 0, p2Wins = 0;
    match.sets.forEach(set => {
      if (set.p1 === 0 && set.p2 === 0) return;
      if (set.p1 > set.p2) p1Wins++;
      else if (set.p2 > set.p1) p2Wins++;
    });
    return [p1Wins, p2Wins];
  }

  const getMatchPhaseLabel = (match: GroupMatch | EliminationMatch): string => {
    if (match.phase === 'group') {
      return `Grupa ${getGroupLetter((match as GroupMatch).groupId)}`;
    }
    return (match as EliminationMatch).roundName || 'Faza Pucharowa';
  }

  const getCategoryLabel = (category: Category): string => {
    return category === 'man' ? 'Mężczyźni' : 'Kobiety';
  }

  // Standings table helpers
  const getStandingsPlayerName = (player: PlayerStanding): string => {
    if (player.name && player.surname) return `${player.name} ${player.surname}`;
    return getPlayerName(player.playerId);
  }

  const renderStandingsTableBlock = (playersList: PlayerStanding[], title: string) => (
    <div className="group-standings-table">
      <h4>{title}</h4>
      <div className="standings-table">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Gracz</th>
              <th>W-P</th>
              <th>Sety</th>
              <th>Punkty</th>
            </tr>
          </thead>
          <tbody>
            {playersList.map((player: PlayerStanding) => {
              const name = getStandingsPlayerName(player);
              const setDiff = (player.setsFor || 0) - (player.setsAgainst || 0);
              const pointDiff = (player.pointsFor || 0) - (player.pointsAgainst || 0);
              const rankClass = player.rank <= 3 ? `podium-row podium-${player.rank}` : '';
              return (
                <tr key={player.playerId} className={rankClass}>
                  <td>
                    <div className={`rank-badge rank-${player.rank <= 3 ? player.rank : 'default'}`}>
                      {player.rank}
                    </div>
                  </td>
                  <td>
                    <div className="player-cell">
                      <span className="player-cell-name">{name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="record-badge">
                      <span className="record-wins">{player.wins}</span>
                      <span className="record-sep">-</span>
                      <span className="record-losses">{player.losses}</span>
                    </span>
                  </td>
                  <td>
                    <span className={`stat-value ${setDiff > 0 ? 'stat-positive' : setDiff < 0 ? 'stat-negative' : 'stat-neutral'}`}>
                      {setDiff > 0 ? '+' : ''}{setDiff}
                    </span>
                  </td>
                  <td>
                    <span className={`stat-value ${pointDiff > 0 ? 'stat-positive' : pointDiff < 0 ? 'stat-negative' : 'stat-neutral'}`}>
                      {pointDiff > 0 ? '+' : ''}{pointDiff}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  )

  // Tournament matches filtering & pagination
  const MATCHES_PER_PAGE = 5;
  const isMatchPlayed = (match: GroupMatch | EliminationMatch): boolean => {
    return !!match.winner || match.sets.some(set => set.p1 !== 0 || set.p2 !== 0);
  };
  const filteredTournamentMatches = tournamentMatches.filter(({ match, category }) => {
    if (tournamentCategoryFilter !== 'all' && category !== tournamentCategoryFilter) return false;
    if (tournamentStatusFilter === 'scheduled' && isMatchPlayed(match)) return false;
    if (tournamentStatusFilter === 'final' && !isMatchPlayed(match)) return false;
    return true;
  });
  const totalTournamentPages = Math.ceil(filteredTournamentMatches.length / MATCHES_PER_PAGE);
  const safeTournamentPage = Math.min(tournamentPage, Math.max(0, totalTournamentPages - 1));
  const paginatedTournamentMatches = filteredTournamentMatches.slice(
    safeTournamentPage * MATCHES_PER_PAGE,
    (safeTournamentPage + 1) * MATCHES_PER_PAGE
  );

  const handleTournamentFilterChange = (filterType: 'category' | 'status', value: string) => {
    setTournamentPage(0);
    if (filterType === 'category') setTournamentCategoryFilter(value as 'all' | Category);
    else setTournamentStatusFilter(value as 'all' | 'scheduled' | 'final');
  }

  const renderTournamentMatches = () => (
    <div className="tournament-matches-section">
      <div className="section-header">
        <h3>Mecze Turnieju</h3>
      </div>
      <div className="tournament-filters">
        <div className="filter-group">
          <div className="tabs">
            <button
              className={`tab ${tournamentCategoryFilter === 'all' ? 'active' : ''}`}
              onClick={() => handleTournamentFilterChange('category', 'all')}
            >
              Wszyscy
            </button>
            <button
              className={`tab ${tournamentCategoryFilter === 'man' ? 'active' : ''}`}
              onClick={() => handleTournamentFilterChange('category', 'man')}
            >
              Mężczyźni
            </button>
            <button
              className={`tab ${tournamentCategoryFilter === 'woman' ? 'active' : ''}`}
              onClick={() => handleTournamentFilterChange('category', 'woman')}
            >
              Kobiety
            </button>
          </div>
        </div>
        <div className="filter-group">
          <div className="tabs">
            <button
              className={`tab ${tournamentStatusFilter === 'all' ? 'active' : ''}`}
              onClick={() => handleTournamentFilterChange('status', 'all')}
            >
              Wszystkie
            </button>
            <button
              className={`tab ${tournamentStatusFilter === 'scheduled' ? 'active' : ''}`}
              onClick={() => handleTournamentFilterChange('status', 'scheduled')}
            >
              Nieodbyty
            </button>
            <button
              className={`tab ${tournamentStatusFilter === 'final' ? 'active' : ''}`}
              onClick={() => handleTournamentFilterChange('status', 'final')}
            >
              Zakończony
            </button>
          </div>
        </div>
      </div>
      {paginatedTournamentMatches.length > 0 ? (
        <>
          <div className="tournament-matches-list">
            {paginatedTournamentMatches.map(({ match, category }) => {
              const [p1Sets, p2Sets] = getSetWins(match);
              const isP1Winner = match.winner === match.p1;
              const isP2Winner = match.winner === match.p2;

              return (
                <div key={`${category}-${match.phase}-${match.id}`} className="tournament-match-card">
                  <div className="tournament-match-header">
                    <div className="tournament-match-badges">
                      <span className="phase-badge">{getMatchPhaseLabel(match)}</span>
                      <span className={`category-badge ${category}`}>{getCategoryLabel(category)}</span>
                    </div>
                    {match.scheduledAt && (
                      <span className="tournament-match-date">
                        {new Date(match.scheduledAt).toLocaleDateString('pl-PL')}
                      </span>
                    )}
                  </div>

                  <div className="tournament-scoreboard">
                    <div className={`scoreboard-row ${isP1Winner ? 'winner' : ''}`}>
                      <div className="scoreboard-player">
                        {isP1Winner && <span className="winner-icon">🏆</span>}
                        <span className="scoreboard-name">{getPlayerName(match.p1)}</span>
                      </div>
                      <div className="scoreboard-sets">
                        {match.sets.map((set, i) => (
                          <div key={i} className={`scoreboard-set ${set.p1 > set.p2 && !(set.p1 === 0 && set.p2 === 0) ? 'set-won' : ''}`}>
                            {set.p1 === 0 && set.p2 === 0 ? '-' : set.p1}
                          </div>
                        ))}
                      </div>
                      <div className="scoreboard-total">{p1Sets}</div>
                    </div>

                    <div className={`scoreboard-row ${isP2Winner ? 'winner' : ''}`}>
                      <div className="scoreboard-player">
                        {isP2Winner && <span className="winner-icon">🏆</span>}
                        <span className="scoreboard-name">{getPlayerName(match.p2)}</span>
                      </div>
                      <div className="scoreboard-sets">
                        {match.sets.map((set, i) => (
                          <div key={i} className={`scoreboard-set ${set.p2 > set.p1 && !(set.p1 === 0 && set.p2 === 0) ? 'set-won' : ''}`}>
                            {set.p1 === 0 && set.p2 === 0 ? '-' : set.p2}
                          </div>
                        ))}
                      </div>
                      <div className="scoreboard-total">{p2Sets}</div>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>

          {totalTournamentPages > 1 && (
            <div className="tournament-pagination">
              <button
                className="pagination-btn"
                onClick={() => setTournamentPage(p => Math.max(0, p - 1))}
                disabled={safeTournamentPage === 0}
              >
                Poprzednia
              </button>
              <span className="pagination-info">
                {safeTournamentPage + 1} / {totalTournamentPages}
              </span>
              <button
                className="pagination-btn"
                onClick={() => setTournamentPage(p => Math.min(totalTournamentPages - 1, p + 1))}
                disabled={safeTournamentPage === totalTournamentPages - 1}
              >
                Następna
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="no-matches">
          <p>Brak meczów turnieju</p>
        </div>
      )}
    </div>
  )

  if (isLoggedIn) {
    return (
      <div className="app">
        <header className="header">
          <div className="header-content">
            <div className="logo-section">
              <div className="target-icon">🎯</div>
              <h1 className="logo">Marymont Ping Pong</h1>
            </div>
            <div className="user-section">
              <div className="user-info">
                <span className="username">{user?.username}</span>
                <span className={`role-badge ${user?.role === 'admin' ? 'admin' : 'player'}`}>
                  {user?.role === 'admin' ? 'Administrator' : 'Gracz'}
                </span>
              </div>
            </div>
          </div>
        </header>

        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button
              className={`sidebar-item ${activeView === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveView('dashboard')}
            >
              <span className="sidebar-icon">🏠</span>
              <span className="sidebar-label">Pulpit</span>
            </button>
            <button
              className={`sidebar-item ${activeView === 'matches' ? 'active' : ''}`}
              onClick={() => setActiveView('matches')}
            >
              <span className="sidebar-icon">🏓</span>
              <span className="sidebar-label">Mecze</span>
            </button>
            <button
              className={`sidebar-item ${activeView === 'standings' ? 'active' : ''}`}
              onClick={() => setActiveView('standings')}
            >
              <span className="sidebar-icon">📊</span>
              <span className="sidebar-label">Klasyfikacja</span>
            </button>
            <button
              className={`sidebar-item ${activeView === 'brackets' ? 'active' : ''}`}
              onClick={() => setActiveView('brackets')}
            >
              <span className="sidebar-icon">🏆</span>
              <span className="sidebar-label">Drabinki</span>
            </button>
            <button
              className={`sidebar-item ${activeView === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveView('admin')}
            >
              <span className="sidebar-icon">⚙️</span>
              <span className="sidebar-label">Ustawienia</span>
            </button>
          </nav>
          <div className="sidebar-footer">
            <img src="/logo.jpg" alt="Marymont Ping Pong" className="sidebar-logo" />
            <span className="footer-text">© 2025 Marymont Ping Pong</span>
          </div>
        </aside>

        {/* Mobile Bottom Nav */}
        <nav className="bottom-nav">
          <button
            className={`bottom-nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveView('dashboard')}
          >
            <span className="nav-icon">🏠</span>
            <span>Pulpit</span>
          </button>
          <button
            className={`bottom-nav-item ${activeView === 'matches' ? 'active' : ''}`}
            onClick={() => setActiveView('matches')}
          >
            <span className="nav-icon">🏓</span>
            <span>Mecze</span>
          </button>
          <button
            className={`bottom-nav-item ${activeView === 'standings' ? 'active' : ''}`}
            onClick={() => setActiveView('standings')}
          >
            <span className="nav-icon">📊</span>
            <span>Klasyfikacja</span>
          </button>
          <button
            className={`bottom-nav-item ${activeView === 'brackets' ? 'active' : ''}`}
            onClick={() => setActiveView('brackets')}
          >
            <span className="nav-icon">🏆</span>
            <span>Drabinki</span>
          </button>
          <button
            className={`bottom-nav-item ${activeView === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveView('admin')}
          >
            <span className="nav-icon">⚙️</span>
            <span>Ustawienia</span>
          </button>
        </nav>

        <main className="main-content">
          {/* Dashboard View */}
          {activeView === 'dashboard' && (
            <>
              <div className="next-match-card">
                <div className="card-header">
                  <h3>Twój Następny Mecz</h3>
                  {nextMatch?.scheduledAt && (
                    <span className="match-time">
                      {new Date(nextMatch.scheduledAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="match-details">
                  {nextMatch ? (
                    <>
                      <div className="opponents">
                        <div className="player">
                          <span className="player-name">{getPlayerName(nextMatch.p1)}</span>
                        </div>
                        <div className="vs">VS</div>
                        <div className="player">
                          <span className="player-name">{getPlayerName(nextMatch.p2)}</span>
                        </div>
                      </div>
                      <div className="current-scores">
                        <div className="set-scores">
                          {getSetScores(nextMatch).map((score, index) => (
                            <span key={index}>{score}</span>
                          ))}
                        </div>
                      </div>
                      <button
                        className="edit-score-btn"
                        onClick={() => handleEditScore(nextMatch)}
                      >
                        Edytuj Wynik
                      </button>
                    </>
                  ) : (
                    <div className="no-match">
                      <p>Brak nadchodzących meczów</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="middle-section">
                <div className="upcoming-matches">
                  <div className="section-header">
                    <h3>Nadchodzące Mecze</h3>
                  </div>
                  <div className="matches-list">
                    {upcomingMatches.length > 0 ? (
                      upcomingMatches.map((match) => (
                        <div key={match.id} className="match-item">
                          <span className="time">
                            {match.scheduledAt ? new Date(match.scheduledAt).toLocaleDateString() : 'TBD'}
                          </span>
                          <span className="players">
                            {getPlayerName(match.p1)} vs {getPlayerName(match.p2)}
                          </span>
                          <span className={`status ${match.status}`}>
                            {getMatchStatus(match)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="no-matches">
                        <p>Brak zaplanowanych meczów</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="my-matches">
                  <h3>Moje Mecze</h3>
                  <div className="matches-list">
                    {myMatches.length > 0 ? (
                      myMatches.map((match) => (
                        <div key={match.id} className="match-item">
                          <span className="time">
                            {match.scheduledAt ? new Date(match.scheduledAt).toLocaleDateString() : 'TBD'}
                          </span>
                          <span className="players">
                            {getPlayerName(match.p1)} vs {getPlayerName(match.p2)}
                          </span>
                          <span className={`status ${match.status}`}>
                            {getMatchStatus(match)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="no-matches">
                        <p>Nie znaleziono meczów</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Matches View */}
          {activeView === 'matches' && renderTournamentMatches()}

          {/* Standings View */}
          {activeView === 'standings' && (
            <div className="group-standings">
              <div className="section-header">
                <h3>Klasyfikacja Grup</h3>
                <div className="tabs">
                  <button
                    className={`tab ${standingsCategory === 'man' ? 'active' : ''}`}
                    onClick={() => handleStandingsCategoryChange('man')}
                  >
                    Mężczyźni
                  </button>
                  <button
                    className={`tab ${standingsCategory === 'woman' ? 'active' : ''}`}
                    onClick={() => handleStandingsCategoryChange('woman')}
                  >
                    Kobiety
                  </button>
                </div>
                {standings.length > 0 && (
                  <div className="group-tabs">
                    <button
                      className={`group-tab ${selectedGroupId === 'all' ? 'active' : ''}`}
                      onClick={() => setSelectedGroupId('all')}
                    >
                      Wszyscy
                    </button>
                    {standings
                      .filter(group => group.groupId !== 'nogroup')
                      .sort((a, b) => {
                        const letterA = getGroupLetter(a.groupId);
                        const letterB = getGroupLetter(b.groupId);
                        return letterA.localeCompare(letterB);
                      })
                      .map((group) => (
                        <button
                          key={group.groupId}
                          className={`group-tab ${selectedGroupId === group.groupId ? 'active' : ''}`}
                          onClick={() => setSelectedGroupId(group.groupId)}
                        >
                          Grupa {getGroupLetter(group.groupId)}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              {standings.length > 0 && selectedGroupId ? (
                (() => {
                  if (selectedGroupId === 'all') {
                    return renderStandingsTableBlock(getAllPlayersStandings(), 'Wszystkie Grupy');
                  } else {
                    const selectedGroup = standings.find(group => group.groupId === selectedGroupId);
                    return selectedGroup
                      ? renderStandingsTableBlock(selectedGroup.table, `Grupa ${getGroupLetter(selectedGroup.groupId)}`)
                      : null;
                  }
                })()
              ) : (
                <div className="no-standings">
                  <p>Brak dostępnej klasyfikacji</p>
                </div>
              )}
            </div>
          )}

          {/* Brackets View */}
          {activeView === 'brackets' && (
            <div className="bracket-preview">
              <div className="bracket-header">
                <h3>Drabinki</h3>
                {user?.role === 'admin' && (
                  <button className="primary-btn small" onClick={() => setShowBracketAdmin(true)}>
                    Zarządzaj Drabinkami
                  </button>
                )}
              </div>
              <div className="bracket-tabs">
                <button
                  className={`bracket-tab ${activeBracketTab === 'man' ? 'active' : ''}`}
                  onClick={() => setActiveBracketTab('man')}
                >
                  Mężczyźni
                </button>
                <button
                  className={`bracket-tab ${activeBracketTab === 'woman' ? 'active' : ''}`}
                  onClick={() => setActiveBracketTab('woman')}
                >
                  Kobiety
                </button>
                <button
                  className={`bracket-tab ${activeBracketTab === 'tds' ? 'active' : ''}`}
                  onClick={() => setActiveBracketTab('tds')}
                >
                  Turniej Drugiej Szansy
                </button>
              </div>
              {activeBracketTab === 'man' && (
                <BracketView
                  bracket={manBracketData?.bracket}
                  matches={manBracketData?.matches || []}
                  players={players}
                  title="Mężczyźni — Drabinka Główna"
                  isAdmin={user?.role === 'admin'}
                  onMatchClick={handleEditScore}
                />
              )}
              {activeBracketTab === 'woman' && (
                <BracketView
                  bracket={womanBracketData?.bracket}
                  matches={womanBracketData?.matches || []}
                  players={players}
                  title="Kobiety — Drabinka Główna"
                  isAdmin={user?.role === 'admin'}
                  onMatchClick={handleEditScore}
                />
              )}
              {activeBracketTab === 'tds' && (
                <BracketView
                  bracket={tdsBracketData?.bracket}
                  matches={tdsBracketData?.matches || []}
                  players={players}
                  title="Turniej Drugiej Szansy"
                  isAdmin={user?.role === 'admin'}
                  onMatchClick={handleEditScore}
                />
              )}
            </div>
          )}

          {/* Settings View */}
          {activeView === 'admin' && (
            <>
              <div className="settings-section">
                <h4>Konto</h4>
                <div className="settings-buttons">
                  <button
                    className="settings-btn"
                    onClick={() => setShowChangePasswordModal(true)}
                  >
                    Zmień Hasło
                  </button>
                  <button
                    className="settings-btn settings-btn-danger"
                    onClick={handleLogout}
                  >
                    Wyloguj
                  </button>
                </div>
              </div>
              {user?.role === 'admin' && (
                <div className="admin-actions">
                  <h4>Panel Administratora</h4>
                  <div className="action-buttons">
                    <button
                      className="action-btn black"
                      onClick={() => setShowGroupGenerator(true)}
                    >
                      Grupy
                    </button>
                    <button
                      className="action-btn blue"
                      onClick={() => setShowMatchCreator(true)}
                    >
                      Mecze
                    </button>
                    <button
                      className="action-btn red"
                      onClick={() => setShowAccountManagement(true)}
                    >
                      Zarządzaj Kontami
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* Add Player Modal */}
        <AddPlayerModal
          isOpen={showAddPlayerModal}
          onClose={() => setShowAddPlayerModal(false)}
          onPlayerAdded={loadDashboardData}
          category={standingsCategory}
        />

        {/* Account Management */}
        {showAccountManagement && (
          <div className="modal-overlay" onClick={() => setShowAccountManagement(false)}>
            <div className="modal-content account-management-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Zarządzanie Kontami</h2>
                <button
                  className="modal-close"
                  onClick={() => setShowAccountManagement(false)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <AccountManagement />
              </div>
            </div>
          </div>
        )}

        {/* Group Generator */}
        {showGroupGenerator && (
          <div className="modal-overlay" onClick={() => setShowGroupGenerator(false)}>
            <div className="modal-content group-generator-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Grupy</h2>
                <button
                  className="modal-close"
                  onClick={() => setShowGroupGenerator(false)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <GroupGenerator
                  onGroupsUpdated={loadDashboardData}
                />
              </div>
            </div>
          </div>
        )}

        {/* Match Creator */}
        {showMatchCreator && (
          <div className="modal-overlay" onClick={() => setShowMatchCreator(false)}>
            <div className="modal-content match-creator-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Mecze</h2>
                <button
                  className="modal-close"
                  onClick={() => setShowMatchCreator(false)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <MatchCreator
                  onMatchesCreated={loadDashboardData}
                  onEditScore={handleEditScore}
                />
              </div>
            </div>
          </div>
        )}

        {/* Edit Score Modal */}
        {showEditScoreModal && selectedMatchForScore && (
          <EditScoreModal
            isOpen={showEditScoreModal}
            onClose={() => setShowEditScoreModal(false)}
            onScoreUpdated={handleScoreUpdated}
            match={selectedMatchForScore}
            players={players}
            category={user?.category}
          />
        )}

        {/* Bracket Admin Modal */}
        <BracketAdmin
          isOpen={showBracketAdmin}
          onClose={() => setShowBracketAdmin(false)}
          onBracketChanged={() => { loadBracketData(); }}
          players={players}
          onMatchClick={(match) => { setShowBracketAdmin(false); handleEditScore(match); }}
        />

        {/* My Matches Modal */}
        {showMyMatchesModal && user && user.playerId && (
          <MyMatchesModal
            isOpen={showMyMatchesModal}
            onClose={() => setShowMyMatchesModal(false)}
            onMatchEdited={(match: GroupMatch | EliminationMatch) => handleMatchEdited(match)}
            userId={user.playerId}
            category={user.category || 'man'}
            players={players}
          />
        )}

        {/* Standings Modal */}
        {showStandingsModal && (
          <StandingsModal
            isOpen={showStandingsModal}
            onClose={() => setShowStandingsModal(false)}
            players={players}
          />
        )}

        {/* Change Password Modal */}
        <ChangePasswordModal
          isOpen={showChangePasswordModal}
          onClose={() => setShowChangePasswordModal(false)}
        />
      </div>
    )
  }


  // Show login screen if login modal is open
  if (showLoginModal) {
    return (
      <div className="app app-login">
        <div className="login-container">
          <div className="login-card">
            <div className="login-header">
              <div className="login-logo-container">
                <img
                  src="/logo.jpg"
                  alt="Marymoncki Turniej Pingonga"
                  className="login-logo"
                />
              </div>
              <p className="login-subtitle">Zaloguj się do swojego konta</p>
            </div>

            <form onSubmit={handleLogin} className="login-form">
              <div className="input-group">
                <label htmlFor="username" className="input-label">Nazwa użytkownika</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={credentials.username}
                  onChange={handleInputChange}
                  className="input-field"
                  placeholder="Wprowadź nazwę użytkownika"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="input-group">
                <label htmlFor="password" className="input-label">Hasło</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={credentials.password || ''}
                  onChange={handleInputChange}
                  className="input-field"
                  placeholder="Wprowadź hasło"
                  required
                  disabled={isLoading}
                />
              </div>

              {error && <div className="error-message">{error}</div>}

              <button
                type="submit"
                className="login-btn"
                disabled={isLoading}
              >
                {isLoading ? 'Logowanie...' : 'Zaloguj'}
              </button>
            </form>

            <div className="login-footer">
              <p className="demo-credentials">
                Skontaktuj się z Dziubsonem w celu dostępu do konta
              </p>
            </div>

            <button
              onClick={() => {
                setShowLoginModal(false)
                setError('')
              }}
              className="back-to-standings-btn"
            >
              ← Wróć do klasyfikacji
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Unlogged user view - show standings with login button
  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo-section">
            <div className="target-icon">🎯</div>
            <h1 className="logo">Marymont Ping Pong</h1>
          </div>
          <div className="user-section">
            <button
              onClick={() => setShowLoginModal(true)}
              className="login-btn-header"
            >
              Zaloguj się
            </button>
          </div>
        </div>
      </header>

      <aside className="sidebar">
        <nav className="sidebar-nav">
          <button
            className={`sidebar-item ${activeView === 'matches' ? 'active' : ''}`}
            onClick={() => setActiveView('matches')}
          >
            <span className="sidebar-icon">🏓</span>
            <span className="sidebar-label">Mecze</span>
          </button>
          <button
            className={`sidebar-item ${activeView === 'standings' ? 'active' : ''}`}
            onClick={() => setActiveView('standings')}
          >
            <span className="sidebar-icon">📊</span>
            <span className="sidebar-label">Klasyfikacja</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <span className="footer-text">© 2025 Marymont Ping Pong</span>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="bottom-nav">
        <button
          className={`bottom-nav-item ${activeView === 'matches' ? 'active' : ''}`}
          onClick={() => setActiveView('matches')}
        >
          <span className="nav-icon">🏓</span>
          <span>Mecze</span>
        </button>
        <button
          className={`bottom-nav-item ${activeView === 'standings' ? 'active' : ''}`}
          onClick={() => setActiveView('standings')}
        >
          <span className="nav-icon">📊</span>
          <span>Klasyfikacja</span>
        </button>
      </nav>

      <main className="main-content">
        {/* Matches View */}
        {activeView === 'matches' && renderTournamentMatches()}

        {/* Standings View */}
        {activeView === 'standings' && (
          <div className="group-standings">
            <div className="section-header">
              <h3>Klasyfikacja Grup</h3>
              <div className="tabs">
                <button
                  className={`tab ${standingsCategory === 'man' ? 'active' : ''}`}
                  onClick={() => handleStandingsCategoryChange('man')}
                >
                  Mężczyźni
                </button>
                <button
                  className={`tab ${standingsCategory === 'woman' ? 'active' : ''}`}
                  onClick={() => handleStandingsCategoryChange('woman')}
                >
                  Kobiety
                </button>
              </div>
              {standings.length > 0 && (
                <div className="group-tabs">
                  <button
                    className={`group-tab ${selectedGroupId === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectedGroupId('all')}
                  >
                    Wszyscy
                  </button>
                  {standings
                    .filter(group => group.groupId !== 'nogroup')
                    .sort((a, b) => {
                      const letterA = getGroupLetter(a.groupId);
                      const letterB = getGroupLetter(b.groupId);
                      return letterA.localeCompare(letterB);
                    })
                    .map((group) => (
                      <button
                        key={group.groupId}
                        className={`group-tab ${selectedGroupId === group.groupId ? 'active' : ''}`}
                        onClick={() => setSelectedGroupId(group.groupId)}
                      >
                        Grupa {getGroupLetter(group.groupId)}
                      </button>
                    ))}
                </div>
              )}
            </div>
            {standings.length > 0 && selectedGroupId ? (
              (() => {
                if (selectedGroupId === 'all') {
                  return renderStandingsTableBlock(getAllPlayersStandings(), 'Wszystkie Grupy');
                } else {
                  const selectedGroup = standings.find(group => group.groupId === selectedGroupId);
                  return selectedGroup
                    ? renderStandingsTableBlock(selectedGroup.table, `Grupa ${getGroupLetter(selectedGroup.groupId)}`)
                    : null;
                }
              })()
            ) : (
              <div className="no-standings">
                <p>Brak dostępnej klasyfikacji</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
