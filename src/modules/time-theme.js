import { backgroundGradients } from '../config/themes.js'
import { getRandomGreeting } from '../utils/formatting.js'

// MapModule is set after import to avoid circular dependency
let _mapModule = null
export function setMapModule(m) { _mapModule = m }

export const TimeTheme = {
    current: null,
    manualTheme: null,
    getTheme(h) {
        if (h >= 22 || h < 5) return 'night'
        if (h >= 5 && h < 8) return 'dawn'
        if (h >= 8 && h < 12) return 'morning'
        if (h >= 12 && h < 17) return 'afternoon'
        return 'evening'
    },
    apply(theme) {
        if (theme === this.current) return
        this.current = theme
        document.body.setAttribute('data-time-theme', theme)
        const bg = document.getElementById('bg-layer')
        if (bg && backgroundGradients[theme]) bg.style.background = backgroundGradients[theme]
        if (_mapModule) _mapModule.updateMapTheme(theme)
    },
    update() {
        const now = new Date()
        const theme = this.manualTheme || this.getTheme(now.getHours())
        this.apply(theme)
    },
    init() {
        document.getElementById('greeting-message').innerHTML = getRandomGreeting()
        this.manualTheme = null
        this.update()
        setInterval(() => this.update(), 60000)
    }
}
