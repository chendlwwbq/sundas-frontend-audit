import type { ReactNode } from "react";

import { CanvasNodeType } from "@/types/canvas";
import { AudioNodeContent } from "./nodes/AudioNodeContent";
import { DirectorNodeContent } from "./nodes/DirectorNodeContent";
import { ImageInfoBar, ImageNodeContent } from "./nodes/ImageNodeContent";
import { EmptyImageContent, ErrorContent, GroupNodeContent, LoadingContent, MissingPluginContent, type NodeContentRendererProps } from "./nodes/NodeShared";
import { TextNodeContent } from "./nodes/TextNodeContent";
import { VideoNodeContent } from "./nodes/VideoNodeContent";

export type { NodeContentRendererProps };
export { ImageInfoBar };

export function NodeContent(props: NodeContentRendererProps) {
    if (props.node.type === CanvasNodeType.Config && props.renderNodeContent) return props.renderNodeContent(props.node);
    if (props.isBatchRoot && props.node.type === CanvasNodeType.Image) return <ImageNodeContent {...props} />;
    if (props.node.type === CanvasNodeType.Text && props.node.metadata?.texts?.length && props.node.metadata.status !== "error") return <TextNodeContent {...props} />;
    if (props.node.metadata?.status === "loading") return <LoadingContent theme={props.theme} node={props.node} />;
    if (props.node.metadata?.status === "error") return <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />;
    if (props.node.type === "director") return <DirectorNodeContent {...props} />;

    const Renderer = nodeContentRenderers[props.node.type as CanvasNodeType];
    if (Renderer) return <Renderer {...props} />;

    return <MissingPluginContent theme={props.theme} type={props.node.type} />;
}

const nodeContentRenderers = {
    [CanvasNodeType.Text]: TextNodeContent,
    [CanvasNodeType.Image]: ImageNodeContent,
    [CanvasNodeType.Config]: EmptyImageContent,
    [CanvasNodeType.Video]: VideoNodeContent,
    [CanvasNodeType.Audio]: AudioNodeContent,
    [CanvasNodeType.Group]: GroupNodeContent,
} satisfies Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>;
