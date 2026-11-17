import type { CreativeToolHandoff } from '@/services/api/creative-agent';
import type { CanvasNodeData } from '@/types/canvas';

/** Match the server's prepared source identity; a handoff never picks another reference. */
export function validateCreativeToolHandoff(handoff: CreativeToolHandoff, project: { id: string; nodes: CanvasNodeData[] } | undefined, origin: string) {
    if (!project || project.id !== handoff.projectId) throw new Error('工具所属画布已变化，请重新准备');
    const ids = [handoff.nodeId, ...handoff.referenceNodeIds];
    if (!handoff.operationId || !Number.isInteger(handoff.projectVersion) || !handoff.sourceKey || handoff.referenceKeys.length !== handoff.referenceNodeIds.length || new Set(ids).size !== ids.length) throw new Error('工具准备记录不完整，请重新准备');
    if (handoff.tool !== 'upscale' && handoff.tool !== 'character_replacement') throw new Error('工具准备记录不受支持');
    const keys = [handoff.sourceKey, ...handoff.referenceKeys];
    ids.forEach((id, index) => {
        const node = project.nodes.find(item => item.id === id);
        const allowed = handoff.tool === 'upscale' ? ['image', 'video'] : index ? ['image'] : ['video'];
        if (!node || !allowed.includes(node.type)) throw new Error('工具引用节点已删除或类型已变化，请重新准备');
        const raw = node.metadata?.storageKey || node.metadata?.content || '';
        let key = raw;
        if (!raw || raw.includes(':') || raw.startsWith('/')) {
            try { const url = new URL(raw, origin); key = url.origin === origin && url.pathname.startsWith('/media/') ? decodeURIComponent(url.pathname.slice(7)) : ''; }
            catch { key = ''; }
        }
        if (!key || key !== keys[index]) throw new Error('工具输入素材已变化，请重新准备');
    });
    if (handoff.tool === 'upscale' && handoff.referenceNodeIds.length) throw new Error('超分准备记录包含多余参考，请重新准备');
}
