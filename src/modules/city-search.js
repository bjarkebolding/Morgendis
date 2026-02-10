import { debounce } from '../utils/dom.js'
import { WeatherAPI } from './weather-api.js'
import { CityCards } from './city-cards.js'
import { PanelManager } from './panel-manager.js'

export const CitySearch = {
    init() {
        const input = document.getElementById('city-search');
        const results = document.getElementById('search-results');

        const doSearch = debounce(async (q) => {
            if (q.length < 2) { results.classList.remove('active'); return; }
            const cities = await WeatherAPI.searchCities(q);
            this.renderResults(cities, results);
        }, 300);

        input.addEventListener('input', (e) => doSearch(e.target.value));
        input.addEventListener('focus', () => { if (input.value.length >= 2) results.classList.add('active'); });
        input.addEventListener('keydown', (e) => {
            const items = results.querySelectorAll('.search-result-item[data-lat]');
            const active = results.querySelector('.search-result-item.highlighted');
            if (e.key === 'Escape') {
                results.classList.remove('active');
                input.blur();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const target = active || items[0];
                if (target) target.click();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!active && items.length) { items[0].classList.add('highlighted'); }
                else if (active?.nextElementSibling) { active.classList.remove('highlighted'); active.nextElementSibling.classList.add('highlighted'); }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (active?.previousElementSibling) { active.classList.remove('highlighted'); active.previousElementSibling.classList.add('highlighted'); }
            }
        });
        document.addEventListener('click', (e) => { if (!e.target.closest('.city-search-wrapper')) results.classList.remove('active'); });
    },

    selectResult(item, container) {
        CityCards.createCityPanel({ name: item.dataset.name, lat: parseFloat(item.dataset.lat), lon: parseFloat(item.dataset.lon) }, { prepend: true });
        document.getElementById('city-search').value = '';
        container.classList.remove('active');
        PanelManager.scheduleArrange();
        PanelManager.saveLayout();
    },

    renderResults(cities, container) {
        if (cities.length === 0) { container.innerHTML = '<div class="search-result-item">Ingen resultater</div>'; container.classList.add('active'); return; }
        container.innerHTML = cities.map(c => `<div class="search-result-item" data-lat="${c.latitude}" data-lon="${c.longitude}" data-name="${c.name}"><strong>${c.name}</strong><small>${c.admin1 || ''} ${c.country || ''}</small></div>`).join('');
        container.classList.add('active');
        container.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => this.selectResult(item, container));
        });
    }
};
