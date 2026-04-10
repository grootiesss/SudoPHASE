import './App.css'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import GameModePage from './pages/GameModePage'
import ExperimentModePage from './pages/ExperimentModePage'

const cards = [
  {
    title: 'Game Mode',
    subtitle: 'Enter the Sudoku arena. Focus first, then use exports when needed.',
    to: '/game',
    size: 'wide',
  },
  {
    title: 'Experiment Mode',
    subtitle: 'Tune solver parameters and compare runtime behavior.',
    to: '/play',
    size: 'wide',
  },
  {
    title: 'Create Puzzle',
    subtitle: 'Craft custom clues and validate solvability.',
    to: '/create',
  },
  {
    title: 'Upload Puzzle',
    subtitle: 'Import your own .txt puzzle and start instantly.',
    to: '/upload',
  },
  {
    title: 'About Game',
    subtitle: 'Read the manual and gameplay guide.',
    to: '/about',
  },
]

function HomeMenu() {
  return (
    <main className="menu-page">
      <section className="menu-shell">
        <header className="brand-header">
          <div className="logo-badge" aria-hidden="true">▦</div>
          <div>
            <h1>SudACO</h1>
            <p>Sudoku Game</p>
          </div>
        </header>

        <div className="menu-grid">
          {cards.map((card) => (
            <Link
              key={card.title}
              to={card.to}
              className={`glass-card ${card.size === 'wide' ? 'wide' : ''}`}
            >
              <h2>{card.title}</h2>
              <p>{card.subtitle}</p>
            </Link>
          ))}
        </div>

        <footer className="menu-footer">
          <span>UI migration in progress</span>
          <span>•</span>
          <span>React workspace: webapp_improved</span>
        </footer>
      </section>
    </main>
  )
}

function PlaceholderPage({ title, fallbackHref }) {
  const location = useLocation()
  return (
    <main className="placeholder-page">
      <section className="placeholder-card">
        <h1>{title}</h1>
        <p>
          This page is the React version placeholder. The full UI can be migrated next.
        </p>
        <div className="actions">
          <Link to="/" className="btn">Back to Menu</Link>
          <a href={fallbackHref} className="btn secondary">
            Open current Flask page
          </a>
        </div>
        <code className="route-label">Current route: {location.pathname}</code>
      </section>
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeMenu />} />
      <Route path="/game" element={<GameModePage />} />
      <Route path="/play" element={<ExperimentModePage />} />
      <Route path="/create" element={<PlaceholderPage title="Create Puzzle" fallbackHref="/create" />} />
      <Route path="/upload" element={<PlaceholderPage title="Upload Puzzle" fallbackHref="/upload" />} />
      <Route path="/about" element={<PlaceholderPage title="About Game" fallbackHref="/about" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
