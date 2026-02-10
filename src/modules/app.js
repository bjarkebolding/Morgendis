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
                defaultCities.forEach(city => CityCards.createCityPanel(city, {}))
                return
            }

            // Build a horizontal split: cities left (55%), map right (45%)
            // createCityPanel and createMapPanel return string IDs
            const cityIds = []
            defaultCities.forEach(city => {
                const panelId = CityCards.createCityPanel(city, {})
                cityIds.push(panelId)
            })
            const mapId = MapModule.createMapPanel({})

            // Build the tile tree: one row with cities stacked vertically on left, map on right
            const citySize = 1 / cityIds.length
            const cityChildren = cityIds.map(id => ({ type: 'leaf', panelId: id, size: citySize }))
            const leftSplit = cityIds.length > 1
                ? { type: 'split', direction: 'vertical', children: cityChildren, size: 0.55 }
                : { type: 'leaf', panelId: cityIds[0], size: 0.55 }
            const rightLeaf = { type: 'leaf', panelId: mapId, size: 0.45 }

            // Vertical root wrapping a single horizontal row
            pm.tileTree = {
                type: 'split',
                direction: 'vertical',
                children: [{
                    type: 'split',
                    direction: 'horizontal',
                    children: [leftSplit, rightLeaf],
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
