import type { CanvasConnection, CanvasNodeData } from "../../types/canvas";

export type CanvasViewBounds = { left: number; top: number; right: number; bottom: number };
export type CanvasVisibleConnection = { connection: CanvasConnection; from: CanvasNodeData; to: CanvasNodeData };
type Entry<T> = { id: string; order: number; value: T; bounds: CanvasViewBounds; cells: string[] };

export function intersectsCanvasBounds(a: CanvasViewBounds, b: CanvasViewBounds) {
    return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
}

// These only choose the index layout. They never limit nodes, view size, or preload distance.
const CELL_SIZE = 512;
const MAX_ENTRY_CELLS = 64;

class BoundsIndex<T> {
    private entries = new Map<string, Entry<T>>();
    private cells = new Map<string, Set<Entry<T>>>();
    private broad = new Set<Entry<T>>();

    update(id: string, order: number, value: T, bounds: CanvasViewBounds) {
        const previous = this.entries.get(id);
        if (previous && Object.keys(bounds).every((key) => previous.bounds[key as keyof CanvasViewBounds] === bounds[key as keyof CanvasViewBounds])) {
            previous.order = order;
            previous.value = value;
            return;
        }
        this.remove(id);
        if (!Object.values(bounds).every(Number.isFinite)) return;
        const entry: Entry<T> = { id, order, value, bounds, cells: [] };
        this.entries.set(id, entry);
        const range = this.range(bounds);
        if (range.count > MAX_ENTRY_CELLS) { this.broad.add(entry); return; }
        for (let x = range.left; x <= range.right; x++) for (let y = range.top; y <= range.bottom; y++) {
            const key = `${x}:${y}`;
            const cell = this.cells.get(key) || new Set<Entry<T>>();
            cell.add(entry);
            this.cells.set(key, cell);
            entry.cells.push(key);
        }
    }

    remove(id: string) {
        const entry = this.entries.get(id);
        if (!entry) return;
        for (const key of entry.cells) {
            const cell = this.cells.get(key)!;
            cell.delete(entry);
            if (!cell.size) this.cells.delete(key);
        }
        this.broad.delete(entry);
        this.entries.delete(id);
    }

    removeMissing(ids: { has: (id: string) => boolean }) { for (const id of this.entries.keys()) if (!ids.has(id)) this.remove(id); }

    query(bounds: CanvasViewBounds, retainedIds?: ReadonlySet<string>) {
        const range = this.range(bounds);
        // Zooming far out can cover enormous empty space; scan occupied entries in that case.
        const candidates = range.count > this.cells.size ? new Set(this.entries.values()) : new Set(this.broad);
        if (range.count <= this.cells.size) {
            for (let x = range.left; x <= range.right; x++) for (let y = range.top; y <= range.bottom; y++) {
                this.cells.get(`${x}:${y}`)?.forEach((entry) => candidates.add(entry));
            }
        }
        retainedIds?.forEach((id) => { const entry = this.entries.get(id); if (entry) candidates.add(entry); });
        return [...candidates].filter((entry) => retainedIds?.has(entry.id) || intersectsCanvasBounds(entry.bounds, bounds)).sort((a, b) => a.order - b.order).map((entry) => entry.value);
    }

    private range(bounds: CanvasViewBounds) {
        const left = Math.floor(bounds.left / CELL_SIZE), right = Math.floor(bounds.right / CELL_SIZE);
        const top = Math.floor(bounds.top / CELL_SIZE), bottom = Math.floor(bounds.bottom / CELL_SIZE);
        const safe = [left, right, top, bottom].every(Number.isSafeInteger);
        return { left, right, top, bottom, count: safe ? (right - left + 1) * (bottom - top + 1) : Infinity };
    }
}

/** Keep one instance per canvas. update is only needed when nodes/connections change, not while panning. */
export class CanvasSpatialIndex {
    private nodes = new BoundsIndex<CanvasNodeData>();
    private connections = new BoundsIndex<CanvasVisibleConnection>();
    private previousNodes: CanvasNodeData[] = [];
    private previousConnections: CanvasConnection[] = [];
    private byId = new Map<string, CanvasNodeData>();
    private connected = new Map<string, Set<{ connection: CanvasConnection; order: number }>>();

    update(nodes: CanvasNodeData[], connections: CanvasConnection[], byId = new Map(nodes.map((node) => [node.id, node]))) {
        const changed = new Set<string>();
        let identitiesChanged = nodes.length !== this.previousNodes.length;
        nodes.forEach((node, order) => {
            if (this.previousNodes[order]?.id !== node.id) identitiesChanged = true;
            if (this.byId.get(node.id) !== node) changed.add(node.id);
            if (this.previousNodes[order] !== node) this.nodes.update(node.id, order, node, { left: node.position.x, top: node.position.y, right: node.position.x + node.width, bottom: node.position.y + node.height });
        });
        if (identitiesChanged) {
            for (const id of this.byId.keys()) if (!byId.has(id)) changed.add(id);
            this.nodes.removeMissing(byId);
        }
        const updateConnection = ({ connection, order }: { connection: CanvasConnection; order: number }) => {
            const from = byId.get(connection.fromNodeId), to = byId.get(connection.toNodeId);
            if (!from || !to) { this.connections.remove(connection.id); return; }
            const startX = from.position.x + from.width, endX = to.position.x;
            const startY = from.position.y + from.height / 2, endY = to.position.y + to.height / 2;
            const curvature = Math.max(Math.abs(endX - startX) * 0.5, 50);
            this.connections.update(connection.id, order, { connection, from, to }, { left: Math.min(startX, endX - curvature), right: Math.max(startX + curvature, endX), top: Math.min(startY, endY), bottom: Math.max(startY, endY) });
        };
        if (connections !== this.previousConnections) {
            this.connected.clear();
            connections.forEach((connection, order) => {
                const entry = { connection, order };
                for (const id of [connection.fromNodeId, connection.toNodeId]) {
                    const edges = this.connected.get(id) || new Set();
                    edges.add(entry);
                    this.connected.set(id, edges);
                }
                updateConnection(entry);
            });
            this.connections.removeMissing(new Set(connections.map((connection) => connection.id)));
        } else {
            const affected = new Set<{ connection: CanvasConnection; order: number }>();
            changed.forEach((id) => this.connected.get(id)?.forEach((edge) => affected.add(edge)));
            affected.forEach(updateConnection);
        }
        this.byId = byId;
        this.previousNodes = nodes;
        this.previousConnections = connections;
    }

    queryNodes(bounds: CanvasViewBounds, playingNodeIds?: ReadonlySet<string>) { return this.nodes.query(bounds, playingNodeIds); }
    queryConnections(bounds: CanvasViewBounds) { return this.connections.query(bounds); }
}
