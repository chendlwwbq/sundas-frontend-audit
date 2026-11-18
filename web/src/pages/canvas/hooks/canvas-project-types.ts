import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { videoMetadata } from "@/lib/canvas/canvas-node-factory";
import type { UploadedFile } from "@/services/file-storage";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData } from "@/types/canvas";
import type { DirectorScene } from "@/types/director";
import type { ProductionDocument } from "../../../../../shared/production";

export type CanvasClipboard = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

export type CanvasHistoryEntry = Pick<CanvasClipboard, "nodes" | "connections"> & {
    production?: ProductionDocument;
    directorScenes: DirectorScene[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

export type CanvasGenerationRequest = {
    targetNodeId: string;
    originNodeId: string;
    runningNodeId: string;
    controller: AbortController;
};

export type CreativeToolBase = {
    projectId: string;
    owner: string;
    epoch: number;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    production?: ProductionDocument;
    directorScenes: DirectorScene[];
};

export const VIDEO_NODE_MAX_WIDTH = 420;
export const VIDEO_NODE_MAX_HEIGHT = 420;
export const NODE_STATUS_IDLE = "idle" as const;
export const NODE_STATUS_LOADING = "loading" as const;
export const NODE_STATUS_SUCCESS = "success" as const;
export const NODE_STATUS_ERROR = "error" as const;

export function applyGeneratedVideo(item: CanvasNodeData, video: UploadedFile, extra: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    const videoSize = fitNodeSize(video.width || item.width, video.height || item.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
    return {
        ...item,
        width: videoSize.width,
        height: videoSize.height,
        position: { x: item.position.x + item.width / 2 - videoSize.width / 2, y: item.position.y + item.height / 2 - videoSize.height / 2 },
        metadata: { ...item.metadata, ...videoMetadata(video), videoStatusMessage: undefined, ...extra },
    };
}

export function isRecoverableVideoCreateError(error: unknown) {
    const message = error instanceof Error ? error.message : "";
    return /（(?:502|503|504|524)）|服务异常/.test(message);
}
