import type { CanvasProject } from '@/stores/canvas/use-canvas-store';
import { isProductionMediaUrl, parseProduction } from '../../../../shared/production';
import type { ImportedMedia } from '@/lib/imported-media';
import { validateDirectorSceneSequence } from '../../../../shared/director-sequence';
import { directorProductionShotId } from '../../../../shared/director-production';

/** References include server-owned media, not only offline IndexedDB keys. */
export function collectCanvasPackageMedia(value: unknown, keys = new Set<string>()): string[] {
    if (typeof value === 'string' && value.startsWith('/media/')) { if (!isProductionMediaUrl(value)) throw new Error('工程包含无效的媒体地址'); keys.add(value); }
    if (!value || typeof value !== 'object') return [...keys];
    if ('storageKey' in value && typeof value.storageKey === 'string' && value.storageKey) keys.add(value.storageKey);
    Object.values(value).forEach(item => collectCanvasPackageMedia(item, keys));
    return [...keys];
}

export function remapCanvasPackageMedia<T>(value: T, media: ImportedMedia): T {
    if (typeof value === 'string' && value.startsWith('/media/')) {
        const replacement = media.get(value);
        if (!replacement) throw new Error('工程缺少服务端素材文件，无法完整导入');
        return replacement.url as T;
    }
    if (Array.isArray(value)) return value.map(item => remapCanvasPackageMedia(item, media)) as T;
    if (!value || typeof value !== 'object') return value;
    const source = value as Record<string, unknown>;
    const key = typeof source.storageKey === 'string' ? source.storageKey : '';
    const mapped = key ? media.get(key) : undefined;
    if (key && !mapped) throw new Error('工程缺少本地素材文件，无法完整导入');
    const result: Record<string, unknown> = {};
    for (const [name, item] of Object.entries(source)) {
        if (['mediaId', 'videoTaskId', 'creativeRunId', 'creativeSourceKey'].includes(name)) continue;
        if (name === 'storageKey' && mapped) { if (mapped.key) result[name] = mapped.key; }
        else if (mapped && ['content', 'url', 'dataUrl', 'coverUrl', 'previewUrl'].includes(name) && typeof item === 'string' && /^(blob:|data:)/.test(item)) result[name] = mapped.url;
        else result[name] = remapCanvasPackageMedia(item, media);
    }
    if (mapped && ['image', 'video', 'audio'].includes(String(source.kind))) {
        if (!mapped.key) result.url = mapped.url;
        else delete result.url;
    }
    return result as T;
}

/** A restored project receives new editable identities and no executable task authorizations. */
export function remapCanvasPackageIdentities(project: CanvasProject, newId: () => string): CanvasProject {
    project.directorScenes?.forEach(validateDirectorSceneSequence);
    const nodeIds = new Map(project.nodes.map(node => [node.id, newId()]));
    const nodeRef = (id?: string) => id ? nodeIds.get(id) : undefined;
    const result: CanvasProject = { ...project, id: newId(), nodes: project.nodes.map(node => ({ ...node, id: nodeIds.get(node.id)!, metadata: node.metadata ? { ...node.metadata, groupId: nodeRef(node.metadata.groupId), references: node.metadata.references?.map(ref => nodeIds.get(ref) || ref), referenceAssetNodeIds: node.metadata.referenceAssetNodeIds?.flatMap(id => nodeRef(id) ? [nodeRef(id)!] : []), directorPreviewNodeId: nodeRef(node.metadata.directorPreviewNodeId) } : undefined })), connections: project.connections.map(edge => ({ ...edge, id: newId(), fromNodeId: nodeIds.get(edge.fromNodeId) || '', toNodeId: nodeIds.get(edge.toNodeId) || '' })) };
    // Director scene-local identities stay intact; their canvas references follow imported nodes.
    if (project.directorScenes) result.directorScenes = project.directorScenes.map(scene => ({ ...scene,
        objects: scene.objects.map(object => ({ ...object, sourceNodeId: nodeRef(object.sourceNodeId) })),
        shots: scene.shots.map(shot => ({ ...shot, previewNodeId: nodeRef(shot.previewNodeId), depthNodeId: nodeRef(shot.depthNodeId), normalNodeId: nodeRef(shot.normalNodeId) })),
    }));
    if (!project.production) return result;
    const p = structuredClone(parseProduction(project.production));
    // These shot identities are derived from scene-local cuts, which also survive import.
    const directorShots = new Set(project.directorScenes?.flatMap(scene => scene.cameraSequence?.cuts.map(cut => directorProductionShotId(scene.id, scene.cameraSequence!.id, cut.id)) || []) || []);
    const assets = new Map(p.library.map(item => [item.id, newId()])), shots = new Map(p.shots.map(item => [item.shotId, directorShots.has(item.shotId) ? item.shotId : newId()])), lines = new Map(p.narration.map(item => [item.id, newId()]));
    p.library = p.library.map(item => ({ ...item, id: assets.get(item.id)! }));
    p.shots = p.shots.map(item => ({ ...item, shotId: shots.get(item.shotId)!, nodeId: item.nodeId ? nodeIds.get(item.nodeId) : undefined, references: item.references.map(ref => ({ ...ref, assetId: assets.get(ref.assetId)! })) }));
    p.narration = p.narration.map(item => ({ ...item, id: lines.get(item.id)!, shotIds: item.shotIds.map(key => shots.get(key) || newId()) }));
    p.subtitles = p.subtitles.map(item => ({ ...item, id: newId(), narrationId: lines.get(item.narrationId)! }));
    p.composition.shots = Object.fromEntries(Object.entries(p.composition.shots).map(([key, value]) => [shots.get(key)!, value]));
    p.composition.narration = Object.fromEntries(Object.entries(p.composition.narration).map(([key, value]) => [lines.get(key)!, { ...value, anchorShotId: shots.get(value.anchorShotId) || newId() }]));
    result.nodes = result.nodes.map(node => node.metadata?.productionShotId ? { ...node, metadata: { ...node.metadata, productionShotId: shots.get(node.metadata.productionShotId) } } : node);
    result.production = parseProduction(p);
    return result;
}
