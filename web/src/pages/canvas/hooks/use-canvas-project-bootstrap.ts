import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { App } from "antd";
import { useNavigate } from "react-router-dom";

import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { hasResumableVideoTask, hydrateAssistantImages, hydrateCanvasImages, resetInterruptedGeneration } from "@/lib/canvas/canvas-generation-helpers";
import { matchesCanvasSession } from "@/lib/canvas/canvas-session";
import { productionFromCanvasNodes } from "@/lib/canvas/production-binding";
import { useAgentBridge } from "@/pages/canvas/hooks/use-agent-bridge";
import type { CreativeToolHandoff } from "@/services/api/creative-agent";
import { useAuthStore } from "@/stores/use-auth-store";
import { isCanvasAccountActive, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import { useCloudSyncStatus } from "@/stores/use-cloud-sync-status";
import type {
    CanvasAssistantSession,
    CanvasConnection,
    CanvasNodeData,
    ContextMenuState,
    ViewportTransform,
} from "@/types/canvas";
import type { DirectorScene } from "@/types/director";
import type { ProductionDocument } from "../../../../../shared/production";
import { NODE_STATUS_ERROR, type CanvasGenerationRequest, type CanvasHistoryEntry, type CreativeToolBase } from "./canvas-project-types";

type UseCanvasProjectBootstrapOptions = {
    projectId: string;
    projectTitle?: string;
    authUserId: string | null;
    authReady: boolean;
    authSessionEpoch: number;
    hydrated: boolean;
    sidePanelOpen: boolean;
    creativePanel: "production" | "production-export" | "agent" | "character" | null;
    projectLoaded: boolean;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    production?: ProductionDocument;
    directorScenes: DirectorScene[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    selectedNodeIds: Set<string>;
    viewport: ViewportTransform;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    productionRef: MutableRefObject<ProductionDocument | undefined>;
    directorScenesRef: MutableRefObject<DirectorScene[]>;
    activeProjectIdRef: MutableRefObject<string>;
    loadedProjectIdRef: MutableRefObject<string | null>;
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    viewportRef: MutableRefObject<ViewportTransform>;
    focusAnimRef: MutableRefObject<number | null>;
    rafRef: MutableRefObject<number | null>;
    nodeDraggingRef: MutableRefObject<boolean>;
    dragRef: MutableRefObject<{ isDraggingNode: boolean }>;
    generateNodeRef: MutableRefObject<((nodeId: string, mode: any, prompt: string) => Promise<void>) | null>;
    generationRequestsRef: MutableRefObject<Map<string, CanvasGenerationRequest>>;
    toolBaseRef: MutableRefObject<CreativeToolBase | null>;
    invalidatedRef: MutableRefObject<boolean>;
    loadedAuthUserIdRef: MutableRefObject<string | null>;
    loadedAuthEpochRef: MutableRefObject<number | null>;
    historyRef: MutableRefObject<{ past: CanvasHistoryEntry[]; future: CanvasHistoryEntry[] }>;
    lastHistoryRef: MutableRefObject<CanvasHistoryEntry | null>;
    historyPausedRef: MutableRefObject<boolean>;
    setProjectLoaded: Dispatch<SetStateAction<boolean>>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setProduction: Dispatch<SetStateAction<ProductionDocument | undefined>>;
    setDirectorScenes: Dispatch<SetStateAction<DirectorScene[]>>;
    setChatSessions: Dispatch<SetStateAction<CanvasAssistantSession[]>>;
    setActiveChatId: Dispatch<SetStateAction<string | null>>;
    setBackgroundMode: Dispatch<SetStateAction<CanvasBackgroundMode>>;
    setShowImageInfo: Dispatch<SetStateAction<boolean>>;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setCreativePanel: Dispatch<SetStateAction<"production" | "production-export" | "agent" | "character" | null>>;
    setToolHandoff: Dispatch<SetStateAction<CreativeToolHandoff | undefined>>;
    setSuperResolveNodeId: Dispatch<SetStateAction<string | null>>;
    setDirectorOpen: Dispatch<SetStateAction<boolean>>;
    setStoryboardOpen: Dispatch<SetStateAction<boolean>>;
    setRunningNodeId: Dispatch<SetStateAction<string | null>>;
    setHistoryState: Dispatch<SetStateAction<{ canUndo: boolean; canRedo: boolean }>>;
    pollVideoNodeTask: (node: CanvasNodeData, silent?: boolean) => Promise<void>;
};

export function useCanvasProjectBootstrap(options: UseCanvasProjectBootstrapOptions) {
    const {
        projectId,
        projectTitle,
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
    } = options;

    const { message } = App.useApp();
    const navigate = useNavigate();
    const openProject = useCanvasStore((state) => state.openProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyingHistoryRef = useRef(false);
    const previousAuthUserIdRef = useRef(authUserId);
    const previousAuthEpochRef = useRef(authSessionEpoch);

    const currentSyncStatus = useCloudSyncStatus((state) =>
        state.owner === authUserId && state.session === authSessionEpoch ? state.projects[projectId || ""] || state.status : "reading",
    );

    const isLoadedCanvasCurrent = useCallback(
        () =>
            !invalidatedRef.current &&
            loadedProjectIdRef.current === activeProjectIdRef.current &&
            matchesCanvasSession(loadedAuthUserIdRef.current, loadedAuthEpochRef.current, useAuthStore.getState()) &&
            isCanvasAccountActive(loadedAuthUserIdRef.current),
        [activeProjectIdRef, invalidatedRef, loadedAuthEpochRef, loadedAuthUserIdRef, loadedProjectIdRef],
    );

    const createHistoryEntry = useCallback(
        (): CanvasHistoryEntry => ({
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            production: productionRef.current,
            directorScenes: directorScenesRef.current,
            chatSessions,
            activeChatId,
            backgroundMode,
            showImageInfo,
        }),
        [activeChatId, backgroundMode, chatSessions, connectionsRef, directorScenesRef, nodesRef, productionRef, showImageInfo],
    );

    // < 1440px 笔记本屏幕下左右侧栏互斥展开，避免中间画布宽度过窄。
    useEffect(() => {
        if (typeof window === "undefined" || window.innerWidth >= 1440) return;
        if (creativePanel && useCanvasSidePanelStore.getState().panelOpen) useCanvasSidePanelStore.getState().closePanel();
    }, [creativePanel]);

    useEffect(() => {
        if (typeof window === "undefined" || window.innerWidth >= 1440) return;
        if (sidePanelOpen && creativePanel) setCreativePanel(null);
    }, [sidePanelOpen, creativePanel, setCreativePanel]);

    // 存在尚未落云端或本地媒体未上传完的改动时提醒拦截，避免误关标签页丢失。
    useEffect(() => {
        if (!projectLoaded) return;
        if (
            currentSyncStatus !== "pending" &&
            currentSyncStatus !== "saving" &&
            currentSyncStatus !== "failed" &&
            currentSyncStatus !== "conflict" &&
            currentSyncStatus !== "local-media"
        ) {
            return;
        }
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [currentSyncStatus, projectLoaded]);

    useEffect(() => {
        if (previousAuthUserIdRef.current === authUserId && previousAuthEpochRef.current === authSessionEpoch) return;
        previousAuthUserIdRef.current = authUserId;
        previousAuthEpochRef.current = authSessionEpoch;
        generationRequestsRef.current.forEach((request) => request.controller.abort());
        generationRequestsRef.current.clear();
        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
        if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        historyCommitTimerRef.current = null;
        viewportSaveTimerRef.current = null;
        historyRef.current = { past: [], future: [] };
        lastHistoryRef.current = null;
        applyingHistoryRef.current = false;
        loadedAuthEpochRef.current = null;
        setHistoryState({ canUndo: false, canRedo: false });
        setProjectLoaded(false);
        setCreativePanel(null);
        setToolHandoff(undefined);
        setSuperResolveNodeId(null);
        directorScenesRef.current = [];
        setDirectorScenes([]);
        setDirectorOpen(false);
        setStoryboardOpen(false);
        toolBaseRef.current = null;
        setRunningNodeId(null);
        setNodes([]);
        setConnections([]);
        setProduction(undefined);
        setChatSessions([]);
        setActiveChatId(null);
    }, [
        authSessionEpoch,
        authUserId,
        directorScenesRef,
        generationRequestsRef,
        historyRef,
        lastHistoryRef,
        loadedAuthEpochRef,
        setActiveChatId,
        setChatSessions,
        setConnections,
        setCreativePanel,
        setDirectorOpen,
        setDirectorScenes,
        setHistoryState,
        setNodes,
        setProduction,
        setProjectLoaded,
        setRunningNodeId,
        setStoryboardOpen,
        setSuperResolveNodeId,
        setToolHandoff,
        toolBaseRef,
    ]);

    useLayoutEffect(() => {
        invalidatedRef.current = false;
        const invalidate = () => {
            invalidatedRef.current = true;
            loadedProjectIdRef.current = null;
            loadedAuthUserIdRef.current = null;
            loadedAuthEpochRef.current = null;
            toolBaseRef.current = null;
            generationRequestsRef.current.forEach((request) => request.controller.abort());
            generationRequestsRef.current.clear();
            if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
            if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
            if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            historyCommitTimerRef.current = viewportSaveTimerRef.current = null;
            focusAnimRef.current = rafRef.current = null;
            dragRef.current.isDraggingNode = nodeDraggingRef.current = false;
            historyRef.current = { past: [], future: [] };
            lastHistoryRef.current = null;
            applyingHistoryRef.current = historyPausedRef.current = false;
        };
        const retireForCloud = (event: Event) => {
            const detail = (event as CustomEvent<{ projectId: string; owner: string; sessionEpoch: number }>).detail;
            if (
                !detail ||
                detail.projectId !== projectId ||
                activeProjectIdRef.current !== projectId ||
                !matchesCanvasSession(detail.owner, detail.sessionEpoch, useAuthStore.getState()) ||
                !isCanvasAccountActive(detail.owner)
            ) {
                return;
            }
            invalidate();
        };
        window.addEventListener("sundas:canvas-conflict-resolved", retireForCloud);
        return () => {
            window.removeEventListener("sundas:canvas-conflict-resolved", retireForCloud);
            invalidate();
        };
    }, [
        activeProjectIdRef,
        dragRef,
        focusAnimRef,
        generationRequestsRef,
        historyPausedRef,
        historyRef,
        invalidatedRef,
        lastHistoryRef,
        loadedAuthEpochRef,
        loadedAuthUserIdRef,
        loadedProjectIdRef,
        nodeDraggingRef,
        projectId,
        rafRef,
        toolBaseRef,
    ]);

    useEffect(() => {
        if (!authReady || !hydrated || !isCanvasAccountActive(authUserId)) return;
        let active = true;
        setProjectLoaded(false);
        const project = openProject(projectId);
        if (!project) {
            navigate("/canvas", { replace: true });
            return;
        }

        const restore = async () => {
            const restoredNodes = await hydrateCanvasImages(resetInterruptedGeneration(project.nodes));
            const restoredSessions = await hydrateAssistantImages(project.chatSessions || []);
            if (
                !active ||
                invalidatedRef.current ||
                !matchesCanvasSession(authUserId, authSessionEpoch, useAuthStore.getState()) ||
                !isCanvasAccountActive(authUserId)
            ) {
                return;
            }
            nodesRef.current = restoredNodes;
            connectionsRef.current = project.connections;
            productionRef.current = project.production;
            directorScenesRef.current = project.directorScenes || [];
            viewportRef.current = project.viewport;
            setNodes(restoredNodes);
            setConnections(project.connections);
            setProduction(project.production);
            loadedProjectIdRef.current = projectId;
            toolBaseRef.current = null;
            setToolHandoff(undefined);
            setCreativePanel(null);
            setSuperResolveNodeId(null);
            setChatSessions(restoredSessions);
            setActiveChatId(project.activeChatId || null);
            setBackgroundMode(project.backgroundMode);
            setShowImageInfo(project.showImageInfo || false);
            setViewport(project.viewport);
            setDirectorScenes(directorScenesRef.current);
            setDirectorOpen(false);
            setStoryboardOpen(false);
            historyRef.current = { past: [], future: [] };
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
            lastHistoryRef.current = {
                nodes: restoredNodes,
                connections: project.connections,
                production: project.production,
                directorScenes: directorScenesRef.current,
                chatSessions: restoredSessions,
                activeChatId: project.activeChatId || null,
                backgroundMode: project.backgroundMode,
                showImageInfo: project.showImageInfo || false,
            };
            setHistoryState({ canUndo: false, canRedo: false });
            loadedAuthUserIdRef.current = authUserId;
            loadedAuthEpochRef.current = authSessionEpoch;
            setProjectLoaded(true);
        };
        void restore();
        return () => {
            active = false;
        };
    }, [
        authReady,
        authSessionEpoch,
        authUserId,
        connectionsRef,
        directorScenesRef,
        historyRef,
        hydrated,
        invalidatedRef,
        lastHistoryRef,
        loadedAuthEpochRef,
        loadedAuthUserIdRef,
        loadedProjectIdRef,
        navigate,
        nodesRef,
        openProject,
        productionRef,
        projectId,
        setActiveChatId,
        setBackgroundMode,
        setChatSessions,
        setConnections,
        setCreativePanel,
        setDirectorOpen,
        setDirectorScenes,
        setHistoryState,
        setNodes,
        setProduction,
        setProjectLoaded,
        setShowImageInfo,
        setStoryboardOpen,
        setSuperResolveNodeId,
        setToolHandoff,
        setViewport,
        toolBaseRef,
        viewportRef,
    ]);

    useEffect(() => {
        if (!projectLoaded) return;
        nodesRef.current.filter(hasResumableVideoTask).forEach((node) => void pollVideoNodeTask(node, true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectLoaded]);

    useEffect(() => {
        if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current || !isLoadedCanvasCurrent()) return;
        const next = createHistoryEntry();
        const previous = lastHistoryRef.current;
        if (
            previous?.nodes === next.nodes &&
            previous.connections === next.connections &&
            previous.production === next.production &&
            previous.directorScenes === next.directorScenes &&
            previous.chatSessions === next.chatSessions &&
            previous.activeChatId === next.activeChatId &&
            previous.backgroundMode === next.backgroundMode &&
            previous.showImageInfo === next.showImageInfo
        ) {
            return;
        }

        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
        const owner = loadedAuthUserIdRef.current;
        const epoch = loadedAuthEpochRef.current;
        historyCommitTimerRef.current = setTimeout(() => {
            if (
                !matchesCanvasSession(owner, epoch, useAuthStore.getState()) ||
                loadedAuthUserIdRef.current !== owner ||
                loadedAuthEpochRef.current !== epoch ||
                !isCanvasAccountActive(owner)
            ) {
                return;
            }
            const current = createHistoryEntry();
            const last = lastHistoryRef.current;
            if (!last) return;
            historyRef.current.past = [...historyRef.current.past.slice(-49), last];
            historyRef.current.future = [];
            setHistoryState({ canUndo: true, canRedo: false });
            lastHistoryRef.current = current;
            historyCommitTimerRef.current = null;
        }, 180);

        return () => {
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
        };
    }, [
        activeChatId,
        backgroundMode,
        chatSessions,
        connections,
        createHistoryEntry,
        directorScenes,
        historyPausedRef,
        historyRef,
        isLoadedCanvasCurrent,
        lastHistoryRef,
        loadedAuthEpochRef,
        loadedAuthUserIdRef,
        nodes,
        production,
        projectLoaded,
        setHistoryState,
        showImageInfo,
    ]);

    useEffect(() => {
        if (
            !projectLoaded ||
            invalidatedRef.current ||
            historyPausedRef.current ||
            !matchesCanvasSession(loadedAuthUserIdRef.current, loadedAuthEpochRef.current, useAuthStore.getState()) ||
            !isCanvasAccountActive(loadedAuthUserIdRef.current)
        ) {
            return;
        }
        if (loadedProjectIdRef.current !== projectId) return;
        updateProject(projectId, {
            nodes,
            connections,
            production: productionRef.current,
            directorScenes: directorScenesRef.current,
            chatSessions,
            activeChatId,
            backgroundMode,
            showImageInfo,
        });
    }, [
        activeChatId,
        backgroundMode,
        chatSessions,
        connections,
        directorScenes,
        directorScenesRef,
        historyPausedRef,
        invalidatedRef,
        loadedAuthEpochRef,
        loadedAuthUserIdRef,
        loadedProjectIdRef,
        nodes,
        production,
        productionRef,
        projectId,
        projectLoaded,
        showImageInfo,
        updateProject,
    ]);

    useEffect(() => {
        if (!projectLoaded || invalidatedRef.current) return;
        if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        const owner = loadedAuthUserIdRef.current;
        const epoch = loadedAuthEpochRef.current;
        viewportSaveTimerRef.current = setTimeout(() => {
            viewportSaveTimerRef.current = null;
            if (
                invalidatedRef.current ||
                !matchesCanvasSession(owner, epoch, useAuthStore.getState()) ||
                loadedAuthUserIdRef.current !== owner ||
                loadedAuthEpochRef.current !== epoch ||
                !isCanvasAccountActive(owner)
            ) {
                return;
            }
            updateProject(projectId, { viewport: viewportRef.current });
        }, 500);
        return () => {
            if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        };
    }, [invalidatedRef, loadedAuthEpochRef, loadedAuthUserIdRef, projectId, projectLoaded, updateProject, viewport, viewportRef]);

    useLayoutEffect(() => {
        if (invalidatedRef.current) return;
        const nextProduction = production ? productionFromCanvasNodes(production, nodesRef.current, nodes) : undefined;
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        productionRef.current = nextProduction;
        if (nextProduction !== production) setProduction(nextProduction);
        selectedNodeIdsRef.current = selectedNodeIds;
        viewportRef.current = viewport;
    }, [connections, connectionsRef, invalidatedRef, nodes, nodesRef, production, productionRef, selectedNodeIds, selectedNodeIdsRef, setProduction, viewport, viewportRef]);

    const applyHistory = useCallback(
        (entry: CanvasHistoryEntry) => {
            if (!isLoadedCanvasCurrent()) return;
            const history = historyRef.current;
            const owner = loadedAuthUserIdRef.current;
            const epoch = loadedAuthEpochRef.current;
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
            applyingHistoryRef.current = true;
            nodesRef.current = entry.nodes;
            productionRef.current = entry.production;
            directorScenesRef.current = entry.directorScenes;
            setNodes(entry.nodes);
            setConnections(entry.connections);
            setProduction(entry.production);
            setDirectorScenes(entry.directorScenes);
            setChatSessions(entry.chatSessions);
            setActiveChatId(entry.activeChatId);
            setBackgroundMode(entry.backgroundMode);
            setShowImageInfo(entry.showImageInfo);
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            setContextMenu(null);
            setTimeout(() => {
                if (
                    historyRef.current !== history ||
                    !matchesCanvasSession(owner, epoch, useAuthStore.getState()) ||
                    loadedAuthUserIdRef.current !== owner ||
                    loadedAuthEpochRef.current !== epoch ||
                    !isCanvasAccountActive(owner)
                ) {
                    return;
                }
                lastHistoryRef.current = entry;
                applyingHistoryRef.current = false;
                setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
            });
        },
        [
            connectionsRef,
            directorScenesRef,
            historyRef,
            isLoadedCanvasCurrent,
            lastHistoryRef,
            loadedAuthEpochRef,
            loadedAuthUserIdRef,
            nodesRef,
            productionRef,
            setActiveChatId,
            setBackgroundMode,
            setChatSessions,
            setConnections,
            setContextMenu,
            setDirectorScenes,
            setHistoryState,
            setNodes,
            setProduction,
            setSelectedConnectionId,
            setSelectedNodeIds,
            setShowImageInfo,
        ],
    );

    const undoCanvas = useCallback(() => {
        if (!isLoadedCanvasCurrent()) return;
        const target = historyRef.current.past.at(-1);
        if (
            target &&
            nodesRef.current.some(
                (node) =>
                    node.metadata?.status !== NODE_STATUS_ERROR &&
                    (node.metadata?.status === "loading" || hasResumableVideoTask(node)) &&
                    !target.nodes.some(
                        (item) =>
                            item.id === node.id &&
                            item.metadata?.videoTaskId === node.metadata?.videoTaskId &&
                            item.metadata?.status === node.metadata?.status,
                    ),
            )
        ) {
            message.warning("任务已提交，不能撤销删除或重置生成节点");
            return;
        }
        const previous = historyRef.current.past.pop();
        const current = lastHistoryRef.current;
        if (!previous || !current) return;
        historyRef.current.future.push(current);
        applyHistory(previous);
    }, [applyHistory, historyRef, isLoadedCanvasCurrent, lastHistoryRef, message, nodesRef]);

    const redoCanvas = useCallback(() => {
        if (!isLoadedCanvasCurrent()) return;
        const target = historyRef.current.future.at(-1);
        if (
            target &&
            nodesRef.current.some(
                (node) =>
                    node.metadata?.status !== NODE_STATUS_ERROR &&
                    (node.metadata?.status === "loading" || hasResumableVideoTask(node)) &&
                    !target.nodes.some(
                        (item) =>
                            item.id === node.id &&
                            item.metadata?.videoTaskId === node.metadata?.videoTaskId &&
                            item.metadata?.status === node.metadata?.status,
                    ),
            )
        ) {
            message.warning("任务已提交，不能重做删除或重置生成节点");
            return;
        }
        const next = historyRef.current.future.pop();
        const current = lastHistoryRef.current;
        if (!next || !current) return;
        historyRef.current.past.push(current);
        applyHistory(next);
    }, [applyHistory, historyRef, isLoadedCanvasCurrent, lastHistoryRef, message, nodesRef]);

    useAgentBridge({
        active: projectLoaded,
        projectId,
        title: projectTitle,
        nodes,
        connections,
        selectedNodeIds,
        viewport,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        viewportRef,
        generateNodeRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setViewport,
        setContextMenu,
    });

    return { isLoadedCanvasCurrent, historyCommitTimerRef, undoCanvas, redoCanvas };
}
