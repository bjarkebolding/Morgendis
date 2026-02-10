import { gridSize } from '../config/api.js'

export function debounce(fn, delay) {
    let t
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay) }
}

export function generateId() {
    return 'p' + Math.random().toString(36).substr(2, 9)
}

export function snapToGrid(val) {
    return Math.round(val / gridSize) * gridSize
}
