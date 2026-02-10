import { Chart } from 'chart.js/auto'
import 'chartjs-adapter-date-fns'
import annotationPlugin from 'chartjs-plugin-annotation'
import { PanelManager } from './panel-manager.js'

Chart.register(annotationPlugin)

export const MoonModule = {
    SYNODIC: 29.53059,
    PHASE_NAMES: ['Nymåne', 'Tiltagende segl', 'Første kvarter', 'Tiltagende måne', 'Fuldmåne', 'Aftagende måne', 'Sidste kvarter', 'Aftagende segl'],
    PHASE_ICONS: ['\u{1F311}', '\u{1F312}', '\u{1F313}', '\u{1F314}', '\u{1F315}', '\u{1F316}', '\u{1F317}', '\u{1F318}'],

    getPhase(date = new Date()) {
        const jd = (date.getTime() / 86400000) + 2440587.5
        const daysSinceNew = ((jd - 2451550.1) % this.SYNODIC + this.SYNODIC) % this.SYNODIC
        const fraction = daysSinceNew / this.SYNODIC
        const index = Math.round(fraction * 8) % 8
        const illumination = Math.round((1 - Math.cos(fraction * 2 * Math.PI)) / 2 * 100)
        return { fraction, index, name: this.PHASE_NAMES[index], icon: this.PHASE_ICONS[index], illumination, daysSinceNew }
    },

    findNextPhase(targetFraction, from = new Date()) {
        const jd0 = (from.getTime() / 86400000) + 2440587.5
        const current = (((jd0 - 2451550.1) % this.SYNODIC + this.SYNODIC) % this.SYNODIC) / this.SYNODIC
        let daysAhead = ((targetFraction - current + 1) % 1) * this.SYNODIC
        if (daysAhead < 0.5) daysAhead += this.SYNODIC
        return new Date(from.getTime() + daysAhead * 86400000)
    },

    renderMoonSVG(fraction, size = 120) {
        const r = size / 2 - 4
        const cx = size / 2, cy = size / 2
        const angle = fraction * 2 * Math.PI
        const limbX = Math.cos(angle) * r
        const sweep1 = fraction <= 0.5 ? 1 : 0
        const sweep2 = fraction <= 0.5 ? 0 : 1
        return `<svg class="moon-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <defs>
                <radialGradient id="moonLit" cx="40%" cy="35%" r="60%">
                    <stop offset="0%" stop-color="#fffef0"/>
                    <stop offset="50%" stop-color="#f5e6a3"/>
                    <stop offset="100%" stop-color="#d4c170"/>
                </radialGradient>
                <clipPath id="moonClip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
                <filter id="shadowBlur"><feGaussianBlur stdDeviation="2"/></filter>
            </defs>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#moonLit)" stroke="#b8a94e" stroke-width="1"/>
            <g clip-path="url(#moonClip)">
                <path d="M ${cx} ${cy - r - 10} A ${r + 10} ${r + 10} 0 0 ${sweep1} ${cx} ${cy + r + 10} A ${Math.abs(limbX) + 4} ${r + 10} 0 0 ${sweep2} ${cx} ${cy - r - 10} Z" fill="#1a1a2e" filter="url(#shadowBlur)"/>
            </g>
        </svg>`
    },

    ANOMALISTIC: 27.55455,
    PERIGEE_EPOCH_JD: 2451562.2,

    getDistance(date = new Date()) {
        const jd = (date.getTime() / 86400000) + 2440587.5
        const daysSincePerigee = ((jd - this.PERIGEE_EPOCH_JD) % this.ANOMALISTIC + this.ANOMALISTIC) % this.ANOMALISTIC
        return 385000 - 21000 * Math.cos(2 * Math.PI * daysSincePerigee / this.ANOMALISTIC)
    },

    getUpcomingEvents(from = new Date()) {
        const events = []
        const phaseTargets = [
            { fraction: 0, name: 'Nymåne', icon: '\u{1F311}' },
            { fraction: 0.25, name: 'Første kvarter', icon: '\u{1F313}' },
            { fraction: 0.5, name: 'Fuldmåne', icon: '\u{1F315}' },
            { fraction: 0.75, name: 'Sidste kvarter', icon: '\u{1F317}' }
        ]
        for (const t of phaseTargets) {
            events.push({ date: this.findNextPhase(t.fraction, from), name: t.name, icon: t.icon })
        }
        const jd0 = (from.getTime() / 86400000) + 2440587.5
        const daysSincePerigee = ((jd0 - this.PERIGEE_EPOCH_JD) % this.ANOMALISTIC + this.ANOMALISTIC) % this.ANOMALISTIC
        const daysToPerigee = (this.ANOMALISTIC - daysSincePerigee) % this.ANOMALISTIC || this.ANOMALISTIC
        const daysToApogee = ((this.ANOMALISTIC / 2) - daysSincePerigee + this.ANOMALISTIC) % this.ANOMALISTIC || this.ANOMALISTIC
        events.push({ date: new Date(from.getTime() + daysToPerigee * 86400000), name: 'Perigæum', icon: '⬇' })
        events.push({ date: new Date(from.getTime() + daysToApogee * 86400000), name: 'Apogæum', icon: '⬆' })
        events.sort((a, b) => a.date - b.date)
        return events.slice(0, 6)
    },

    distanceChart: null,

    renderDistanceChart(canvasId) {
        const canvas = document.getElementById(canvasId)
        if (!canvas) return
        if (this.distanceChart) { this.distanceChart.destroy(); this.distanceChart = null }

        const now = new Date()
        const labels = []
        const data = []
        const totalPoints = 240
        const startTime = now.getTime() - 30 * 86400000
        for (let i = 0; i <= totalPoints; i++) {
            const t = new Date(startTime + i * 6 * 3600000)
            labels.push(t)
            data.push(Math.round(this.getDistance(t)))
        }

        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#999'
        const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f0c040'

        this.distanceChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data,
                    borderColor: accentColor,
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0.4,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                    annotation: {
                        annotations: {
                            todayLine: {
                                type: 'line',
                                xMin: now,
                                xMax: now,
                                borderColor: textColor,
                                borderWidth: 1,
                                borderDash: [4, 3],
                                label: {
                                    display: true,
                                    content: 'I dag',
                                    position: 'start',
                                    font: { size: 8 },
                                    color: textColor,
                                    backgroundColor: 'transparent'
                                }
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'day', displayFormats: { day: 'd. MMM' } },
                        ticks: { color: textColor, font: { size: 8 }, maxTicksLimit: 6 },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            color: textColor,
                            font: { size: 8 },
                            callback: v => Math.round(v / 1000) + 'k'
                        },
                        grid: { color: 'rgba(128,128,128,0.15)' }
                    }
                }
            }
        })
    },

    destroyChart() {
        if (this.distanceChart) { this.distanceChart.destroy(); this.distanceChart = null }
    },

    createMoonPanel(config = {}) {
        const { id, panel, content } = PanelManager.createPanel('moon', { ...config, title: 'Måne', w: config.w || 300 })
        this.renderPanel(id, content)
        return id
    },

    renderPanel(id, content) {
        const phase = this.getPhase()
        const distance = this.getDistance()
        const events = this.getUpcomingEvents()
        const formatDate = d => d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })
        const formatDist = d => d.toLocaleString('da-DK')
        const canvasId = `moon-distance-chart-${id}`

        const eventsHtml = events.map(e =>
            `<div class="moon-event-item">
                <span class="event-icon">${e.icon}</span>
                <span class="event-name">${e.name}</span>
                <span class="event-date">${formatDate(e.date)}</span>
            </div>`
        ).join('')

        content.innerHTML = `
            <div class="moon-display">
                ${this.renderMoonSVG(phase.fraction)}
                <div class="moon-info">
                    <div class="moon-phase-name">${phase.icon} ${phase.name}</div>
                    <div class="moon-illumination">${phase.illumination}% belyst</div>
                    <div class="moon-distance">Afstand: ${formatDist(Math.round(distance))} km</div>
                </div>
                <div class="moon-chart-wrapper">
                    <canvas id="${canvasId}"></canvas>
                </div>
                <div class="moon-events">${eventsHtml}</div>
            </div>
        `

        requestAnimationFrame(() => requestAnimationFrame(() => {
            this.renderDistanceChart(canvasId)
        }))
    }
}
