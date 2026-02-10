import L from 'leaflet'
import { mapDefaults } from '../config/api.js'
import { mapTileStyles } from '../config/themes.js'
import { PanelManager } from './panel-manager.js'
import { WeatherAPI } from './weather-api.js'
import { getWeatherIcon } from '../utils/weather-icons.js'
import { getWindDirection } from '../utils/wind.js'
import { formatTime } from '../utils/formatting.js'
import { TimeTheme } from './time-theme.js'

let _cityCards = null
export function setMapCityCards(cc) { _cityCards = cc }

export const MapModule = {
    maps: new Map(),
    radarFrames: [],
    radarLayers: new Map(),

    createMapPanel(config = {}) {
        const { id, panel, content } = PanelManager.createPanel('map', { ...config, title: 'Radarkort' });

        content.innerHTML = `
            <div id="map-${id}" style="flex:1;min-height:200px;"></div>
            <div class="map-controls">
                <div class="radar-controls">
                    <button class="btn play-btn">⏸</button>
                    <input type="range" class="frame-slider" min="0" max="0" value="0">
                    <span class="timestamp">--:--</span>
                </div>
                <div class="layer-toggles">
                    <label><input type="checkbox" class="toggle-radar" checked> Radar</label>
                    <label><input type="checkbox" class="toggle-labels" checked> Navne</label>
                    <label><input type="checkbox" class="toggle-temp" checked> Temp</label>
                </div>
            </div>
        `;

        setTimeout(() => this.initMap(id, content), 100);
        return id;
    },

    getTileUrl(theme) {
        const isDark = (theme === 'night' || theme === 'dawn' || theme === 'evening');
        const style = isDark ? mapTileStyles.dark : mapTileStyles.light;
        return `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
    },

    updateMapTheme(theme) {
        this.maps.forEach(mapData => {
            if (mapData.tileLayer) {
                mapData.tileLayer.setUrl(this.getTileUrl(theme));
            }
        });
    },

    initMap(id, content) {
        const mapEl = content.querySelector(`#map-${id}`);
        const map = L.map(mapEl, { center: mapDefaults.center, zoom: mapDefaults.zoom, minZoom: 5, maxZoom: 12 });
        const theme = TimeTheme.current || 'night';
        const tileLayer = L.tileLayer(this.getTileUrl(theme), { attribution: '© CARTO', subdomains: 'abcd' }).addTo(map);

        const mapData = { map, tileLayer, layers: [], currentFrame: 0, isPlaying: true, interval: null, showLabels: true, showTemp: true, radarEnabled: true, markers: new Map(), resizeObserver: null };
        this.maps.set(id, mapData);

        this.initRadar(id, content);
        this.setupMapControls(id, content);
        this.addCityMarkersToMap(id);

        // Fix map size after panel resize using ResizeObserver
        setTimeout(() => map.invalidateSize(), 200);

        // Watch for panel resize and invalidate map
        const panel = content.closest('.panel');
        if (panel) {
            mapData.resizeObserver = new ResizeObserver(() => {
                map.invalidateSize();
            });
            mapData.resizeObserver.observe(panel);
        }
    },

    async initRadar(id, content) {
        try {
            if (this.radarFrames.length === 0) {
                const data = await WeatherAPI.fetchRadarData();
                this.radarFrames = data.radar.past.concat(data.radar.nowcast || []);
            }

            const mapData = this.maps.get(id);
            if (!mapData || this.radarFrames.length === 0) return;

            // Create radar layers
            this.radarFrames.forEach((frame, i) => {
                const url = `https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
                const layer = L.tileLayer(url, { opacity: 0, zIndex: 100 + i });
                layer.addTo(mapData.map);
                mapData.layers.push(layer);
            });

            const slider = content.querySelector('.frame-slider');
            slider.max = this.radarFrames.length - 1;
            slider.value = this.radarFrames.length - 1;
            mapData.currentFrame = this.radarFrames.length - 1;

            this.showRadarFrame(id, mapData.currentFrame, content);
            this.startAutoPlay(id, content);
        } catch (e) { console.error('Radar error:', e); }
    },

    showRadarFrame(id, index, content) {
        const mapData = this.maps.get(id);
        if (!mapData) return;
        const opacity = mapData.radarEnabled ? 0.7 : 0;
        mapData.layers.forEach((l, i) => l.setOpacity(i === index ? opacity : 0));
        if (this.radarFrames[index]) {
            content.querySelector('.timestamp').textContent = formatTime(new Date(this.radarFrames[index].time * 1000));
        }
    },

    startAutoPlay(id, content) {
        const mapData = this.maps.get(id);
        if (!mapData) return;
        if (mapData.interval) clearInterval(mapData.interval);
        mapData.isPlaying = true;
        content.querySelector('.play-btn').textContent = '⏸';
        mapData.interval = setInterval(() => {
            mapData.currentFrame = (mapData.currentFrame + 1) % this.radarFrames.length;
            content.querySelector('.frame-slider').value = mapData.currentFrame;
            this.showRadarFrame(id, mapData.currentFrame, content);
        }, 700);
    },

    stopAutoPlay(id, content) {
        const mapData = this.maps.get(id);
        if (!mapData) return;
        if (mapData.interval) clearInterval(mapData.interval);
        mapData.isPlaying = false;
        content.querySelector('.play-btn').textContent = '▶';
    },

    setupMapControls(id, content) {
        const mapData = this.maps.get(id);
        content.querySelector('.play-btn').addEventListener('click', () => {
            if (mapData.isPlaying) this.stopAutoPlay(id, content);
            else this.startAutoPlay(id, content);
        });
        content.querySelector('.frame-slider').addEventListener('input', (e) => {
            this.stopAutoPlay(id, content);
            mapData.currentFrame = parseInt(e.target.value);
            this.showRadarFrame(id, mapData.currentFrame, content);
        });
        content.querySelector('.toggle-radar').addEventListener('change', (e) => {
            if (e.target.checked) {
                mapData.layers[mapData.currentFrame]?.setOpacity(0.7);
                mapData.radarEnabled = true;
            } else {
                mapData.layers.forEach(l => l.setOpacity(0));
                mapData.radarEnabled = false;
                this.stopAutoPlay(id, content);
            }
        });
        content.querySelector('.toggle-labels').addEventListener('change', (e) => {
            mapData.showLabels = e.target.checked;
            this.updateMapMarkers(id);
        });
        content.querySelector('.toggle-temp').addEventListener('change', (e) => {
            mapData.showTemp = e.target.checked;
            this.updateMapMarkers(id);
        });
    },

    addCityMarkersToMap(mapId) {
        const mapData = this.maps.get(mapId);
        if (!mapData) return;
        if (!_cityCards) return;
        _cityCards.cities.forEach((city, cityId) => {
            this.addCityMarker(mapId, city);
        });
        // Apply any weather data that already arrived before the map initialized
        _cityCards.weatherData.forEach((data, panelId) => {
            const p = PanelManager.panels.get(panelId);
            if (p && p.config.city) {
                const m = mapData.markers.get(p.config.city.id);
                if (m && !m.weather) {
                    m.weather = data;
                    this.updateMarkerContent(mapId, m);
                }
            }
        });
    },

    addCityMarker(mapId, city) {
        const mapData = this.maps.get(mapId);
        if (!mapData) return;
        if (mapData.markers.has(city.id)) return;
        const icon = L.divIcon({
            className: 'leaflet-div-icon',
            html: `<div class="city-marker-label"><div class="name">${city.name}</div></div>`,
            iconSize: [0, 0], iconAnchor: [0, 0]
        });
        const marker = L.marker([city.lat, city.lon], { icon, interactive: false }).addTo(mapData.map);
        mapData.markers.set(city.id, { marker, city, weather: null });
    },

    updateCityMarkerWeather(cityId, weather) {
        this.maps.forEach((mapData, mapId) => {
            const m = mapData.markers.get(cityId);
            if (m) {
                m.weather = weather;
                this.updateMarkerContent(mapId, m);
            }
        });
    },

    buildMarkerHtml(mapData, markerData) {
        const w = markerData.weather?.current;
        let html = '<div class="city-marker-label">';
        if (mapData.showLabels) html += `<div class="name">${markerData.city.name}</div>`;
        if (w && (mapData.showLabels || mapData.showTemp)) html += '<div class="sep"></div>';
        if (w && mapData.showTemp) {
            html += `<span class="weather-icon">${getWeatherIcon(w.weather_code)}</span>`;
            html += `<span class="temp">${Math.round(w.temperature_2m)}°</span>`;
        }
        if (w && mapData.showLabels) {
            html += `<span class="wind">${w.wind_speed_10m?.toFixed(0) || 0} m/s</span>`;
        }
        html += '</div>';
        return html;
    },

    updateMarkerContent(mapId, markerData) {
        const mapData = this.maps.get(mapId);
        if (!mapData) return;
        const el = markerData.marker.getElement();
        if (!el) return;
        const show = mapData.showLabels || mapData.showTemp;
        el.style.display = show ? 'block' : 'none';
        if (show) el.innerHTML = this.buildMarkerHtml(mapData, markerData);
    },

    updateMapMarkers(mapId) {
        const mapData = this.maps.get(mapId);
        if (!mapData) return;
        mapData.markers.forEach(m => this.updateMarkerContent(mapId, m));
    },

    removeMap(id) {
        const mapData = this.maps.get(id);
        if (mapData) {
            if (mapData.interval) clearInterval(mapData.interval);
            if (mapData.resizeObserver) mapData.resizeObserver.disconnect();
            mapData.map.remove();
            this.maps.delete(id);
        }
    },

    invalidateAllMaps() {
        this.maps.forEach(m => m.map.invalidateSize());
    }
};
