import { applyProductionOperation, type ProductionDocument } from '../../../../shared/production';
import { CanvasNodeType, type CanvasNodeData } from '@/types/canvas';

/** New shots gain a node once; intentionally unbound/deleted existing nodes are never resurrected. */
export function syncProductionBindings(next: ProductionDocument, previous: ProductionDocument | undefined, nodes: CanvasNodeData[], createId: () => string): { production: ProductionDocument; nodes: CanvasNodeData[] } {
    let production = next;
    const result = [...nodes], oldShots = new Map(previous?.shots.map(shot => [shot.shotId, shot]) || []);
    const claimed = new Set<string>();
    const right = nodes.reduce((value, node) => Math.max(value, node.position.x + node.width), 0);
    let created = 0;
    for (const original of next.shots) {
        let shot = original;
        let nodeIndex = shot.nodeId ? result.findIndex(node => node.id === shot.nodeId) : -1;
        if (nodeIndex < 0 && !oldShots.has(shot.shotId)) {
            const nodeId = createId();
            if (result.some(node => node.id === nodeId)) throw new Error('新镜头节点身份冲突，请重试');
            shot = { ...shot, nodeId };
            if (production === next) production = { ...next, shots: [...next.shots] };
            production.shots = production.shots.map(item => item.shotId === shot.shotId ? shot : item);
            result.push({ id: nodeId, type: CanvasNodeType.Image, title: shot.title, position: { x: right + (nodes.length ? 80 : 0) + created++ * 400, y: 0 }, width: 360, height: 240, metadata: { status: 'idle' } });
            nodeIndex = result.length - 1;
        }
        if (!shot.nodeId || nodeIndex < 0) continue;
        if (claimed.has(shot.nodeId)) throw new Error('一个画布节点只能绑定一个镜头');
        claimed.add(shot.nodeId);
        const node = result[nodeIndex], old = oldShots.get(shot.shotId);
        const changedMedia = shot.adoptedMedia && (JSON.stringify(shot.adoptedMedia) !== JSON.stringify(old?.adoptedMedia) || old?.nodeId !== shot.nodeId);
        const metadata = { ...node.metadata, prompt: shot.prompt, productionShotId: shot.shotId };
        if (changedMedia) {
            metadata.generationMode = shot.adoptedMedia!.kind;
            metadata.content = shot.adoptedMedia!.url || '';
            metadata.storageKey = shot.adoptedMedia!.storageKey;
            metadata.durationMs = shot.adoptedMedia!.durationMs;
            metadata.images = undefined; metadata.primaryImageId = undefined;
            metadata.naturalWidth = undefined; metadata.naturalHeight = undefined;
            metadata.bytes = undefined; metadata.mimeType = undefined;
            metadata.videoTaskId = undefined; metadata.videoStatusMessage = undefined; metadata.videoTaskProvider = undefined;
            metadata.status = 'success'; metadata.errorDetails = undefined;
        }
        result[nodeIndex] = { ...node, title: shot.title, ...(changedMedia ? { type: shot.adoptedMedia!.kind as CanvasNodeType } : {}), metadata };
    }
    for (let index = 0; index < result.length; index++) {
        const node = result[index];
        if (node.metadata?.productionShotId && !claimed.has(node.id)) result[index] = { ...node, metadata: { ...node.metadata, productionShotId: undefined } };
    }
    return { production, nodes: result };
}

/** Node layout/media generation never rewrites adopted assets; only shared text edits map back. */
export function productionFromCanvasNodes(production: ProductionDocument, previousNodes: CanvasNodeData[], nextNodes: CanvasNodeData[]): ProductionDocument {
    const before = new Map(previousNodes.map(node => [node.id, node])), after = new Map(nextNodes.map(node => [node.id, node]));
    let result = production;
    for (const shot of production.shots) {
        if (!shot.nodeId) continue;
        const node = after.get(shot.nodeId), old = before.get(shot.nodeId);
        if (!node) { result = applyProductionOperation(result, { type: 'shot.upsert', shot: { ...shot, nodeId: undefined } }); continue; }
        if (!old) continue;
        const title = node.title !== old.title ? node.title : shot.title;
        const prompt = node.metadata?.prompt !== old.metadata?.prompt ? node.metadata?.prompt || '' : shot.prompt;
        if (title !== shot.title || prompt !== shot.prompt) result = applyProductionOperation(result, { type: 'shot.upsert', shot: { ...shot, title, prompt } });
    }
    return result;
}
