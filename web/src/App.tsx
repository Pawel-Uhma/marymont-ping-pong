import { useState } from 'react'
import './App.css'
import { userService } from './api'
import type { User, LoginCredentials } from './api/types'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [credentials, setCredentials] = useState<LoginCredentials>({ username: '', password: '' })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

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
                <span className={`role-badge ${user?.username === 'admin' ? 'admin' : 'player'}`}>
                  {user?.username === 'admin' ? 'Admin' : 'Player'}
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
                <span className="match-time">Today, 3:00 PM</span>
              </div>
              <div className="match-details">
                <div className="opponents">
                  <div className="player">
                    <span className="player-name">John Doe</span>
                    <span className="player-rank">#3</span>
                  </div>
                  <div className="vs">VS</div>
                  <div className="player">
                    <span className="player-name">Jane Smith</span>
                    <span className="player-rank">#5</span>
                  </div>
                </div>
                <div className="current-scores">
                  <div className="set-scores">
                    <span>Set 1: 11-9</span>
                    <span>Set 2: 8-11</span>
                    <span>Set 3: -</span>
                  </div>
                </div>
                <button className="edit-score-btn">Edit Score</button>
              </div>
            </div>
            
            <div className="quick-actions">
              <h4>Quick Actions</h4>
              <div className="action-buttons">
                <button className="action-btn blue">Report Score</button>
                <button className="action-btn yellow">See All Matches</button>
                {user?.username === 'admin' && (
                  <>
                    <button className="action-btn red">Add Player</button>
                    <button className="action-btn black">Generate Groups</button>
                    <button className="action-btn blue">Seed Bracket</button>
                    <button className="action-btn yellow">Recompute Standings</button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Middle Section */}
          <div className="middle-section">
            <div className="todays-matches">
              <div className="section-header">
                <h3>Today's Matches</h3>
                <div className="filters">
                  <select className="filter-select">
                    <option>All Categories</option>
                    <option>Men</option>
                    <option>Women</option>
                  </select>
                  <select className="filter-select">
                    <option>All Phases</option>
                    <option>Group Stage</option>
                    <option>Elimination</option>
                  </select>
                </div>
              </div>
              <div className="matches-list">
                <div className="match-item">
                  <span className="time">2:00 PM</span>
                  <span className="players">Mike vs Sarah</span>
                  <span className="status">In Progress</span>
                </div>
                <div className="match-item">
                  <span className="time">2:30 PM</span>
                  <span className="players">Tom vs Lisa</span>
                  <span className="status">Scheduled</span>
                </div>
                <div className="match-item">
                  <span className="time">3:00 PM</span>
                  <span className="players">John vs Jane</span>
                  <span className="status">Scheduled</span>
                </div>
              </div>
            </div>

            <div className="my-matches">
              <h3>My Matches</h3>
              <div className="matches-list">
                <div className="match-item">
                  <span className="time">3:00 PM</span>
                  <span className="players">You vs Jane</span>
                  <span className="status upcoming">Upcoming</span>
                </div>
                <div className="match-item">
                  <span className="time">Yesterday</span>
                  <span className="players">You vs Mike</span>
                  <span className="status won">Won 3-1</span>
                </div>
                <div className="match-item">
                  <span className="time">2 days ago</span>
                  <span className="players">You vs Tom</span>
                  <span className="status lost">Lost 2-3</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="bottom-section">
            <div className="group-standings">
              <div className="section-header">
                <h3>Group Standings</h3>
                <div className="tabs">
                  <button className="tab active">Men</button>
                  <button className="tab">Women</button>
                </div>
                <div className="group-tabs">
                  <button className="group-tab active">Group A</button>
                  <button className="group-tab">Group B</button>
                  <button className="group-tab">Group C</button>
                </div>
              </div>
              <div className="standings-table">
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
                    <tr>
                      <td>1</td>
                      <td>John Doe</td>
                      <td>3-1</td>
                      <td>+2</td>
                      <td>+15</td>
                    </tr>
                    <tr>
                      <td>2</td>
                      <td>Mike Johnson</td>
                      <td>2-2</td>
                      <td>0</td>
                      <td>+5</td>
                    </tr>
                    <tr>
                      <td>3</td>
                      <td>Tom Wilson</td>
                      <td>2-2</td>
                      <td>-1</td>
                      <td>-3</td>
                    </tr>
                    <tr>
                      <td>4</td>
                      <td>Bob Smith</td>
                      <td>1-3</td>
                      <td>-1</td>
                      <td>-17</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bracket-preview">
              <h3>Bracket Preview</h3>
              <div className="bracket">
                <div className="bracket-round">
                  <div className="bracket-match">
                    <div className="player">John</div>
                    <div className="player">Mike</div>
                  </div>
                  <div className="bracket-match">
                    <div className="player">Tom</div>
                    <div className="player">Bob</div>
                  </div>
                </div>
                <div className="bracket-round">
                  <div className="bracket-match">
                    <div className="player">John</div>
                    <div className="player">Tom</div>
                  </div>
                </div>
                <div className="bracket-round">
                  <div className="bracket-match">
                    <div className="player winner">John</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
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
