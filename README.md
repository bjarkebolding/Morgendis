# Morgendis

### *Because DMI's website makes you want to stand in the rain.*

A free, no-nonsense Danish weather app with more forecast models than you'll ever need, radar that actually animates, and a moon panel for the romantically inclined.

**[morgendis.dk](https://morgendis.dk)**

---

## What You Get

**53+ weather variables.** Temperature, wind, precipitation, pressure, humidity, clouds, solar radiation, soil conditions, atmospheric instability — basically everything short of predicting your mood.

**26 forecast models.** DMI, ECMWF, GFS, DWD ICON, Arpege, KNMI, JMA, and more. Disagree with one model? Try another. They all disagree with each other anyway.

**Live radar animation.** Watch the rain sweep across Denmark in real time. Great for planning your bike ride. Or cancelling it.

**Interactive maps.** Leaflet maps with city markers showing live temps and conditions. Add as many as you want. We don't judge.

**Moon panel.** Current phase, illumination percentage, distance to the moon in kilometers, upcoming lunar events, and a 60-day distance chart. For werewolves and astronomers alike.

**Draggable panels.** Desktop: drag them around, resize them, stack them however you like. Mobile: tap the arrows. Either way, your layout is saved.

**Time-based themes.** The app shifts colors throughout the day — dark at night, warm at dawn, bright in the afternoon. It knows what time it is even if you don't.

**Zero accounts, zero tracking, zero cost.** Everything lives in your browser's localStorage. We don't know who you are, and we'd like to keep it that way.

---

## Tech Stack

| What | Why |
|------|-----|
| [Vite](https://vite.dev) | Fast builds, hot reload, no drama |
| [Chart.js](https://www.chartjs.org) | Pretty forecast charts |
| [Leaflet](https://leafletjs.com) | Maps that don't require a PhD |
| [Open-Meteo](https://open-meteo.com) | Free weather API, no API key needed |
| [RainViewer](https://www.rainviewer.com) | Radar tiles that just work |

No frameworks. No React. No state management library with a Greek name. Just vanilla JS modules and vibes.

---

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # Production build to dist/
npm run preview   # Preview production build
```

## Deployment

Push to `main`. GitHub Actions takes it from there. Go get a coffee.

## License

MIT — do whatever you want with it. If you build something cool, let me know.

---

*Made in Denmark, where talking about the weather isn't small talk — it's a national sport.*
