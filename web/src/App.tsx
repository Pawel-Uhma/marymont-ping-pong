import { useState, useEffect } from 'react'
import './App.css'
import { userService, dataService } from './api'
import type { LoginCredentials, Category, Player, GroupMatch, EliminationMatch, PlayerStanding, GroupStanding } from './api/types'
import { AddPlayerModal } from './components/AddPlayerModal'
import { AccountManagement } from './components/AccountManagement'
import { GroupGenerator } from './components/GroupGenerator'
import { MatchCreator } from './components/MatchCreator'

interface User {
  username: string;
  role: 'admin' | 'player';
  playerId: string | null;
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [credentials, setCredentials] = useState<LoginCredentials>({ username: '', password: '' })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  // Dashboard data
  const [selectedCategory, setSelectedCategory] = useState<Category>('man')
  const [players, setPlayers] = useState<Player[]>([])
  const [nextMatch, setNextMatch] = useState<GroupMatch | EliminationMatch | null>(null)
  const [upcomingMatches, setUpcomingMatches] = useState<(GroupMatch | EliminationMatch)[]>([])
  const [myMatches, setMyMatches] = useState<(GroupMatch | EliminationMatch)[]>([])
  const [standings, setStandings] = useState<GroupStanding[]>([])
  const [bracket, setBracket] = useState<any>(null)
  
  // Modal states
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false)
  const [showAccountManagement, setShowAccountManagement] = useState(false)
  const [showGroupGenerator, setShowGroupGenerator] = useState(false)
  const [showMatchCreator, setShowMatchCreator] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    try {
      const response = await userService.login(credentials)
      
      if (response.success && response.user) {
        setUser(response.user)
        setIsLoggedIn(true)
        setCredentials({ username: '', password: '' })
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
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setCredentials(prev => ({ ...prev, [name]: value }))
    setError('') // Clear error when user types
  }

  // Load dashboard data
  const loadDashboardData = async () => {
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
      if (user.playerId) {
        const nextMatchData = await dataService.getNextMatchForPlayer(selectedCategory, user.playerId)
        setNextMatch(nextMatchData)
        
        // Load player's matches
        const myMatchesData = await dataService.getMatchesForPlayer(selectedCategory, user.playerId)
        setMyMatches(myMatchesData)
      }

      // Load upcoming matches from both categories
      const upcomingMatchesData = await dataService.getUpcomingMatches()
      setUpcomingMatches(upcomingMatchesData)

      // Load standings
      const standingsData = await dataService.getStandings(selectedCategory)
      setStandings(standingsData)

      // Load bracket
      const bracketData = await dataService.getBracket(selectedCategory)
      setBracket(bracketData)
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    }
  }

  // Load data when user logs in or category changes
  useEffect(() => {
    if (isLoggedIn && user) {
      loadDashboardData()
    }
  }, [isLoggedIn, user, selectedCategory])

  // Helper functions
  const getPlayerName = (playerId: string): string => {
    console.log('getPlayerName called with playerId:', playerId, 'players array:', players)
    const player = players.find(p => p.id === playerId)
    console.log('Found player:', player)
    return player ? `${player.name} ${player.surname}` : 'Unknown Player'
  }

  const getMatchStatus = (match: GroupMatch | EliminationMatch): string => {
    if (match.status === 'final') {
      return match.winner ? `Won by ${getPlayerName(match.winner)}` : 'Completed'
    }
    if (match.status === 'in_progress') {
      return 'In Progress'
    }
    return 'Scheduled'
  }

  const getSetScores = (match: GroupMatch | EliminationMatch): string[] => {
    return match.sets.map((set, index) => {
      if (set.p1 === 0 && set.p2 === 0) return `Set ${index + 1}: -`
      return `Set ${index + 1}: ${set.p1}-${set.p2}`
    })
  }

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
                  {user?.role === 'admin' ? 'Admin' : 'Player'}
                </span>
              </div>
              <button onClick={handleLogout} className="logout-btn">
                Logout
              </button>
            </div>
          </div>
        </header>
        
        <main className="main-content">
          {/* Top Row */}
          <div className="top-row">
            <div className="next-match-card">
              <div className="card-header">
                <h3>Your Next Match</h3>
                {nextMatch?.scheduledAt && (
                  <span className="match-time">
                    {new Date(nextMatch.scheduledAt).toLocaleDateString()}, {new Date(nextMatch.scheduledAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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
                    <button className="edit-score-btn">Edit Score</button>
                  </>
                ) : (
                  <div className="no-match">
                    <p>No upcoming matches</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="quick-actions">
              <h4>Quick Actions</h4>
              <div className="action-buttons">
                <button className="action-btn blue">Report Score</button>
                <button className="action-btn yellow">See All Matches</button>
              </div>
            </div>
            
            {user?.role === 'admin' && (
              <div className="admin-actions">
                <h4>Admin Actions</h4>
                <div className="action-buttons">
                  <button 
                    className="action-btn black"
                    onClick={() => setShowGroupGenerator(true)}
                  >
                    Generate Groups
                  </button>
                  <button 
                    className="action-btn blue"
                    onClick={() => setShowMatchCreator(true)}
                  >
                    Add Matches
                  </button>
                  <button 
                    className="action-btn red"
                    onClick={() => setShowAccountManagement(true)}
                  >
                    Manage Accounts
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Middle Section */}
          <div className="middle-section">
            <div className="upcoming-matches">
              <div className="section-header">
                <h3>Upcoming Matches</h3>
              </div>
              <div className="matches-list">
                {upcomingMatches.length > 0 ? (
                  upcomingMatches.map((match) => (
                    <div key={match.id} className="match-item">
                      <span className="time">
                        {match.scheduledAt ? new Date(match.scheduledAt).toLocaleDateString() + ' ' + new Date(match.scheduledAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'TBD'}
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
                    <p>No upcoming matches scheduled</p>
                  </div>
                )}
              </div>
            </div>

            <div className="my-matches">
              <h3>My Matches</h3>
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
                    <p>No matches found</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="bottom-section">
            <div className="group-standings">
              <div className="section-header">
                <h3>Group Standings</h3>
                <div className="tabs">
                  <button 
                    className={`tab ${selectedCategory === 'man' ? 'active' : ''}`}
                    onClick={() => setSelectedCategory('man')}
                  >
                    Men
                  </button>
                  <button 
                    className={`tab ${selectedCategory === 'woman' ? 'active' : ''}`}
                    onClick={() => setSelectedCategory('woman')}
                  >
                    Women
                  </button>
                </div>
                <div className="group-tabs">
                  <button className="group-tab active">Group A</button>
                  <button className="group-tab">Group B</button>
                  <button className="group-tab">Group C</button>
                </div>
              </div>
              <div className="standings-table">
                {standings.length > 0 ? (
                  standings.map((group) => (
                    <div key={group.groupId} className="group-standings-table">
                      <h4>Group {group.groupId}</h4>
                      <table>
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Player</th>
                            <th>W-L</th>
                            <th>Sets +/-</th>
                            <th>Points +/-</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.table.map((player: PlayerStanding) => (
                            <tr key={player.playerId}>
                              <td>{player.rank}</td>
                              <td>{getPlayerName(player.playerId)}</td>
                              <td>{player.wins}-{player.losses}</td>
                              <td>{player.setsFor - player.setsAgainst > 0 ? '+' : ''}{player.setsFor - player.setsAgainst}</td>
                              <td>{player.pointsFor - player.pointsAgainst > 0 ? '+' : ''}{player.pointsFor - player.pointsAgainst}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                ) : (
                  <div className="no-standings">
                    <p>No standings available</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bracket-preview">
              <h3>Bracket Preview</h3>
              <div className="bracket">
                {bracket ? (
                  bracket.rounds.map((round: any, roundIndex: number) => (
                    <div key={roundIndex} className="bracket-round">
                      <h5>{round.name}</h5>
                      {round.matchIds.map((matchId: string) => {
                        const match = bracket.matches?.find((m: any) => m.id === matchId)
                        return match ? (
                          <div key={matchId} className="bracket-match">
                            <div className="player">{getPlayerName(match.p1)}</div>
                            <div className="player">{getPlayerName(match.p2)}</div>
                          </div>
                        ) : null
                      })}
                    </div>
                  ))
                ) : (
                  <div className="no-bracket">
                    <p>No bracket available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
        
        {/* Add Player Modal */}
        <AddPlayerModal
          isOpen={showAddPlayerModal}
          onClose={() => setShowAddPlayerModal(false)}
          onPlayerAdded={loadDashboardData}
          category={selectedCategory}
        />

        {/* Account Management */}
        {showAccountManagement && (
          <div className="modal-overlay" onClick={() => setShowAccountManagement(false)}>
            <div className="modal-content account-management-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Account Management</h2>
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
                <h2>Generate Groups</h2>
                <button 
                  className="modal-close" 
                  onClick={() => setShowGroupGenerator(false)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <GroupGenerator 
                  onGroupsGenerated={loadDashboardData}
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
                <h2>Add Matches</h2>
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
                />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }


  return (
    <div className="app">
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1 className="login-title">Marymont Ping Pong</h1>
            <p className="login-subtitle">Sign in to your account</p>
          </div>
          
          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label htmlFor="username" className="input-label">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                value={credentials.username}
                onChange={handleInputChange}
                className="input-field"
                placeholder="Enter your username"
                required
                disabled={isLoading}
              />
            </div>
            
            <div className="input-group">
              <label htmlFor="password" className="input-label">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={credentials.password}
                onChange={handleInputChange}
                className="input-field"
                placeholder="Enter your password"
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
              {isLoading ? 'Signing In...' : 'Sign In'}
        </button>
          </form>
          
          <div className="login-footer">
            <p className="demo-credentials">
              Contact admin for account access
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
