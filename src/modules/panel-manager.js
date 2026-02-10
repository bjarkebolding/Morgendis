import { debounce, generateId, snapToGrid } from '../utils/dom.js';
import { storage } from '../utils/storage.js';

let _closeHandlers = new Map();
export function registerCloseHandler(type, handler) { _closeHandlers.set(type, handler); }

let _summaryHandlers = new Map();
export function registerSummaryHandler(type, handler) { _summaryHandlers.set(type, handler); }

let _resizeHandlers = [];
export function registerResizeHandler(fn) { _resizeHandlers.push(fn); }

let _panelFactories = new Map();
export function registerPanelFactory(type, fn) { _panelFactories.set(type, fn); }

let _defaultLayoutFactory = null;
export function registerDefaultLayoutFactory(fn) { _defaultLayoutFactory = fn; }

export const PanelManager = {
    panels: new Map(),
    panelOrder: [], // Track order for arrangement
    gap: 10,
    dragging: false,
    _restoring: false,

    lastWidth: 0,

    init() {
        this.loadLayout();
        this.lastWidth = window.innerWidth;
        const debouncedResize = debounce(() => {
            if (window.innerWidth !== this.lastWidth) {
                this.lastWidth = window.innerWidth;
                this.onWindowResize();
            }
        }, 300);
        window.addEventListener('resize', debouncedResize);
        screen.orientation?.addEventListener('change', () => { this.lastWidth = 0; setTimeout(debouncedResize, 200); });
    },

    isMobile() { return window.innerWidth <= 768 || window.matchMedia('(pointer: coarse)').matches; },

    createPanel(type, config = {}) {
        const id = config.id || generateId();
        const panel = document.createElement('div');
        panel.className = 'panel';
        if (type === 'map') panel.classList.add('panel-map');
        panel.id = id;

        const mobile = this.isMobile();
        const ws = document.getElementById('workspace');
        const wsW = ws.clientWidth;
        const defaultW = Math.min(600, wsW - this.gap * 2);
        const w = config.w != null ? Math.min(config.w, wsW - this.gap * 2) : defaultW;
        const h = config.h != null ? config.h : (type === 'map' ? 400 : undefined);

        if (!mobile) {
            panel.style.width = w + 'px';
            if (type === 'map' && h) panel.style.height = h + 'px';
        }

        const title = config.title || (type === 'map' ? 'Radarkort' : config.cityName || 'Panel');

        panel.innerHTML = `
            <div class="panel-header">
                <h3>${title}${config.coords ? ` <span class="coords">${config.coords}</span>` : ''}</h3>
                <div class="panel-buttons">
                    <button class="btn-icon move-up-btn mobile-only" title="Flyt op" aria-label="Flyt op">▲</button>
                    <button class="btn-icon move-down-btn mobile-only" title="Flyt ned" aria-label="Flyt ned">▼</button>
                    <button class="btn-icon minimize-btn" title="Minimer" aria-label="Minimer">−</button>
                    <button class="btn-icon danger close-btn" title="Luk" aria-label="Luk panel">×</button>
                </div>
            </div>
            <div class="panel-content"></div>
            <div class="resize-handle"></div>
        `;

        if (config.prepend) {
            ws.prepend(panel);
        } else {
            ws.appendChild(panel);
        }
        this.panels.set(id, { id, type, config, element: panel, minimized: false });
        if (config.prepend) {
            this.panelOrder.unshift(id);
        } else {
            this.panelOrder.push(id);
        }

        if (!mobile) {
            this.setupDrag(id, panel);
            this.setupResize(id, panel, type);
            // Watch for height changes and re-pack layout
            let lastH = 0;
            const heightObserver = new ResizeObserver(() => {
                const h = panel.offsetHeight;
                if (h !== lastH) {
                    lastH = h;
                    this.scheduleArrange();
                }
            });
            heightObserver.observe(panel);
            this.panels.get(id).heightObserver = heightObserver;
        }

        panel.querySelector('.move-up-btn').addEventListener('click', (e) => { e.stopPropagation(); this.movePanelUp(id); e.target.blur(); });
        panel.querySelector('.move-down-btn').addEventListener('click', (e) => { e.stopPropagation(); this.movePanelDown(id); e.target.blur(); });
        panel.querySelector('.minimize-btn').addEventListener('click', () => this.toggleMinimize(id));
        panel.querySelector('.close-btn').addEventListener('click', () => this.closePanel(id));
        // Clicking the title in the tray restores the panel
        panel.querySelector('.panel-header h3').addEventListener('click', () => {
            const p = this.panels.get(id);
            if (p && p.minimized) this.toggleMinimize(id);
        });

        return { id, panel, content: panel.querySelector('.panel-content') };
    },

    // Auto-arrange: pack panels top-to-bottom, fitting side-by-side when possible
    autoArrange() {
        if (this.isMobile()) return;
        const ws = document.getElementById('workspace');
        const wsW = ws.clientWidth;
        const gap = this.gap;

        // Collect panel dimensions in order
        const items = this.panelOrder
            .map(id => this.panels.get(id))
            .filter(p => p);

        // Simple row-packing: place panels in rows, fitting side-by-side
        let curX = gap, curY = gap, rowH = 0;
        items.forEach(p => {
            const el = p.element;
            const w = el.offsetWidth;
            const h = el.offsetHeight;

            // Does it fit in current row?
            if (curX + w + gap > wsW && curX > gap) {
                // Move to next row
                curX = gap;
                curY += rowH + gap;
                rowH = 0;
            }

            el.style.left = curX + 'px';
            el.style.top = curY + 'px';
            curX += w + gap;
            rowH = Math.max(rowH, h);
        });

        this.updateWorkspaceSize();
    },

    // Schedule auto-arrange after DOM settles
    _arrangeScheduled: false,
    scheduleArrange() {
        if (this._arrangeScheduled || this._restoring) return;
        this._arrangeScheduled = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this._arrangeScheduled = false;
            if (this.dragging || this._restoring) return;
            this.autoArrange();
            this.updateWorkspaceSize();
        }));
    },

    setupDrag(id, panel) {
        const header = panel.querySelector('.panel-header');
        let dragStart = null;
        let dragMoved = false;

        const onDragMove = (e) => {
            if (!dragStart) return;
            e.preventDefault();
            dragMoved = true;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            let newX = Math.max(0, dragStart.startX + clientX - dragStart.mouseX);
            let newY = Math.max(0, dragStart.startY + clientY - dragStart.mouseY);

            // Snap-to-edge logic
            const snap = 12;
            const gap = this.gap;
            const pw = panel.offsetWidth;
            const ph = panel.offsetHeight;
            const pl = newX, pr = newX + pw, pt = newY, pb = newY + ph;
            let snappedX = false, snappedY = false;

            // Snap to workspace edges
            if (Math.abs(pl - gap) < snap) { newX = gap; snappedX = true; }
            if (Math.abs(pt - gap) < snap) { newY = gap; snappedY = true; }

            // Snap to other panel edges
            this.panels.forEach((other, otherId) => {
                if (otherId === id) return;
                const oel = other.element;
                const ol = oel.offsetLeft, ot = oel.offsetTop;
                const or_ = ol + oel.offsetWidth, ob = ot + oel.offsetHeight;

                if (!snappedX) {
                    // Left edge → other right edge + gap
                    if (Math.abs(pl - (or_ + gap)) < snap) { newX = or_ + gap; snappedX = true; }
                    // Right edge → other left edge - gap
                    else if (Math.abs(pr - (ol - gap)) < snap) { newX = ol - gap - pw; snappedX = true; }
                    // Left↔Left alignment
                    else if (Math.abs(pl - ol) < snap) { newX = ol; snappedX = true; }
                    // Right↔Right alignment
                    else if (Math.abs(pr - or_) < snap) { newX = or_ - pw; snappedX = true; }
                }
                if (!snappedY) {
                    // Top edge → other bottom edge + gap
                    if (Math.abs(pt - (ob + gap)) < snap) { newY = ob + gap; snappedY = true; }
                    // Bottom edge → other top edge - gap
                    else if (Math.abs(pb - (ot - gap)) < snap) { newY = ot - gap - ph; snappedY = true; }
                    // Top↔Top alignment
                    else if (Math.abs(pt - ot) < snap) { newY = ot; snappedY = true; }
                    // Bottom↔Bottom alignment
                    else if (Math.abs(pb - ob) < snap) { newY = ob - ph; snappedY = true; }
                }
            });

            panel.style.left = Math.max(0, newX) + 'px';
            panel.style.top = Math.max(0, newY) + 'px';
            this.pushNeighbors(id);
        };

        const onDragEnd = () => {
            if (!dragStart) return;
            panel.classList.remove('dragging');
            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            document.removeEventListener('touchmove', onDragMove);
            document.removeEventListener('touchend', onDragEnd);

            if (dragMoved) {
                this.pushNeighbors(id);
                // Update panelOrder based on position without rearranging
                const dropY = panel.offsetTop;
                const dropX = panel.offsetLeft;
                const oldIdx = this.panelOrder.indexOf(id);
                this.panelOrder.splice(oldIdx, 1);
                let insertIdx = this.panelOrder.length;
                for (let i = 0; i < this.panelOrder.length; i++) {
                    const other = this.panels.get(this.panelOrder[i]);
                    if (!other) continue;
                    const oy = other.element.offsetTop;
                    const ox = other.element.offsetLeft;
                    if (dropY < oy || (dropY === oy && dropX < ox)) {
                        insertIdx = i;
                        break;
                    }
                }
                this.panelOrder.splice(insertIdx, 0, id);
                this.updateWorkspaceSize();
                this.saveLayout();
            }

            dragStart = null;
            dragMoved = false;
            this.dragging = false;
        };

        const onDragStart = (e) => {
            if (e.target.closest('.panel-buttons')) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            dragStart = {
                mouseX: clientX,
                mouseY: clientY,
                startX: panel.offsetLeft,
                startY: panel.offsetTop
            };
            dragMoved = false;
            this.dragging = true;
            panel.classList.add('dragging');
            panel.style.zIndex = 999;
            document.addEventListener('mousemove', onDragMove);
            document.addEventListener('mouseup', onDragEnd);
            document.addEventListener('touchmove', onDragMove, { passive: false });
            document.addEventListener('touchend', onDragEnd);
        };

        header.addEventListener('mousedown', onDragStart);
        header.addEventListener('touchstart', onDragStart, { passive: false });
    },

    setupResize(id, panel, type) {
        const handle = panel.querySelector('.resize-handle');
        const canResizeHeight = type === 'map';
        let resizeStart = null;

        const onResizeMove = (e) => {
            if (!resizeStart) return;
            e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const wsW = document.getElementById('workspace').clientWidth;
            const newW = Math.min(wsW - this.gap * 2, Math.max(280, resizeStart.w + clientX - resizeStart.mouseX));
            panel.style.width = snapToGrid(newW) + 'px';
            if (canResizeHeight) {
                const newH = Math.max(200, resizeStart.h + clientY - resizeStart.mouseY);
                panel.style.height = snapToGrid(newH) + 'px';
            }
            // Shrink overlapping neighbors in real-time
            this.shrinkOverlapping(id);
        };

        const onResizeEnd = () => {
            if (!resizeStart) return;
            resizeStart = null;
            this.dragging = false;
            document.removeEventListener('mousemove', onResizeMove);
            document.removeEventListener('mouseup', onResizeEnd);
            document.removeEventListener('touchmove', onResizeMove);
            document.removeEventListener('touchend', onResizeEnd);
            this.shrinkOverlapping(id);
            this.updateWorkspaceSize();
            this.saveLayout();
        };

        const onResizeStart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.dragging = true;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            resizeStart = {
                mouseX: clientX,
                mouseY: clientY,
                w: panel.offsetWidth,
                h: panel.offsetHeight
            };
            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeEnd);
            document.addEventListener('touchmove', onResizeMove, { passive: false });
            document.addEventListener('touchend', onResizeEnd);
        };

        handle.addEventListener('mousedown', onResizeStart);
        handle.addEventListener('touchstart', onResizeStart, { passive: false });
    },

    movePanelUp(id) {
        const idx = this.panelOrder.indexOf(id);
        if (idx <= 0) return;
        [this.panelOrder[idx - 1], this.panelOrder[idx]] = [this.panelOrder[idx], this.panelOrder[idx - 1]];
        if (this.isMobile()) {
            // DOM reorder for static layout
            const el = this.panels.get(id)?.element;
            const prev = el?.previousElementSibling;
            if (el && prev) el.parentNode.insertBefore(el, prev);
        } else {
            // Swap positions for absolute layout
            this.swapPanelPositions(id, this.panelOrder[idx]);
        }
        this.saveLayout();
    },

    movePanelDown(id) {
        const idx = this.panelOrder.indexOf(id);
        if (idx < 0 || idx >= this.panelOrder.length - 1) return;
        [this.panelOrder[idx], this.panelOrder[idx + 1]] = [this.panelOrder[idx + 1], this.panelOrder[idx]];
        if (this.isMobile()) {
            const el = this.panels.get(id)?.element;
            const next = el?.nextElementSibling;
            if (el && next) el.parentNode.insertBefore(next, el);
        } else {
            this.swapPanelPositions(id, this.panelOrder[idx]);
        }
        this.saveLayout();
    },

    swapPanelPositions(idA, idB) {
        const a = this.panels.get(idA)?.element;
        const b = this.panels.get(idB)?.element;
        if (!a || !b) return;
        const ax = a.style.left, ay = a.style.top;
        a.style.left = b.style.left; a.style.top = b.style.top;
        b.style.left = ax; b.style.top = ay;
    },

    updateWorkspaceSize() {
        const ws = document.getElementById('workspace');
        if (this.isMobile()) {
            ws.style.minHeight = 'auto';
            return;
        }
        // Desktop: ensure workspace covers all absolute-positioned panels
        let maxBottom = 0;
        this.panels.forEach(p => {
            if (p.element.offsetParent === null) return; // hidden
            const rect = p.element.getBoundingClientRect();
            const wsRect = ws.getBoundingClientRect();
            const bottom = rect.bottom - wsRect.top + 20;
            if (bottom > maxBottom) maxBottom = bottom;
        });
        ws.style.minHeight = Math.max(maxBottom, window.innerHeight - 80) + 'px';
    },

    rectsOverlap(a, b) {
        return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    },

    resolveOverlap(id) {
        const p = this.panels.get(id);
        if (!p) return;
        const el = p.element;
        const gap = this.gap;
        const wsW = document.getElementById('workspace').clientWidth;
        let attempts = 0;

        while (attempts < 50) {
            const rect = { l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight };
            let overlap = false;

            for (const [otherId, other] of this.panels) {
                if (otherId === id) continue;
                const oel = other.element;
                const oRect = { l: oel.offsetLeft, t: oel.offsetTop, r: oel.offsetLeft + oel.offsetWidth, b: oel.offsetTop + oel.offsetHeight };
                if (this.rectsOverlap(rect, oRect)) {
                    overlap = true;
                    // Try pushing right
                    const newX = oRect.r + gap;
                    if (newX + el.offsetWidth + gap <= wsW) {
                        el.style.left = newX + 'px';
                    } else {
                        // Push down, reset to left
                        el.style.left = gap + 'px';
                        el.style.top = (oRect.b + gap) + 'px';
                    }
                    break;
                }
            }
            if (!overlap) break;
            attempts++;
        }
    },

    shrinkOverlapping(id) {
        const p = this.panels.get(id);
        if (!p) return;
        const el = p.element;
        const gap = this.gap;
        const wsW = document.getElementById('workspace').clientWidth;
        const rect = { l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight };

        for (const [otherId, other] of this.panels) {
            if (otherId === id || other.minimized) continue;
            const oel = other.element;
            const ol = oel.offsetLeft, ot = oel.offsetTop;
            const ow = oel.offsetWidth, oh = oel.offsetHeight;

            // Only act on panels that overlap vertically
            if (ot + oh <= rect.t || ot >= rect.b) continue;

            // Neighbor is to the right: push it, then shrink if hitting workspace edge
            if (ol >= rect.l && ol < rect.r + gap) {
                const newLeft = rect.r + gap;
                if (newLeft === ol) continue; // already in place
                const maxRight = wsW - gap;
                if (newLeft + ow <= maxRight) {
                    // Just push, keep width
                    oel.style.left = newLeft + 'px';
                } else {
                    // Push and shrink against workspace edge
                    const newW = maxRight - newLeft;
                    if (newW >= 280) {
                        oel.style.left = newLeft + 'px';
                        oel.style.width = newW + 'px';
                    }
                }
            }
        }
    },

    pushNeighbors(id) {
        const p = this.panels.get(id);
        if (!p) return;
        const el = p.element;
        const gap = this.gap;
        const wsW = document.getElementById('workspace').clientWidth;
        const pl = el.offsetLeft, pt = el.offsetTop;
        const pr = pl + el.offsetWidth, pb = pt + el.offsetHeight;

        for (const [otherId, other] of this.panels) {
            if (otherId === id || other.minimized) continue;
            const oel = other.element;
            const ol = oel.offsetLeft, ot = oel.offsetTop;
            const ow = oel.offsetWidth, oh = oel.offsetHeight;
            const or_ = ol + ow, ob = ot + oh;

            // Check actual pixel overlap
            if (!(pl < or_ && pr > ol && pt < ob && pb > ot)) continue;

            // How much to push to restore gap in each direction
            const pushR = pr + gap - ol;
            const pushL = or_ + gap - pl;
            const pushD = pb + gap - ot;
            const pushU = ob + gap - pt;

            // Push in direction of least penetration
            const minH = Math.min(pushR, pushL);
            const minV = Math.min(pushD, pushU);

            if (minH <= minV) {
                if (pushR <= pushL) {
                    const newLeft = pr + gap;
                    oel.style.left = Math.min(newLeft, wsW - gap - ow) + 'px';
                } else {
                    const newLeft = pl - gap - ow;
                    oel.style.left = Math.max(gap, newLeft) + 'px';
                }
            } else {
                if (pushD <= pushU) {
                    oel.style.top = (pb + gap) + 'px';
                } else {
                    const newTop = pt - gap - oh;
                    oel.style.top = Math.max(gap, newTop) + 'px';
                }
            }
        }
    },

    toggleMinimize(id) {
        const p = this.panels.get(id);
        if (!p) return;
        p.minimized = !p.minimized;
        p.element.classList.toggle('minimized', p.minimized);
        p.element.querySelector('.minimize-btn').textContent = p.minimized ? '+' : '−';

        const h3 = p.element.querySelector('.panel-header h3');
        if (p.minimized) {
            p.originalTitle = h3.innerHTML;
            const summaryFn = _summaryHandlers.get(p.type);
            if (summaryFn) {
                h3.innerHTML = summaryFn(id, p);
            }
        } else if (p.originalTitle) {
            h3.innerHTML = p.originalTitle;
        }

        this.updateWorkspaceSize();
        this.saveLayout();
    },

    closePanel(id) {
        const p = this.panels.get(id);
        if (!p) return;
        const name = p.type === 'city' ? (p.config.city?.name || 'Panel') : p.type === 'moon' ? 'Måne' : 'Radarkort';
        if (!confirm(`Fjern ${name}?`)) return;
        const handler = _closeHandlers.get(p.type);
        if (handler) handler(id);
        if (p.heightObserver) p.heightObserver.disconnect();
        p.element.remove();
        this.panels.delete(id);
        this.panelOrder = this.panelOrder.filter(pid => pid !== id);
        this.updateWorkspaceSize();
        this.saveLayout();
    },


    onWindowResize() {
        _resizeHandlers.forEach(fn => fn());
        if (!this.isMobile()) {
            // Clamp widths to fit viewport
            const wsW = document.getElementById('workspace').clientWidth;
            this.panels.forEach(p => {
                const maxW = wsW - this.gap * 2;
                if (p.element.offsetWidth > maxW) {
                    p.element.style.width = maxW + 'px';
                }
            });
            this.autoArrange();
        }
        this.updateWorkspaceSize();
    },

    saveLayout() {
        const mobile = this.isMobile();
        const layout = [];
        this.panelOrder.forEach(id => {
            const p = this.panels.get(id);
            if (!p) return;
            const entry = {
                id, type: p.type, config: p.config, minimized: p.minimized,
                w: mobile ? null : p.element.offsetWidth,
                x: mobile ? null : p.element.offsetLeft,
                y: mobile ? null : p.element.offsetTop
            };
            if (p.type === 'map') entry.h = mobile ? null : p.element.offsetHeight;
            layout.push(entry);
        });
        storage.set('layout', layout);
    },

    createDefaultLayout() {
        if (_defaultLayoutFactory) {
            _defaultLayoutFactory(this);
        }
    },

    loadLayout() {
        const layout = storage.get('layout');
        if (!layout || layout.length === 0) {
            this.createDefaultLayout();
            return;
        } else {
            this._restoring = true;
            const hasPositions = layout.some(l => l.x != null && l.y != null);
            layout.forEach(l => {
                const cfg = { ...l.config, id: l.id, w: l.w };
                if (l.h) cfg.h = l.h;
                const factory = _panelFactories.get(l.type);
                if (factory) factory(l, cfg);
                // Restore saved position
                const panelId = this.panelOrder[this.panelOrder.length - 1];
                if (panelId && l.x != null && l.y != null) {
                    const el = this.panels.get(panelId)?.element;
                    if (el) {
                        el.style.left = l.x + 'px';
                        el.style.top = l.y + 'px';
                    }
                }
                // Restore minimized state
                if (l.minimized && panelId) {
                    this.toggleMinimize(panelId);
                }
            });
            if (hasPositions && !this.isMobile()) {
                setTimeout(() => {
                    this._restoring = false;
                    this.updateWorkspaceSize();
                }, 500);
                return;
            }
            this._restoring = false;
        }
        // Auto-arrange after all panels are created and content loaded
        setTimeout(() => { this.autoArrange(); this.saveLayout(); }, 500);
    }
};
