import { MediaThumbnail } from "@/components/media-thumbnail";
import { FileText, Image as ImageIcon, Music2, Plus, Puzzle, Video, X } from "lucide-react";
import { Popover } from "antd";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { getGroupResourceNodes } from "@/lib/canvas/canvas-resource-references";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function CanvasNodeReferenceBar({ nodeId, nodes, connectedNodes, onDisconnect, onStartSelection, compact = false }: { nodeId: string; nodes: CanvasNodeData[]; connectedNodes: CanvasNodeData[]; onDisconnect?: (fromNodeId: string, toNodeId: string) => void; onStartSelection?: (nodeId: string) => void; compact?: boolean }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const references = connectedNodes.flatMap((sourceNode) => (sourceNode.type === CanvasNodeType.Group ? getGroupResourceNodes(sourceNode.id, nodes) : [sourceNode]).map((node) => ({ node, sourceNodeId: sourceNode.id })));
    if (compact) {
        return (
            <div className="panel-scrollbar flex items-center gap-2 overflow-x-auto py-1" aria-label={t("canvas.references.title")}>
                {references.map(({ node, sourceNodeId }) => <ReferenceItem key={`${sourceNodeId}:${node.id}`} node={node} compact onRemove={() => onDisconnect?.(sourceNodeId, nodeId)} />)}
                {onStartSelection ? (
                    <button type="button" className="grid size-11 shrink-0 place-items-center rounded-[10px] border border-dashed bg-transparent transition-colors hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: theme.composer.slotBorder, color: theme.composer.muted, background: theme.composer.slot }} title={t("canvas.references.select")} aria-label={t("canvas.references.select")} onClick={() => onStartSelection(nodeId)}>
                        <Plus className="size-4" />
                    </button>
                ) : null}
            </div>
        );
    }
    return (
        <div className="mb-2">
            <div className="mb-1.5 text-[11px] font-medium" style={{ color: theme.node.muted }}>{t("canvas.references.title")}</div>
            <div className="panel-scrollbar flex min-h-12 gap-2 overflow-x-auto pb-1">
                {references.map(({ node, sourceNodeId }) => <ReferenceItem key={`${sourceNodeId}:${node.id}`} node={node} onRemove={() => onDisconnect?.(sourceNodeId, nodeId)} />)}
                <button type="button" className="grid size-12 shrink-0 place-items-center rounded-xl border border-dashed bg-transparent transition hover:opacity-70" style={{ borderColor: theme.composer.slotBorder, color: theme.node.muted }} title={t("canvas.references.select")} aria-label={t("canvas.references.select")} onClick={() => onStartSelection?.(nodeId)}>
                    <Plus className="size-4" />
                </button>
            </div>
        </div>
    );
}

function ReferenceItem({ node, onRemove, compact = false }: { node: CanvasNodeData; onRemove: () => void; compact?: boolean }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    const content = node.metadata?.content || resource?.url;
    const thumbnail = previewUrlFor(node.metadata?.storageKey) || content;
    const Icon = resource?.kind === "image" || node.type === CanvasNodeType.Image ? ImageIcon : resource?.kind === "video" || node.type === CanvasNodeType.Video ? Video : resource?.kind === "audio" || node.type === CanvasNodeType.Audio ? Music2 : resource?.kind === "text" || node.type === CanvasNodeType.Text ? FileText : Puzzle;
    return (
        <Popover placement="topLeft" mouseEnterDelay={0.15} content={<ReferencePreview node={node} content={content} />}>
            <div className={`group relative grid shrink-0 place-items-center border ${compact ? "size-11 rounded-[10px]" : "size-12 rounded-xl"}`} style={{ background: theme.toolbar.activeBg, borderColor: theme.toolbar.border }}>
                <span className="grid size-full place-items-center overflow-hidden rounded-[inherit]">
                    {(resource?.kind === "image" || node.type === CanvasNodeType.Image) && thumbnail ? <MediaThumbnail source={thumbnail} fallback={<Icon className="size-4 opacity-65"/>} /> : (resource?.kind === "video" || node.type === CanvasNodeType.Video) && content ? <MediaThumbnail source={content} kind="video" fallback={<Icon className="size-4 opacity-65"/>} /> : <Icon className="size-4 opacity-65" />}
                </span>
                <button type="button" className={`absolute grid place-items-center rounded-full border shadow-sm transition-opacity ${compact ? "-right-1 -top-1 size-5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100" : "right-0 top-0 size-6 opacity-100"}`} style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} aria-label={t("canvas.references.disconnect")} title={t("canvas.references.disconnect")} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRemove(); }}><X className="size-3" /></button>
            </div>
        </Popover>
    );
}

function ReferencePreview({ node, content }: { node: CanvasNodeData; content?: string }) {
    const { t } = useTranslation();
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    if ((resource?.kind === "image" || node.type === CanvasNodeType.Image) && content) return <img src={content} alt={node.title} className="max-h-52 w-72 rounded-lg object-contain" />;
    if ((resource?.kind === "video" || node.type === CanvasNodeType.Video) && content) return <video src={content} className="max-h-52 w-72 rounded-lg" muted controls />;
    if ((resource?.kind === "audio" || node.type === CanvasNodeType.Audio) && content) return <audio src={content} className="w-72" controls />;
    return <div className="panel-scrollbar max-h-52 w-72 overflow-auto whitespace-pre-wrap text-sm">{resource?.text || node.metadata?.content || node.metadata?.prompt || node.title || t("canvas.references.empty")}</div>;
}
