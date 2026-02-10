import { api, cacheDuration } from '../config/api.js'

export const WeatherAPI = {
    cache: new Map(),
    getCacheKey(lat, lon, model, days) { return `${lat.toFixed(3)}_${lon.toFixed(3)}_${model}_${days}` },
    getFromCache(k) { const c = this.cache.get(k); return (c && Date.now() - c.ts < cacheDuration) ? c.data : null },
    setCache(k, d) { this.cache.set(k, { data: d, ts: Date.now() }) },

    async fetchForecast(city, model, days) {
        const k = this.getCacheKey(city.lat, city.lon, model, days)
        const cached = this.getFromCache(k)
        if (cached) return cached

        const hourlyVars = [
            'temperature_2m', 'apparent_temperature', 'dew_point_2m', 'temperature_80m', 'temperature_120m', 'temperature_180m',
            'precipitation', 'rain', 'showers', 'snowfall', 'snow_depth', 'precipitation_probability', 'freezing_level_height',
            'wind_speed_10m', 'wind_speed_80m', 'wind_speed_120m', 'wind_speed_180m', 'wind_gusts_10m',
            'wind_direction_10m', 'wind_direction_80m', 'wind_direction_120m', 'wind_direction_180m',
            'surface_pressure', 'pressure_msl',
            'relative_humidity_2m', 'vapour_pressure_deficit', 'evapotranspiration',
            'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'visibility',
            'uv_index', 'uv_index_clear_sky', 'sunshine_duration', 'shortwave_radiation', 'direct_radiation',
            'diffuse_radiation', 'direct_normal_irradiance', 'global_tilted_irradiance', 'terrestrial_radiation',
            'soil_temperature_0cm', 'soil_temperature_6cm', 'soil_temperature_18cm', 'soil_temperature_54cm',
            'soil_moisture_0_to_1cm', 'soil_moisture_1_to_3cm', 'soil_moisture_3_to_9cm', 'soil_moisture_9_to_27cm', 'soil_moisture_27_to_81cm',
            'cape', 'lifted_index', 'convective_inhibition', 'boundary_layer_height',
            'weather_code', 'is_day'
        ].join(',')

        const currentVars = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover'

        let url = `${api.openMeteo}?latitude=${city.lat}&longitude=${city.lon}&hourly=${hourlyVars}&current=${currentVars}&daily=sunrise,sunset&wind_speed_unit=ms&timezone=auto&forecast_days=${days}`
        if (model) url += `&models=${model}`

        const res = await fetch(url)
        if (!res.ok) throw new Error(`API: ${res.status}`)
        const data = await res.json()
        if (data.error) throw new Error(data.reason || 'API error')
        this.setCache(k, data)
        return data
    },

    async searchCities(q) {
        if (!q || q.length < 2) return []
        const res = await fetch(`${api.geocoding}?name=${encodeURIComponent(q)}&count=8&language=da&format=json`)
        if (!res.ok) return []
        const d = await res.json()
        return d.results || []
    },

    async fetchRadarData() {
        const res = await fetch(api.rainviewer)
        if (!res.ok) throw new Error('Radar error')
        return res.json()
    }
}
