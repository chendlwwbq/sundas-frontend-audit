import { type CanvasNodeData } from "@/types/canvas";

/** 导演台节点类型标识：sundas 的 CanvasNodeType 不新增成员，这里用开放字符串。 */
const DIRECTOR_NODE_TYPE = "director";

/** Returns the first available positive index for a new director card. */
export function nextDirectorNodeIndex(nodes: CanvasNodeData[]): number {
    const used = new Set<number>();
    for (const node of nodes) {
        if (node.type !== DIRECTOR_NODE_TYPE && !node.metadata?.directorSceneId) continue;
        const titleIndex = /^导演台(?:\s+(\d+))?$/.exec(node.title)?.[1];
        const index = Number(titleIndex || node.metadata?.shotIndex || 1);
        if (Number.isSafeInteger(index) && index > 0) used.add(index);
    }
    let candidate = 1;
    while (used.has(candidate)) candidate += 1;
    return candidate;
}
