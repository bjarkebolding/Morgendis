import { storage } from '../utils/storage.js'
import { defaultCities } from '../config/cities.js'
import { TimeTheme, setMapModule } from './time-theme.js'
import { PanelManager, registerCloseHandler, registerResizeHandler, registerPanelFactory, registerDefaultLayoutFactory } from './panel-manager.js'
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

        // Register resize handlers
        registerResizeHandler(() => MapModule.invalidateAllMaps())
        registerResizeHandler(() => CityCards.reRenderAll())

        // Register panel factories for layout restore
        registerPanelFactory('map', (l, cfg) => {
            MapModule.createMapPanel(cfg)
        })
        registerPanelFactory('city', (l, cfg) => {
            CityCards.createCityPanel(l.config.city, cfg)
        })
        registerPanelFactory('moon', (l, cfg) => {
            MoonModule.createMoonPanel(cfg)
        })

        // Register default layout factory — builds tileTree directly
        registerDefaultLayoutFactory((pm) => {
            const mobile = pm.isMobile()

            if (mobile) {
                MapModule.createMapPanel({})
                MoonModule.createMoonPanel({})
                defaultCities.forEach(city => CityCards.createCityPanel(city, {}))
                return
            }

            // Build panels
            const cityIds = []
            defaultCities.forEach(city => {
                const panelId = CityCards.createCityPanel(city, {})
                cityIds.push(panelId)
            })
            const mapId = MapModule.createMapPanel({})
            const moonId = MoonModule.createMoonPanel({})

            // Left column: cities stacked vertically (55%)
            const citySize = 1 / cityIds.length
            const cityChildren = cityIds.map(id => ({ type: 'leaf', panelId: id, size: citySize }))
            const leftSplit = cityIds.length > 1
                ? { type: 'split', direction: 'vertical', children: cityChildren, size: 0.55 }
                : { type: 'leaf', panelId: cityIds[0], size: 0.55 }

            // Right column: map (60%) + moon (40%) stacked vertically (45%)
            const rightSplit = {
                type: 'split',
                direction: 'vertical',
                children: [
                    { type: 'leaf', panelId: mapId, size: 0.6 },
                    { type: 'leaf', panelId: moonId, size: 0.4 }
                ],
                size: 0.45
            }

            // Vertical root wrapping a single horizontal row
            pm.tileTree = {
                type: 'split',
                direction: 'vertical',
                children: [{
                    type: 'split',
                    direction: 'horizontal',
                    children: [leftSplit, rightSplit],
                    size: 1
                }],
                size: 1
            }

            setTimeout(() => {
                pm.applyLayout()
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
