import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CELLS,
  SIZES,
  CREATED_KEY,
  displayValuesToPuzzle,
  getCreatedPuzzlesByOrder,
  parseInstanceText,
  puzzleToDisplayValues,
  sanitizeDownloadBase,
} from '../lib/sudoku'

function sizeLabelFromOrder(order) {
  return order === 3 ? '9×9' : order === 4 ? '16×16' : '25×25'
}

const defaultParams = {
  timeout: 120,
  threads: 4,
  ants: 10,
  evap: 0.005,
  saTinit: 1.5,
  saTmin: 0.01,
  safreq: 50,
  saCooling: 0.995,
  commThreshold: 200,
  commEarly: 100,
  commLate: 10,
  alg: 2,
}

export default function ExperimentModePage() {
  const [order, setOrder] = useState(3)
  const [values, setValues] = useState(Array(81).fill(''))
  const [initialPuzzle, setInitialPuzzle] = useState('.'.repeat(81))
  const [puzzleName, setPuzzleName] = useState('Puzzle')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [resultText, setResultText] = useState('')
  const [resultError, setResultError] = useState(false)

  const [library, setLibrary] = useState({})
  const [source, setSource] = useState('curated')
  const [sizeLabel, setSizeLabel] = useState('9×9')
  const [listItems, setListItems] = useState([])
  const [selectedItem, setSelectedItem] = useState('')

  const [solving, setSolving] = useState(false)
  const [activeJobId, setActiveJobId] = useState(null)
  const [lastSolvedParams, setLastSolvedParams] = useState(null)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [dlKind, setDlKind] = useState('initial')
  const [dlFmt, setDlFmt] = useState('txt')
  const uploadRef = useRef(null)

  const [params, setParams] = useState(defaultParams)
  const n = order * order

  useEffect(() => {
    fetch('/api/library')
      .then((r) => r.json())
      .then((d) => setLibrary(d || {}))
      .catch(() => setLibrary({}))
  }, [])

  useEffect(() => {
    const ord = SIZES[sizeLabel] || 3
    if (source === 'curated') {
      setListItems(library[sizeLabel] || [])
    } else {
      setListItems(getCreatedPuzzlesByOrder(ord).map((x) => ({ ...x, path: x.id })))
    }
    setSelectedItem('')
  }, [source, sizeLabel, library])

  useEffect(() => {
    const created = sessionStorage.getItem('createdPuzzle')
    if (!created) return
    try {
      const data = JSON.parse(created)
      sessionStorage.removeItem('createdPuzzle')
      if (data?.order && data?.puzzle) applyLoadedPuzzle(data.order, data.puzzle, data.name || 'Created puzzle')
    } catch {
      // ignore
    }
  }, [])

  const fixedSet = useMemo(() => {
    const s = new Set()
    const str = (initialPuzzle || '').padEnd(CELLS[order], '.')
    for (let i = 0; i < str.length; i += 1) if (str[i] !== '.') s.add(i)
    return s
  }, [initialPuzzle, order])

  function applyLoadedPuzzle(nextOrder, puzzle, name) {
    setOrder(nextOrder)
    setSizeLabel(sizeLabelFromOrder(nextOrder))
    setValues(puzzleToDisplayValues(puzzle, nextOrder))
    setInitialPuzzle(puzzle)
    setPuzzleName(name || 'Puzzle')
    setSelectedIndex(0)
    setResultText('')
    setResultError(false)
    setLastSolvedParams(null)
  }

  function handleCellInput(i, raw) {
    if (fixedSet.has(i)) return
    let v = raw.replace(/\D/g, '')
    if (n <= 9) v = v.slice(0, 1)
    else {
      const num = parseInt(v, 10)
      if (!Number.isNaN(num) && num > n) v = String(n)
      if (v.length > 2) v = v.slice(0, 2)
    }
    const next = [...values]
    next[i] = v
    setValues(next)
  }

  function setDigit(v) {
    if (fixedSet.has(selectedIndex)) return
    const next = [...values]
    next[selectedIndex] = String(v)
    setValues(next)
  }

  function eraseSelected() {
    if (fixedSet.has(selectedIndex)) return
    const next = [...values]
    next[selectedIndex] = ''
    setValues(next)
  }

  function clearBoard() {
    const len = CELLS[order]
    setValues(Array(len).fill(''))
    setInitialPuzzle('.'.repeat(len))
    setPuzzleName('Empty grid')
    setResultText('')
    setResultError(false)
    setLastSolvedParams(null)
  }

  async function loadSelected() {
    if (!selectedItem) return
    try {
      if (source === 'curated') {
        const r = await fetch(`/api/instance/${encodeURIComponent(selectedItem)}`)
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Load failed')
        applyLoadedPuzzle(d.order, d.puzzle, (selectedItem || '').split('/').pop() || 'Puzzle')
      } else {
        const list = getCreatedPuzzlesByOrder(SIZES[sizeLabel] || 3)
        const item = list.find((x) => String(x.id) === String(selectedItem))
        if (!item) throw new Error('Created puzzle not found.')
        applyLoadedPuzzle(item.order, item.puzzle, item.name || 'Created puzzle')
      }
    } catch (e) {
      setResultError(true)
      setResultText(e.message || 'Load failed')
    }
  }

  function deleteSelectedCreated() {
    if (source !== 'created' || !selectedItem) return
    const raw = localStorage.getItem(CREATED_KEY)
    let list = []
    try {
      list = raw ? JSON.parse(raw) : []
    } catch {
      list = []
    }
    if (!Array.isArray(list)) return
    localStorage.setItem(CREATED_KEY, JSON.stringify(list.filter((x) => String(x.id) !== String(selectedItem))))
    setListItems(getCreatedPuzzlesByOrder(SIZES[sizeLabel] || 3).map((x) => ({ ...x, path: x.id })))
    setSelectedItem('')
  }

  async function solvePuzzle() {
    if (!initialPuzzle.includes('.')) {
      setResultError(true)
      setResultText('Grid is already full')
      return
    }
    if (!(params.evap > 0 && params.evap < 1)) {
      alert('Invalid Evaporation Rate. Must be between 0 and 1.')
      return
    }
    if (!(params.saCooling > 0 && params.saCooling < 1)) {
      alert('Invalid Cooling Rate. Must be between 0 and 1.')
      return
    }
    setSolving(true)
    setResultError(false)
    setResultText('Solving…')
    try {
      const postRes = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzle: initialPuzzle, order, ...params }),
      })
      const postData = await postRes.json().catch(() => ({}))
      if (!postRes.ok || !postData.job_id) throw new Error(postData.error || 'Failed to start solver')
      setActiveJobId(postData.job_id)
      const deadline = Date.now() + (params.timeout + 20) * 1000
      while (true) {
        if (Date.now() > deadline) throw new Error('Request timed out')
        const r = await fetch(`/api/status/${encodeURIComponent(postData.job_id)}`)
        const data = await r.json().catch(() => ({}))
        if (!r.ok || data.error) throw new Error(data.error || 'Status error')
        if (data.status === 'done' || data.status === 'error') {
          const res = data.result || {}
          if (res.success && res.solution) {
            setValues(puzzleToDisplayValues(res.solution, order))
            setLastSolvedParams({ ...params })
            setResultError(false)
            setResultText(`Solved in ${res.time?.toFixed?.(2) ?? '?'} s`)
          } else {
            setResultError(true)
            setResultText(res.error || 'No solution within timeout')
          }
          break
        }
        if (data.best_solution) setValues(puzzleToDisplayValues(data.best_solution, order))
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
    } catch (e) {
      setResultError(true)
      setResultText(e.message || 'Network error')
    } finally {
      setSolving(false)
      setActiveJobId(null)
    }
  }

  async function stopSolve() {
    if (!activeJobId) return
    try {
      await fetch(`/api/cancel/${encodeURIComponent(activeJobId)}`, { method: 'POST' })
      setResultError(true)
      setResultText('Puzzle not solved (cancelled).')
    } catch (e) {
      setResultError(true)
      setResultText(e.message || 'Cancel failed')
    } finally {
      setSolving(false)
      setActiveJobId(null)
    }
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function runDownload() {
    const len = CELLS[order]
    if (!initialPuzzle || initialPuzzle === '.'.repeat(len)) {
      setResultError(true)
      setResultText('Load a puzzle first (not an empty grid).')
      return false
    }
    const current = displayValuesToPuzzle(values, order)
    const solvedManual = values.every((v) => String(v || '').trim() !== '')
    const includeParams = solvedManual && !!lastSolvedParams
    const reportKind = dlKind === 'initial' ? 'initial' : (solvedManual ? 'solved' : 'progress')
    const ext = dlFmt === 'pdf' ? '.pdf' : '.txt'
    const defaultName = sanitizeDownloadBase((puzzleName || 'puzzle').replace(/\s+/g, '_') + (dlKind === 'progress' ? '_progress' : ''), 'puzzle')
    const base = sanitizeDownloadBase(prompt('File name:', defaultName), defaultName)
    const filename = base.toLowerCase().endsWith(ext) ? base : base + ext
    const endpoint = dlFmt === 'pdf' ? '/api/pdf' : '/api/export/report-txt'
    const body = {
      reportKind,
      includeParams: dlKind === 'initial' ? false : includeParams,
      order,
      puzzle: initialPuzzle,
      currentPuzzle: dlKind === 'initial' ? '' : current,
      solution: reportKind === 'solved' ? current : '',
      params: includeParams ? (lastSolvedParams || params) : {},
    }
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      setResultError(true)
      setResultText(`Export failed${t ? `: ${t}` : ''}`)
      return false
    }
    triggerBlobDownload(await r.blob(), filename)
    return true
  }

  function onUploadFile(file) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseInstanceText(String(reader.result || ''))
        applyLoadedPuzzle(parsed.order, parsed.puzzle, (file.name || 'Uploaded').replace(/\.txt$/i, ''))
      } catch (e) {
        setResultError(true)
        setResultText(e.message || 'Failed to parse file')
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  const gridStyle = useMemo(() => {
    const cell = order === 3 ? 34 : order === 4 ? 28 : 22
    return {
      gridTemplateColumns: `repeat(${n}, ${cell}px)`,
      gridTemplateRows: `repeat(${n}, ${cell}px)`,
    }
  }, [order, n])

  return (
    <main className="exp-page">
      <aside className="exp-sidebar">
        <h2>Puzzle library</h2>
        <label>Source</label>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="curated">Curated dataset</option>
          <option value="created">Created puzzles</option>
        </select>
        <label>Size</label>
        <select
          value={sizeLabel}
          onChange={(e) => {
            setSizeLabel(e.target.value)
            const newOrder = SIZES[e.target.value] || 3
            setOrder(newOrder)
          }}
        >
          <option value="9×9">9×9</option>
          <option value="16×16">16×16</option>
          <option value="25×25">25×25</option>
        </select>
        <label>Instances</label>
        <ul className="exp-list">
          {listItems.length ? listItems.map((item) => {
            const key = source === 'curated' ? item.path : item.id
            return (
              <li
                key={String(key)}
                className={String(selectedItem) === String(key) ? 'sel' : ''}
                onClick={() => setSelectedItem(String(key))}
              >
                {item.name}
              </li>
            )
          }) : <li className="muted">(none)</li>}
        </ul>
        <button type="button" className="exp-btn" onClick={loadSelected}>Load selected</button>
        {source === 'created' ? (
          <button type="button" className="exp-btn" onClick={deleteSelectedCreated}>Delete selected</button>
        ) : null}

        <section className="exp-params">
          <h3>Parameters</h3>
          {[
            ['timeout', 'Timeout (s)'],
            ['ants', 'Number of Ants'],
            ['evap', 'Evap. Rate'],
            ['saTinit', 'Initial Temp'],
            ['saTmin', 'Stopping Temp'],
            ['safreq', 'Frequency'],
            ['saCooling', 'Cooling Rate'],
            ['threads', 'Thread Count'],
            ['commThreshold', 'Comm. Threshold'],
            ['commEarly', 'Early Comm.'],
            ['commLate', 'Late Comm.'],
          ].map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                type="number"
                value={params[key]}
                onChange={(e) => setParams((p) => ({ ...p, [key]: Number(e.target.value) }))}
              />
            </label>
          ))}
          <button type="button" className="exp-btn primary" onClick={solvePuzzle} disabled={solving}>SOLVE PUZZLE</button>
          <button type="button" className="exp-btn danger" onClick={stopSolve} disabled={!solving}>Stop</button>
          <button type="button" className="exp-btn" onClick={() => setDownloadOpen(true)}>Download</button>
        </section>
      </aside>

      <section className="exp-main">
        <Link to="/" className="gm-link">← Main menu</Link>
        <h1 className="gm-title">SudoPHASE</h1>
        <p className="gm-subtitle">{puzzleName}</p>
        <div className="gm-grid-wrap">
          <div className="gm-grid" style={gridStyle}>
            {values.map((v, i) => {
              const row = Math.floor(i / n)
              const col = i % n
              const blockRight = (col + 1) % order === 0 && col !== n - 1
              const blockBottom = (row + 1) % order === 0 && row !== n - 1
              return (
                <input
                  key={i}
                  className={`gm-cell ${fixedSet.has(i) ? 'fixed' : ''} ${selectedIndex === i ? 'sel' : ''} ${blockRight ? 'br' : ''} ${blockBottom ? 'bb' : ''}`}
                  value={v}
                  readOnly={fixedSet.has(i)}
                  onFocus={() => setSelectedIndex(i)}
                  onClick={() => setSelectedIndex(i)}
                  onChange={(e) => handleCellInput(i, e.target.value)}
                />
              )
            })}
          </div>
        </div>

        <div className="gm-row">
          <button type="button" className="gm-icon-btn" onClick={eraseSelected}>Erase</button>
          <button type="button" className="gm-icon-btn" onClick={clearBoard}>Clear</button>
        </div>
        <div className="gm-digits">
          {Array.from({ length: n }, (_, i) => i + 1).map((d) => (
            <button key={d} type="button" className="gm-digit" onClick={() => setDigit(d)}>{d}</button>
          ))}
        </div>
        <button type="button" className="gm-btn" onClick={() => uploadRef.current?.click()} style={{ marginTop: '0.75rem' }}>Upload .txt</button>
        {resultText ? <p className={`gm-result ${resultError ? 'err' : ''}`}>{resultText}</p> : null}
      </section>

      {downloadOpen ? (
        <div className="gm-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setDownloadOpen(false) }}>
          <section className="gm-modal">
            <h3>Download</h3>
            <fieldset className="gm-fieldset">
              <legend>Content</legend>
              <label><input type="radio" checked={dlKind === 'initial'} onChange={() => setDlKind('initial')} /> Initial puzzle (clues only)</label>
              <label><input type="radio" checked={dlKind === 'progress'} onChange={() => setDlKind('progress')} /> Progress (initial + current grid)</label>
            </fieldset>
            <fieldset className="gm-fieldset">
              <legend>Document type</legend>
              <label><input type="radio" checked={dlFmt === 'txt'} onChange={() => setDlFmt('txt')} /> Text (.txt)</label>
              <label><input type="radio" checked={dlFmt === 'pdf'} onChange={() => setDlFmt('pdf')} /> PDF (.pdf)</label>
            </fieldset>
            <div className="gm-modal-actions">
              <button type="button" className="gm-btn" onClick={() => setDownloadOpen(false)}>Cancel</button>
              <button type="button" className="gm-btn primary" onClick={async () => {
                const ok = await runDownload()
                if (ok) setDownloadOpen(false)
              }}
              >
                Download
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <input
        ref={uploadRef}
        type="file"
        accept=".txt,text/plain"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onUploadFile(file)
        }}
      />
    </main>
  )
}

