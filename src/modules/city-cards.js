import { Chart, Tooltip } from 'chart.js/auto'
import 'chartjs-adapter-date-fns'
import annotationPlugin from 'chartjs-plugin-annotation'
import { variableGroups, defaultVariables } from '../config/variables.js'

Chart.register(annotationPlugin)

// Custom tooltip positioner: offset to the left
Tooltip.positioners.offsetLeft = function(elements, eventPosition) {
    if (!elements.length) return false
    return { x: eventPosition.x - 80, y: 10 }
}
import { storage } from '../utils/storage.js'
import { debounce, generateId } from '../utils/dom.js'
import { formatTime, formatDateShort } from '../utils/formatting.js'
import { getWeatherIcon } from '../utils/weather-icons.js'
import { getWindDirection, getWindArrow } from '../utils/wind.js'
import { PanelManager } from './panel-manager.js'
import { WeatherAPI } from './weather-api.js'
import { MapModule } from './map-module.js'

export const CityCards = {
    cities: new Map(),
    charts: new Map(),
    selectedVariables: new Set(defaultVariables),
    weatherData: new Map(),

    init() {
        const savedVars = storage.get('selectedVariables');
        if (savedVars) this.selectedVariables = new Set(savedVars);
    },

    getCurrentValuesSummary(panelId) {
        const data = this.weatherData.get(panelId);
        if (!data?.current) return '';
        const c = data.current;
        const parts = [];
        if (c.temperature_2m != null) parts.push(`${Math.round(c.temperature_2m)}°`);
        if (c.wind_speed_10m != null) parts.push(`${c.wind_speed_10m.toFixed(1)} m/s`);
        if (c.precipitation > 0) parts.push(`${c.precipitation} mm`);
        if (c.relative_humidity_2m != null) parts.push(`${c.relative_humidity_2m}%`);
        return parts.join(' · ');
    },

    createCityPanel(city, config = {}) {
        const cityWithId = { ...city, id: city.id || generateId() };
        this.cities.set(cityWithId.id, cityWithId);

        const { id, panel, content } = PanelManager.createPanel('city', {
            ...config,
            city: cityWithId,
            title: cityWithId.name,
            coords: `${cityWithId.lat.toFixed(2)}°N, ${cityWithId.lon.toFixed(2)}°Ø`
        });

        content.innerHTML = `
            <div class="current-weather" id="current-${id}"><div class="loading-indicator">Henter...</div></div>
            <details class="variable-selector">
                <summary>Vælg variabler</summary>
                <div class="variable-groups" id="vars-${id}">${this.renderVariableSelector()}</div>
            </details>
            <div class="forecast-container" id="forecast-${id}"><div class="loading-indicator">Henter prognose...</div></div>
        `;

        this.setupCardEvents(id, cityWithId, content);
        this.fetchAndRender(id, cityWithId);

        // Add to all maps
        MapModule.maps.forEach((_, mapId) => MapModule.addCityMarker(mapId, cityWithId));

        return id;
    },

    renderVariableSelector() {
        let html = '';
        for (const [key, group] of Object.entries(variableGroups)) {
            html += `<div class="variable-group"><h4>${group.icon} ${group.name}</h4>`;
            for (const v of group.variables) {
                const checked = this.selectedVariables.has(v.id) ? 'checked' : '';
                html += `<label><input type="checkbox" value="${v.id}" ${checked}>${v.name}</label>`;
            }
            html += '</div>';
        }
        return html;
    },

    setupCardEvents(panelId, city, content) {
        content.querySelector('.variable-groups').addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const varId = e.target.value;
                if (e.target.checked) this.selectedVariables.add(varId);
                else this.selectedVariables.delete(varId);
                storage.set('selectedVariables', [...this.selectedVariables]);
                const data = this.weatherData.get(panelId);
                if (data) {
                    this.renderDetailedForecast(panelId, city, data);
                    PanelManager.scheduleArrange();
                }
            }
        });

        // Watch for panel resize and update charts
        const panel = content.closest('.panel');
        if (panel) {
            let resizeTimeout;
            let lastPanelWidth = panel.offsetWidth;
            const resizeObserver = new ResizeObserver(() => {
                const w = panel.offsetWidth;
                if (w === lastPanelWidth) return;
                lastPanelWidth = w;
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    this.charts.forEach((chart, key) => {
                        if (key.endsWith(panelId)) chart.resize();
                    });
                }, 100);
            });
            resizeObserver.observe(panel);
            // Store for cleanup
            if (!this.resizeObservers) this.resizeObservers = new Map();
            this.resizeObservers.set(panelId, resizeObserver);
        }
    },

    async fetchAndRender(panelId, city) {
        const model = document.getElementById('forecast-model').value;
        const days = 9; // Always fetch 9 days, time window filtered in render

        try {
            const data = await WeatherAPI.fetchForecast(city, model, days);
            this.weatherData.set(panelId, data);
            this.renderCurrentWeather(panelId, data.current, data.daily);
            this.renderDetailedForecast(panelId, city, data);
            MapModule.updateCityMarkerWeather(city.id, data);
            document.getElementById('last-update').textContent = `Opdateret: ${formatTime(new Date())}`;
                    } catch (e) {
            console.error(`Error for ${city.name}:`, e);
            const currentEl = document.getElementById(`current-${panelId}`);
            const forecastEl = document.getElementById(`forecast-${panelId}`);
            currentEl.innerHTML = `<div class="error-message">Fejl: ${e.message} <button class="btn retry-btn">Prøv igen</button></div>`;
            forecastEl.innerHTML = '';
            currentEl.querySelector('.retry-btn').addEventListener('click', () => {
                currentEl.innerHTML = '<div class="loading-indicator">Henter...</div>';
                forecastEl.innerHTML = '<div class="loading-indicator">Henter prognose...</div>';
                this.fetchAndRender(panelId, city);
            });
        }
    },

    renderCurrentWeather(panelId, current, daily) {
        const el = document.getElementById(`current-${panelId}`);
        if (!current) { el.innerHTML = '<div class="error-message">Ingen data</div>'; return; }
        const icon = getWeatherIcon(current.weather_code, true);
        const windDir = getWindDirection(current.wind_direction_10m || 0);
        const sunrise = daily?.sunrise?.[0] ? formatTime(new Date(daily.sunrise[0])) : '--:--';
        const sunset = daily?.sunset?.[0] ? formatTime(new Date(daily.sunset[0])) : '--:--';
        el.innerHTML = `
            <div class="weather-icon">${icon}</div>
            <div class="temp-display">
                <div class="temp-value">${Math.round(current.temperature_2m)}°</div>
                <div class="feels-like">Føles som ${Math.round(current.apparent_temperature)}°</div>
            </div>
            <div class="weather-details">
                <div class="detail-item"><span class="detail-label">Vind</span><span class="detail-value">${(current.wind_speed_10m || 0).toFixed(1)} m/s ${windDir}</span></div>
                <div class="detail-item"><span class="detail-label">Fugtighed</span><span class="detail-value">${current.relative_humidity_2m || 0}%</span></div>
                <div class="detail-item"><span class="detail-label">Tryk</span><span class="detail-value">${Math.round(current.surface_pressure || 0)} hPa</span></div>
                <div class="detail-item"><span class="detail-label">Skydække</span><span class="detail-value">${current.cloud_cover || 0}%</span></div>
                <div class="detail-item"><span class="detail-label">Sol op</span><span class="detail-value">${sunrise}</span></div>
                <div class="detail-item"><span class="detail-label">Sol ned</span><span class="detail-value">${sunset}</span></div>
            </div>
        `;
    },

    renderDetailedForecast(panelId, city, data) {
        const container = document.getElementById(`forecast-${panelId}`);
        const hourly = data.hourly;
        const allTimes = hourly.time.map(t => new Date(t));

        // Determine time window based on forecast mode
        const mode = storage.get('forecastMode', '48h');
        const now = new Date();
        now.setMinutes(0, 0, 0);

        let startIdx = 0;
        for (let i = 0; i < allTimes.length; i++) {
            if (allTimes[i] >= now) { startIdx = i; break; }
        }

        // Calculate end index based on mode
        let endIdx = allTimes.length;
        if (mode === '48h') {
            // Show 48 hours from now
            const end48 = new Date(now.getTime() + 48 * 3600000);
            for (let i = startIdx; i < allTimes.length; i++) {
                if (allTimes[i] > end48) { endIdx = i; break; }
            }
        } else {
            // Show from +48h to +192h (days 3-9)
            const start48 = new Date(now.getTime() + 48 * 3600000);
            const end192 = new Date(now.getTime() + 192 * 3600000);
            for (let i = startIdx; i < allTimes.length; i++) {
                if (allTimes[i] >= start48) { startIdx = i; break; }
            }
            for (let i = startIdx; i < allTimes.length; i++) {
                if (allTimes[i] > end192) { endIdx = i; break; }
            }
        }

        const times = allTimes.slice(startIdx, endIdx);
        const totalHours = times.length;

        // Find day boundaries
        const days = [];
        let currentDay = null;
        times.forEach((t, i) => {
            const dk = t.toDateString();
            if (dk !== currentDay) { days.push({ date: t, start: i + startIdx, end: i + startIdx }); currentDay = dk; }
            else days[days.length - 1].end = i + startIdx;
        });

        // Compact labels: increase step when many hours or on mobile
        const mobile = window.innerWidth <= 768;
        let step = 2;
        if (totalHours > 72) step = 6;
        else if (totalHours > 48 || mobile) step = 3;
        const displayIndices = [];
        for (let i = startIdx; i < endIdx; i += step) displayIndices.push(i);

        let html = '<div class="forecast-wrapper" id="fw-' + panelId + '">';

        // Day headers
        html += '<div class="day-headers">';
        days.forEach(d => {
            const w = ((d.end - d.start + 1) / times.length) * 100;
            const isToday = d.date.toDateString() === new Date().toDateString();
            html += `<div class="day-header${isToday ? ' today' : ''}" style="flex:${w}">${formatDateShort(d.date)}</div>`;
        });
        html += '</div>';

        // Weather icons
        html += '<div class="weather-icons-row">';
        displayIndices.forEach(i => {
            const code = hourly.weather_code?.[i] || 0;
            const isDay = hourly.is_day ? hourly.is_day[i] : true;
            html += `<div class="weather-icon-cell">${getWeatherIcon(code, isDay)}</div>`;
        });
        html += '</div>';

        // Group variables by chart type
        const chartGroups = {
            tempPrecip: { vars: [], tempVars: [], precipVars: [], labelLeft: '°C', labelRight: 'mm', height: 'temp' },
            wind: { vars: [], label: 'm/s', height: 'wind' },
            pressure: { vars: [], label: 'hPa', height: 'pressure' },
            humidity: { vars: [], label: '%', height: 'humidity' },
            clouds: { vars: [], label: '%', height: 'clouds' },
            solar: { vars: [], label: 'W/m²', height: 'solar' }
        };

        // Map variables to chart groups
        const varToGroup = {
            temperature_2m: 'tempPrecip:temp', apparent_temperature: 'tempPrecip:temp', dew_point_2m: 'tempPrecip:temp',
            temperature_80m: 'tempPrecip:temp', temperature_120m: 'tempPrecip:temp', temperature_180m: 'tempPrecip:temp',
            soil_temperature_0cm: 'tempPrecip:temp', soil_temperature_6cm: 'tempPrecip:temp', soil_temperature_18cm: 'tempPrecip:temp', soil_temperature_54cm: 'tempPrecip:temp',
            precipitation: 'tempPrecip:precip', rain: 'tempPrecip:precip', showers: 'tempPrecip:precip', snowfall: 'tempPrecip:precip',
            precipitation_probability: 'tempPrecip:precip', evapotranspiration: 'tempPrecip:precip',
            wind_speed_10m: 'wind', wind_speed_80m: 'wind', wind_speed_120m: 'wind', wind_speed_180m: 'wind', wind_gusts_10m: 'wind',
            surface_pressure: 'pressure', pressure_msl: 'pressure',
            relative_humidity_2m: 'humidity', vapour_pressure_deficit: 'humidity',
            cloud_cover: 'clouds', cloud_cover_low: 'clouds', cloud_cover_mid: 'clouds', cloud_cover_high: 'clouds', visibility: 'clouds',
            uv_index: 'solar', uv_index_clear_sky: 'solar', sunshine_duration: 'solar',
            shortwave_radiation: 'solar', direct_radiation: 'solar', diffuse_radiation: 'solar',
            direct_normal_irradiance: 'solar', global_tilted_irradiance: 'solar', terrestrial_radiation: 'solar'
        };

        // Build variable lookup
        const allVars = {};
        Object.values(variableGroups).forEach(g => g.variables.forEach(v => allVars[v.id] = v));

        // Assign selected variables to groups
        this.selectedVariables.forEach(varId => {
            const groupMapping = varToGroup[varId];
            if (!groupMapping || !hourly[varId]) return;

            if (groupMapping.includes(':')) {
                const [group, subType] = groupMapping.split(':');
                chartGroups[group].vars.push(varId);
                if (subType === 'temp') chartGroups[group].tempVars.push(varId);
                else if (subType === 'precip') chartGroups[group].precipVars.push(varId);
            } else {
                chartGroups[groupMapping].vars.push(varId);
            }
        });

        // Render charts for each group with data - ALL charts get both y-label and y-label-right for alignment
        Object.entries(chartGroups).forEach(([groupKey, group]) => {
            if (group.vars.length === 0) return;
            html += `<div class="chart-section chart-container-${group.height}">`;
            if (groupKey === 'tempPrecip') {
                html += `<span class="y-label">${group.labelLeft}</span>`;
                html += `<div class="chart-canvas-wrapper"><canvas id="chart-${groupKey}-${panelId}"></canvas></div>`;
                html += `<span class="y-label-right">${group.labelRight}</span>`;
            } else {
                html += `<span class="y-label">${group.label}</span>`;
                html += `<div class="chart-canvas-wrapper"><canvas id="chart-${groupKey}-${panelId}"></canvas></div>`;
                html += `<span class="y-label-right">&nbsp;</span>`;
            }
            html += '</div>';
        });

        // Add soil and atmospheric to their own charts if selected
        const soilVars = [];
        const atmosVars = [];
        variableGroups.soil.variables.forEach(v => {
            if (this.selectedVariables.has(v.id) && hourly[v.id]) soilVars.push(v.id);
        });
        variableGroups.atmospheric.variables.forEach(v => {
            if (this.selectedVariables.has(v.id) && hourly[v.id]) atmosVars.push(v.id);
        });

        if (soilVars.length > 0) {
            html += `<div class="chart-section chart-container-humidity">`;
            html += `<span class="y-label">Jord</span>`;
            html += `<div class="chart-canvas-wrapper"><canvas id="chart-soil-${panelId}"></canvas></div>`;
            html += `<span class="y-label-right">&nbsp;</span>`;
            html += '</div>';
        }

        if (atmosVars.length > 0) {
            html += `<div class="chart-section chart-container-humidity">`;
            html += `<span class="y-label">Atmos</span>`;
            html += `<div class="chart-canvas-wrapper"><canvas id="chart-atmos-${panelId}"></canvas></div>`;
            html += `<span class="y-label-right">&nbsp;</span>`;
            html += '</div>';
        }

        // Wind arrows
        if (this.selectedVariables.has('wind_direction_10m') && hourly.wind_direction_10m) {
            html += '<div class="wind-arrows-row">';
            displayIndices.forEach(i => html += `<div class="wind-arrow-cell">${getWindArrow(hourly.wind_direction_10m[i])}</div>`);
            html += '</div>';
        }

        // Hour labels
        html += '<div class="hour-labels">';
        displayIndices.forEach(i => html += `<div class="hour-label">${allTimes[i].getHours().toString().padStart(2, '0')}</div>`);
        html += '</div>';

        html += '</div>';
        container.innerHTML = html;

        // No longer need has-dual-axis class since all charts now have both axes

        // Create charts after layout settles
        const buildCharts = () => {
            Object.entries(chartGroups).forEach(([groupKey, group]) => {
                if (group.vars.length === 0) return;
                const options = groupKey === 'tempPrecip' ? { tempVars: group.tempVars, precipVars: group.precipVars } : {};
                this.createChart(panelId, groupKey, group.vars, hourly, allTimes, days, allVars, options);
            });
            if (soilVars.length > 0) {
                this.createChart(panelId, 'soil', soilVars, hourly, allTimes, days, allVars, {});
            }
            if (atmosVars.length > 0) {
                this.createChart(panelId, 'atmos', atmosVars, hourly, allTimes, days, allVars, {});
            }
        };
        // Use double-rAF to ensure DOM has fully laid out before measuring
        requestAnimationFrame(() => requestAnimationFrame(() => {
            buildCharts();
                    }));
    },

    createChart(panelId, groupKey, varIds, hourly, times, days, allVars, options = {}) {
        const ctx = document.getElementById(`chart-${groupKey}-${panelId}`);
        if (!ctx) return;

        const chartKey = `${groupKey}-${panelId}`;
        const existing = this.charts.get(chartKey);
        if (existing) existing.destroy();

        const isDualAxis = groupKey === 'tempPrecip' && options.tempVars?.length > 0 && options.precipVars?.length > 0;
        const precipVars = options.precipVars || [];

        // Helper to get temperature-based color
        const getTempColor = (val) => {
            if (val < -10) return '#1e40af';
            if (val < 0) return '#3b82f6';
            if (val < 10) return '#f59e0b';
            if (val < 20) return '#ef4444';
            return '#dc2626';
        };

        // X-axis range based on forecast mode
        const mode = storage.get('forecastMode', '48h');
        const now = new Date();
        now.setMinutes(0, 0, 0);
        let xMin, xMax;
        if (mode === '48h') {
            xMin = now > times[0] ? now : times[0];
            xMax = new Date(now.getTime() + 48 * 3600000);
        } else {
            xMin = new Date(now.getTime() + 48 * 3600000);
            xMax = new Date(now.getTime() + 192 * 3600000);
        }
        // Clamp to data bounds
        if (xMax > times[times.length - 1]) xMax = times[times.length - 1];

        const datasets = varIds.map(varId => {
            const v = allVars[varId];
            const isTemp = varId === 'temperature_2m';
            const isPrecipVar = precipVars.includes(varId);

            const dataset = {
                label: v.name,
                data: hourly[varId],
                borderColor: isTemp ? undefined : v.color,
                backgroundColor: v.type === 'bar' ? v.color + '80' : 'transparent',
                type: v.type === 'bar' ? 'bar' : 'line',
                tension: 0.3,
                pointRadius: 0,
                borderWidth: v.dashed ? 1.5 : 2,
                borderDash: v.dashed ? [4, 4] : undefined,
                barPercentage: 0.7,
                yAxisID: isDualAxis ? (isPrecipVar ? 'yRight' : 'yLeft') : 'yLeft'
            };

            if (isTemp) {
                dataset.segment = {
                    borderColor: (ctx) => getTempColor(ctx.p1.parsed.y)
                };
                dataset.borderColor = getTempColor(hourly[varId][0] || 0);
            }

            return dataset;
        });

        const annotations = {};
        days.forEach((d, i) => {
            if (i > 0) annotations[`day${i}`] = { type: 'line', xMin: times[d.start], xMax: times[d.start], borderColor: 'rgba(150,150,150,0.4)', borderWidth: 1 };
        });

        // ALL charts get both yLeft and yRight with fixed width for alignment
        const mobile = window.innerWidth <= 768;
        const fixedAxisWidth = mobile ? 20 : 30;
        const tickFont = { size: mobile ? 7 : 8 };
        const scales = {
            x: {
                type: 'time',
                time: { unit: 'hour', displayFormats: { hour: 'HH' } },
                ticks: { display: false },
                grid: { display: false },
                min: xMin,
                max: xMax
            },
            yLeft: {
                position: 'left',
                afterFit: (axis) => { axis.width = fixedAxisWidth; },
                ticks: { font: tickFont, color: '#888', stepSize: 2, precision: 0 },
                grid: { color: 'rgba(150,150,150,0.15)' }
            },
            yRight: {
                position: 'right',
                afterFit: (axis) => { axis.width = fixedAxisWidth; },
                ticks: isDualAxis ? { font: tickFont, color: '#60a5fa', stepSize: 2, precision: 0 } : { display: false },
                grid: { display: false },
                min: isDualAxis ? 0 : undefined
            }
        };

        const chart = new Chart(ctx, {
            type: 'line',
            data: { labels: times, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    annotation: { annotations },
                    tooltip: {
                        position: 'offsetLeft',
                        caretSize: 0,
                        backgroundColor: 'rgba(0,0,0,0.55)',
                        callbacks: {
                            title: (items) => {
                                if (!items.length) return '';
                                const d = new Date(items[0].parsed.x);
                                const day = d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' });
                                const h = String(d.getHours()).padStart(2, '0');
                                const m = String(d.getMinutes()).padStart(2, '0');
                                return `${day} ${h}:${m}`;
                            }
                        }
                    }
                },
                scales
            }
        });

        ctx.addEventListener('touchend', () => {
            try {
                chart.setActiveElements([]);
                if (chart.tooltip) chart.tooltip.setActiveElements([], { x: 0, y: 0 });
                chart.update('none');
            } catch(e) {}
        });

        this.charts.set(chartKey, chart);
    },

    removeCity(panelId) {
        const p = PanelManager.panels.get(panelId);
        if (p && p.config.city) {
            this.cities.delete(p.config.city.id);
            // Remove from all maps
            MapModule.maps.forEach(mapData => {
                const m = mapData.markers.get(p.config.city.id);
                if (m) { m.marker.remove(); mapData.markers.delete(p.config.city.id); }
            });
        }
        // Destroy charts
        this.charts.forEach((chart, key) => {
            if (key.endsWith(panelId)) { chart.destroy(); this.charts.delete(key); }
        });
        // Cleanup resize observer
        if (this.resizeObservers && this.resizeObservers.has(panelId)) {
            this.resizeObservers.get(panelId).disconnect();
            this.resizeObservers.delete(panelId);
        }
        this.weatherData.delete(panelId);
    },

    reRenderAll() {
        // Re-render from cached data (handles orientation change, axis width recalc)
        PanelManager.panels.forEach((p, id) => {
            if (p.type === 'city') {
                const data = this.weatherData.get(id);
                if (data) this.renderDetailedForecast(id, p.config.city, data);
            }
        });
    },

    refreshAll() {
        PanelManager.panels.forEach((p, id) => {
            if (p.type === 'city') this.fetchAndRender(id, p.config.city);
        });
    }
};
