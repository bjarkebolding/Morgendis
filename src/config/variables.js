export const variableGroups = {
    temperature: {
        name: 'Temperatur',
        icon: '🌡️',
        variables: [
            { id: 'temperature_2m', name: 'Temp (2m)', unit: '°C', color: '#1e40af', type: 'line' },
            { id: 'apparent_temperature', name: 'Føles som', unit: '°C', color: '#dc2626', type: 'line' },
            { id: 'dew_point_2m', name: 'Dugpunkt', unit: '°C', color: '#14b8a6', type: 'line' },
            { id: 'temperature_80m', name: 'Temp (80m)', unit: '°C', color: '#3b82f6', type: 'line' },
            { id: 'temperature_120m', name: 'Temp (120m)', unit: '°C', color: '#6366f1', type: 'line' },
            { id: 'temperature_180m', name: 'Temp (180m)', unit: '°C', color: '#8b5cf6', type: 'line' }
        ]
    },
    precipitation: {
        name: 'Nedbør',
        icon: '🌧️',
        variables: [
            { id: 'precipitation', name: 'Nedbør total', unit: 'mm', color: '#3b82f6', type: 'bar' },
            { id: 'rain', name: 'Regn', unit: 'mm', color: '#2563eb', type: 'bar' },
            { id: 'showers', name: 'Byger', unit: 'mm', color: '#0ea5e9', type: 'bar' },
            { id: 'snowfall', name: 'Sne', unit: 'cm', color: '#e2e8f0', type: 'bar' },
            { id: 'snow_depth', name: 'Snedybde', unit: 'm', color: '#cbd5e1', type: 'line' },
            { id: 'precipitation_probability', name: 'Sandsynlighed', unit: '%', color: '#06b6d4', type: 'line' },
            { id: 'freezing_level_height', name: 'Fryseniveau', unit: 'm', color: '#67e8f9', type: 'line' }
        ]
    },
    wind: {
        name: 'Vind',
        icon: '💨',
        variables: [
            { id: 'wind_speed_10m', name: 'Vind (10m)', unit: 'm/s', color: '#0d9488', type: 'line' },
            { id: 'wind_speed_80m', name: 'Vind (80m)', unit: 'm/s', color: '#14b8a6', type: 'line' },
            { id: 'wind_speed_120m', name: 'Vind (120m)', unit: 'm/s', color: '#2dd4bf', type: 'line' },
            { id: 'wind_speed_180m', name: 'Vind (180m)', unit: 'm/s', color: '#5eead4', type: 'line' },
            { id: 'wind_gusts_10m', name: 'Vindstød', unit: 'm/s', color: '#0d9488', type: 'line', dashed: true },
            { id: 'wind_direction_10m', name: 'Retning (10m)', unit: '°', color: '#6b7280', type: 'arrows' },
            { id: 'wind_direction_80m', name: 'Retning (80m)', unit: '°', color: '#9ca3af', type: 'arrows' },
            { id: 'wind_direction_120m', name: 'Retning (120m)', unit: '°', color: '#d1d5db', type: 'arrows' }
        ]
    },
    pressure: {
        name: 'Lufttryk',
        icon: '📊',
        variables: [
            { id: 'surface_pressure', name: 'Overfladetryk', unit: 'hPa', color: '#a855f7', type: 'line' },
            { id: 'pressure_msl', name: 'Havniveau', unit: 'hPa', color: '#c084fc', type: 'line' }
        ]
    },
    humidity: {
        name: 'Fugtighed',
        icon: '💧',
        variables: [
            { id: 'relative_humidity_2m', name: 'Rel. fugtighed', unit: '%', color: '#8b5cf6', type: 'line' },
            { id: 'vapour_pressure_deficit', name: 'VPD', unit: 'kPa', color: '#a78bfa', type: 'line' },
            { id: 'evapotranspiration', name: 'Evapotranspiration', unit: 'mm', color: '#c4b5fd', type: 'bar' }
        ]
    },
    clouds: {
        name: 'Skyer',
        icon: '☁️',
        variables: [
            { id: 'cloud_cover', name: 'Total skydække', unit: '%', color: '#6366f1', type: 'line' },
            { id: 'cloud_cover_low', name: 'Lave skyer', unit: '%', color: '#818cf8', type: 'line' },
            { id: 'cloud_cover_mid', name: 'Mellem skyer', unit: '%', color: '#a5b4fc', type: 'line' },
            { id: 'cloud_cover_high', name: 'Høje skyer', unit: '%', color: '#c7d2fe', type: 'line' },
            { id: 'visibility', name: 'Sigtbarhed', unit: 'm', color: '#e0e7ff', type: 'line' }
        ]
    },
    solar: {
        name: 'Sol & Stråling',
        icon: '☀️',
        variables: [
            { id: 'uv_index', name: 'UV-indeks', unit: '', color: '#f59e0b', type: 'line' },
            { id: 'uv_index_clear_sky', name: 'UV (klar himmel)', unit: '', color: '#fbbf24', type: 'line' },
            { id: 'sunshine_duration', name: 'Solskin', unit: 's', color: '#fcd34d', type: 'bar' },
            { id: 'shortwave_radiation', name: 'Kortbølge', unit: 'W/m²', color: '#fde047', type: 'line' },
            { id: 'direct_radiation', name: 'Direkte', unit: 'W/m²', color: '#facc15', type: 'line' },
            { id: 'diffuse_radiation', name: 'Diffus', unit: 'W/m²', color: '#eab308', type: 'line' },
            { id: 'direct_normal_irradiance', name: 'DNI', unit: 'W/m²', color: '#ca8a04', type: 'line' },
            { id: 'global_tilted_irradiance', name: 'GTI', unit: 'W/m²', color: '#a16207', type: 'line' },
            { id: 'terrestrial_radiation', name: 'Jordstråling', unit: 'W/m²', color: '#854d0e', type: 'line' }
        ]
    },
    soil: {
        name: 'Jord',
        icon: '🌱',
        variables: [
            { id: 'soil_temperature_0cm', name: 'Jordtemp (0cm)', unit: '°C', color: '#78350f', type: 'line' },
            { id: 'soil_temperature_6cm', name: 'Jordtemp (6cm)', unit: '°C', color: '#92400e', type: 'line' },
            { id: 'soil_temperature_18cm', name: 'Jordtemp (18cm)', unit: '°C', color: '#b45309', type: 'line' },
            { id: 'soil_temperature_54cm', name: 'Jordtemp (54cm)', unit: '°C', color: '#d97706', type: 'line' },
            { id: 'soil_moisture_0_to_1cm', name: 'Jordfugt (0-1cm)', unit: 'm³/m³', color: '#65a30d', type: 'line' },
            { id: 'soil_moisture_1_to_3cm', name: 'Jordfugt (1-3cm)', unit: 'm³/m³', color: '#84cc16', type: 'line' },
            { id: 'soil_moisture_3_to_9cm', name: 'Jordfugt (3-9cm)', unit: 'm³/m³', color: '#a3e635', type: 'line' },
            { id: 'soil_moisture_9_to_27cm', name: 'Jordfugt (9-27cm)', unit: 'm³/m³', color: '#bef264', type: 'line' },
            { id: 'soil_moisture_27_to_81cm', name: 'Jordfugt (27-81cm)', unit: 'm³/m³', color: '#d9f99d', type: 'line' }
        ]
    },
    atmospheric: {
        name: 'Atmosfærisk',
        icon: '🌀',
        variables: [
            { id: 'cape', name: 'CAPE', unit: 'J/kg', color: '#dc2626', type: 'line' },
            { id: 'lifted_index', name: 'Lifted Index', unit: '', color: '#ef4444', type: 'line' },
            { id: 'convective_inhibition', name: 'CIN', unit: 'J/kg', color: '#f87171', type: 'line' },
            { id: 'boundary_layer_height', name: 'Grænselag højde', unit: 'm', color: '#fca5a5', type: 'line' }
        ]
    }
}

export const defaultVariables = ['temperature_2m', 'precipitation', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m']
