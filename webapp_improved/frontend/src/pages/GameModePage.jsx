import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CELLS,
  SIZES,
  displayValuesToPuzzle,
  getCreatedPuzzlesByOrder,
  parseInstanceText,
  puzzleToDisplayValues,
  sanitizeDownloadBase,
} from '../lib/sudoku'

const GAME_DEFAULT_PARAMS = {
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

function sizeLabelFromOrder(order) {
  return order === 3 ? '9×9' : order === 4 ? '16×16' : '25×25'
}

export default function GameModePage() {
  const [order, setOrder] = useState(3)
  const [values, setValues] = useState(Array(81).fill(''))
  const [initialPuzzle, setInitialPuzzle] = useState('.'.repeat(81))
  const [puzzleName, setPuzzleName] = useState('Game mode')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [resultText, setResultText] = useState('')
  const [resultError, setResultError] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [pickerSource, setPickerSource] = useState('curated')
  const [pickerSize, setPickerSize] = useState('9×9')
  const [pickerItems, setPickerItems] = useState([])
  const [pickerSelected, setPickerSelected] = useState('')
  const [library, setLibrary] = useState({})
  const [solving, setSolving] = useState(false)
  const [activeJobId, setActiveJobId] = useState(null)
  const [lastSolvedParams, setLastSolvedParams] = useState(null)
  const [timerStart, setTimerStart] = useState(Date.now())
  const [timerTick, setTimerTick] = useState(0)
  const [dlKind, setDlKind] = useState('initial')
  const [dlFmt, setDlFmt] = useState('txt')
  const fileInputRef = useRef(null)

  const n = order * order
  const hasGrid = values.length === n * n

  useEffect(() => {
    const id = setInterval(() => setTimerTick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    fetch('/api/library')
      .then((r) => r.json())
      .then((d) => setLibrary(d || {}))
      .catch(() => setLibrary({}))
  }, [])

  useEffect(() => {
    const created = sessionStorage.getItem('createdPuzzle')
    if (!created) return
    try {
      const data = JSON.parse(created)
      sessionStorage.removeItem('createdPuzzle')
      if (data?.order && data?.puzzle) {
        applyLoadedPuzzle(data.order, data.puzzle, data.name || 'Created puzzle')
      }
    } catch {
      // ignore invalid data
    }
  }, [])

  useEffect(() => {
    if (!pickerOpen) return
    const ord = SIZES[pickerSize] || 3
    if (pickerSource === 'curated') {
      setPickerItems(library[pickerSize] || [])
    } else if (pickerSource === 'created') {
      setPickerItems(getCreatedPuzzlesByOrder(ord).map((x) => ({ ...x, path: x.id })))
    } else {
      setPickerItems([])
    }
    setPickerSelected('')
  }, [pickerOpen, pickerSource, pickerSize, library])

  const elapsed = useMemo(() => Math.max(0, Math.floor((Date.now() - timerStart) / 1000)), [timerStart, timerTick])

  const fixedSet = useMemo(() => {
    const s = new Set()
    const str = (initialPuzzle || '').padEnd(CELLS[order], '.')
    for (let i = 0; i < str.length; i += 1) {
      if (str[i] !== '.') s.add(i)
    }
    return s
  }, [initialPuzzle, order])

  function applyLoadedPuzzle(nextOrder, puzzle, name) {
    const nextValues = puzzleToDisplayValues(puzzle, nextOrder)
    setOrder(nextOrder)
    setValues(nextValues)
    setInitialPuzzle(puzzle)
    setPuzzleName(name || 'Puzzle')
    setSelectedIndex(0)
    setResultText('')
    setResultError(false)
    setLastSolvedParams(null)
    setTimerStart(Date.now())
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  function handleInput(i, raw) {
    if (fixedSet.has(i)) return
    const maxVal = n
    let v = raw.replace(/\D/g, '')
    if (maxVal <= 9) v = v.slice(0, 1)
    else {
      const num = parseInt(v, 10)
      if (!Number.isNaN(num) && num > maxVal) v = String(maxVal)
      if (v.length > 2) v = v.slice(0, 2)
    }
    const next = [...values]
    next[i] = v
    setValues(next)
  }

  function setDigit(v) {
    if (!hasGrid || fixedSet.has(selectedIndex)) return
    const next = [...values]
    next[selectedIndex] = String(v)
    setValues(next)
  }

  function eraseSelected() {
    if (!hasGrid || fixedSet.has(selectedIndex)) return
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

  async function pickLoad() {
    if (pickerSource === 'upload') {
      fileInputRef.current?.click()
      return
    }
    if (!pickerSelected) return
    try {
      if (pickerSource === 'created') {
        const list = getCreatedPuzzlesByOrder(SIZES[pickerSize] || 3)
        const item = list.find((x) => String(x.id) === String(pickerSelected))
        if (!item) return
        applyLoadedPuzzle(item.order, item.puzzle, item.name || 'Created puzzle')
      } else {
        const r = await fetch(`/api/instance/${encodeURIComponent(pickerSelected)}`)
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Load failed')
        applyLoadedPuzzle(d.order, d.puzzle, (pickerSelected || '').split('/').pop() || 'Puzzle')
      }
      setPickerOpen(false)
    } catch (e) {
      setResultError(true)
      setResultText(e.message || 'Failed to load puzzle')
    }
  }

  function onUploadFile(file) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseInstanceText(String(reader.result || ''))
        applyLoadedPuzzle(parsed.order, parsed.puzzle, (file.name || 'Uploaded').replace(/\.txt$/i, ''))
        setPickerOpen(false)
      } catch (e) {
        setResultError(true)
        setResultText(e.message || 'Failed to parse file')
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  async function solvePuzzle() {
    const puzzle = initialPuzzle
    if (!puzzle.includes('.')) {
      setResultError(true)
      setResultText('Grid is already full')
      return
    }
    setSolving(true)
    setResultError(false)
    setResultText('Solving…')
    try {
      const postRes = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzle, order, ...GAME_DEFAULT_PARAMS }),
      })
      const postData = await postRes.json().catch(() => ({}))
      if (!postRes.ok || !postData.job_id) {
        throw new Error(postData.error || 'Failed to start solver')
      }
      setActiveJobId(postData.job_id)
      const deadline = Date.now() + (GAME_DEFAULT_PARAMS.timeout + 20) * 1000
      while (true) {
        if (Date.now() > deadline) throw new Error('Request timed out')
        const r = await fetch(`/api/status/${encodeURIComponent(postData.job_id)}`)
        const data = await r.json().catch(() => ({}))
        if (!r.ok || data.error) throw new Error(data.error || 'Status error')
        if (data.status === 'done' || data.status === 'error') {
          const res = data.result || {}
          if (res.success && res.solution) {
            setValues(puzzleToDisplayValues(res.solution, order))
            setLastSolvedParams(GAME_DEFAULT_PARAMS)
            setResultError(false)
            setResultText(`Solved in ${res.time?.toFixed?.(2) ?? '?'} s`)
          } else {
            setResultError(true)
            setResultText(res.error || 'No solution within timeout')
          }
          break
        }
        if (data.best_solution) {
          setValues(puzzleToDisplayValues(data.best_solution, order))
        }
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
      params: includeParams ? (lastSolvedParams || GAME_DEFAULT_PARAMS) : {},
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

  const gridSizeStyle = useMemo(() => {
    const cell = order === 3 ? 36 : order === 4 ? 30 : 24
    return {
      gridTemplateColumns: `repeat(${n}, ${cell}px)`,
      gridTemplateRows: `repeat(${n}, ${cell}px)`,
    }
  }, [order, n])

  return (
    <main className="gm-page">
      <div className="gm-top">
        <Link to="/" className="gm-link">← Main menu</Link>
        <button type="button" className="gm-pill" onClick={() => setPickerOpen(true)}>Choose puzzle</button>
      </div>

      <h1 className="gm-title">SudoPHASE</h1>
      <p className="gm-subtitle">{puzzleName} · {formatTime(elapsed)}</p>

      <section className="gm-grid-wrap">
        <div className="gm-grid" style={gridSizeStyle}>
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
                onChange={(e) => handleInput(i, e.target.value)}
              />
            )
          })}
        </div>
      </section>

      <div className="gm-row">
        <button type="button" className="gm-icon-btn" onClick={eraseSelected}>Erase</button>
        <button type="button" className="gm-icon-btn" onClick={clearBoard}>Clear</button>
      </div>

      <div className="gm-digits">
        {Array.from({ length: n }, (_, i) => i + 1).map((d) => (
          <button key={d} type="button" className="gm-digit" onClick={() => setDigit(d)}>{d}</button>
        ))}
      </div>

      <div className="gm-row">
        <button type="button" className="gm-btn primary" onClick={solvePuzzle} disabled={solving}>Solve</button>
        <button type="button" className="gm-btn danger" onClick={stopSolve} disabled={!solving}>Stop</button>
        <button type="button" className="gm-btn" onClick={() => setDownloadOpen(true)}>Download</button>
      </div>

      {resultText ? <p className={`gm-result ${resultError ? 'err' : ''}`}>{resultText}</p> : null}

      {pickerOpen ? (
        <div className="gm-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setPickerOpen(false) }}>
          <section className="gm-modal">
            <h3>Choose a puzzle</h3>
            <div className="gm-modal-row">
              <label>
                Source
                <select value={pickerSource} onChange={(e) => setPickerSource(e.target.value)}>
                  <option value="curated">Curated dataset</option>
                  <option value="created">Created puzzles</option>
                  <option value="upload">Upload .txt file</option>
                </select>
              </label>
              {pickerSource !== 'upload' ? (
                <label>
                  Size
                  <select value={pickerSize} onChange={(e) => setPickerSize(e.target.value)}>
                    <option value="9×9">9×9</option>
                    <option value="16×16">16×16</option>
                    <option value="25×25">25×25</option>
                  </select>
                </label>
              ) : null}
            </div>
            {pickerSource === 'upload' ? (
              <button type="button" className="gm-btn primary" onClick={() => fileInputRef.current?.click()}>Choose .txt file</button>
            ) : (
              <ul className="gm-list">
                {pickerItems.length ? pickerItems.map((item) => {
                  const value = pickerSource === 'curated' ? item.path : item.id
                  return (
                    <li
                      key={String(value)}
                      className={String(pickerSelected) === String(value) ? 'sel' : ''}
                      onClick={() => setPickerSelected(String(value))}
                    >
                      {item.name}
                    </li>
                  )
                }) : <li className="muted">(no puzzles)</li>}
              </ul>
            )}
            <div className="gm-modal-actions">
              <button type="button" className="gm-btn" onClick={() => setPickerOpen(false)}>Cancel</button>
              <button type="button" className="gm-btn primary" onClick={pickLoad}>Load</button>
            </div>
          </section>
        </div>
      ) : null}

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
        ref={fileInputRef}
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
