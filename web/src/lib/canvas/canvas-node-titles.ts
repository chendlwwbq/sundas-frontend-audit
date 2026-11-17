import type { CanvasNodeData } from "@/types/canvas";

/** 同名节点把标题里的序号往后推，避免多次铺开或回写都叫「镜头 1」。 */
export function uniqueNodeTitle(nodes: CanvasNodeData[], title: string) {
    const used = new Set(nodes.map((node) => node.title.trim()));
    const base = title.trim();
    if (!used.has(base)) return base;
    const match = /^(.*?)(\d+)(.*)$/.exec(base);
    const prefix = match ? match[1] : `${base} `;
    const suffix = match ? match[3] : "";
    let index = match ? Number(match[2]) : 0;
    let candidate = base;
    while (used.has(candidate)) {
        index += 1;
        candidate = `${prefix}${index}${suffix}`;
    }
    return candidate;
}
