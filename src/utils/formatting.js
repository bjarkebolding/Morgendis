import { greetings } from '../config/greetings.js'

export function formatTime(d) {
    return d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateShort(d) {
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return 'I dag'
    const wd = d.toLocaleDateString('da-DK', { weekday: 'short' }).replace('.', '')
    const day = d.getDate()
    const mon = d.toLocaleDateString('da-DK', { month: 'short' }).replace('.', '')
    return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${day}. ${mon}`
}

export function getRandomGreeting() {
    const g = greetings[Math.floor(Math.random() * greetings.length)]
    const parts = g.split(' — ')
    if (parts.length === 2) return `${parts[0]}<br><span class="quote-author">— ${parts[1]}</span>`
    return g
}
