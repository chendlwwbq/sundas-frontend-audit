import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";

import { isEditableElement } from "@/lib/keyboard-event";
import { createCanvasNode } from "@/lib/canvas/canvas-node-factory";
import { useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import {
    CanvasNodeType,
    type CanvasConnection,
    type CanvasNodeData,
    type ContextMenuState,
    type Position,
    type SelectionBox,
} from "@/types/canvas";
import type { CanvasClipboard } from "./canvas-project-types";

type UseCanvasKeyboardAndClipboardOptions = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    selectedConnectionId: string | null;
    dialogNodeId: string | null;
    creativePanel: "production" | "production-export" | "agent" | "character" | null;
    getCanvasCenter: () => Position;
    createImageFileNode: (file: File, position: Position) => Promise<void>;
    undoCanvas: () => void;
    redoCanvas: () => void;
    fitAllNodes: () => void;
    resetViewport: () => void;
    focusSelectedNode: () => void;
    groupSelection: () => void;
    ungroupSelection: () => void;
    canGroupSelected: (selected: Set<string>, nodes: CanvasNodeData[]) => boolean;
    canUngroupSelected: (selected: Set<string>, nodes: CanvasNodeData[]) => boolean;
    deleteNodes: (ids: Set<string>) => void;
    deleteConnection: (connectionId: string) => void;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setNodeCreateMenu: Dispatch<SetStateAction<{ world: Position; anchor: Position } | null>>;
    setSelectionBox: Dispatch<SetStateAction<SelectionBox | null>>;
    setConnecting: (next: null) => void;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setInfoNodeId: Dispatch<SetStateAction<string | null>>;
    setCropNodeId: Dispatch<SetStateAction<string | null>>;
    setMaskEditNodeId: Dispatch<SetStateAction<string | null>>;
    setPendingConnectionCreate: Dispatch<SetStateAction<any>>;
    setCanvasTool: Dispatch<SetStateAction<"select" | "pan">>;
    setCreativePanel: Dispatch<SetStateAction<"production" | "production-export" | "agent" | "character" | null>>;
};

export function useCanvasKeyboardAndClipboard({
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
    canGroupSelected,
    canUngroupSelected,
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
}: UseCanvasKeyboardAndClipboardOptions) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const clipboardRef = useRef<CanvasClipboard | null>(null);
    const [, setClipboardTick] = useState(0);
    void setClipboardTick;

    const duplicateNode = useCallback(
        (nodeId: string) => {
            const source = nodesRef.current.find((node) => node.id === nodeId);
            if (!source) return;

            const id = `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const next: CanvasNodeData = {
                ...source,
                id,
                title: `${source.title} Copy`,
                position: { x: source.position.x + 36, y: source.position.y + 36 },
                metadata: { ...source.metadata, productionShotId: undefined },
            };
            const referenceConnections = connectionsRef.current
                .filter((connection) => connection.toNodeId === nodeId)
                .map((connection) => ({ ...connection, id: `${connection.id}-copy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, toNodeId: id }));

            setNodes((prev) => [...prev, next]);
            setConnections((prev) => [...prev, ...referenceConnections]);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            if (next.type !== CanvasNodeType.Group) setDialogNodeId(id);
        },
        [connectionsRef, nodesRef, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    const copySelectedNodes = useCallback(() => {
        const selectedIds = selectedNodeIdsRef.current;
        if (!selectedIds.size) return;

        const copiedNodes = nodesRef.current
            .filter((node) => selectedIds.has(node.id))
            .map((node) => ({
                ...node,
                position: { ...node.position },
                metadata: node.metadata ? { ...node.metadata, productionShotId: undefined } : undefined,
            }));

        if (!copiedNodes.length) return;

        clipboardRef.current = {
            nodes: copiedNodes,
            connections: connectionsRef.current.filter((connection) => selectedIds.has(connection.toNodeId)).map((connection) => ({ ...connection })),
        };
    }, [connectionsRef, nodesRef, selectedNodeIdsRef]);

    const pasteCopiedNodes = useCallback(() => {
        const clipboard = clipboardRef.current;
        if (!clipboard?.nodes.length) return false;

        const center = getCanvasCenter();
        const bounds = clipboard.nodes.reduce(
            (acc, node) => ({
                left: Math.min(acc.left, node.position.x),
                top: Math.min(acc.top, node.position.y),
                right: Math.max(acc.right, node.position.x + node.width),
                bottom: Math.max(acc.bottom, node.position.y + node.height),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const dx = center.x - (bounds.left + bounds.right) / 2;
        const dy = center.y - (bounds.top + bounds.bottom) / 2;
        const idMap = new Map<string, string>();
        const nextNodes = clipboard.nodes.map((node, index) => {
            const id = `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
            idMap.set(node.id, id);
            return {
                ...node,
                id,
                title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
                position: {
                    x: node.position.x + dx,
                    y: node.position.y + dy,
                },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            };
        });

        const pastedNodes = nextNodes.map((node) => {
            const groupId = node.metadata?.groupId;
            if (!groupId) return node;
            return { ...node, metadata: { ...node.metadata, groupId: idMap.get(groupId) } };
        });

        const nextConnections = clipboard.connections.flatMap((connection, index) => {
            const toNodeId = idMap.get(connection.toNodeId);
            if (!toNodeId) return [];
            return [
                {
                    ...connection,
                    id: `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
                    fromNodeId: idMap.get(connection.fromNodeId) ?? connection.fromNodeId,
                    toNodeId,
                },
            ];
        });

        setNodes((prev) => [...prev, ...pastedNodes]);
        setConnections((prev) => [...prev, ...nextConnections]);
        setSelectedNodeIds(new Set(pastedNodes.map((node) => node.id)));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(pastedNodes[0]?.type === CanvasNodeType.Group ? null : pastedNodes[0]?.id || null);
        return true;
    }, [getCanvasCenter, setConnections, setContextMenu, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds]);

    const createTextNodeFromClipboard = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return false;

            const node = {
                ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: trimmed, status: "success" }),
                title: trimmed.slice(0, 32) || t("canvas.projectPage.clipboardText"),
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(node.id);
            return true;
        },
        [getCanvasCenter, setContextMenu, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, t],
    );

    const pasteSystemClipboard = useCallback(async () => {
        if (!navigator.clipboard) return;

        const items = await navigator.clipboard.read();
        const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")));
        if (imageItem) {
            const imageType = imageItem.types.find((type) => type.startsWith("image/"));
            if (!imageType) return;
            const blob = await imageItem.getType(imageType);
            const file = new File([blob], "clipboard-image.png", { type: imageType });
            void createImageFileNode(file, getCanvasCenter());
            message.success(t("canvas.projectPage.clipboardImageAdded"));
            return;
        }

        const text = await navigator.clipboard.readText();
        if (createTextNodeFromClipboard(text)) message.success(t("canvas.projectPage.clipboardTextAdded"));
    }, [createImageFileNode, createTextNodeFromClipboard, getCanvasCenter, message, t]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            const panelEditor = dialogNodeId ? document.querySelector<HTMLElement>('[data-canvas-no-zoom][data-node-panel] [contenteditable="true"]') : null;
            const pointerOnPanel = Boolean(panelEditor?.closest("[data-node-panel]")?.matches(":hover"));
            if (panelEditor && (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "v" && (pointerOnPanel || !clipboardRef.current?.nodes.length)) {
                panelEditor.focus({ preventScroll: true });
                return;
            }
            const editingEscape = event.key === "Escape" && !event.defaultPrevented && !event.isComposing;
            if (
                !editingEscape &&
                (isEditableElement(document.activeElement) ||
                    isEditableElement(event.target) ||
                    target?.closest("[data-canvas-no-zoom],[data-canvas-shortcuts-ignore]"))
            ) {
                return;
            }

            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;

            if (isModifierShortcut && key === "c" && window.getSelection()?.toString()) return;

            if (isModifierShortcut && !event.altKey && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redoCanvas();
                else undoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "y") {
                event.preventDefault();
                redoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "a") {
                event.preventDefault();
                setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
                setSelectedConnectionId(null);
                setContextMenu(null);
                setSelectionBox(null);
                return;
            }

            if (!isModifierShortcut && !event.altKey && !event.shiftKey) {
                if (key === "v") {
                    event.preventDefault();
                    setCanvasTool("select");
                    return;
                }
                if (key === "h") {
                    event.preventDefault();
                    setCanvasTool("pan");
                    return;
                }
            }

            if (isModifierShortcut && !event.altKey && !event.shiftKey && (key === "\\" || event.code === "Backslash")) {
                event.preventDefault();
                const sideOpen = useCanvasSidePanelStore.getState().panelOpen;
                if (sideOpen || creativePanel !== null) {
                    if (sideOpen) useCanvasSidePanelStore.getState().closePanel();
                    setCreativePanel(null);
                } else {
                    useCanvasSidePanelStore.getState().openPanel();
                }
                return;
            }

            if (isModifierShortcut && !event.altKey && (key === "0" || key === "1" || key === "2")) {
                event.preventDefault();
                if (key === "0") fitAllNodes();
                else if (key === "1") resetViewport();
                else focusSelectedNode();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "d") {
                event.preventDefault();
                copySelectedNodes();
                pasteCopiedNodes();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "g") {
                if (event.shiftKey) {
                    if (canUngroupSelected(selectedNodeIdsRef.current, nodesRef.current)) {
                        event.preventDefault();
                        ungroupSelection();
                    }
                    return;
                }
                if (canGroupSelected(selectedNodeIdsRef.current, nodesRef.current)) {
                    event.preventDefault();
                    groupSelection();
                }
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "c") {
                event.preventDefault();
                copySelectedNodes();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "v") {
                event.preventDefault();
                if (!pasteCopiedNodes()) void pasteSystemClipboard();
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                if (selectedNodeIdsRef.current.size) {
                    deleteNodes(new Set(selectedNodeIdsRef.current));
                } else if (selectedConnectionId) {
                    deleteConnection(selectedConnectionId);
                }
            }

            if (event.key === "Escape") {
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                setContextMenu(null);
                setNodeCreateMenu(null);
                setSelectionBox(null);
                setConnecting(null);
                setHoveredNodeId(null);
                setToolbarNodeId(null);
                setDialogNodeId(null);
                setInfoNodeId(null);
                setCropNodeId(null);
                setMaskEditNodeId(null);
                setPendingConnectionCreate(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        canGroupSelected,
        canUngroupSelected,
        copySelectedNodes,
        creativePanel,
        deleteConnection,
        deleteNodes,
        dialogNodeId,
        fitAllNodes,
        focusSelectedNode,
        groupSelection,
        nodesRef,
        pasteCopiedNodes,
        pasteSystemClipboard,
        redoCanvas,
        resetViewport,
        selectedConnectionId,
        selectedNodeIdsRef,
        setCanvasTool,
        setConnecting,
        setContextMenu,
        setCreativePanel,
        setCropNodeId,
        setDialogNodeId,
        setHoveredNodeId,
        setInfoNodeId,
        setMaskEditNodeId,
        setNodeCreateMenu,
        setPendingConnectionCreate,
        setSelectedConnectionId,
        setSelectedNodeIds,
        setSelectionBox,
        setToolbarNodeId,
        undoCanvas,
        ungroupSelection,
    ]);

    return { duplicateNode, copySelectedNodes, pasteCopiedNodes, pasteSystemClipboard };
}
