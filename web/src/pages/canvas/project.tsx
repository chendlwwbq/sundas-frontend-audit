import { downloadCloudMedia, refreshExpiredMedia } from "@/services/media-download";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Group, MousePointerClick, Video } from "lucide-react";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { defaultConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { ensureImagePreview, uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import { nanoid } from "nanoid";
import { getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { mediaFileKind } from "@/lib/media-file";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useAssetStore } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { uniqueNodeTitle } from "@/lib/canvas/canvas-node-titles";
import { captureVideoFrame, type VideoFramePosition } from "@/lib/canvas/canvas-video-frame";
import { App } from "antd";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "@/constant/canvas";
import { ActiveConnectionPath, ConnectionPath } from "@/components/canvas/canvas-connections";
import { CanvasConfigComposer } from "@/components/canvas/canvas-config-composer";
import { CanvasConfigNodePanel } from "@/components/canvas/canvas-config-node-panel";
import { CanvasNodeContextMenu } from "@/components/canvas/canvas-context-menu";
import { CanvasBlankContextMenu } from "@/components/canvas/canvas-blank-context-menu";
import { type NodeGenerationInput } from "@/components/canvas/canvas-node-generation";
import { CanvasNodeHoverToolbar } from "@/components/canvas/canvas-node-hover-toolbar";
import { CanvasSelectionToolbar } from "@/components/canvas/canvas-selection-toolbar";
import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { Minimap } from "@/components/canvas/canvas-mini-map";
import { CanvasNode } from "@/components/canvas/canvas-node";
import type { CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar";
import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import type { StoryboardApplyPayload } from "@/components/canvas/canvas-storyboard-panel";
import { CanvasSidePanel } from "@/components/canvas/canvas-side-panel";
import { CanvasZoomControls } from "@/components/canvas/canvas-zoom-controls";
import { CanvasOverlaysLayer } from "@/components/canvas/canvas-overlays-layer";
import { createDirectorSceneFromTemplate } from "@/lib/canvas/director/director-templates";
import type { DirectorScene, DirectorSceneOutput } from "@/types/director";
import type { AdoptDirectorRender } from "@/services/api/canvas-director";

// Prompt 面板内含 24.8KB 的 @提及输入组件，仅在节点打开面板时按需下载挂载。
const CanvasNodePromptPanel = lazy(() =>
    import("@/components/canvas/canvas-node-prompt-panel").then((mod) => ({ default: mod.CanvasNodePromptPanel })),
);
import { isCanvasAccountActive, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import { matchesCanvasSession } from "@/lib/canvas/canvas-session";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { buildNodeMentionReferences, getGroupResourceNodes, isCanvasReferenceNode, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { exportCanvasProjects, formatCanvasExportProgress } from "@/lib/canvas/canvas-export";
import { applyNodeConfigPatch, audioMetadata, createCanvasNode, imageMetadata, videoMetadata } from "@/lib/canvas/canvas-node-factory";
import { applyGroupSelection, applyUngroupSelection, canGroupSelectedNodes, canUngroupSelectedNodes, collectGroupMemberNodes, findContainingGroupId, findGroupDropTarget, focusViewportForNode, getConnectionTargetAnchor, getGroupWrapRect, normalizeConnection, snapNodesIntoGroup } from "@/lib/canvas/canvas-node-geometry";
import { audioExtension, getGenerationCount, getInputSummary, hasResumableVideoTask, imageExtension, isAudioFile } from "@/lib/canvas/canvas-generation-helpers";
import { getNodeDefinition, isBuiltinNodeType as isBuiltinType, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { registerBuiltinNodes } from "@/components/canvas/nodes/builtin-nodes";
import { CanvasRefreshShell } from "@/components/canvas/canvas-refresh-shell";
import { CanvasTopBar } from "@/components/canvas/canvas-top-bar";
import { CanvasSpatialIndex } from "@/lib/canvas/canvas-spatial-index";
import { getPlayingCanvasNodeIds, subscribeCanvasPlayback } from "@/lib/canvas/canvas-media-playback";
import { prepareCanvasForTools, acceptCanvasToolProject, type ToolCloudProject } from "@/hooks/use-cloud-sync";
import type { AgentProject, CreativeToolHandoff } from "@/services/api/creative-agent";
import { canvasProductionApi } from "@/services/api/canvas-production";
import type { CharacterMedia } from "@/services/api/character-workflow";
import type { UpscaleRun } from "@/services/api/canvas-upscale";
import type { ProductionDocument, ProductionMedia } from "../../../../shared/production";
import { syncProductionBindings } from "@/lib/canvas/production-binding";
import { ConnectionCreateMenu, NodeCreateMenu, type PendingConnectionCreate } from "@/components/canvas/canvas-create-menus";
import { useCanvasBatchGeneration } from "@/pages/canvas/hooks/use-canvas-batch-generation";
import { useCanvasKeyboardAndClipboard } from "@/pages/canvas/hooks/use-canvas-keyboard-and-clipboard";
import { useCanvasProjectBootstrap } from "@/pages/canvas/hooks/use-canvas-project-bootstrap";
import {
    NODE_STATUS_ERROR,
    NODE_STATUS_SUCCESS,
    VIDEO_NODE_MAX_HEIGHT,
    VIDEO_NODE_MAX_WIDTH,
    type CanvasGenerationRequest,
    type CanvasHistoryEntry,
    type CreativeToolBase,
} from "@/pages/canvas/hooks/canvas-project-types";
import {
    CanvasNodeType,
    type CanvasAssistantImage,
    type CanvasAssistantSession,
    type CanvasConnection,
    type CanvasNodeData,
    type CanvasNodeTypeId,
    type ConnectionHandle,
    type ContextMenuState,
    type Position,
    type SelectionBox,
    type ViewportTransform,
} from "@/types/canvas";

// Register built-in nodes in the shared registry once when the module loads.
registerBuiltinNodes();

type ConnectionDropTarget = {
    nodeId: string | null;
    isNearNode: boolean;
};

// Stable empty reference array prevents `... || []` from invalidating CanvasNode's React.memo on every render.
const EMPTY_REFERENCES: CanvasResourceReference[] = [];
const CONNECTION_HANDLE_HIT_RADIUS = 40;
const CONNECTION_NODE_HIT_PADDING = 32;

export default function CanvasPage() {
    const [mounted, setMounted] = useState(false);
    const [cloudRestoreVersion, setCloudRestoreVersion] = useState(0);
    const projectId = useParams<{ id: string }>().id;
    const owner = useAuthStore((state) => state.user?.id ?? null);
    const sessionEpoch = useAuthStore((state) => state.sessionEpoch);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const restoreCloud = (event: Event) => {
            const detail = (event as CustomEvent<{ projectId: string; owner: string; sessionEpoch: number }>).detail;
            if (detail?.projectId !== projectId || detail.owner !== owner || detail.sessionEpoch !== sessionEpoch || !matchesCanvasSession(owner, sessionEpoch, useAuthStore.getState()) || !isCanvasAccountActive(owner)) return;
            setCloudRestoreVersion((version) => version + 1);
        };
        window.addEventListener("sundas:canvas-conflict-resolved", restoreCloud);
        return () => window.removeEventListener("sundas:canvas-conflict-resolved", restoreCloud);
    }, [projectId, owner, sessionEpoch]);

    if (!mounted) return <CanvasRefreshShell />;

    return <InfiniteCanvasPage key={`${projectId}:${owner}:${sessionEpoch}:${cloudRestoreVersion}`} />;
}

function measureFocusFrame(container: HTMLDivElement | null, nodeId: string) {
    if (!container) return {};
    const nodeRect = container.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)?.getBoundingClientRect();
    const panelRect = container.querySelector<HTMLElement>(`[data-node-id="${nodeId}"] [data-node-panel]`)?.getBoundingClientRect();
    const toolbarRect = document.querySelector<HTMLElement>(`[data-node-toolbar="${nodeId}"]`)?.getBoundingClientRect();
    const dockRect = document.querySelector<HTMLElement>("[data-canvas-bottom-toolbar]")?.getBoundingClientRect();
    const below = nodeRect && panelRect ? panelRect.bottom - nodeRect.bottom : 0;
    const above = nodeRect && toolbarRect ? nodeRect.top - toolbarRect.top : 0;
    return { above, below, bottomInset: dockRect && below > 0 ? Math.max(0, container.getBoundingClientRect().bottom - dockRect.top) : 0 };
}

function InfiniteCanvasPage() {
    const { message, modal } = App.useApp();
    const { t } = useTranslation();
    // Subscribe to the registry version so plugin registration changes rerender the canvas.
    const nodeRegistryVersion = useNodeRegistryVersion((state) => state.version);
    const params = useParams<{ id: string }>();
    const navigate = useNavigate();
    useSearchParams();
    const projectId = params.id || "";
    const containerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);
    const historyRef = useRef<{ past: CanvasHistoryEntry[]; future: CanvasHistoryEntry[] }>({ past: [], future: [] });
    const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
    const historyPausedRef = useRef(false);
    const invalidatedRef = useRef(false);
    const rafRef = useRef<number | null>(null);
    const nodeDraggingRef = useRef(false);
    const dragRef = useRef<{
        isDraggingNode: boolean;
        hasMoved: boolean;
        startX: number;
        startY: number;
        // Keyed by node id so drag frames look positions up in O(1) instead of scanning the array per node.
        initialSelectedNodes: Map<string, { x: number; y: number }>;
        movedIds: Set<string>;
    }>({
        isDraggingNode: false,
        hasMoved: false,
        startX: 0,
        startY: 0,
        initialSelectedNodes: new Map(),
        movedIds: new Set(),
    });

    const effectiveConfig = useEffectiveConfig();
    const addAsset = useAssetStore((state) => state.addAsset);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const createProject = useCanvasStore((state) => state.createProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const currentProject = useCanvasStore((state) => state.projects.find((project) => project.id === projectId));
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [production, setProduction] = useState<ProductionDocument>();
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [canvasTool, setCanvasTool] = useState<"select" | "pan">("pan");
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
    const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
    const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [nodeCreateMenu, setNodeCreateMenu] = useState<{ world: Position; anchor: Position } | null>(null);
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("dots");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [deleteProjectConfirmOpen, setDeleteProjectConfirmOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [projectLoaded, setProjectLoaded] = useState(false);
    const [directorScenes, setDirectorScenes] = useState<DirectorScene[]>([]);
    const [directorOpen, setDirectorOpen] = useState(false);
    const [storyboardOpen, setStoryboardOpen] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [cropNodeId, setCropNodeId] = useState<string | null>(null);
    const [maskEditNodeId, setMaskEditNodeId] = useState<string | null>(null);
    const [splitNodeId, setSplitNodeId] = useState<string | null>(null);
    const [upscaleNodeId, setUpscaleNodeId] = useState<string | null>(null);
    const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(null);
    const [creativePanel, setCreativePanel] = useState<"production" | "production-export" | "agent" | "character" | null>(null);
    const sidePanelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const [toolHandoff, setToolHandoff] = useState<CreativeToolHandoff>();
    const toolBaseRef = useRef<CreativeToolBase | null>(null);
    const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [hoverPreviewNodeId, setHoverPreviewNodeId] = useState<string | null>(null);
    const [previewImageId, setPreviewImageId] = useState<string | null>(null);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
    const [expandedBatchNodeIds, setExpandedBatchNodeIds] = useState<Set<string>>(new Set());
    const [isNodeDragging, setIsNodeDragging] = useState(false);
    const [isNodeResizing, setIsNodeResizing] = useState(false);
    const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
    const [referencePickerNodeId, setReferencePickerNodeId] = useState<string | null>(null);

    const nodesRef = useRef(nodes);
    const connectionsRef = useRef(connections);
    const productionRef = useRef(production);
    const directorScenesRef = useRef(directorScenes);
    const activeProjectIdRef = useRef(projectId);
    activeProjectIdRef.current = projectId;
    const loadedProjectIdRef = useRef<string | null>(null);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const viewportRef = useRef(viewport);
    const focusAnimRef = useRef<number | null>(null);
    const generateNodeRef = useRef<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>) | null>(null);
    const connectingParamsRef = useRef(connectingParams);
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
    const selectionBoxRef = useRef(selectionBox);
    const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
    const generationRequestsRef = useRef(new Map<string, CanvasGenerationRequest>());
    const authUserId = useAuthStore((state) => state.user?.id ?? null);
    const authReady = useAuthStore((state) => state.ready);
    const authSessionEpoch = useAuthStore((state) => state.sessionEpoch);
    const loadedAuthUserIdRef = useRef<string | null>(null);
    const loadedAuthEpochRef = useRef<number | null>(null);

    const {
        pollVideoNodeTask,
        confirmStopGeneration,
        cropImageNode,
        splitImageNode,
        maskEditImageNode,
        upscaleImageNode,
        generateAngleNode,
        handleGenerateNode,
        handleRetryNode,
        deleteBatchImage,
        retryBatchImage,
        buildNodeGenerationInputs,
    } = useCanvasBatchGeneration({
        nodesRef,
        connectionsRef,
        generationRequestsRef,
        generateNodeRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setRunningNodeId,
        setExpandedBatchNodeIds,
        setCropNodeId,
        setSplitNodeId,
        setMaskEditNodeId,
        setUpscaleNodeId,
        setAngleNodeId,
    });

    const { isLoadedCanvasCurrent, undoCanvas, redoCanvas } = useCanvasProjectBootstrap({
        projectId,
        projectTitle: currentProject?.title,
        authUserId,
        authReady,
        authSessionEpoch,
        hydrated,
        sidePanelOpen,
        creativePanel,
        projectLoaded,
        nodes,
        connections,
        production,
        directorScenes,
        chatSessions,
        activeChatId,
        backgroundMode,
        showImageInfo,
        selectedNodeIds,
        viewport,
        nodesRef,
        connectionsRef,
        productionRef,
        directorScenesRef,
        activeProjectIdRef,
        loadedProjectIdRef,
        selectedNodeIdsRef,
        viewportRef,
        focusAnimRef,
        rafRef,
        nodeDraggingRef,
        dragRef,
        generateNodeRef,
        generationRequestsRef,
        toolBaseRef,
        invalidatedRef,
        loadedAuthUserIdRef,
        loadedAuthEpochRef,
        historyRef,
        lastHistoryRef,
        historyPausedRef,
        setProjectLoaded,
        setNodes,
        setConnections,
        setProduction,
        setDirectorScenes,
        setChatSessions,
        setActiveChatId,
        setBackgroundMode,
        setShowImageInfo,
        setViewport,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setCreativePanel,
        setToolHandoff,
        setSuperResolveNodeId,
        setDirectorOpen,
        setStoryboardOpen,
        setRunningNodeId,
        setHistoryState,
        pollVideoNodeTask,
    });

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown) => {
            cleanupAssetImages({ extra, history: historyRef.current, lastHistory: lastHistoryRef.current });
        },
        [cleanupAssetImages],
    );

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useEffect(() => {
        connectingParamsRef.current = connectingParams;
        connectionTargetNodeIdRef.current = connectionTargetNodeId;
        pendingConnectionCreateRef.current = pendingConnectionCreate;
        selectionBoxRef.current = selectionBox;
    }, [connectingParams, connectionTargetNodeId, pendingConnectionCreate, selectionBox]);

    useEffect(() => {
        if (!projectLoaded) return;
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, [projectLoaded]);

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const currentViewport = viewportRef.current;
        const localX = clientX - (rect?.left || 0);
        const localY = clientY - (rect?.top || 0);

        return {
            x: (localX - currentViewport.x) / currentViewport.k,
            y: (localY - currentViewport.y) / currentViewport.k,
        };
    }, []);

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        const center = screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2, (rect?.top || 0) + (rect?.height || size.height) / 2);
        // 迁移自 BeefTV 的新节点落位：优先摆在最右节点右侧（保留 80 间距、同屏垂直居中），
        // 没有节点时才落在视口中心，避免连续新增时节点完全重叠。
        // 这里返回的是节点中心点，所以加上默认节点宽度的一半把左边缘推到间距线上。
        const existing = nodesRef.current;
        if (!existing.length) return center;
        const rightmost = existing.reduce((acc, node) => (node.position.x + node.width > acc.position.x + acc.width ? node : acc), existing[0]);
        return { x: rightmost.position.x + rightmost.width + 80 + NODE_DEFAULT_SIZE.image.width / 2, y: center.y };
    }, [screenToCanvas, size.height, size.width]);

    const setConnecting = useCallback((next: ConnectionHandle | null) => {
        connectingParamsRef.current = next;
        setConnectingParams(next);
        if (!next) {
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
        }
    }, []);

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen || !selectedNodeIdsRef.current.has(nodeId)) return;
            setToolbarNodeId(nodeId);
        },
        [nodeImageSettingsOpen],
    );

    const hideNodeToolbar = useCallback(() => {}, []);

    const connectNodes = useCallback(
        (current: ConnectionHandle, targetNodeId: string) => {
            if (current.nodeId === targetNodeId) return;

            const connection = normalizeConnection(current.nodeId, targetNodeId, nodesRef.current, current.handleType);
            if (!connection) {
                message.warning(t("canvas.projectPage.configConnection"));
                return;
            }
            const { fromNodeId, toNodeId } = connection;
            const exists = connectionsRef.current.some((conn) => conn.fromNodeId === fromNodeId && conn.toNodeId === toNodeId);
            if (!exists) {
                setConnections((prev) => [...prev, { id: `conn-${Date.now()}`, fromNodeId, toNodeId }]);
            }
            setContextMenu(null);
        },
        [message, t],
    );

    const createConnectedNode = useCallback(
        (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio, pending: PendingConnectionCreate) => {
            const metadata = type === CanvasNodeType.Config ? { model: effectiveConfig.imageModel || effectiveConfig.model, size: effectiveConfig.size, count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count) } : undefined;
            const newNode = createCanvasNode(type, pending.position, metadata);
            const connection = normalizeConnection(pending.connection.nodeId, newNode.id, [...nodesRef.current, newNode], pending.connection.handleType);
            if (!connection) {
                message.warning(t("canvas.projectPage.configConnection"));
                return;
            }
            setNodes((prev) => [...prev, newNode]);
            setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio) setDialogNodeId(newNode.id);
            setPendingConnectionCreate(null);
            setConnecting(null);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message, setConnecting, t],
    );

    const cancelPendingConnectionCreate = useCallback(() => {
        setPendingConnectionCreate(null);
        setConnecting(null);
    }, [setConnecting]);

    const getConnectionDropTarget = useCallback(
        (clientX: number, clientY: number, current: ConnectionHandle): ConnectionDropTarget => {
            const world = screenToCanvas(clientX, clientY);
            const scale = Math.max(viewportRef.current.k, 0.05);
            const padding = CONNECTION_NODE_HIT_PADDING / scale;
            const handleRadius = CONNECTION_HANDLE_HIT_RADIUS / scale;
            let isNearNode = false;
            let bestNodeId: string | null = null;
            let bestPriority = Number.POSITIVE_INFINITY;

            [...nodesRef.current]
                .reverse()
                .forEach((node) => {
                    const anchor = getConnectionTargetAnchor(node, current);
                    const dx = world.x - anchor.x;
                    const dy = world.y - anchor.y;
                    const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius;
                    const hitsInside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
                    const hitsExpanded = world.x >= node.position.x - padding && world.x <= node.position.x + node.width + padding && world.y >= node.position.y - padding && world.y <= node.position.y + node.height + padding;

                    if (!hitsHandle && !hitsInside && !hitsExpanded) return;
                    isNearNode = true;
                    if (node.id === current.nodeId || !normalizeConnection(current.nodeId, node.id, nodesRef.current, current.handleType)) return;

                    const priority = hitsInside ? 0 : hitsHandle ? 1 : 2;
                    if (priority < bestPriority) {
                        bestNodeId = node.id;
                        bestPriority = priority;
                    }
                });

            return { nodeId: bestNodeId, isNearNode };
        },
        [screenToCanvas],
    );

    const viewBounds = useMemo(() => {
        const padding = 280;
        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || size.width;
        const height = rect?.height || size.height;
        const left = -viewport.x / viewport.k - padding;
        const top = -viewport.y / viewport.k - padding;
        return { left, top, right: left + width / viewport.k + padding * 2, bottom: top + height / viewport.k + padding * 2 };
        // `nodes` keeps the container rect re-read on node changes, matching the previous behaviour when the container resizes without a size update.
    }, [nodes, size.height, size.width, viewport.k, viewport.x, viewport.y]);

    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const playingNodeIds = useSyncExternalStore(subscribeCanvasPlayback, getPlayingCanvasNodeIds, getPlayingCanvasNodeIds);
    const [spatialIndex] = useState(() => new CanvasSpatialIndex());
    useMemo(() => spatialIndex.update(nodes, connections, nodeById), [spatialIndex, nodes, connections, nodeById]);
    const visibleNodes = useMemo(() => spatialIndex.queryNodes(viewBounds, playingNodeIds), [spatialIndex, nodes, connections, viewBounds, playingNodeIds]);
    const visibleConnections = useMemo(() => spatialIndex.queryConnections(viewBounds), [spatialIndex, nodes, connections, viewBounds]);
    // The toolbar follows a single selected node selected by click, creation, marquee, or keyboard.
    // It stays hidden for multi-selection and while isNodeDragging is true.
    const singleSelectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
    const toolbarNode = (toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null) || (singleSelectedNodeId ? nodeById.get(singleSelectedNodeId) || null : null);
    const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
    const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
    const maskEditNode = maskEditNodeId ? nodeById.get(maskEditNodeId) || null : null;
    const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
    const upscaleNode = upscaleNodeId ? nodeById.get(upscaleNodeId) || null : null;
    const superResolveNode = superResolveNodeId ? nodeById.get(superResolveNodeId) || null : null;
    const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
    const contextMenuNode = contextMenu?.type === "node" ? nodeById.get(contextMenu.nodeId) || null : null;
    const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
    const previewContent = previewImageId ? previewNode?.metadata?.images?.find((image) => image.id === previewImageId)?.content : previewNode?.metadata?.content;
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const selectedNodes = useMemo(() => nodes.filter((node) => selectedNodeIds.has(node.id)), [nodes, selectedNodeIds]);
    const canGroupSelection = canGroupSelectedNodes(selectedNodeIds, nodes);
    const canUngroupSelection = canUngroupSelectedNodes(selectedNodeIds, nodes);
    const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
    const groupChildCountById = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node) => {
            const groupId = node.metadata?.groupId;
            if (groupId) map.set(groupId, (map.get(groupId) || 0) + 1);
        });
        return map;
    }, [nodes]);
    const relatedHighlight = useMemo(() => {
        const nodeIds = new Set<string>();
        const connectionIds = new Set<string>();

        if (!activeNodeId) return { nodeIds, connectionIds };

        const addNode = (nodeId: string) => {
            nodeIds.add(nodeId);
            if (nodeById.get(nodeId)?.type === CanvasNodeType.Group) nodes.forEach((node) => node.metadata?.groupId === nodeId && nodeIds.add(node.id));
        };
        addNode(activeNodeId);
        connections.forEach((connection) => {
            if (connection.fromNodeId !== activeNodeId && connection.toNodeId !== activeNodeId) return;
            connectionIds.add(connection.id);
            addNode(connection.fromNodeId);
            addNode(connection.toNodeId);
        });

        return { nodeIds, connectionIds };
    }, [activeNodeId, connections, nodeById, nodes]);

    const configInputsById = useMemo(() => {
        const map = new Map<string, NodeGenerationInput[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Config) return;
            map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections));
        });
        return map;
    }, [connections, nodes]);
    const mentionReferencesByNodeId = useMemo(() => {
        const map = new Map<string, ReturnType<typeof buildNodeMentionReferences>>();
        nodes.forEach((node) => map.set(node.id, buildNodeMentionReferences(node, nodes, connections)));
        return map;
    }, [connections, nodes]);
    const connectedNodesByNodeId = useMemo(() => {
        const map = new Map<string, CanvasNodeData[]>();
        connections.forEach((connection) => {
            const source = nodeById.get(connection.fromNodeId);
            if (!source) return;
            const connected = map.get(connection.toNodeId);
            if (connected) connected.push(source);
            else map.set(connection.toNodeId, [source]);
        });
        return map;
    }, [connections, nodeById]);
    const referenceConnectedNodeIds = useMemo(() => new Set([referencePickerNodeId, ...(referencePickerNodeId ? connectedNodesByNodeId.get(referencePickerNodeId)?.flatMap((node) => node.type === CanvasNodeType.Group ? [node.id, ...getGroupResourceNodes(node.id, nodes).map((child) => child.id)] : [node.id]) || [] : [])].filter((id): id is string => Boolean(id))), [connectedNodesByNodeId, nodes, referencePickerNodeId]);

    const createNode = useCallback(
        (type: CanvasNodeTypeId, position?: Position) => {
            const targetPosition = position || getCanvasCenter();
            const configMetadata =
                type === CanvasNodeType.Config
                    ? {
                          model: effectiveConfig.imageModel || effectiveConfig.model,
                          size: effectiveConfig.size,
                          count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                      }
                    : undefined;
            const newNode = createCanvasNode(type, targetPosition, configMetadata);

            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            const definition = getNodeDefinition(type);
            // Display-only plugin nodes with hidePanel do not open a panel; custom Panels require autoOpenPanel on creation.
            // Plugin nodes declaring useBuiltinPanel open the built-in generation panel on creation, like image nodes.
            // Built-in image, video, and config nodes retain their existing open-on-create behavior.
            const wantsPanel = definition?.hidePanel
                ? false
                : definition?.Panel
                  ? Boolean(definition.autoOpenPanel)
                  : definition?.useBuiltinPanel
                    ? true
                    : isBuiltinType(type) && type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio && type !== CanvasNodeType.Group;
            if (wantsPanel) setDialogNodeId(newNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, getCanvasCenter],
    );

    const deleteNodes = useCallback(
        (ids: Set<string>) => {
            if (!ids.size) return;
            if (nodesRef.current.some((node) => ids.has(node.id) && (node.metadata?.status !== NODE_STATUS_ERROR && (node.metadata?.status === "loading" || hasResumableVideoTask(node))))) {
                message.warning("任务已提交，结束前不能删除生成节点");
                return;
            }
            const allIds = new Set(ids);
            setNodes((prev) => {
                const next = prev.filter((node) => !allIds.has(node.id));
                return next.map((node) => {
                    const groupId = node.metadata?.groupId;
                    if (groupId && allIds.has(groupId)) return { ...node, metadata: { ...node.metadata, groupId: undefined } };
                    return node;
                });
            });
            setConnections((prev) => prev.filter((conn) => !allIds.has(conn.fromNodeId) && !allIds.has(conn.toNodeId)));
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            setHoveredNodeId((current) => (current && allIds.has(current) ? null : current));
            setToolbarNodeId((current) => (current && allIds.has(current) ? null : current));
            setDialogNodeId((current) => (current && allIds.has(current) ? null : current));
            setInfoNodeId((current) => (current && allIds.has(current) ? null : current));
            setCropNodeId((current) => (current && allIds.has(current) ? null : current));
            setMaskEditNodeId((current) => (current && allIds.has(current) ? null : current));
            setAngleNodeId((current) => (current && allIds.has(current) ? null : current));
            setPreviewNodeId((current) => (current && allIds.has(current) ? null : current));
            setRunningNodeId((current) => (current && allIds.has(current) ? null : current));
            setReferencePickerNodeId((current) => (current && allIds.has(current) ? null : current));
            setExpandedBatchNodeIds((current) => new Set([...current].filter((nodeId) => !allIds.has(nodeId))));
            setContextMenu((current) => (current?.type === "node" && allIds.has(current.nodeId) ? null : current));
            cleanupCanvasFiles({ projectId, nodes: nodesRef.current.filter((node) => !allIds.has(node.id)), chatSessions });
        },
        [chatSessions, cleanupCanvasFiles, projectId, message],
    );

    const groupSelection = useCallback(() => {
        const selectedIds = selectedNodeIdsRef.current;
        const members = collectGroupMemberNodes(selectedIds, nodesRef.current);
        if (members.length < 2) return;
        const rect = getGroupWrapRect(members);
        const created = createCanvasNode(CanvasNodeType.Group, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        const result = applyGroupSelection(selectedIds, nodesRef.current, connectionsRef.current, { ...created, position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height });
        if (!result) return;
        setNodes(result.nodes);
        setConnections(result.connections);
        setSelectedNodeIds(new Set(result.selectedIds));
        setSelectedConnectionId(null);
        setToolbarNodeId(result.selectedIds[0] || null);
        setDialogNodeId(null);
        setContextMenu(null);
    }, []);

    const ungroupSelection = useCallback((ids?: Set<string>) => {
        const result = applyUngroupSelection(ids || selectedNodeIdsRef.current, nodesRef.current, connectionsRef.current);
        if (!result) return;
        setNodes(result.nodes);
        setConnections(result.connections);
        setSelectedNodeIds(new Set(result.selectedIds));
        setSelectedConnectionId(null);
        setToolbarNodeId(result.selectedIds.length === 1 ? result.selectedIds[0] : null);
        setDialogNodeId(null);
        setContextMenu(null);
    }, []);

    const deleteConnection = useCallback((connectionId: string) => {
        setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));
        setSelectedConnectionId((current) => (current === connectionId ? null : current));
        setContextMenu((current) => (current?.type === "connection" && current.connectionId === connectionId ? null : current));
    }, []);

    const disconnectNodeReference = useCallback((fromNodeId: string, toNodeId: string) => {
        setConnections((prev) => prev.filter((connection) => connection.fromNodeId !== fromNodeId || connection.toNodeId !== toNodeId));
    }, []);

    const startNodeReferenceSelection = useCallback((nodeId: string) => {
        setReferencePickerNodeId(nodeId);
        setSelectedNodeIds(new Set([nodeId]));
        setSelectedConnectionId(null);
        setDialogNodeId(null);
    }, []);

    const exitNodeReferenceSelection = useCallback(() => {
        if (!referencePickerNodeId) return;
        setSelectedNodeIds(new Set([referencePickerNodeId]));
        setDialogNodeId(referencePickerNodeId);
        setReferencePickerNodeId(null);
    }, [referencePickerNodeId]);

    const selectNodeReference = useCallback((fromNodeId: string) => {
        if (!referencePickerNodeId || referenceConnectedNodeIds.has(fromNodeId)) return;
        const source = nodesRef.current.find((node) => node.id === fromNodeId);
        if (!source || !isCanvasReferenceNode(source, nodesRef.current)) return;
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId, toNodeId: referencePickerNodeId }]);
    }, [referenceConnectedNodeIds, referencePickerNodeId]);

    useEffect(() => {
        if (!referencePickerNodeId) return;
        const exit = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            exitNodeReferenceSelection();
        };
        window.addEventListener("keydown", exit, true);
        return () => window.removeEventListener("keydown", exit, true);
    }, [exitNodeReferenceSelection, referencePickerNodeId]);

    const deselectCanvas = useCallback(() => {
        cancelPendingConnectionCreate();
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setSelectionBox(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
    }, [cancelPendingConnectionCreate]);

    const clearCanvas = useCallback(() => {
        if (nodesRef.current.some((node) => node.metadata?.status !== NODE_STATUS_ERROR && (node.metadata?.status === "loading" || hasResumableVideoTask(node)))) {
            message.warning("存在未结束的生成任务，暂时不能清空画布");
            return;
        }
        setNodes([]);
        setConnections([]);
        setInfoNodeId(null);
        setCropNodeId(null);
        setMaskEditNodeId(null);
        setAngleNodeId(null);
        setPreviewNodeId(null);
        setRunningNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        cleanupCanvasFiles({ projectId, nodes: [], chatSessions: [] });
    }, [cleanupCanvasFiles, deselectCanvas, projectId, message]);

    const resetViewport = useCallback(() => {
        setViewport({ x: size.width / 2, y: size.height / 2, k: 1 });
        setContextMenu(null);
    }, [size.height, size.width]);

    // 迁移自 BeefTV：⌘0 / 右键菜单的「适应全部节点」。
    // 顶栏 64px、底部 Dock 约 96px 的留白要扣掉，否则节点会被压到控件底下。
    const fitAllNodes = useCallback(() => {
        const list = nodesRef.current;
        if (!list.length) {
            resetViewport();
            return;
        }
        const minX = Math.min(...list.map((node) => node.position.x));
        const minY = Math.min(...list.map((node) => node.position.y));
        const maxX = Math.max(...list.map((node) => node.position.x + node.width));
        const maxY = Math.max(...list.map((node) => node.position.y + node.height));
        const topInset = 88;
        const bottomInset = 104;
        const usableHeight = Math.max(160, size.height - topInset - bottomInset);
        const usableWidth = Math.max(160, size.width - 96);
        const k = Math.min(Math.max(Math.min(usableWidth / Math.max(1, maxX - minX), usableHeight / Math.max(1, maxY - minY)), 0.05), 1);
        setViewport({
            x: (size.width - (maxX - minX) * k) / 2 - minX * k,
            y: topInset + (usableHeight - (maxY - minY) * k) / 2 - minY * k,
            k,
        });
        setContextMenu(null);
    }, [resetViewport, size.height, size.width]);

    const focusNode = useCallback(
        (nodeId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            if (!node) return;
            setHoverPreviewNodeId(null);
            const target = focusViewportForNode(node, size, measureFocusFrame(containerRef.current, nodeId));
            setSelectedNodeIds(new Set([nodeId]));
            setSelectedConnectionId(null);
            setContextMenu(null);

            if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current);
            const start = { ...viewportRef.current };
            const duration = 450;
            const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
            let startTime: number | null = null;
            const step = (now: number) => {
                if (startTime === null) startTime = now;
                const progress = Math.min((now - startTime) / duration, 1);
                const t = easeOutCubic(progress);
                setViewport({ x: start.x + (target.x - start.x) * t, y: start.y + (target.y - start.y) * t, k: start.k + (target.k - start.k) * t });
                focusAnimRef.current = progress < 1 ? requestAnimationFrame(step) : null;
            };
            focusAnimRef.current = requestAnimationFrame(step);
        },
        [size.height, size.width],
    );

    const focusNodeRef = useRef(focusNode);
    useEffect(() => {
        focusNodeRef.current = focusNode;
    }, [focusNode]);

    const focusSelectedNode = useCallback(() => {
        const nodeId = selectedNodeIdsRef.current.values().next().value;
        if (nodeId) focusNode(nodeId);
    }, [focusNode]);

    useEffect(() => () => void (focusAnimRef.current && cancelAnimationFrame(focusAnimRef.current)), []);

    const setZoomScale = useCallback(
        (scale: number) => {
            const nextScale = Math.min(Math.max(scale, 0.05), 5);
            setViewport((prev) => ({
                x: size.width / 2 - ((size.width / 2 - prev.x) / prev.k) * nextScale,
                y: size.height / 2 - ((size.height / 2 - prev.y) / prev.k) * nextScale,
                k: nextScale,
            }));
            setContextMenu(null);
        },
        [size.height, size.width],
    );

    const createAndOpenProject = useCallback(() => {
        const id = createProject();
        navigate(`/canvas/${id}`);
    }, [createProject, navigate, t]);

    const deleteCurrentProject = useCallback(() => {
        setDeleteProjectConfirmOpen(false);
        deleteProjects([projectId]);
        cleanupAssetImages();
        navigate("/canvas");
    }, [cleanupAssetImages, deleteProjects, navigate, projectId]);

    const exportCurrentProject = useCallback(async () => {
        const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
        if (!project) return message.error(t("canvas.projectPage.notFound"));
        const toastKey = `canvas-export-${projectId}`;
        const baseLabel = t("canvas.projectPage.exporting");
        message.open({ key: toastKey, type: "loading", content: baseLabel, duration: 0 });
        try {
            await exportCanvasProjects([project], project.title || t("canvas.title"), {
                onProgress: (progress) => message.open({ key: toastKey, type: "loading", content: formatCanvasExportProgress(progress, baseLabel), duration: 0 }),
            });
            message.open({ key: toastKey, type: "success", content: t("canvas.projectPage.exported"), duration: 2.5 });
        } catch (error) {
            console.error(error);
            message.open({ key: toastKey, type: "error", content: error instanceof Error ? error.message : t("canvas.sidePanel.exportFailed"), duration: 3 });
        }
    }, [message, projectId, t]);

    const handleCanvasMouseDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            setContextMenu(null);
            setNodeCreateMenu(null);
            setHoveredNodeId(null);
            setToolbarNodeId(null);
            setDialogNodeId(null);
            if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
            if (event.button !== 0) return;

            const world = screenToCanvas(event.clientX, event.clientY);
            const nextSelectionBox = {
                startWorldX: world.x,
                startWorldY: world.y,
                currentWorldX: world.x,
                currentWorldY: world.y,
                additive: event.shiftKey,
                initialSelectedNodeIds: event.shiftKey ? Array.from(selectedNodeIdsRef.current) : [],
            };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            if (!event.shiftKey) {
                setSelectedNodeIds(new Set());
            }

            setSelectedConnectionId(null);
        },
        [cancelPendingConnectionCreate, screenToCanvas],
    );

    // Selection-only logic shared by the bubbling drag entry point and outer capture handler.
    // Returns the single target ID after the click, or null for multi-selection or deselection, to sync the toolbar.
    const selectNodeByEvent = useCallback((event: Pick<ReactMouseEvent, "shiftKey" | "metaKey" | "ctrlKey">, nodeId: string) => {
        const nextSelected = new Set(selectedNodeIdsRef.current);
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
            if (nextSelected.has(nodeId)) nextSelected.delete(nodeId);
            else nextSelected.add(nodeId);
        } else if (!nextSelected.has(nodeId)) {
            nextSelected.clear();
            nextSelected.add(nodeId);
        }
        setSelectedNodeIds(nextSelected);
        const soloId = nextSelected.size === 1 && nextSelected.has(nodeId) ? nodeId : null;
        setToolbarNodeId(soloId);
        return { nextSelected, soloId };
    }, []);

    // Capture-phase selection lets any inner element, including textarea or iframe, select the node and show its toolbar.
    // It only selects; body onMouseDown still starts dragging, so text selection inside editors does not drag the node.
    // Cache the capture result for the following bubbling drag handler to avoid applying shift-selection twice.
    const pendingSelectionRef = useRef<Set<string> | null>(null);
    const handleNodeSelectCapture = useCallback(
        (event: ReactMouseEvent, nodeId: string) => {
            if (event.button !== 0) return;
            setContextMenu(null);
            setHoveredNodeId(null);
            setSelectedConnectionId(null);
            const { nextSelected } = selectNodeByEvent(event, nodeId);
            pendingSelectionRef.current = nextSelected;
        },
        [selectNodeByEvent],
    );

    const handleNodeMouseDown = useCallback((event: ReactMouseEvent, nodeId: string) => {
        event.stopPropagation();
        // Capture already selected the node; this only starts dragging, with a fallback selection if capture did not run.
        const currentNodes = nodesRef.current;
        const nextSelected = pendingSelectionRef.current ?? selectNodeByEvent(event, nodeId).nextSelected;
        pendingSelectionRef.current = null;
        const dragIds = new Set(nextSelected);
        currentNodes.forEach((node) => {
            if (!nextSelected.has(node.id)) return;
            if (node.type === CanvasNodeType.Group) {
                currentNodes.forEach((child) => {
                    if (child.metadata?.groupId === node.id) dragIds.add(child.id);
                });
            }
        });
        const initialSelectedNodes = new Map(currentNodes.filter((node) => dragIds.has(node.id)).map((node): [string, { x: number; y: number }] => [node.id, { x: node.position.x, y: node.position.y }]));
        dragRef.current = {
            isDraggingNode: true,
            hasMoved: false,
            startX: event.clientX,
            startY: event.clientY,
            initialSelectedNodes,
            movedIds: new Set(initialSelectedNodes.keys()),
        };
        historyPausedRef.current = true;
        nodeDraggingRef.current = true;
        setIsNodeDragging(true);
    }, []);

    const finishNodeDrag = useCallback((clientX?: number, clientY?: number) => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        if (!dragRef.current.isDraggingNode) return;

        const wasClick = !dragRef.current.hasMoved && dragRef.current.initialSelectedNodes.size === 1;
        const clickedNodeId = dragRef.current.initialSelectedNodes.keys().next().value;
        const currentViewport = viewportRef.current;
        const dx = clientX == null ? 0 : (clientX - dragRef.current.startX) / currentViewport.k;
        const dy = clientY == null ? 0 : (clientY - dragRef.current.startY) / currentViewport.k;
        const initialPositions = dragRef.current.initialSelectedNodes;
        const movedIds = dragRef.current.movedIds;

        historyPausedRef.current = false;
        nodeDraggingRef.current = false;
        setIsNodeDragging(false);
        setDropTargetGroupId(null);
        if (dragRef.current.hasMoved && clientX != null && clientY != null) {
            setNodes((prev) => {
                const moved = prev.map((node) => {
                    const initial = initialPositions.get(node.id);
                    return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                });
                const targetGroup = findGroupDropTarget(movedIds, moved);
                if (targetGroup) return snapNodesIntoGroup(movedIds, moved, targetGroup);
                return moved.map((node) => {
                    if (!movedIds.has(node.id) || node.type === CanvasNodeType.Group) return node;
                    const groupId = findContainingGroupId(node, moved);
                    if (node.metadata?.groupId === groupId) return node;
                    return { ...node, metadata: { ...node.metadata, groupId } };
                });
            });
        }

        dragRef.current.isDraggingNode = false;
        dragRef.current.hasMoved = false;
        dragRef.current.initialSelectedNodes = new Map();
        dragRef.current.movedIds = new Set();
        if (wasClick && clickedNodeId) {
            const clickedNode = nodesRef.current.find((node) => node.id === clickedNodeId);
            const clickedDefinition = clickedNode ? getNodeDefinition(clickedNode.type) : undefined;
            if (clickedDefinition?.hidePanel) {
                // Clicking a display-only plugin node selects it without opening a lower panel.
                setDialogNodeId((current) => (current === clickedNodeId ? current : null));
            } else if (clickedNode?.type !== CanvasNodeType.Group) {
                setDialogNodeId(clickedNodeId);
                if (useConfigStore.getState().config.autoFocusOnSelect) {
                    // Wait for the generation panel to render so centering accounts for it.
                    requestAnimationFrame(() => focusNodeRef.current(clickedNodeId));
                }
            }
        }
    }, []);

    const handleGlobalMouseMove = useCallback(
        (event: MouseEvent) => {
            const currentViewport = viewportRef.current;

            if (dragRef.current.isDraggingNode) {
                const dx = (event.clientX - dragRef.current.startX) / currentViewport.k;
                const dy = (event.clientY - dragRef.current.startY) / currentViewport.k;
                const initialPositions = dragRef.current.initialSelectedNodes;
                const movedIds = dragRef.current.movedIds;
                if (Math.abs(event.clientX - dragRef.current.startX) > 3 || Math.abs(event.clientY - dragRef.current.startY) > 3) {
                    dragRef.current.hasMoved = true;
                }

                // Drop-target detection and node updates both run once per frame; mousemove can fire far more often than the display refreshes.
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(() => {
                    const previewNodes = nodesRef.current.map((node) => {
                        const initial = initialPositions.get(node.id);
                        return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                    });
                    setDropTargetGroupId(findGroupDropTarget(movedIds, previewNodes)?.id || null);
                    setNodes((prev) =>
                        prev.map((node) => {
                            const initial = initialPositions.get(node.id);
                            return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                        }),
                    );
                    rafRef.current = null;
                });
                return;
            }

            if (connectingParamsRef.current && !pendingConnectionCreateRef.current) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, connectingParamsRef.current);
                connectionTargetNodeIdRef.current = dropTarget.nodeId;
                setConnectionTargetNodeId(dropTarget.nodeId);
                setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            }
        },
        [finishNodeDrag, getConnectionDropTarget, screenToCanvas],
    );

    const handleGlobalPointerMove = useCallback(
        (event: PointerEvent) => {
            const currentSelection = selectionBoxRef.current;
            if (!currentSelection) return;

            if (event.buttons === 0) {
                selectionBoxRef.current = null;
                setSelectionBox(null);
                return;
            }

            const world = screenToCanvas(event.clientX, event.clientY);
            const rectX = Math.min(currentSelection.startWorldX, world.x);
            const rectY = Math.min(currentSelection.startWorldY, world.y);
            const rectW = Math.abs(world.x - currentSelection.startWorldX);
            const rectH = Math.abs(world.y - currentSelection.startWorldY);
            const nextSelected = new Set<string>(currentSelection.additive ? currentSelection.initialSelectedNodeIds : []);

            nodesRef.current
                .forEach((node) => {
                    const intersects = rectX < node.position.x + node.width && rectX + rectW > node.position.x && rectY < node.position.y + node.height && rectY + rectH > node.position.y;

                    if (intersects) nextSelected.add(node.id);
                });

            const nextSelectionBox = { ...currentSelection, currentWorldX: world.x, currentWorldY: world.y };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            setSelectedNodeIds(nextSelected);
        },
        [screenToCanvas],
    );

    const handleGlobalMouseUp = useCallback(
        (event: MouseEvent) => {
            finishNodeDrag(event.clientX, event.clientY);

            selectionBoxRef.current = null;
            setSelectionBox(null);

            if (pendingConnectionCreateRef.current) return;

            const currentConnection = connectingParamsRef.current;
            if (currentConnection) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, currentConnection);
                if (dropTarget.nodeId) {
                    connectNodes(currentConnection, dropTarget.nodeId);
                    setConnecting(null);
                } else if (dropTarget.isNearNode) {
                    setConnecting(null);
                } else {
                    setMouseWorld(screenToCanvas(event.clientX, event.clientY));
                    setPendingConnectionCreate({ connection: currentConnection, position: screenToCanvas(event.clientX, event.clientY), anchor: { x: event.clientX, y: event.clientY } });
                }
            }
        },
        [connectNodes, finishNodeDrag, getConnectionDropTarget, screenToCanvas, setConnecting],
    );

    useEffect(() => {
        const handlePointerUp = (event: PointerEvent) => finishNodeDrag(event.clientX, event.clientY);
        const cancelNodeDrag = () => finishNodeDrag();
        window.addEventListener("mousemove", handleGlobalMouseMove);
        window.addEventListener("mouseup", handleGlobalMouseUp);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", cancelNodeDrag);
        window.addEventListener("blur", cancelNodeDrag);
        window.addEventListener("pointermove", handleGlobalPointerMove);
        return () => {
            window.removeEventListener("mousemove", handleGlobalMouseMove);
            window.removeEventListener("mouseup", handleGlobalMouseUp);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", cancelNodeDrag);
            window.removeEventListener("blur", cancelNodeDrag);
            window.removeEventListener("pointermove", handleGlobalPointerMove);
        };
    }, [finishNodeDrag, handleGlobalMouseMove, handleGlobalMouseUp, handleGlobalPointerMove]);

    const createImageFileNode = useCallback(async (file: File, position: Position) => {
        const image = await uploadImage(file);
        const size = fitNodeSize(image.width, image.height);
        const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newNode: CanvasNodeData = {
            id,
            type: CanvasNodeType.Image,
            title: file.name,
            position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
            width: size.width,
            height: size.height,
            metadata: imageMetadata(image),
        };

        setNodes((prev) => [...prev, newNode]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const createVideoFileNode = useCallback(async (file: File, position: Position) => {
        const video = await uploadMediaFile(file, "video");
        const size = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
        const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Video,
                title: file.name,
                position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
                width: size.width,
                height: size.height,
                metadata: videoMetadata(video),
            },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const createAudioFileNode = useCallback(async (file: File, position: Position) => {
        const audio = await uploadMediaFile(file, "audio");
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
        const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Audio,
                title: file.name,
                position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
                width: spec.width,
                height: spec.height,
                metadata: audioMetadata(audio),
            },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
    }, []);

    const { duplicateNode, copySelectedNodes, pasteCopiedNodes, pasteSystemClipboard } = useCanvasKeyboardAndClipboard({
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        selectedConnectionId,
        dialogNodeId,
        creativePanel,
        getCanvasCenter,
        createImageFileNode,
        undoCanvas,
        redoCanvas,
        fitAllNodes,
        resetViewport,
        focusSelectedNode,
        groupSelection,
        ungroupSelection,
        canGroupSelected: canGroupSelectedNodes,
        canUngroupSelected: canUngroupSelectedNodes,
        deleteNodes,
        deleteConnection,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setNodeCreateMenu,
        setSelectionBox,
        setConnecting,
        setHoveredNodeId,
        setToolbarNodeId,
        setDialogNodeId,
        setInfoNodeId,
        setCropNodeId,
        setMaskEditNodeId,
        setPendingConnectionCreate,
        setCanvasTool,
        setCreativePanel,
    });

    const handleConnectStart = useCallback(
        (event: ReactMouseEvent, nodeId: string, handleType: "source" | "target") => {
            event.stopPropagation();
            setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            setConnecting({ nodeId, handleType });
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
        },
        [screenToCanvas, setConnecting],
    );

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, width, height, position: position || node.position } : node)));
    }, []);

    const handleNodeResizeStart = useCallback(() => {
        setIsNodeResizing(true);
    }, []);
    const handleNodeResizeEnd = useCallback(() => setIsNodeResizing(false), []);

    const toggleNodeFreeResize = useCallback((nodeId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                const freeResize = !node.metadata?.freeResize;
                if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
                const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                const height = node.width / ratio;
                return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
            }),
        );
    }, []);

    const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
        setNodes((prev) =>
            prev.map((node) =>
                node.id === nodeId
                    ? { ...node, metadata: { ...node.metadata, content, texts: node.metadata?.texts?.map((text) => (text.id === node.metadata?.primaryTextId ? { ...text, content } : text)) } }
                    : node,
            ),
        );
    }, []);

    const handleNodeTitleChange = useCallback((nodeId: string, title: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, title } : node)));
    }, []);

    const toggleBatchExpanded = useCallback((nodeId: string) => {
        setExpandedBatchNodeIds((current) => {
            const next = new Set(current);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    }, []);

    const setBatchPrimary = useCallback((nodeId: string, itemId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                if (node.type === CanvasNodeType.Text) {
                    const text = node.metadata?.texts?.find((item) => item.id === itemId);
                    return text?.content ? { ...node, metadata: { ...node.metadata, content: text.content, primaryTextId: text.id } } : node;
                }
                const image = node.metadata?.images?.find((item) => item.id === itemId);
                if (!image?.content) return node;
                const edge = Math.max(node.width, node.height);
                const size = node.metadata?.freeResize ? { width: node.width, height: node.height } : fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge);
                return {
                    ...node,
                    position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 },
                    ...size,
                    metadata: {
                        ...node.metadata,
                        content: image.content,
                        storageKey: image.storageKey,
                        naturalWidth: image.naturalWidth,
                        naturalHeight: image.naturalHeight,
                        bytes: image.bytes,
                        mimeType: image.mimeType,
                        primaryImageId: image.id,
                    },
                };
            }),
        );
    }, []);

    const duplicateBatchImage = useCallback((node: CanvasNodeData, imageId: string) => {
        const image = node.metadata?.images?.find((item) => item.id === imageId);
        if (!image?.content) return;
        const id = nanoid();
        const edge = Math.max(node.width, node.height);
        const size = fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge);
        const copy: CanvasNodeData = {
            id,
            type: CanvasNodeType.Image,
            title: node.title,
            position: { x: node.position.x + node.width * 2 + 96, y: node.position.y + node.height / 2 - size.height / 2 },
            ...size,
            metadata: {
                content: image.content,
                storageKey: image.storageKey,
                naturalWidth: image.naturalWidth,
                naturalHeight: image.naturalHeight,
                bytes: image.bytes,
                mimeType: image.mimeType,
                status: NODE_STATUS_SUCCESS,
                prompt: node.metadata?.prompt,
                generationType: node.metadata?.generationType,
                model: node.metadata?.model,
                size: node.metadata?.size,
                quality: node.metadata?.quality,
                background: node.metadata?.background,
                references: node.metadata?.references,
            },
        };
        setNodes((prev) => [...prev, copy]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt } } : node)));
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node)));
    }, []);

    const downloadNodeImage = useCallback((node: CanvasNodeData) => {
        if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
        const filename = `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(node.metadata.mimeType) : imageExtension(node.metadata.content)}`;
        if (!downloadCloudMedia(node.metadata.content, filename)) saveAs(node.metadata.content, filename);
    }, []);

    const downloadBatchImage = useCallback((node: CanvasNodeData, imageId: string) => {
        const image = node.metadata?.images?.find((item) => item.id === imageId);
        if (!image?.content) return;
        const filename = `canvas-image-${node.id}-${image.id}.${imageExtension(image.content)}`;
        if (!downloadCloudMedia(image.content, filename)) saveAs(image.content, filename);
    }, []);

    const captureVideoNodeFrame = useCallback(
        async (nodeId: string, position: VideoFramePosition) => {
            setContextMenu(null);
            const node = nodesRef.current.find((item) => item.id === nodeId);
            const video = Array.from(containerRef.current!.querySelectorAll<HTMLVideoElement>("video[data-canvas-video]")).find((item) => item.dataset.canvasVideo === nodeId);
            if (node?.type !== CanvasNodeType.Video || !node.metadata?.content || !video) return message.error(t("canvas.videoFrames.failed"));
            try {
                const image = await uploadImage(await captureVideoFrame(node.metadata.content, position, video.currentTime));
                const size = fitNodeSize(image.width, image.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                const id = nanoid();
                const x = node.position.x + node.width + 96;
                let y = node.position.y + node.height / 2 - size.height / 2;
                while (nodesRef.current.some((item) => item.id !== node.id && item.position.x < x + size.width && item.position.x + item.width > x && item.position.y < y + size.height && item.position.y + item.height > y)) y += size.height + 24;
                const child: CanvasNodeData = {
                    id,
                    type: CanvasNodeType.Image,
                    title: t(`canvas.videoFrames.${position}Title`, { name: node.title || t("assets.kinds.video") }),
                    position: { x, y },
                    ...size,
                    metadata: imageMetadata(image),
                };
                setNodes((prev) => [...prev, child]);
                setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: id }]);
                setSelectedNodeIds(new Set([id]));
                setSelectedConnectionId(null);
                setDialogNodeId(id);
                message.success(t("canvas.videoFrames.captured"));
            } catch {
                message.error(t("canvas.videoFrames.failed"));
            }
        },
        [message, t],
    );

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Text) {
                const content = node.metadata?.content?.trim();
                if (!content) return message.error(t("canvas.projectPage.noTextToSave"));
                addAsset({ kind: "text", title: node.metadata?.prompt?.slice(0, 24) || t("canvas.projectPage.canvasText"), coverUrl: "", tags: [], source: "Canvas", data: { content }, metadata: { source: "canvas", nodeId: node.id } });
                message.success(t("common.addedToAssets"));
                return;
            }
            if (node.type === CanvasNodeType.Video) {
                if (!node.metadata?.content) return message.error(t("canvas.projectPage.noVideoToSave"));
                addAsset({
                    kind: "video",
                    title: node.metadata?.prompt?.slice(0, 24) || t("canvas.projectPage.canvasVideo"),
                    coverUrl: "",
                    tags: [],
                    source: "Canvas",
                    data: { url: node.metadata.content, storageKey: node.metadata.storageKey, width: node.width, height: node.height, bytes: node.metadata.bytes || 0, mimeType: node.metadata.mimeType || "video/mp4" },
                    metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
                });
                message.success(t("common.addedToAssets"));
                return;
            }
            if (!node.metadata?.content) return message.error(t("canvas.projectPage.noImageToSave"));
            const dataUrl = node.metadata.storageKey ? "" : node.metadata.content;
            addAsset({
                kind: "image",
                title: node.metadata?.prompt?.slice(0, 24) || t("canvas.projectPage.canvasImage"),
                coverUrl: node.metadata.content,
                tags: [],
                source: "Canvas",
                data: {
                    dataUrl,
                    storageKey: node.metadata.storageKey,
                    width: node.metadata.naturalWidth || node.width,
                    height: node.metadata.naturalHeight || node.height,
                    bytes: node.metadata.bytes || getDataUrlByteSize(dataUrl),
                    mimeType: node.metadata.mimeType || "image/png",
                },
                metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
            });
            message.success(t("common.addedToAssets"));
        },
        [addAsset, message, t],
    );

    const createImageReversePromptNodes = useCallback(
        (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image || !node.metadata?.content) {
                message.warning(t("canvas.projectPage.emptyReverse"));
                return;
            }

            const gap = 96;
            const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
            const centerY = node.position.y + node.height / 2;
            const textNode = {
                ...createCanvasNode(CanvasNodeType.Text, { x: node.position.x + node.width + gap + textSpec.width / 2, y: centerY }, { content: t("canvas.projectPage.reversePreset"), prompt: t("canvas.projectPage.reversePreset"), status: NODE_STATUS_SUCCESS, fontSize: 14 }),
                title: t("canvas.projectPage.reverseTitle"),
            };
            const configNode = {
                ...createCanvasNode(
                    CanvasNodeType.Config,
                    { x: textNode.position.x + textNode.width + gap + configSpec.width / 2, y: centerY },
                    {
                        generationMode: "text",
                        model: effectiveConfig.textModel || effectiveConfig.model || defaultConfig.textModel,
                        count: 1,
                        composerContent: t("canvas.reverseComposer", { imageId: node.id, textId: textNode.id }),
                    },
                ),
                title: t("canvas.projectPage.reverseConfigTitle"),
            };

            setNodes((prev) => [...prev, textNode, configNode]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id }, { id: nanoid(), fromNodeId: textNode.id, toNodeId: configNode.id }]);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
            setContextMenu(null);
        },
        [effectiveConfig.model, effectiveConfig.textModel, message, t],
    );

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, []);

    const handleUploadRequest = useCallback((nodeId?: string, position?: Position) => {
        uploadTargetRef.current = { nodeId, position };
        imageInputRef.current?.click();
    }, []);

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const files = Array.from(event.target.files || []).filter(
                (f) => Boolean(mediaFileKind(f)) || isAudioFile(f),
            );
            if (!files.length) {
                uploadTargetRef.current = null;
                event.target.value = "";
                return;
            }

            const target = uploadTargetRef.current;
            // 单张上传时如果固定在视口中心，连续导入会全部叠在同一处；
            // 这里复用新增节点的落位策略：优先摆到最右节点右侧。
            const basePosition = target?.position || getCanvasCenter();
            // 图片节点按自然比例渲染，实际宽度通常在 640 左右；
            // 批量导入按这个量级铺成 3 列网格，避免 40px 错位导致视觉上完全重叠。
            const batchPerRow = 3;
            const batchStepX = 720;
            const batchStepY = 540;

            // When replacing a target node, use the first file as the replacement and create the rest nearby.
            if (target?.nodeId) {
                const [first, ...rest] = files;

                // Replace the target node with the first file.
                if (isAudioFile(first)) {
                    const audio = await uploadMediaFile(first, "audio");
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Audio,
                                      title: first.name,
                                      position: { x: node.position.x + node.width / 2 - spec.width / 2, y: node.position.y + node.height / 2 - spec.height / 2 },
                                      width: spec.width,
                                      height: spec.height,
                                      metadata: { ...node.metadata, ...audioMetadata(audio), errorDetails: undefined },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                } else if (mediaFileKind(first) === "video") {
                    const video = await uploadMediaFile(first, "video");
                    const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Video,
                                      title: first.name,
                                      position: { x: node.position.x + node.width / 2 - nextSize.width / 2, y: node.position.y + node.height / 2 - nextSize.height / 2 },
                                      width: nextSize.width,
                                      height: nextSize.height,
                                      metadata: { ...node.metadata, ...videoMetadata(video), errorDetails: undefined },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                } else {
                    const image = await uploadImage(first);
                    const s = fitNodeSize(image.width, image.height);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Image,
                                      title: first.name,
                                      width: s.width,
                                      height: s.height,
                                      metadata: {
                                          ...node.metadata,
                                          ...imageMetadata(image),
                                          errorDetails: undefined,
                                          freeResize: false,
                                          images: undefined,
                                          generationType: undefined,
                                          model: undefined,
                                          size: undefined,
                                          quality: undefined,
                                          count: undefined,
                                          references: undefined,
                                          primaryImageId: undefined,
                                      },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                }

                // Create the remaining files near the target node.
                for (let i = 0; i < rest.length; i++) {
                    const offsetPos = { x: basePosition.x + (i + 1) * batchStepX, y: basePosition.y + (i + 1) * batchStepY };
                    const f = rest[i];
                    if (isAudioFile(f)) {
                        void createAudioFileNode(f, offsetPos);
                    } else if (mediaFileKind(f) === "video") {
                        void createVideoFileNode(f, offsetPos);
                    } else {
                        void createImageFileNode(f, offsetPos);
                    }
                }
            } else {
                // 无替换目标时按网格铺开：40px 错位会让整批图片几乎完全重叠。
                for (let i = 0; i < files.length; i++) {
                    const offsetPos = {
                        x: basePosition.x + (i % batchPerRow) * batchStepX,
                        y: basePosition.y + Math.floor(i / batchPerRow) * batchStepY,
                    };
                    const f = files[i];
                    if (isAudioFile(f)) {
                        void createAudioFileNode(f, offsetPos);
                    } else if (f.type.startsWith("video/")) {
                        void createVideoFileNode(f, offsetPos);
                    } else {
                        void createImageFileNode(f, offsetPos);
                    }
                }
            }

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, getCanvasCenter, screenToCanvas, size.height, size.width],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const files = Array.from(event.dataTransfer.files).filter(
                (item) => Boolean(mediaFileKind(item)) || isAudioFile(item),
            );
            if (!files.length) return;

            const basePos = screenToCanvas(event.clientX, event.clientY);
            const STAGGER = 40;
            for (let i = 0; i < files.length; i++) {
                const pos = { x: basePos.x + i * STAGGER, y: basePos.y + i * STAGGER };
                const f = files[i];
                if (isAudioFile(f)) {
                    void createAudioFileNode(f, pos);
                } else if (f.type.startsWith("video/")) {
                    void createVideoFileNode(f, pos);
                } else {
                    void createImageFileNode(f, pos);
                }
            }
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas],
    );

    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentProject?.title || t("canvas.projectPage.untitledCanvas"));
        setTitleEditing(true);
    }, [currentProject?.title, t]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameProject(projectId, nextTitle);
        setTitleEditing(false);
    }, [projectId, renameProject, titleDraft]);

    // 迁移自 BeefTV：空白处右键不再只是 preventDefault，而是给出画布级操作菜单。
    const handleCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-node-id],[data-connection-id],[data-canvas-no-zoom],[data-connection-create-menu],.ant-modal,.ant-popover,.ant-dropdown")) return;
        event.preventDefault();
        setNodeCreateMenu(null);
        setPendingConnectionCreate(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setContextMenu({ type: "canvas", x: event.clientX, y: event.clientY });
    }, []);

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning(t("canvas.projectPage.emptyTextImage"));
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Config);
            const configNode = createCanvasNode(
                CanvasNodeType.Config,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                },
            );
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: configNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(configNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message, t],
    );

    const insertAssistantImage = useCallback(
        async (image: CanvasAssistantImage) => {
            const storedImage = image.storageKey ? { url: image.dataUrl, storageKey: image.storageKey, width: 1, height: 1, bytes: 0, mimeType: "image/png" } : await uploadImage(image.dataUrl);
            await ensureImagePreview(storedImage.storageKey);
            const meta = storedImage.width === 1 && storedImage.height === 1 ? await readImageMeta(storedImage.url) : storedImage;
            const config = fitNodeSize(meta.width, meta.height);
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const node: CanvasNodeData = {
                id,
                type: CanvasNodeType.Image,
                title: image.prompt.slice(0, 32) || "Generated Image",
                position: { x: center.x - config.width / 2, y: center.y - config.height / 2 },
                width: config.width,
                height: config.height,
                metadata: { ...imageMetadata({ ...storedImage, width: meta.width, height: meta.height }), prompt: image.prompt },
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [screenToCanvas, size.height, size.width],
    );

    const insertAssistantText = useCallback(
        (text: string, title?: string) => {
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const node = {
                ...createCanvasNode(CanvasNodeType.Text, center, { content: text, status: NODE_STATUS_SUCCESS }),
                title: title || text.slice(0, 32) || "Assistant Text",
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
        },
        [screenToCanvas, size.height, size.width],
    );

    const handleAssetInsert = useCallback(
        (payload: InsertAssetPayload) => {
            if (payload.kind === "text") {
                insertAssistantText(payload.content, payload.title);
            } else if (payload.kind === "audio") {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const id = `audio-${crypto.randomUUID()}`;
                setNodes(prev => [...prev, { id, type: CanvasNodeType.Audio, title: payload.title, position: { x: center.x - spec.width / 2, y: center.y - spec.height / 2 }, width: spec.width, height: spec.height, metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS } }]);
                setSelectedNodeIds(new Set([id]));
            } else if (payload.kind === "video") {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const nextSize = fitNodeSize(payload.width || spec.width, payload.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                setNodes((prev) => [
                    ...prev,
                    {
                        id,
                        type: CanvasNodeType.Video,
                        title: payload.title,
                        position: { x: center.x - nextSize.width / 2, y: center.y - nextSize.height / 2 },
                        width: nextSize.width,
                        height: nextSize.height,
                        metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height },
                    },
                ]);
                setSelectedNodeIds(new Set([id]));
            } else {
                insertAssistantImage({ id: `asset-${Date.now()}`, prompt: payload.title, dataUrl: payload.dataUrl, storageKey: payload.storageKey });
            }
            setAssetPickerOpen(false);
        },
        [insertAssistantImage, insertAssistantText, screenToCanvas, size.height, size.width],
    );

    // Memoize every callback and render function passed to CanvasNode.
    // CanvasNode uses React.memo, but new prop references would invalidate it on every render and rerender every node
    // during click, hover, or viewport changes, which is especially expensive for Markdown. These useCallback values
    // and their memoized map/handler dependencies remain stable during interaction, so unchanged nodes do not rerender.
    const handleNodeHoverStart = useCallback((nodeId: string) => {
        if (nodeDraggingRef.current) return;
        setHoveredNodeId(nodeId);
    }, []);
    const handleNodeHoverEnd = useCallback((nodeId: string) => {
        setHoveredNodeId((current) => (current === nodeId ? null : current));
    }, []);
    const handleNodeViewImage = useCallback((node: CanvasNodeData, imageId?: string) => {
        setPreviewNodeId(node.id);
        setPreviewImageId(imageId || null);
    }, []);
    const handleNodeRetry = useCallback(
        (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Text && (node.metadata?.textCount || 1) > 1) {
                void generateNodeRef.current?.(node.id, "text", node.metadata?.prompt || "");
                return;
            }
            void handleRetryNode(node);
        },
        [handleRetryNode],
    );
    const handleNodeContextMenu = useCallback((event: ReactMouseEvent, nodeId: string) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedNodeIds((current) => (current.has(nodeId) ? current : new Set([nodeId])));
        setSelectedConnectionId(null);
        setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId });
    }, []);

    const renderNodePanel = useCallback(
        (panelNode: CanvasNodeData) =>
            panelNode.type === CanvasNodeType.Config ? (
                <CanvasConfigComposer
                    nodeId={panelNode.id}
                    nodes={nodes}
                    value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                    inputs={configInputsById.get(panelNode.id) || []}
                    connectedNodes={connectedNodesByNodeId.get(panelNode.id) || []}
                    onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                    onClose={() => setDialogNodeId(null)}
                    onDisconnectReference={disconnectNodeReference}
                    onStartReferenceSelection={startNodeReferenceSelection}
                />
            ) : (
                <Suspense fallback={null}>
                    <CanvasNodePromptPanel
                        node={panelNode}
                        nodes={nodes}
                        connections={connections}
                        isRunning={runningNodeId === panelNode.id}
                        mentionReferences={mentionReferencesByNodeId.get(panelNode.id) || EMPTY_REFERENCES}
                        connectedNodes={connectedNodesByNodeId.get(panelNode.id) || []}
                        onPromptChange={handleNodePromptChange}
                        onConfigChange={handleConfigNodeChange}
                        onGenerate={handleGenerateNode}
                        onStop={confirmStopGeneration}
                        onDisconnectReference={disconnectNodeReference}
                        onStartReferenceSelection={startNodeReferenceSelection}
                        modeOverride={getNodeDefinition(panelNode.type)?.useBuiltinPanel?.mode}
                        onImageSettingsOpenChange={(open) => {
                            setNodeImageSettingsOpen(open);
                            if (open) setToolbarNodeId(null);
                        }}
                    />
                </Suspense>
            ),
        [configInputsById, confirmStopGeneration, connectedNodesByNodeId, connections, disconnectNodeReference, handleConfigNodeChange, handleGenerateNode, handleNodePromptChange, mentionReferencesByNodeId, nodes, runningNodeId, startNodeReferenceSelection],
    );

    const renderNodeContentPanel = useCallback(
        (contentNode: CanvasNodeData) => (
            <CanvasConfigNodePanel
                node={contentNode}
                nodes={nodes}
                connections={connections}
                isRunning={runningNodeId === contentNode.id}
                inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                onConfigChange={handleConfigNodeChange}
                onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                onStop={confirmStopGeneration}
                onGenerate={(nodeId) => {
                    const target = nodesRef.current.find((item) => item.id === nodeId);
                    void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                }}
            />
        ),
        [configInputsById, confirmStopGeneration, connections, handleConfigNodeChange, handleGenerateNode, nodes, runningNodeId],
    );

    const hoverPreviewNode = hoverPreviewNodeId ? nodeById.get(hoverPreviewNodeId) || null : null;
    const hoverPreviewMedia =
        hoverPreviewNode && (hoverPreviewNode.type === CanvasNodeType.Image || hoverPreviewNode.type === CanvasNodeType.Video) && hoverPreviewNode.metadata?.content
            ? {
                  video: hoverPreviewNode.type === CanvasNodeType.Video,
                  src: hoverPreviewNode.metadata.content,
                  width: hoverPreviewNode.metadata.naturalWidth || hoverPreviewNode.width,
                  height: hoverPreviewNode.metadata.naturalHeight || hoverPreviewNode.height,
              }
            : null;
    const showHoverPreview = Boolean(hoverPreviewMedia);
    const retainedPreviewRef = useRef<{ video: boolean; src: string; title: string; width: number; height: number } | null>(null);
    // Written during render on purpose: the overlay stays mounted while it fades out, so the last preview has to be
    // retained after the hovered node clears. Sizing reuses the measured container size instead of reading layout here.
    if (hoverPreviewMedia) {
        const previewSize = fitNodeSize(hoverPreviewMedia.width, hoverPreviewMedia.height, size.width * 0.9, size.height * 0.9);
        retainedPreviewRef.current = { video: hoverPreviewMedia.video, src: hoverPreviewMedia.src, title: hoverPreviewNode?.title || "", width: previewSize.width, height: previewSize.height };
    }
    const retainedPreview = retainedPreviewRef.current;

    async function prepareCreativeCanvas() {
        if (!isLoadedCanvasCurrent() || !authUserId) throw new Error("当前画布尚未准备好");
        const owner = authUserId, epoch = authSessionEpoch, id = projectId;
        const snapshot = { nodes: nodesRef.current, connections: connectionsRef.current, production: productionRef.current, directorScenes: directorScenesRef.current };
        updateProject(id, { ...snapshot, chatSessions, activeChatId, backgroundMode, showImageInfo });
        const remote = await prepareCanvasForTools(id);
        if (!isLoadedCanvasCurrent() || activeProjectIdRef.current !== id || !matchesCanvasSession(owner, epoch, useAuthStore.getState())) throw new Error("画布或账户已变化");
        if (snapshot.nodes !== nodesRef.current || snapshot.connections !== connectionsRef.current || snapshot.production !== productionRef.current || snapshot.directorScenes !== directorScenesRef.current) throw new Error("保存期间画布已有编辑，请保存后重新操作");
        const local = useCanvasStore.getState().projects.find(item => item.id === id)!;
        toolBaseRef.current = { projectId: id, owner, epoch, updatedAt: local.updatedAt, ...snapshot };
        return remote;
    }

    async function applyCreativeProject(remote: AgentProject) {
        const base = toolBaseRef.current;
        if (!isLoadedCanvasCurrent() || !base || remote.id !== projectId || activeProjectIdRef.current !== projectId || !matchesCanvasSession(base.owner, base.epoch, useAuthStore.getState())) throw new Error("操作所属画布或账户已变化");
        if (base.nodes !== nodesRef.current || base.connections !== connectionsRef.current || base.production !== productionRef.current || base.directorScenes !== directorScenesRef.current) throw new Error("执行期间已有编辑，结果保留在服务端，请先处理同步冲突");
        const local = await acceptCanvasToolProject(remote as ToolCloudProject, base.updatedAt);
        if (!isLoadedCanvasCurrent() || activeProjectIdRef.current !== projectId || !matchesCanvasSession(base.owner, base.epoch, useAuthStore.getState())) return;
        if (toolBaseRef.current !== base || base.nodes !== nodesRef.current || base.connections !== connectionsRef.current || base.production !== productionRef.current || base.directorScenes !== directorScenesRef.current) throw new Error("同步期间已有编辑，当前草稿已保留，请处理同步冲突后再采用");
        nodesRef.current = local.nodes; connectionsRef.current = local.connections; productionRef.current = local.production;
        directorScenesRef.current = local.directorScenes || [];
        setNodes(local.nodes); setConnections(local.connections); setProduction(local.production);
        setDirectorScenes(directorScenesRef.current);
        setChatSessions(local.chatSessions || []); setActiveChatId(local.activeChatId || null);
        setBackgroundMode(local.backgroundMode); setShowImageInfo(local.showImageInfo || false);
        toolBaseRef.current = { ...base, updatedAt: local.updatedAt, nodes: local.nodes, connections: local.connections, production: local.production, directorScenes: directorScenesRef.current };
    }

    function changeProduction(next: ProductionDocument) {
        if (!isLoadedCanvasCurrent()) return;
        const synced = syncProductionBindings(next, productionRef.current, nodesRef.current, nanoid);
        nodesRef.current = synced.nodes;
        productionRef.current = synced.production;
        setNodes(synced.nodes);
        setProduction(synced.production);
        updateProject(projectId, { nodes: synced.nodes, production: synced.production });
    }

    async function openUpscale(nodeId: string) {
        try {
            await prepareCreativeCanvas();
            if (isLoadedCanvasCurrent() && nodesRef.current.some(node => node.id === nodeId)) setSuperResolveNodeId(nodeId);
        } catch (error) { if (isLoadedCanvasCurrent()) message.error(friendlyErrorMessage(error instanceof Error ? error.message : String(error))); }
    }

    function openCreativeTool(handoff: NonNullable<typeof toolHandoff>) {
        if (!isLoadedCanvasCurrent() || handoff.projectId !== projectId || !nodesRef.current.some(node => node.id === handoff.nodeId)) { message.error("工具所属画布或素材已变化，请重新准备"); return; }
        setToolHandoff(handoff);
        setSelectedNodeIds(new Set([handoff.nodeId]));
        if (handoff.tool === 'upscale') { void openUpscale(handoff.nodeId); }
        else setCreativePanel('character');
    }

    function addCreativeMedia(runId: string, media: CharacterMedia[], sourceId?: string) {
        if (!isLoadedCanvasCurrent()) return;
        const source = sourceId ? nodesRef.current.find(node => node.id === sourceId) : undefined;
        const added: CanvasNodeData[] = [];
        for (const result of media) {
            if (!result.key || nodesRef.current.some(node => node.metadata?.creativeRunId === runId && node.metadata?.creativeSourceKey === result.key)) continue;
            const type = result.kind === "video" ? CanvasNodeType.Video : CanvasNodeType.Image;
            const size = fitNodeSize(result.width || 512, result.height || 512);
            added.push({ id: nanoid(), type, title: `${source?.title || "创作"} · 处理结果`, width: size.width, height: size.height,
                position: { x: (source?.position.x || 0) + (source?.width || 0) + 80, y: (source?.position.y || 0) + added.length * (size.height + 32) },
                metadata: { content: result.url || `/media/${result.key.split("/").map(encodeURIComponent).join("/")}`, status: "success", naturalWidth: result.width, naturalHeight: result.height, bytes: result.bytes, mimeType: result.mime, durationMs: result.duration === undefined ? undefined : result.duration * 1000, creativeRunId: runId, creativeSourceKey: result.key } });
        }
        if (!added.length) { message.info("结果已在当前画布中"); return; }
        nodesRef.current = [...nodesRef.current, ...added]; setNodes(nodesRef.current);
        if (source) { connectionsRef.current = [...connectionsRef.current, ...added.map(node => ({ id: nanoid(), fromNodeId: source.id, toNodeId: node.id }))]; setConnections(connectionsRef.current); }
        setSelectedNodeIds(new Set(added.map(node => node.id)));
        message.success(`已添加 ${added.length} 个处理结果到画布`);
    }

    function addUpscaleResult(run: UpscaleRun) {
        if (!run.resultUrl || !run.result) return;
        const resultUrl = new URL(run.resultUrl, window.location.origin);
        if (resultUrl.origin !== window.location.origin || !resultUrl.pathname.startsWith("/media/")) { message.error("结果尚未归档，请恢复原任务"); return; }
        addCreativeMedia(run.id, [{ key: decodeURIComponent(resultUrl.pathname.slice(7)), kind: run.purpose === "video_upscale" ? "video" : "image", url: run.resultUrl, ...run.result }], run.sourceNodeId);
    }

    async function upscaleProductionCandidate(runId: string, media: ProductionMedia) {
        if (!isLoadedCanvasCurrent() || !['image', 'video'].includes(media.kind)) return;
        const resultUrl = new URL(media.url || `/media/${media.storageKey}`, window.location.origin);
        if (resultUrl.origin !== window.location.origin || !resultUrl.pathname.startsWith('/media/private/')) throw new Error('候选尚未归档到当前账户');
        const key = decodeURIComponent(resultUrl.pathname.slice(7));
        let node = nodesRef.current.find(item => item.metadata?.creativeRunId === runId && item.metadata?.creativeSourceKey === key);
        if (!node) {
            addCreativeMedia(runId, [{ key, kind: media.kind as 'image' | 'video', url: resultUrl.pathname, ...(media.durationMs ? { duration: media.durationMs / 1000 } : {}) }]);
            node = nodesRef.current.find(item => item.metadata?.creativeRunId === runId && item.metadata?.creativeSourceKey === key);
        }
        if (!node) return;
        setToolHandoff(undefined);
        setSelectedNodeIds(new Set([node.id]));
        await openUpscale(node.id);
    }

    /* ---------------- 导演台（3D 场景搭建，迁移自 BeefTV） ---------------- */
    const activeDirectorScene = directorScenes[0] || null;

    const changeDirectorScenes = useCallback((next: DirectorScene[]) => {
        if (!isLoadedCanvasCurrent() || activeProjectIdRef.current !== projectId || !matchesCanvasSession(authUserId, authSessionEpoch, useAuthStore.getState())) throw new Error("导演台所属画布或账户已变化");
        directorScenesRef.current = next;
        setDirectorScenes(next);
        updateProject(projectId, { directorScenes: next });
    }, [projectId, authUserId, authSessionEpoch, updateProject]);

    const openDirector = useCallback(() => {
        // 首次进入自动建一条空场景，之后沿用项目里已存的那条。
        changeDirectorScenes(directorScenesRef.current.length ? directorScenesRef.current : [createDirectorSceneFromTemplate("empty", t("canvas.director.defaultScene"))]);
        setDirectorOpen(true);
    }, [changeDirectorScenes, t]);

    const saveDirectorScene = useCallback((scene: DirectorScene) => {
        const current = directorScenesRef.current;
        changeDirectorScenes(current.some((item) => item.id === scene.id) ? current.map((item) => (item.id === scene.id ? scene : item)) : [...current, scene]);
    }, [changeDirectorScenes]);

    /** 导演台上传的参考图：直接落成一张画布图片节点。 */
    const addDirectorCanvasImage = useCallback(
        async (image: Awaited<ReturnType<typeof uploadImage>>, title: string, signal: AbortSignal) => {
            if (signal.aborted || !isLoadedCanvasCurrent() || activeProjectIdRef.current !== projectId || !matchesCanvasSession(authUserId, authSessionEpoch, useAuthStore.getState())) throw new Error("导演台所属画布或账户已变化");
            const node = createCanvasNode(CanvasNodeType.Image, getCanvasCenter(), imageMetadata(image));
            node.title = title;
            nodesRef.current = [...nodesRef.current, node];
            setNodes(nodesRef.current);
            updateProject(projectId, { nodes: nodesRef.current });
            await prepareCanvasForTools(projectId);
            return { persisted: true };
        },
        [getCanvasCenter, projectId, authUserId, authSessionEpoch, updateProject],
    );

    const adoptDirectorRender = useCallback<AdoptDirectorRender>(async (task, output, target = 'canvas') => {
        const current = () => isLoadedCanvasCurrent() && activeProjectIdRef.current === projectId && matchesCanvasSession(authUserId, authSessionEpoch, useAuthStore.getState());
        if (!current()) throw new Error("导演台所属画布或账户已变化");
        if (task.status !== "completed" || !task.receipt?.outputs.some(item => item.objectKey === output.objectKey) || !task.receipt.fps) throw new Error("该任务尚无可采用的完整回执");
        if (target === 'production') {
            const project = await prepareCreativeCanvas();
            const api = canvasProductionApi(projectId);
            const preview = await api.directorMapping(task.id);
            if (!current()) throw new Error("导演台所属画布或账户已变化");
            const clientRequestId = crypto.randomUUID();
            await new Promise<void>(resolve => modal.confirm({
                title: '按切点采用到制作镜头',
                content: <div><p>采用来源版本 v{preview.sourceVersion} 的参考视频。已有对应镜头将更新素材和裁剪范围，保留名称及排序；其他镜头不变。</p><ul>{preview.mapping.map(cut => <li key={cut.shotId}>{cut.title}：{(cut.inMs / 1000).toFixed(3)}–{(cut.outMs / 1000).toFixed(3)} 秒</li>)}</ul></div>,
                okText: '确认采用', cancelText: '取消', onCancel: () => resolve(),
                onOk: async () => {
                    if (!current()) throw new Error("导演台所属画布或账户已变化");
                    const latest = await prepareCreativeCanvas();
                    if (latest.version !== project.version) throw new Error('画布已变化，请关闭后重新查看映射');
                    const result = await api.adoptDirector({ clientRequestId, expectedVersion: project.version, command: { type: 'director-adopt', renderRequestId: task.id } });
                    await applyCreativeProject(result.project);
                    message.success('已按切点采用到制作镜头'); resolve();
                },
            }));
            return;
        }
        await prepareCanvasForTools(projectId);
        if (!current()) throw new Error("导演台所属画布或账户已变化");
        const nodeId = `director-render-${task.id}-${output.frame ?? "video"}`;
        if (!nodesRef.current.some(node => node.id === nodeId)) {
            const video = task.parameters.kind === "video";
            const node = createCanvasNode(video ? CanvasNodeType.Video : CanvasNodeType.Image, getCanvasCenter(), {
                content: output.url, storageKey: output.objectKey, status: "success",
                naturalWidth: output.width, naturalHeight: output.height, mimeType: output.mime,
                bytes: Number(output.bytes), durationMs: output.duration === undefined ? undefined : output.duration * 1000,
                directorSceneId: task.sceneId, directorRenderRequestId: task.id, directorProjectVersion: task.projectVersion,
                directorOutputTarget: { kind: "sequence", sceneId: task.sceneId, sequenceId: task.parameters.sequenceId,
                    startFrame: output.frame ?? task.parameters.startFrame,
                    endFrame: output.frame === undefined ? task.parameters.endFrame : output.frame + 1,
                    fps: task.receipt.fps, fixedCameraId: task.parameters.fixedCameraId },
                workflowKind: video ? "reference_video" : "shot",
            });
            node.id = nodeId;
            node.title = uniqueNodeTitle(nodesRef.current, video ? "导演预演参考视频" : `导演参考 · 第 ${output.frame} 帧`);
            Object.assign(node, fitNodeSize(output.width, output.height));
            nodesRef.current = [...nodesRef.current, node];
            setNodes(nodesRef.current);
            updateProject(projectId, { nodes: nodesRef.current });
        }
        setSelectedNodeIds(new Set([nodeId]));
        setSelectedConnectionId(null);
        await prepareCanvasForTools(projectId);
        if (!current()) throw new Error("导演台所属画布或账户已变化");
        message.success("参考结果已加入画布");
    }, [projectId, authUserId, authSessionEpoch, getCanvasCenter, updateProject, message, modal]);

    /** 「应用到镜头」：把截图（以及可选的白膜视频）回写成画布节点。 */
    const applyDirectorOutput = useCallback(
        async (output: DirectorSceneOutput) => {
            const current = () => isLoadedCanvasCurrent() && activeProjectIdRef.current === projectId && matchesCanvasSession(authUserId, authSessionEpoch, useAuthStore.getState());
            if (!current()) throw new Error("导演台所属画布或账户已变化");
            // 同一个镜头可能多次回写，重名时把序号往后推，画布上能看出先后。
            const title = uniqueNodeTitle(nodesRef.current, output.shot?.name || output.scene.cameraSequence?.name || t("canvas.director.defaultScene"));
            const uploaded = await uploadImage(output.beauty);
            if (!current()) throw new Error("导演台所属画布或账户已变化");
            const center = getCanvasCenter();
            const imageNode = createCanvasNode(CanvasNodeType.Image, center, imageMetadata(uploaded));
            imageNode.title = title;
            imageNode.metadata = {
                ...imageNode.metadata,
                prompt: output.prompt,
                directorSceneId: output.scene.id,
                directorShotId: output.shot?.id,
                directorOutputTarget: output.target,
                workflowKind: "shot",
            };
            const additions = [imageNode];
            if (output.clayVideo) {
                const video = await uploadMediaFile(output.clayVideo, "director-clay");
                if (!current()) throw new Error("导演台所属画布或账户已变化");
                const videoNode = createCanvasNode(CanvasNodeType.Video, { x: center.x + imageNode.width + 80, y: center.y }, videoMetadata(video));
                videoNode.title = `${title} · 白膜`;
                videoNode.metadata = {
                    ...videoNode.metadata,
                    directorSceneId: output.scene.id,
                    directorShotId: output.shot?.id,
                    directorOutputTarget: output.target,
                    workflowKind: "reference_video",
                    assetTags: ["导演台白膜"],
                };
                additions.push(videoNode);
            }
            nodesRef.current = [...nodesRef.current, ...additions];
            setNodes(nodesRef.current);
            updateProject(projectId, { nodes: nodesRef.current });
            setSelectedNodeIds(new Set(additions.map((node) => node.id)));
            setSelectedConnectionId(null);
            await prepareCanvasForTools(projectId);
            if (!current()) throw new Error("导演台所属画布或账户已变化");
            message.success(t("canvas.director.applied"));
        },
        [getCanvasCenter, message, t, projectId, authUserId, authSessionEpoch, updateProject],
    );

    /** 一句话分镜：把脚本 + 每个镜头的提示词铺成画布节点，用户改完再逐个生成。 */
    const applyStoryboard = useCallback(
        (payload: StoryboardApplyPayload) => {
            if (!isLoadedCanvasCurrent() || activeProjectIdRef.current !== projectId || !matchesCanvasSession(authUserId, authSessionEpoch, useAuthStore.getState())) return;
            const center = getCanvasCenter();
            const scriptNode = createCanvasNode(CanvasNodeType.Text, center, { content: payload.scriptText, status: "success", fontSize: 13 });
            scriptNode.title = t("canvas.storyboard.scriptTitle", { title: payload.title });
            scriptNode.width = 380;
            scriptNode.height = 440;

            const imageSpec = getNodeSpec(CanvasNodeType.Image);
            const videoSpec = getNodeSpec(CanvasNodeType.Video);
            const columns = payload.shots.length > 4 ? 3 : 2;
            const rows = Math.ceil(payload.shots.length / columns);
            const gapX = 56;
            const gapY = 168;
            const scriptGap = 120;
            // 整块（脚本 + 分镜网格）居中落在当前视口中心，避免镜头铺到视野外。
            const gridWidth = columns * imageSpec.width + (columns - 1) * gapX;
            const blockWidth = scriptNode.width + scriptGap + gridWidth;
            const blockHeight = Math.max(scriptNode.height, rows * imageSpec.height + (rows - 1) * gapY);
            const startX = center.x - blockWidth / 2 + scriptNode.width + scriptGap;
            const startY = center.y - blockHeight / 2;
            scriptNode.position = { x: center.x - blockWidth / 2, y: startY };

            const created: CanvasNodeData[] = [scriptNode];
            const nextConnections: CanvasConnection[] = [];

            payload.shots.forEach((shot, index) => {
                const column = index % columns;
                const row = Math.floor(index / columns);
                const shotTitle = uniqueNodeTitle([...nodesRef.current, ...created], t("canvas.storyboard.shotTitle", { index: shot.index, duration: shot.duration }));

                const imageNode = createCanvasNode(CanvasNodeType.Image, center, { prompt: shot.prompt, status: "idle", workflowKind: "shot", shotIndex: shot.index });
                imageNode.title = shotTitle;
                imageNode.position = { x: startX + column * (imageSpec.width + gapX), y: startY + row * (imageSpec.height + gapY) };
                created.push(imageNode);
                nextConnections.push({ id: nanoid(), fromNodeId: scriptNode.id, toNodeId: imageNode.id });

                if (!payload.createVideoNodes) return;
                const videoNode = createCanvasNode(CanvasNodeType.Video, center, { prompt: shot.videoPrompt, status: "idle", workflowKind: "shot_video", shotIndex: shot.index });
                videoNode.title = `${shotTitle}${t("canvas.storyboard.videoSuffix")}`;
                videoNode.position = {
                    x: imageNode.position.x + (imageSpec.width - videoSpec.width) / 2,
                    y: imageNode.position.y + imageSpec.height + 44,
                };
                created.push(videoNode);
                nextConnections.push({ id: nanoid(), fromNodeId: imageNode.id, toNodeId: videoNode.id });
            });

            setNodes((current) => [...current, ...created]);
            setConnections((current) => [...current, ...nextConnections]);
            setSelectedNodeIds(new Set(created.map((node) => node.id)));
            setSelectedConnectionId(null);

            // 铺完把视口缩放到刚好容纳整块分镜，用户不用自己再缩放找镜头。
            const minX = Math.min(...created.map((node) => node.position.x));
            const minY = Math.min(...created.map((node) => node.position.y));
            const maxX = Math.max(...created.map((node) => node.position.x + node.width));
            const maxY = Math.max(...created.map((node) => node.position.y + node.height));
            const topInset = 88;
            const bottomInset = 104;
            const usableWidth = Math.max(160, size.width - 96);
            const usableHeight = Math.max(160, size.height - topInset - bottomInset);
            const k = Math.min(Math.max(Math.min(usableWidth / Math.max(1, maxX - minX), usableHeight / Math.max(1, maxY - minY)), 0.05), 1);
            setViewport({
                x: (size.width - (maxX - minX) * k) / 2 - minX * k,
                y: topInset + (usableHeight - (maxY - minY) * k) / 2 - minY * k,
                k,
            });

            message.success(t("canvas.storyboard.applied", { count: payload.shots.length }));
        },
        [getCanvasCenter, message, size.height, size.width, t, projectId, authUserId, authSessionEpoch],
    );

    if (!authReady || !projectLoaded || loadedProjectIdRef.current !== projectId || loadedAuthUserIdRef.current !== authUserId || !isCanvasAccountActive(authUserId)) return <CanvasRefreshShell />;

    return (
        <main className="flex h-full min-h-0 overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <CanvasSidePanel nodes={nodes} selectedNodeIds={selectedNodeIds} onFocusNode={focusNode} onPreviewNode={setPreviewNodeId} onHoverNode={setHoverPreviewNodeId} onInsertAsset={handleAssetInsert} />
            <section className="relative min-w-0 flex-1 overflow-hidden">
                <CanvasTopBar
                    title={currentProject?.title || t("canvas.projectPage.untitledCanvas")}
                    titleDraft={titleDraft}
                    isTitleEditing={titleEditing}
                    onTitleDraftChange={setTitleDraft}
                    onStartTitleEditing={startTitleEditing}
                    onFinishTitleEditing={finishTitleEditing}
                    onCancelTitleEditing={() => setTitleEditing(false)}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    onHome={() => navigate("/")}
                    onBack={() => navigate("/canvas")}
                    onProjects={() => navigate("/canvas")}
                    onCreateProject={createAndOpenProject}
                    onDeleteProject={() => setDeleteProjectConfirmOpen(true)}
                    onExportProject={exportCurrentProject}
                    onImportImage={() => handleUploadRequest()}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onOpenProduction={() => setCreativePanel("production")}
                    onOpenAgent={() => setCreativePanel("agent")}
                    onOpenCharacter={() => { setToolHandoff(undefined); setCreativePanel("character"); }}
                    onOpenUpscale={() => {
                        setToolHandoff(undefined);
                        const source = nodesRef.current.find(node => selectedNodeIdsRef.current.has(node.id) && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) && node.metadata?.content);
                        if (source) void openUpscale(source.id);
                        else message.info("请先选择有素材的图片或视频节点");
                    }}
                />

                <InfiniteCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    tool={canvasTool}
                    backgroundMode={backgroundMode}
                    onViewportChange={(next) => {
                        setViewport(next);
                        setContextMenu(null);
                    }}
                    onCanvasMouseDown={(event) => {
                        if (!referencePickerNodeId) handleCanvasMouseDown(event);
                    }}
                    onCanvasDeselect={referencePickerNodeId ? undefined : deselectCanvas}
                    onCanvasDoubleClick={(event) => {
                        if (referencePickerNodeId) return;
                        setContextMenu(null);
                        setNodeCreateMenu({ world: screenToCanvas(event.clientX, event.clientY), anchor: { x: event.clientX, y: event.clientY } });
                    }}
                    onContextMenu={handleCanvasContextMenu}
                    onDrop={handleDrop}
                >
                    <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 0 }}>
                        {visibleConnections.map(({ connection, from, to }) => (
                            <ConnectionPath
                                key={connection.id}
                                connection={connection}
                                from={from}
                                to={to}
                                active={selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id)}
                                onSelect={() => {
                                    setSelectedConnectionId(connection.id);
                                    setSelectedNodeIds(new Set());
                                    setContextMenu(null);
                                }}
                                onContextMenu={(event) => {
                                    setSelectedConnectionId(connection.id);
                                    setSelectedNodeIds(new Set());
                                    setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId: connection.id });
                                }}
                            />
                        ))}
                        {connectingParams ? <ActiveConnectionPath node={nodeById.get(connectingParams.nodeId)} handle={connectingParams} mouseWorld={mouseWorld} target={connectionTargetNodeId ? nodeById.get(connectionTargetNodeId) : undefined} /> : null}
                    </svg>

                    {visibleNodes.map((node) => (
                        <CanvasNode
                            key={node.id}
                            data={node}
                            scale={viewport.k}
                            isSelected={selectedNodeIds.has(node.id)}
                            isRelated={relatedHighlight.nodeIds.has(node.id)}
                            isFocusRelated={activeNodeId === node.id}
                            isConnectionTarget={connectionTargetNodeId === node.id}
                            isConnecting={Boolean(connectingParams)}
                            referenceSelectionState={!referencePickerNodeId ? undefined : node.id === referencePickerNodeId ? "target" : referenceConnectedNodeIds.has(node.id) || !isCanvasReferenceNode(node, nodes) ? "disabled" : "available"}
                            showPanel={!isNodeResizing && dialogNodeId === node.id && !selectionBox && !getNodeDefinition(node.type)?.hidePanel}
                            groupChildCount={groupChildCountById.get(node.id) || 0}
                            isGroupDropTarget={dropTargetGroupId === node.id}
                            batchExpanded={expandedBatchNodeIds.has(node.id)}
                            showImageInfo={showImageInfo}
                            mentionReferences={mentionReferencesByNodeId.get(node.id) || EMPTY_REFERENCES}
                            registryVersion={nodeRegistryVersion}
                            renderPanel={renderNodePanel}
                            renderNodeContent={renderNodeContentPanel}
                            onMouseDown={handleNodeMouseDown}
                            onSelectCapture={handleNodeSelectCapture}
                            onHoverStart={handleNodeHoverStart}
                            onHoverEnd={handleNodeHoverEnd}
                            onConnectStart={handleConnectStart}
                            onResizeStart={handleNodeResizeStart}
                            onResize={handleNodeResize}
                            onResizeEnd={handleNodeResizeEnd}
                            onContentChange={handleNodeContentChange}
                            onTitleChange={handleNodeTitleChange}
                            onToggleBatch={toggleBatchExpanded}
                            onSetBatchPrimary={setBatchPrimary}
                            onDuplicateBatchImage={duplicateBatchImage}
                            onDownloadBatchImage={downloadBatchImage}
                            onRetryBatchImage={retryBatchImage}
                            onDeleteBatchImage={deleteBatchImage}
                            onRetry={handleNodeRetry}
                            onViewImage={handleNodeViewImage}
                            onSelectReference={selectNodeReference}
                            onContextMenu={handleNodeContextMenu}
                        />
                    ))}

                    {selectionBox ? (
                        <svg
                            className="pointer-events-none absolute z-[var(--z-canvas-overlay)] overflow-visible"
                            style={{
                                left: Math.min(selectionBox.startWorldX, selectionBox.currentWorldX),
                                top: Math.min(selectionBox.startWorldY, selectionBox.currentWorldY),
                                width: Math.abs(selectionBox.currentWorldX - selectionBox.startWorldX),
                                height: Math.abs(selectionBox.currentWorldY - selectionBox.startWorldY),
                            }}
                        >
                            <rect width="100%" height="100%" fill={theme.canvas.selectionFill} stroke={theme.canvas.selectionStroke} strokeOpacity={0.55} strokeWidth={1 / viewport.k} strokeDasharray={`${6 / viewport.k} ${4 / viewport.k}`} />
                        </svg>
                    ) : null}
                    {pendingConnectionCreate ? <ConnectionCreateMenu pending={pendingConnectionCreate} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} /> : null}
                    {nodeCreateMenu ? (
                        <NodeCreateMenu
                            anchor={nodeCreateMenu.anchor}
                            onCreate={(type) => {
                                createNode(type, nodeCreateMenu.world);
                                setNodeCreateMenu(null);
                            }}
                            onClose={() => setNodeCreateMenu(null)}
                        />
                    ) : null}
                </InfiniteCanvas>

                {/* 迁移自 BeefTV：空画布给出「双击即添加」的入口提示，避免一进来只有一片点阵。 */}
                {!nodes.length ? (
                    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center pb-16">
                        <div className="flex flex-col items-center gap-1.5 text-center" style={{ color: theme.node.muted }}>
                            <MousePointerClick className="size-5 opacity-70" />
                            <p className="text-[12.5px] font-medium" style={{ color: theme.node.text, opacity: 0.86 }}>
                                {t("canvas.emptyHint.title")}
                            </p>
                            <p className="text-[11px] opacity-70">{t("canvas.emptyHint.description")}</p>
                        </div>
                    </div>
                ) : null}

                {referencePickerNodeId ? <button type="button" className="absolute left-1/2 top-4 z-[var(--z-canvas-overlay)] -translate-x-1/2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} onClick={exitNodeReferenceSelection}>{t("canvas.references.selectingHint")}</button> : null}

                <div
                    className="pointer-events-none absolute inset-0 z-[var(--z-canvas-menu)] flex items-center justify-center transition-opacity duration-200 ease-out"
                    style={{ background: `color-mix(in srgb, ${theme.canvas.background} 76%, transparent)`, opacity: showHoverPreview ? 1 : 0 }}
                >
                    <div
                        className="flex flex-col overflow-hidden rounded-2xl border transition-transform duration-200 ease-out"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, boxShadow: "0 24px 60px rgba(0,0,0,.32)", transform: showHoverPreview ? "scale(1)" : "scale(0.95)" }}
                    >
                        {retainedPreview ? (
                            <>
                                <div className="max-w-full truncate px-3.5 py-2 text-sm font-medium" style={{ color: theme.node.text }}>
                                    {retainedPreview.title || t(retainedPreview.video ? "assets.kinds.video" : "assets.kinds.image")}
                                </div>
                                <div className="overflow-hidden" style={{ width: retainedPreview.width, height: retainedPreview.height }}>
                                    {retainedPreview.video ? <video onError={refreshExpiredMedia} src={retainedPreview.src} muted playsInline preload="metadata" className="size-full object-contain" /> : <img src={retainedPreview.src} alt={retainedPreview.title} className="size-full object-contain" />}
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>

                <CanvasNodeHoverToolbar
                    node={isNodeDragging || isNodeResizing || nodeImageSettingsOpen || Boolean(referencePickerNodeId) || expandedBatchNodeIds.has(toolbarNode?.id || "") ? null : toolbarNode}
                    viewport={viewport}
                    viewportSize={size}
                    onKeep={keepNodeToolbar}
                    onLeave={hideNodeToolbar}
                    onInfo={(node) => setInfoNodeId(node.id)}
                    onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                    onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                    onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                    onGenerateImage={generateImageFromTextNode}
                    onUpload={(node) => handleUploadRequest(node.id)}
                    onDownload={downloadNodeImage}
                    onSaveAsset={(node) => void saveNodeAsset(node)}
                    onMaskEdit={(node) => setMaskEditNodeId(node.id)}
                    onCrop={(node) => setCropNodeId(node.id)}
                    onSplit={(node) => setSplitNodeId(node.id)}
                    onUpscale={(node) => setUpscaleNodeId(node.id)}
                    onSuperResolve={(node) => { setToolHandoff(undefined); void openUpscale(node.id); }}
                    onAngle={(node) => setAngleNodeId(node.id)}
                    onViewImage={handleNodeViewImage}
                    onReversePrompt={createImageReversePromptNodes}
                    onRetry={(node) => void handleRetryNode(node)}
                    onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                    onDelete={(node) => deleteNodes(new Set([node.id]))}
                    onUngroup={(node) => ungroupSelection(new Set([node.id]))}
                />

                {hasMultipleSelectedNodes && !selectionBox ? (
                    <CanvasSelectionToolbar
                        nodes={selectedNodes}
                        viewport={viewport}
                        viewportSize={size}
                        showToolbar={!isNodeDragging && !isNodeResizing}
                        canGroup={canGroupSelection}
                        canUngroup={canUngroupSelection}
                        onGroup={groupSelection}
                        onUngroup={ungroupSelection}
                    />
                ) : null}

                <CanvasToolbar
                    selectedCount={selectedNodeIds.size}
                    canvasTool={canvasTool}
                    onFocusSelected={focusSelectedNode}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    backgroundMode={backgroundMode}
                    showImageInfo={showImageInfo}
                    onAddImage={() => createNode(CanvasNodeType.Image)}
                    onAddVideo={() => createNode(CanvasNodeType.Video)}
                    onAddAudio={() => createNode(CanvasNodeType.Audio)}
                    onAddText={() => createNode(CanvasNodeType.Text)}
                    onAddConfig={() => createNode(CanvasNodeType.Config)}
                    onAddGroup={() => createNode(CanvasNodeType.Group)}
                    onAddExtensionNode={(type) => createNode(type)}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onUpload={() => handleUploadRequest()}
                    onOpenAssets={() => setAssetPickerOpen(true)}
                    onOpenDirector={openDirector}
                    onOpenStoryboard={() => setStoryboardOpen(true)}
                    onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                    onClear={() => setClearConfirmOpen(true)}
                    onCanvasToolChange={setCanvasTool}
                    onBackgroundModeChange={setBackgroundMode}
                    onShowImageInfoChange={setShowImageInfo}
                />

                {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

                <CanvasZoomControls scale={viewport.k} onScaleChange={setZoomScale} onReset={resetViewport} isMiniMapOpen={isMiniMapOpen} onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)} />

                {contextMenu ? (
                    contextMenu.type === "canvas" ? (
                        <CanvasBlankContextMenu
                            x={contextMenu.x}
                            y={contextMenu.y}
                            backgroundMode={backgroundMode}
                            hasNodes={nodes.length > 0}
                            onClose={() => setContextMenu(null)}
                            onPaste={() => {
                                if (!pasteCopiedNodes()) void pasteSystemClipboard();
                            }}
                            onSelectAll={() => {
                                setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
                                setSelectedConnectionId(null);
                            }}
                            onFitAll={fitAllNodes}
                            onResetZoom={resetViewport}
                            onBackgroundModeChange={setBackgroundMode}
                            onUpload={() => handleUploadRequest()}
                            onClear={() => setClearConfirmOpen(true)}
                        />
                    ) : (
                        <CanvasNodeContextMenu
                        menu={contextMenu}
                        canCaptureVideoFrame={contextMenuNode?.type === CanvasNodeType.Video && Boolean(contextMenuNode.metadata?.content)}
                        canGroup={contextMenu.type === "node" && canGroupSelection}
                        canUngroup={contextMenu.type === "node" && canUngroupSelection}
                        onClose={() => setContextMenu(null)}
                        onOpenProduction={contextMenu.type === "node" && production?.shots.some(shot => shot.nodeId === contextMenu.nodeId) ? () => { setSelectedNodeIds(new Set([contextMenu.nodeId])); setCreativePanel("production"); setContextMenu(null); } : undefined}
                        onCaptureVideoFrame={(position) => {
                            if (contextMenu.type !== "node") return;
                            void captureVideoNodeFrame(contextMenu.nodeId, position);
                        }}
                        onDuplicate={() => {
                            if (contextMenu.type !== "node") return;
                            duplicateNode(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                        onGroup={groupSelection}
                        onUngroup={ungroupSelection}
                        onDelete={() => {
                            if (contextMenu.type === "node") {
                                deleteNodes(new Set([contextMenu.nodeId]));
                            } else {
                                deleteConnection(contextMenu.connectionId);
                            }
                            setContextMenu(null);
                        }}
                        />
                    )
                ) : null}

                <input ref={imageInputRef} type="file" multiple accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" className="hidden" onChange={handleImageInputChange} />
            </section>

            <CanvasOverlaysLayer
                projectId={projectId}
                authUserId={authUserId}
                authSessionEpoch={authSessionEpoch}
                projectTitle={currentProject?.title}
                theme={theme}
                nodes={nodes}
                selectedNodeIds={selectedNodeIds}
                singleSelectedNodeId={singleSelectedNodeId || undefined}
                production={production}
                infoNode={infoNode}
                onCloseInfo={() => setInfoNodeId(null)}
                cropNode={cropNode}
                onCloseCrop={() => setCropNodeId(null)}
                onCropImage={cropImageNode}
                maskEditNode={maskEditNode}
                onCloseMaskEdit={() => setMaskEditNodeId(null)}
                onMaskEditImage={maskEditImageNode}
                splitNode={splitNode}
                onCloseSplit={() => setSplitNodeId(null)}
                onSplitImage={splitImageNode}
                upscaleNode={upscaleNode}
                onCloseUpscale={() => setUpscaleNodeId(null)}
                onUpscaleImage={upscaleImageNode}
                angleNode={angleNode}
                onCloseAngle={() => setAngleNodeId(null)}
                onAngleImage={generateAngleNode}
                superResolveNode={superResolveNode}
                onCloseSuperResolve={() => setSuperResolveNodeId(null)}
                onUpscaleResult={addUpscaleResult}
                creativePanel={creativePanel}
                onCloseCreativePanel={() => setCreativePanel(null)}
                onOpenProductionExport={() => setCreativePanel("production-export")}
                onOpenDirectorFromAgent={() => {
                    setCreativePanel(null);
                    openDirector();
                }}
                toolHandoff={toolHandoff}
                prepareCreativeCanvas={prepareCreativeCanvas}
                applyCreativeProject={applyCreativeProject}
                openCreativeTool={openCreativeTool}
                addCreativeMedia={addCreativeMedia}
                findSourceNodeIdByKey={(sourceKey) => nodesRef.current.find((node) => node.metadata?.content === `/media/${sourceKey}`)?.id}
                changeProduction={changeProduction}
                focusNode={focusNode}
                upscaleProductionCandidate={upscaleProductionCandidate}
                previewNode={previewNode}
                previewContent={previewContent}
                onClosePreview={() => setPreviewNodeId(null)}
                clearConfirmOpen={clearConfirmOpen}
                onCloseClearConfirm={() => setClearConfirmOpen(false)}
                onClearCanvas={clearCanvas}
                deleteProjectConfirmOpen={deleteProjectConfirmOpen}
                onCloseDeleteProjectConfirm={() => setDeleteProjectConfirmOpen(false)}
                onDeleteCurrentProject={deleteCurrentProject}
                directorOpen={directorOpen}
                activeDirectorScene={activeDirectorScene}
                onCloseDirector={() => setDirectorOpen(false)}
                onSaveDirectorScene={saveDirectorScene}
                onApplyDirectorOutput={applyDirectorOutput}
                onDeleteDirectorImageNode={(nodeId) => deleteNodes(new Set([nodeId]))}
                onAddDirectorCanvasImage={addDirectorCanvasImage}
                onAdoptDirectorRender={adoptDirectorRender}
                storyboardOpen={storyboardOpen}
                onCloseStoryboard={() => setStoryboardOpen(false)}
                onApplyStoryboard={applyStoryboard}
                assetPickerOpen={assetPickerOpen}
                onCloseAssetPicker={() => setAssetPickerOpen(false)}
                onInsertAsset={handleAssetInsert}
            />
        </main>
    );
}
