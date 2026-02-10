import { storage } from '../utils/storage.js'
import { defaultCities } from '../config/cities.js'
import { TimeTheme, setMapModule } from './time-theme.js'
import { PanelManager, registerCloseHandler, registerSummaryHandler, registerResizeHandler, registerPanelFactory, registerDefaultLayoutFactory } from './panel-manager.js'
import { CityCards } from './city-cards.js'
import { CitySearch } from './city-search.js'
import { MapModule, setMapCityCards } from './map-module.js'
import { MoonModule } from './moon-module.js'
import { WeatherAPI } from './weather-api.js'

export const App = {
    init() {
        // Wire up cross-module dependencies
        setMapModule(MapModule)
        setMapCityCards(CityCards)

        // Register panel close handlers
        registerCloseHandler('city', (id) => CityCards.removeCity(id))
        registerCloseHandler('map', (id) => MapModule.removeMap(id))
        registerCloseHandler('moon', () => MoonModule.destroyChart())

        // Register panel minimize summary handlers
        registerSummaryHandler('city', (id, p) => {
            const summary = CityCards.getCurrentValuesSummary(id)
            return `${p.config.city?.name || 'Panel'} <span class="minimized-vars">${summary}</span>`
        })
        registerSummaryHandler('map', () => 'Radarkort')
        registerSummaryHandler('moon', () => {
            const phase = MoonModule.getPhase()
            return `Måne <span class="minimized-vars">${phase.icon} ${phase.illumination}%</span>`
        })

        // Register resize handlers
        registerResizeHandler(() => MapModule.invalidateAllMaps())
        registerResizeHandler(() => CityCards.reRenderAll())

        // Register panel factories for layout restore
        registerPanelFactory('map', (l, cfg) => {
            cfg.h = cfg.h || 400
            MapModule.createMapPanel(cfg)
        })
        registerPanelFactory('city', (l, cfg) => {
            CityCards.createCityPanel(l.config.city, cfg)
        })
        registerPanelFactory('moon', (l, cfg) => {
            MoonModule.createMoonPanel(cfg)
        })

        // Register default layout factory
        registerDefaultLayoutFactory((pm) => {
            const ws = document.getElementById('workspace')
            const wsW = ws.clientWidth
            const gap = pm.gap
            const mobile = pm.isMobile()

            if (mobile) {
                const panelW = wsW - gap * 2
                MapModule.createMapPanel({ w: panelW, h: 400 })
                defaultCities.forEach(city => CityCards.createCityPanel(city, { w: panelW }))
                return
            }

            const cityW = Math.min(600, Math.floor((wsW - gap * 3) * 0.55))
            const mapW = wsW - cityW - gap * 3
            const mapH = 500

            defaultCities.forEach(city => CityCards.createCityPanel(city, { w: cityW }))
            MapModule.createMapPanel({ w: mapW, h: mapH })

            setTimeout(() => {
                let curY = gap
                pm.panelOrder.forEach(id => {
                    const p = pm.panels.get(id)
                    if (!p) return
                    if (p.type === 'city') {
                        p.element.style.left = gap + 'px'
                        p.element.style.top = curY + 'px'
                        curY += p.element.offsetHeight + gap
                    } else if (p.type === 'map') {
                        p.element.style.left = (cityW + gap * 2) + 'px'
                        p.element.style.top = gap + 'px'
                    }
                })
                pm.updateWorkspaceSize()
                pm.saveLayout()
            }, 500)
        })

        TimeTheme.init()
        CityCards.init()
        PanelManager.init()
        CitySearch.init()
        this.setupControls()
        setTimeout(() => MapModule.invalidateAllMaps(), 500)
        console.log('Morgendis initialized')
    },

    setupControls() {
        // Days toggle buttons
        const savedMode = storage.get('forecastMode', '48h')
        document.querySelectorAll('.days-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === savedMode)
            btn.addEventListener('click', () => {
                document.querySelectorAll('.days-btn').forEach(b => b.classList.remove('active'))
                btn.classList.add('active')
                storage.set('forecastMode', btn.dataset.mode)
                CityCards.refreshAll()
            })
        })

        // Forecast model selector
        const modelSelect = document.getElementById('forecast-model')
        const savedModel = storage.get('forecastModel', '')
        modelSelect.value = savedModel
        modelSelect.addEventListener('change', () => {
            storage.set('forecastModel', modelSelect.value)
            WeatherAPI.cache.clear()
            CityCards.refreshAll()
        })

        document.getElementById('add-map-btn').addEventListener('click', () => {
            MapModule.createMapPanel({ prepend: true })
            PanelManager.scheduleArrange()
        })
        document.getElementById('add-moon-btn').addEventListener('click', () => {
            MoonModule.createMoonPanel({ prepend: true })
            PanelManager.scheduleArrange()
        })
        document.getElementById('reset-btn').addEventListener('click', () => {
            if (confirm('Nulstil alt?')) { localStorage.clear(); location.reload() }
        })
    }
}
