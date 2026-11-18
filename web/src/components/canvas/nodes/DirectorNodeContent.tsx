import { Clapperboard } from "lucide-react";

import { refreshExpiredMedia } from "@/services/media-download";
import { type NodeContentRendererProps, useNodeImagePreview } from "./NodeShared";

export function DirectorNodeContent({ node, theme }: NodeContentRendererProps) {
    const content = node.metadata?.directorCoverUrl || node.metadata?.content;
    const preview = useNodeImagePreview(node.metadata?.directorCoverStorageKey || node.metadata?.storageKey, content);
    const source = preview || content;
    return source ? (
        <img src={source} alt={`${node.title} 导演台场景封面`} loading="lazy" decoding="async" draggable={false} onError={refreshExpiredMedia} className="h-full w-full rounded-xl object-cover" />
    ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-3 text-center" style={{ color: theme.node.muted }}>
            <Clapperboard className="size-7" />
            <span className="text-xs">导演台场景暂无封面</span>
        </div>
    );
}
