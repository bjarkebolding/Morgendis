import { debounce, generateId } from '../utils/dom.js';
import { storage } from '../utils/storage.js';

let _closeHandlers = new Map();
export function registerCloseHandler(type, handler) { _closeHandlers.set(type, handler); }

let _resizeHandlers = [];
export function registerResizeHandler(fn) { _resizeHandlers.push(fn); }

let _panelFactories = new Map();
export function registerPanelFactory(type, fn) { _panelFactories.set(type, fn); }

let _defaultLayoutFactory = null;
export function registerDefaultLayoutFactory(fn) { _defaultLayoutFactory = fn; }

// ── Tile tree helpers ──────────────────────────────────────────

function makeLeaf(panelId, size) {
    return { type: 'leaf', panelId, size };
}

function makeSplit(direction, children, size) {
    return { type: 'split', direction, children, size };
}

function findLeaf(node, panelId) {
    if (!node) return null;
    if (node.type === 'leaf') return node.panelId === panelId ? node : null;
    for (const c of node.children) {
        const found = findLeaf(c, panelId);
        if (found) return found;
    }
    return null;
}

function removeLeaf(node, panelId) {
    if (!node || node.type === 'leaf') return node;
    node.children = node.children.filter(c => {
        if (c.type === 'leaf' && c.panelId === panelId) return false;
        return true;
    });
    node.children.forEach(c => removeLeaf(c, panelId));
    if (node.children.length === 1) {
        const only = node.children[0];
        node.size = node.size;
        if (only.type === 'leaf') {
            node.type = 'leaf';
            node.panelId = only.panelId;
            delete node.children;
            delete node.direction;
        } else {
            node.direction = only.direction;
            node.children = only.children;
        }
    }
    if (node.children) {
        const total = node.children.reduce((s, c) => s + c.size, 0);
        if (total > 0) node.children.forEach(c => c.size /= total);
    }
    return node;
}

function serializeTree(node) {
    if (!node) return null;
    if (node.type === 'leaf') return { type: 'leaf', panelId: node.panelId, size: node.size };
    return {
        type: 'split',
        direction: node.direction,
        size: node.size,
        children: node.children.map(serializeTree)
    };
}

function deserializeTree(obj) {
    if (!obj) return null;
    if (obj.type === 'leaf') return makeLeaf(obj.panelId, obj.size);
    return makeSplit(obj.direction, obj.children.map(deserializeTree), obj.size);
}

function findDirectParent(root, panelId) {
    if (!root || root.type === 'leaf') return null;
    for (let i = 0; i < root.children.length; i++) {
        const child = root.children[i];
        if (child.type === 'leaf' && child.panelId === panelId) return { parent: root, index: i };
        const found = findDirectParent(child, panelId);
        if (found) return found;
    }
    return null;
}

function findParentOfNode(root, target) {
    if (!root || root.type === 'leaf') return null;
    for (let i = 0; i < root.children.length; i++) {
        if (root.children[i] === target) return { parent: root, index: i };
        const found = findParentOfNode(root.children[i], target);
        if (found) return found;
    }
    return null;
}

const MIN_PANEL_PX = 100;
const SNAP_SIZES = [1/3, 1/2, 2/3, 1];

function snapSize(val) {
    let best = SNAP_SIZES[0], bestDist = Math.abs(val - best);
    for (const s of SNAP_SIZES) {
        const d = Math.abs(val - s);
        if (d < bestDist) { best = s; bestDist = d; }
    }
    return best;
}


export const PanelManager = {
    panels: new Map(),
    panelOrder: [],
    tileTree: null,
    dragging: false,
    _restoring: false,
    _dividers: [],
    _dropIndicator: null,
    _ghostEl: null,
    _dividerDragging: false,

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

    // ── Tree manipulation ─────────────────────────────────────

    addPanelToTree(id) {
        const leaf = makeLeaf(id, 1);
        if (!this.tileTree) {
            this.tileTree = makeSplit('vertical', [leaf], 1);
            return;
        }
        if (this.tileTree.type === 'leaf') {
            this.tileTree = makeSplit('vertical', [
                makeLeaf(this.tileTree.panelId, 0.5),
                makeLeaf(id, 0.5)
            ], 1);
            return;
        }
        const n = this.tileTree.children.length + 1;
        this.tileTree.children.forEach(c => c.size = (c.size * (n - 1)) / n);
        leaf.size = 1 / n;
        this.tileTree.children.push(leaf);
    },

    removeFromTree(id) {
        if (!this.tileTree) return;
        if (this.tileTree.type === 'leaf' && this.tileTree.panelId === id) {
            this.tileTree = null;
            return;
        }
        removeLeaf(this.tileTree, id);
        if (this.tileTree.type === 'leaf') {
            this.tileTree = makeSplit('vertical', [makeLeaf(this.tileTree.panelId, 1)], 1);
        }
    },

    // ── Apply layout (flex-based) ─────────────────────────────

    applyLayout() {
        if (this.isMobile() || !this.tileTree) return;
        if (this._dividerDragging) return;

        const ws = document.getElementById('workspace');

        // Clear layout styles on all panels
        this.panels.forEach(p => {
            const el = p.element;
            el.style.removeProperty('left');
            el.style.removeProperty('top');
            el.style.removeProperty('width');
            el.style.removeProperty('height');
            el.style.removeProperty('flex');
            el.style.removeProperty('max-width');
        });

        // Detach all panels
        this.panels.forEach(p => {
            if (p.element.parentNode) p.element.remove();
        });

        // Remove old tile-split wrappers
        ws.querySelectorAll('.tile-split').forEach(el => el.remove());

        // Build DOM from tree
        const rootEl = this._buildNode(this.tileTree);
        if (rootEl) ws.appendChild(rootEl);

        // Render dividers after layout settles
        requestAnimationFrame(() => this.renderDividers());
    },

    _buildNode(node) {
        if (!node) return null;

        if (node.type === 'leaf') {
            const panel = this.panels.get(node.panelId);
            if (!panel) return null;
            node._el = panel.element;
            return panel.element;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'tile-split ' + (node.direction === 'horizontal' ? 'tile-h' : 'tile-v');
        wrapper._tileNode = node;
        node._el = wrapper;

        node.children.forEach(child => {
            const childEl = this._buildNode(child);
            if (!childEl) return;
            if (node.direction === 'horizontal') {
                const pct = (snapSize(child.size) * 100) + '%';
                childEl.style.flex = '0 0 ' + pct;
                childEl.style.width = pct;
                childEl.style.maxWidth = pct;
            }
            wrapper.appendChild(childEl);
        });

        // Add empty-space placeholder if horizontal split has unused space
        if (node.direction === 'horizontal') {
            const totalUsed = node.children.reduce((s, c) => s + snapSize(c.size), 0);
            if (totalUsed < 1 - 0.01 && node.children.length < 3) {
                const placeholder = document.createElement('div');
                placeholder.className = 'tile-empty-space';
                placeholder._tileNode = node;
                const pct = ((1 - totalUsed) * 100) + '%';
                placeholder.style.flex = '0 0 ' + pct;
                placeholder.style.width = pct;
                wrapper.appendChild(placeholder);
            }
        }

        return wrapper;
    },

    // ── Schedule layout ───────────────────────────────────────

    _arrangeScheduled: false,
    _saveTimeout: null,
    scheduleArrange() {
        if (this._arrangeScheduled || this._restoring) return;
        this._arrangeScheduled = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this._arrangeScheduled = false;
            if (this.dragging || this._restoring) return;
            this.applyLayout();
            clearTimeout(this._saveTimeout);
            this._saveTimeout = setTimeout(() => this.saveLayout(), 1000);
        }));
    },

    // ── Create panel ──────────────────────────────────────────

    createPanel(type, config = {}) {
        const id = config.id || generateId();
        const panel = document.createElement('div');
        panel.className = 'panel';
        if (type === 'map') panel.classList.add('panel-map');
        panel.id = id;

        const title = config.title || (type === 'map' ? 'Radarkort' : config.cityName || 'Panel');

        panel.innerHTML = `
            <div class="panel-header">
                <h3>${title}${config.coords ? ` <span class="coords">${config.coords}</span>` : ''}</h3>
                <div class="panel-buttons">
                    <button class="btn-icon tile-up-btn mobile-only" title="Flyt op" aria-label="Flyt op">▲</button>
                    <button class="btn-icon tile-down-btn mobile-only" title="Flyt ned" aria-label="Flyt ned">▼</button>
                    <button class="btn-icon danger close-btn" title="Luk" aria-label="Luk panel">×</button>
                </div>
            </div>
            <div class="panel-content"></div>
        `;

        const ws = document.getElementById('workspace');
        if (config.prepend) {
            ws.prepend(panel);
        } else {
            ws.appendChild(panel);
        }
        this.panels.set(id, { id, type, config, element: panel });
        if (config.prepend) {
            this.panelOrder.unshift(id);
        } else {
            this.panelOrder.push(id);
        }

        if (!this._restoring) {
            this.addPanelToTree(id);
            if (!this.isMobile()) {
                this.applyLayout();
                this.saveLayout();
            }
        }

        if (!this.isMobile()) {
            this.setupTileDrag(id, panel);
        }

        panel.querySelector('.tile-up-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.tileUp(id); e.target.blur(); });
        panel.querySelector('.tile-down-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.tileDown(id); e.target.blur(); });
        panel.querySelector('.close-btn').addEventListener('click', () => this.closePanel(id));

        return { id, panel, content: panel.querySelector('.panel-content') };
    },

    // ── Tile drag (reorder by dropping) ───────────────────────

    setupTileDrag(id, panel) {
        const header = panel.querySelector('.panel-header');
        let dragStart = null;
        let dragMoved = false;

        const getDropZone = (panelEl, clientX, clientY) => {
            const rect = panelEl.getBoundingClientRect();
            const relX = (clientX - rect.left) / rect.width;
            const relY = (clientY - rect.top) / rect.height;
            if (relY < 0.2) return 'top';
            if (relY > 0.8) return 'bottom';
            if (relX < 0.3) return 'left';
            if (relX > 0.7) return 'right';
            return 'center';
        };

        const showDropIndicator = (targetPanel, zone) => {
            if (!this._dropIndicator) {
                this._dropIndicator = document.createElement('div');
                this._dropIndicator.className = 'tile-drop-indicator';
                document.getElementById('workspace').appendChild(this._dropIndicator);
            }
            const ind = this._dropIndicator;
            const rect = targetPanel.getBoundingClientRect();
            const ws = document.getElementById('workspace');
            const wsRect = ws.getBoundingClientRect();
            const ox = rect.left - wsRect.left + ws.scrollLeft;
            const oy = rect.top - wsRect.top + ws.scrollTop;
            ind.style.display = 'block';
            switch (zone) {
                case 'top':
                    ind.style.left = ox + 'px'; ind.style.top = oy + 'px';
                    ind.style.width = rect.width + 'px'; ind.style.height = (rect.height * 0.5) + 'px';
                    break;
                case 'bottom':
                    ind.style.left = ox + 'px'; ind.style.top = (oy + rect.height * 0.5) + 'px';
                    ind.style.width = rect.width + 'px'; ind.style.height = (rect.height * 0.5) + 'px';
                    break;
                case 'left':
                    ind.style.left = ox + 'px'; ind.style.top = oy + 'px';
                    ind.style.width = (rect.width * 0.5) + 'px'; ind.style.height = rect.height + 'px';
                    break;
                case 'right':
                    ind.style.left = (ox + rect.width * 0.5) + 'px'; ind.style.top = oy + 'px';
                    ind.style.width = (rect.width * 0.5) + 'px'; ind.style.height = rect.height + 'px';
                    break;
                case 'center':
                    ind.style.left = ox + 'px'; ind.style.top = oy + 'px';
                    ind.style.width = rect.width + 'px'; ind.style.height = rect.height + 'px';
                    break;
            }
        };

        const showEmptySpaceIndicator = (emptySpaceEl) => {
            if (!this._dropIndicator) {
                this._dropIndicator = document.createElement('div');
                this._dropIndicator.className = 'tile-drop-indicator';
                document.getElementById('workspace').appendChild(this._dropIndicator);
            }
            const ind = this._dropIndicator;
            const rect = emptySpaceEl.getBoundingClientRect();
            const ws = document.getElementById('workspace');
            const wsRect = ws.getBoundingClientRect();
            const ox = rect.left - wsRect.left + ws.scrollLeft;
            const oy = rect.top - wsRect.top + ws.scrollTop;
            ind.style.display = 'block';
            ind.style.left = ox + 'px';
            ind.style.top = oy + 'px';
            ind.style.width = rect.width + 'px';
            ind.style.height = rect.height + 'px';
        };

        const hideDropIndicator = () => {
            if (this._dropIndicator) this._dropIndicator.style.display = 'none';
        };

        const removeGhost = () => {
            if (this._ghostEl) { this._ghostEl.remove(); this._ghostEl = null; }
        };

        const onDragMove = (e) => {
            if (!dragStart) return;
            e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const dx = clientX - dragStart.mouseX;
            const dy = clientY - dragStart.mouseY;
            if (!dragMoved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
            dragMoved = true;

            if (!this._ghostEl) {
                this._ghostEl = document.createElement('div');
                this._ghostEl.className = 'tile-drag-ghost';
                this._ghostEl.textContent = panel.querySelector('.panel-header h3').textContent;
                document.body.appendChild(this._ghostEl);
            }
            this._ghostEl.style.left = (clientX + 10) + 'px';
            this._ghostEl.style.top = (clientY + 10) + 'px';

            panel.style.pointerEvents = 'none';
            this._dividers.forEach(d => d.style.pointerEvents = 'none');
            const elUnder = document.elementFromPoint(clientX, clientY);
            panel.style.pointerEvents = '';
            this._dividers.forEach(d => d.style.pointerEvents = '');

            const targetPanel = elUnder?.closest('.panel');
            const emptySpace = elUnder?.closest('.tile-empty-space');

            if (emptySpace && emptySpace._tileNode) {
                const splitNode = emptySpace._tileNode;
                const sourceInSplit = splitNode.children.some(c => c.type === 'leaf' && c.panelId === id);
                if (!sourceInSplit && splitNode.children.length < 3) {
                    showEmptySpaceIndicator(emptySpace);
                    dragStart.targetId = null;
                    dragStart.zone = 'empty-space';
                    dragStart.emptySpaceNode = splitNode;
                } else {
                    hideDropIndicator();
                    dragStart.targetId = null;
                    dragStart.zone = null;
                    dragStart.emptySpaceNode = null;
                }
            } else if (targetPanel && targetPanel.id !== id) {
                const zone = getDropZone(targetPanel, clientX, clientY);
                showDropIndicator(targetPanel, zone);
                dragStart.targetId = targetPanel.id;
                dragStart.zone = zone;
                dragStart.emptySpaceNode = null;
            } else {
                hideDropIndicator();
                dragStart.targetId = null;
                dragStart.zone = null;
                dragStart.emptySpaceNode = null;
            }
        };

        const onDragEnd = () => {
            if (!dragStart) return;
            panel.classList.remove('dragging');
            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            document.removeEventListener('touchmove', onDragMove);
            document.removeEventListener('touchend', onDragEnd);

            hideDropIndicator();
            removeGhost();

            if (dragMoved && dragStart.zone === 'empty-space' && dragStart.emptySpaceNode) {
                this.tileDropEmptySpace(id, dragStart.emptySpaceNode);
            } else if (dragMoved && dragStart.targetId && dragStart.zone) {
                this.tileDrop(id, dragStart.targetId, dragStart.zone);
            }

            dragStart = null;
            dragMoved = false;
            this.dragging = false;
        };

        const onDragStart = (e) => {
            if (e.target.closest('.panel-buttons')) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            dragStart = { mouseX: clientX, mouseY: clientY, targetId: null, zone: null };
            dragMoved = false;
            this.dragging = true;
            panel.classList.add('dragging');
            document.addEventListener('mousemove', onDragMove);
            document.addEventListener('mouseup', onDragEnd);
            document.addEventListener('touchmove', onDragMove, { passive: false });
            document.addEventListener('touchend', onDragEnd);
        };

        header.addEventListener('mousedown', onDragStart);
        header.addEventListener('touchstart', onDragStart, { passive: false });
    },

    tileDrop(sourceId, targetId, zone) {
        if (zone === 'center') {
            const srcLeaf = findLeaf(this.tileTree, sourceId);
            const tgtLeaf = findLeaf(this.tileTree, targetId);
            if (srcLeaf && tgtLeaf) {
                srcLeaf.panelId = targetId;
                tgtLeaf.panelId = sourceId;
            }
        } else {
            this.removeFromTree(sourceId);

            const found = findDirectParent(this.tileTree, targetId);
            if (!found) { this.addPanelToTree(sourceId); this.applyLayout(); this.saveLayout(); return; }

            const { parent: targetParent, index: targetIdx } = found;
            const targetChild = targetParent.children[targetIdx];

            if (zone === 'top' || zone === 'bottom') {
                if (targetParent.direction === 'vertical') {
                    const newLeaf = makeLeaf(sourceId, targetChild.size * 0.5);
                    targetChild.size *= 0.5;
                    const insertIdx = zone === 'top' ? targetIdx : targetIdx + 1;
                    targetParent.children.splice(insertIdx, 0, newLeaf);
                } else {
                    const newSplit = makeSplit('vertical',
                        zone === 'top'
                            ? [makeLeaf(sourceId, 0.5), makeLeaf(targetId, 0.5)]
                            : [makeLeaf(targetId, 0.5), makeLeaf(sourceId, 0.5)],
                        targetChild.size
                    );
                    targetParent.children[targetIdx] = newSplit;
                }
            } else {
                if (targetParent.direction === 'horizontal') {
                    if (targetParent.children.length >= 3) {
                        this.addPanelToTree(sourceId);
                        this.applyLayout(); this.saveLayout(); return;
                    }
                    // Equal sizes for all children after insert
                    const insertIdx = zone === 'left' ? targetIdx : targetIdx + 1;
                    const n = targetParent.children.length + 1;
                    targetParent.children.splice(insertIdx, 0, makeLeaf(sourceId, 1 / n));
                    targetParent.children.forEach(c => c.size = 1 / n);
                } else {
                    const newSplit = makeSplit('horizontal',
                        zone === 'left'
                            ? [makeLeaf(sourceId, 0.5), makeLeaf(targetId, 0.5)]
                            : [makeLeaf(targetId, 0.5), makeLeaf(sourceId, 0.5)],
                        targetChild.size
                    );
                    targetParent.children[targetIdx] = newSplit;
                }
            }
        }
        this.applyLayout();
        this.saveLayout();
        _resizeHandlers.forEach(fn => fn());
    },

    tileDropEmptySpace(sourceId, splitNode) {
        if (splitNode.children.length >= 3) return;
        // Snapshot the target panel IDs before removing source (tree may mutate)
        const targetPanelIds = [];
        const collectIds = (node) => {
            if (node.type === 'leaf') targetPanelIds.push(node.panelId);
            else if (node.children) node.children.forEach(collectIds);
        };
        splitNode.children.forEach(collectIds);

        this.removeFromTree(sourceId);

        // Re-find the target split by locating one of its panels
        let actualSplit = null;
        if (targetPanelIds.length > 0) {
            const found = findDirectParent(this.tileTree, targetPanelIds[0]);
            if (found && found.parent.direction === 'horizontal') {
                actualSplit = found.parent;
            } else if (found) {
                // Panel is now a direct child of vertical root — wrap in h-split
                const idx = found.index;
                const leaf = found.parent.children[idx];
                const hSplit = makeSplit('horizontal', [makeLeaf(leaf.panelId, leaf.size || 1)], leaf.size);
                found.parent.children[idx] = hSplit;
                actualSplit = hSplit;
            }
        }
        if (!actualSplit) { this.addPanelToTree(sourceId); this.applyLayout(); this.saveLayout(); return; }
        if (actualSplit.children.length >= 3) { this.addPanelToTree(sourceId); this.applyLayout(); this.saveLayout(); return; }

        // Calculate remaining space
        const usedSize = actualSplit.children.reduce((s, c) => s + c.size, 0);
        const available = Math.max(1 - usedSize, 0);
        if (available > 0.01) {
            actualSplit.children.push(makeLeaf(sourceId, snapSize(available)));
        } else {
            const n = actualSplit.children.length + 1;
            actualSplit.children.forEach(c => c.size = 1 / n);
            actualSplit.children.push(makeLeaf(sourceId, 1 / n));
        }
        this.applyLayout();
        this.saveLayout();
        _resizeHandlers.forEach(fn => fn());
    },

    // ── Dividers (column resize only) ─────────────────────────

    renderDividers() {
        this._dividers.forEach(d => d.remove());
        this._dividers = [];
        if (!this.tileTree || this.isMobile()) return;
        const ws = document.getElementById('workspace');
        this._renderDividersForNode(this.tileTree, ws);
    },

    _renderDividersForNode(node, ws) {
        if (!node || node.type === 'leaf') return;
        const { direction, children } = node;

        // Only create dividers for horizontal splits (column resize)
        if (direction === 'horizontal' && node._el) {
            const wsRect = ws.getBoundingClientRect();
            const dividerW = 8;

            for (let i = 0; i < children.length - 1; i++) {
                const childEl = children[i]._el;
                if (!childEl) continue;
                const childRect = childEl.getBoundingClientRect();

                const div = document.createElement('div');
                div.className = 'tile-divider tile-divider-v';
                div.style.left = (childRect.right - wsRect.left - dividerW / 2) + 'px';
                div.style.top = (childRect.top - wsRect.top + ws.scrollTop) + 'px';
                div.style.width = dividerW + 'px';
                div.style.height = childRect.height + 'px';
                ws.appendChild(div);
                this._dividers.push(div);

                this._setupDividerDrag(div, node, i);
            }
        }

        // Recurse into children
        children.forEach(child => this._renderDividersForNode(child, ws));
    },

    _setupDividerDrag(divEl, splitNode, childIdx) {
        let active = false;

        const onMove = (e) => {
            if (!active) return;
            e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;

            const rowRect = splitNode._el.getBoundingClientRect();
            const pos = clientX - rowRect.left;
            const total = rowRect.width;

            let prevSizeSum = 0;
            for (let i = 0; i < childIdx; i++) prevSizeSum += splitNode.children[i].size;

            const a = splitNode.children[childIdx];
            const b = splitNode.children[childIdx + 1];
            const combined = a.size + b.size;
            const minFrac = MIN_PANEL_PX / total;

            let newASize = (pos / total) - prevSizeSum;
            // Snap to nearest valid size (1/3, 1/2, 2/3)
            const validSnaps = SNAP_SIZES.filter(s => s >= 1/3 - 0.01 && s <= combined - 1/3 + 0.01);
            if (validSnaps.length > 0) {
                let best = validSnaps[0], bestDist = Math.abs(newASize - best);
                for (const s of validSnaps) {
                    const d = Math.abs(newASize - s);
                    if (d < bestDist) { best = s; bestDist = d; }
                }
                newASize = best;
            }
            a.size = newASize;
            b.size = combined - newASize;

            // Update flex sizes directly
            if (a._el) {
                const pctA = (a.size * 100) + '%';
                a._el.style.flex = '0 0 ' + pctA;
                a._el.style.width = pctA;
                a._el.style.maxWidth = pctA;
            }
            if (b._el) {
                const pctB = (b.size * 100) + '%';
                b._el.style.flex = '0 0 ' + pctB;
                b._el.style.width = pctB;
                b._el.style.maxWidth = pctB;
            }

            // Reposition divider
            if (a._el) {
                const aRect = a._el.getBoundingClientRect();
                const ws = document.getElementById('workspace');
                const wsRect = ws.getBoundingClientRect();
                divEl.style.left = (aRect.right - wsRect.left - 4) + 'px';
                divEl.style.height = aRect.height + 'px';
                divEl.style.top = (aRect.top - wsRect.top + ws.scrollTop) + 'px';
            }
        };

        const onEnd = () => {
            active = false;
            this.dragging = false;
            this._dividerDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            this.renderDividers();
            this.saveLayout();
            _resizeHandlers.forEach(fn => fn());
        };

        const onStart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.dragging = true;
            this._dividerDragging = true;
            active = true;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        };

        divEl.addEventListener('mousedown', onStart);
        divEl.addEventListener('touchstart', onStart, { passive: false });
    },

    // ── Close ─────────────────────────────────────────────────

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
        this.removeFromTree(id);
        this.applyLayout();
        this.saveLayout();
    },

    // ── Tile movement (mobile only) ─────────────────────────────

    tileUp(id) {
        this._mobileMove(id, -1);
    },

    tileDown(id) {
        this._mobileMove(id, 1);
    },

    _mobileMove(id, dir) {
        const idx = this.panelOrder.indexOf(id);
        const target = idx + dir;
        if (target < 0 || target >= this.panelOrder.length) return;
        [this.panelOrder[idx], this.panelOrder[target]] = [this.panelOrder[target], this.panelOrder[idx]];
        const el = this.panels.get(id)?.element;
        if (dir < 0) {
            const prev = el?.previousElementSibling;
            if (el && prev) el.parentNode.insertBefore(el, prev);
        } else {
            const next = el?.nextElementSibling;
            if (el && next) el.parentNode.insertBefore(next, el);
        }
        this.saveLayout();
    },

    // Extract a panel from a horizontal split into its own row above/below
    _extractFromSplit(id, splitParent, position) {
        const leafIdx = splitParent.children.findIndex(c => c.type === 'leaf' && c.panelId === id);
        if (leafIdx === -1) return;
        splitParent.children.splice(leafIdx, 1);

        // Redistribute remaining sizes
        const total = splitParent.children.reduce((s, c) => s + c.size, 0);
        if (total > 0) splitParent.children.forEach(c => c.size /= total);

        // Collapse if only one child left
        if (splitParent.children.length === 1) {
            const only = splitParent.children[0];
            if (only.type === 'leaf') {
                splitParent.type = 'leaf';
                splitParent.panelId = only.panelId;
                delete splitParent.children;
                delete splitParent.direction;
            } else {
                splitParent.direction = only.direction;
                splitParent.children = only.children;
            }
        }

        // Find where splitParent sits in the tree
        let vertParent, splitIdx;
        if (this.tileTree === splitParent) {
            this.tileTree = makeSplit('vertical', [splitParent], 1);
            splitParent.size = 1;
            vertParent = this.tileTree;
            splitIdx = 0;
        } else {
            const gpInfo = findParentOfNode(this.tileTree, splitParent);
            if (!gpInfo) return;
            vertParent = gpInfo.parent;
            splitIdx = gpInfo.index;
        }

        // Insert as new row
        const insertIdx = position === 'before' ? splitIdx : splitIdx + 1;
        const n = vertParent.children.length + 1;
        vertParent.children.forEach(c => c.size = (c.size * (n - 1)) / n);
        vertParent.children.splice(insertIdx, 0, makeLeaf(id, 1 / n));
    },

    // Merge a panel with an adjacent sibling into a horizontal split
    _mergeWithSibling(id, parent, panelIdx, siblingIdx, side) {
        const panelNode = parent.children[panelIdx];
        const siblingNode = parent.children[siblingIdx];
        const combinedSize = panelNode.size + siblingNode.size;

        if (siblingNode.type === 'split' && siblingNode.direction === 'horizontal') {
            if (siblingNode.children.length >= 3) return; // max 3 per row
            // Join existing horizontal split
            parent.children.splice(panelIdx, 1);
            const adjSibIdx = panelIdx < siblingIdx ? siblingIdx - 1 : siblingIdx;
            const hSplit = parent.children[adjSibIdx];
            hSplit.size = combinedSize;
            // Check if there's empty space to fill
            const usedSize = hSplit.children.reduce((s, c) => s + c.size, 0);
            const emptySpace = 1 - usedSize;
            if (emptySpace > 0.01) {
                // Fill the empty space (always at the end where empty space is)
                const newSize = snapSize(emptySpace);
                hSplit.children.push(makeLeaf(id, newSize));
            } else {
                // No empty space, redistribute equally
                const n = hSplit.children.length + 1;
                if (side === 'left') {
                    hSplit.children.unshift(makeLeaf(id, 1 / n));
                } else {
                    hSplit.children.push(makeLeaf(id, 1 / n));
                }
                hSplit.children.forEach(c => c.size = 1 / n);
            }
        } else {
            // Create new horizontal split (1/2 + 1/2)
            siblingNode.size = 0.5;
            const children = side === 'left'
                ? [makeLeaf(id, 0.5), siblingNode]
                : [siblingNode, makeLeaf(id, 0.5)];
            const newSplit = makeSplit('horizontal', children, combinedSize);

            const minIdx = Math.min(panelIdx, siblingIdx);
            const maxIdx = Math.max(panelIdx, siblingIdx);
            parent.children.splice(maxIdx, 1);
            parent.children.splice(minIdx, 1, newSplit);
        }

        // Normalize parent sizes
        const totalSize = parent.children.reduce((s, c) => s + c.size, 0);
        if (totalSize > 0) parent.children.forEach(c => c.size /= totalSize);
    },

    // ── Window resize ─────────────────────────────────────────

    onWindowResize() {
        _resizeHandlers.forEach(fn => fn());
        if (!this.isMobile()) {
            this.renderDividers();
        }
    },

    // ── Save / Load ───────────────────────────────────────────

    saveLayout() {
        const panelsMeta = {};
        this.panelOrder.forEach(id => {
            const p = this.panels.get(id);
            if (!p) return;
            panelsMeta[id] = { type: p.type, config: p.config };
        });
        const layout = {
            version: 2,
            tree: serializeTree(this.tileTree),
            panels: panelsMeta,
            order: [...this.panelOrder]
        };
        storage.set('layout', layout);
    },

    createDefaultLayout() {
        if (_defaultLayoutFactory) {
            _defaultLayoutFactory(this);
        }
    },

    loadLayout() {
        const layout = storage.get('layout');
        if (!layout) {
            this.createDefaultLayout();
            return;
        }

        // V2 format
        if (layout.version === 2 && layout.tree) {
            this._restoring = true;
            this.tileTree = deserializeTree(layout.tree);
            const order = layout.order || Object.keys(layout.panels);
            order.forEach(id => {
                const meta = layout.panels[id];
                if (!meta) return;
                const cfg = { ...meta.config, id };
                delete cfg.prepend;
                const factory = _panelFactories.get(meta.type);
                if (factory) factory(meta, cfg);
            });
            this._restoring = false;
            setTimeout(() => {
                this.applyLayout();
                _resizeHandlers.forEach(fn => fn());
            }, 500);
            return;
        }

        // V1 format (array) — migrate
        if (Array.isArray(layout)) {
            this._restoring = true;
            this.tileTree = this._migrateFromV1(layout);
            layout.forEach(l => {
                const cfg = { ...l.config, id: l.id };
                if (l.h) cfg.h = l.h;
                delete cfg.prepend;
                const factory = _panelFactories.get(l.type);
                if (factory) factory(l, cfg);
            });
            this._restoring = false;
            setTimeout(() => {
                this.applyLayout();
                this.saveLayout();
                _resizeHandlers.forEach(fn => fn());
            }, 500);
            return;
        }

        this.createDefaultLayout();
    },

    _migrateFromV1(layout) {
        const tolerance = 50;
        const rows = [];
        const sorted = [...layout].sort((a, b) => (a.y || 0) - (b.y || 0));

        sorted.forEach(l => {
            const y = l.y || 0;
            let found = false;
            for (const row of rows) {
                if (Math.abs(row.y - y) < tolerance) {
                    row.items.push(l);
                    found = true;
                    break;
                }
            }
            if (!found) rows.push({ y, items: [l] });
        });

        rows.forEach(r => r.items.sort((a, b) => (a.x || 0) - (b.x || 0)));

        const rowNodes = rows.map(row => {
            if (row.items.length === 1) {
                return makeLeaf(row.items[0].id, 1);
            }
            const totalW = row.items.reduce((s, l) => s + (l.w || 400), 0);
            const children = row.items.map(l => makeLeaf(l.id, (l.w || 400) / totalW));
            return makeSplit('horizontal', children, 1);
        });

        const n = rowNodes.length;
        rowNodes.forEach(r => r.size = 1 / n);
        return makeSplit('vertical', rowNodes, 1);
    }
};
