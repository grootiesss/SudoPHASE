export const SIZES = { '9×9': 3, '16×16': 4, '25×25': 5 }
export const CELLS = { 3: 81, 4: 256, 5: 625 }
export const CREATED_KEY = 'sudophaseCreatedPuzzles'

export function order4CharToDisplay(ch) {
  if (ch === '.') return ''
  if (ch >= '0' && ch <= '9') return String(ch.charCodeAt(0) - 48 + 1)
  if (ch >= 'a' && ch <= 'f') return String(ch.charCodeAt(0) - 97 + 11)
  return ''
}

export function order5CharToDisplay(ch) {
  if (ch === '.') return ''
  if (ch >= 'a' && ch <= 'y') return String(ch.charCodeAt(0) - 97 + 1)
  return ''
}

export function order4DisplayToChar(v) {
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return '.'
  if (n >= 1 && n <= 10) return String.fromCharCode(48 + n - 1)
  if (n >= 11 && n <= 16) return String.fromCharCode(97 + n - 11)
  return '.'
}

export function order5DisplayToChar(v) {
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return '.'
  if (n >= 1 && n <= 25) return String.fromCharCode(97 + n - 1)
  return '.'
}

export function puzzleToDisplayValues(puzzle, order) {
  const n = order * order
  const len = n * n
  const str = String(puzzle || '').padEnd(len, '.').slice(0, len)
  return Array.from({ length: len }, (_, i) => {
    const ch = str[i]
    if (order === 3) return ch !== '.' && /[1-9]/.test(ch) ? ch : ''
    if (order === 4) return order4CharToDisplay(ch)
    return order5CharToDisplay(ch)
  })
}

export function displayValuesToPuzzle(values, order) {
  const out = values.map((v) => {
    const val = String(v || '').trim()
    if (!val) return '.'
    if (order === 3) return /^[1-9]$/.test(val) ? val : '.'
    if (order === 4) return order4DisplayToChar(val)
    return order5DisplayToChar(val)
  })
  return out.join('')
}

export function parseInstanceText(text) {
  const rawLines = String(text || '').split(/\r?\n/).map((l) => l.trim())
  const lines = rawLines.filter((l) => l && l.charAt(0) !== '#')
  if (lines.length < 2) throw new Error('Invalid file: need order and idum lines.')
  const order = parseInt(lines[0], 10)
  if (![3, 4, 5].includes(order)) throw new Error('Unsupported order; use 3, 4, or 5.')
  const numCells = Math.pow(order, 4)
  const values = []
  for (let i = 2; i < lines.length; i += 1) {
    lines[i].split(/\s+/).forEach((part) => {
      const n = parseInt(part, 10)
      if (!Number.isNaN(n)) values.push(n)
    })
  }
  if (values.length < numCells) throw new Error(`Not enough grid values (expected ${numCells}).`)
  const slice = values.slice(0, numCells)
  const chars = slice.map((v) => {
    if (v === -1) return '.'
    if (order === 3) return (v >= 1 && v <= 9) ? String.fromCharCode(48 + v) : '.'
    if (order === 4) {
      if (v >= 1 && v <= 10) return String.fromCharCode(48 + v - 1)
      if (v >= 11 && v <= 16) return String.fromCharCode(97 + v - 11)
      return '.'
    }
    return (v >= 1 && v <= 25) ? String.fromCharCode(97 + v - 1) : '.'
  })
  return { order, puzzle: chars.join('') }
}

export function getCreatedPuzzlesByOrder(order) {
  const raw = localStorage.getItem(CREATED_KEY)
  let list = []
  try {
    list = raw ? JSON.parse(raw) : []
  } catch {
    list = []
  }
  if (!Array.isArray(list)) return []
  return list
    .filter((p) => p && p.order === order && typeof p.puzzle === 'string')
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}

export function sanitizeDownloadBase(name, fallback) {
  const s = String(name || '').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
  return s || fallback
}
