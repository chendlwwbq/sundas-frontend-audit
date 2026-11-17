import { useState, type MouseEvent as ReactMouseEvent } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "@/types/canvas";

export function ConnectionPath({
    connection,
    from,
    to,
    active,
    onSelect,
    onContextMenu,
}: {
    connection: CanvasConnection;
    from: CanvasNodeData;
    to: CanvasNodeData;
    active: boolean;
    onSelect: () => void;
    onContextMenu?: (event: ReactMouseEvent<SVGPathElement>) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [hovered, setHovered] = useState(false);
    const startX = from.position.x + from.width;
    const startY = from.position.y + from.height / 2;
    const endX = to.position.x;
    const endY = to.position.y + to.height / 2;
    const dx = Math.abs(endX - startX);
    const curvature = Math.max(dx * 0.5, 50);
    const pathD = `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`;
    const accent = theme.accent.primary;
    const emphasized = active || hovered;

    return (
        <g data-connection-group={connection.id} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            <path
                data-connection-id={connection.id}
                d={pathD}
                stroke="transparent"
                strokeWidth="18"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect();
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onContextMenu?.(event);
                }}
            />
            {/* 选中态：低透明度柔光垫在主线下方，模拟 BeefTV 的连接高亮。 */}
            {active ? <path d={pathD} stroke={accent} strokeWidth="8" strokeOpacity="0.16" fill="none" style={{ pointerEvents: "none" }} /> : null}
            <path
                d={pathD}
                stroke={emphasized ? accent : theme.node.muted}
                strokeWidth={emphasized ? 2.4 : 1.6}
                strokeOpacity={emphasized ? 0.95 : 0.5}
                fill="none"
                strokeLinecap="round"
                style={{
                    pointerEvents: "none",
                    transition: "stroke 140ms ease, stroke-width 140ms ease, stroke-opacity 140ms ease",
                }}
            />
            {active ? <path d={pathD} stroke={accent} strokeWidth="2.4" strokeOpacity="0.9" fill="none" strokeLinecap="round" strokeDasharray="2 14" style={{ pointerEvents: "none", animation: "canvas-connection-flow 1.1s linear infinite" }} /> : null}
            <circle cx={startX} cy={startY} r={emphasized ? 3 : 2.4} fill={emphasized ? accent : theme.node.muted} style={{ pointerEvents: "none", transition: "fill 140ms ease" }} />
            <circle cx={endX} cy={endY} r={emphasized ? 3 : 2.4} fill={emphasized ? accent : theme.node.muted} style={{ pointerEvents: "none", transition: "fill 140ms ease" }} />
        </g>
    );
}

export function ActiveConnectionPath({ node, handle, mouseWorld, target }: { node?: CanvasNodeData; handle: ConnectionHandle; mouseWorld: Position; target?: CanvasNodeData }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!node) return null;

    const startX = handle.handleType === "source" ? node.position.x + node.width : mouseWorld.x;
    const startY = handle.handleType === "source" ? node.position.y + node.height / 2 : mouseWorld.y;
    const endX = handle.handleType === "source" ? mouseWorld.x : node.position.x;
    const endY = handle.handleType === "source" ? mouseWorld.y : node.position.y + node.height / 2;
    const snappedStartX = handle.handleType === "target" && target ? target.position.x + target.width : startX;
    const snappedStartY = handle.handleType === "target" && target ? target.position.y + target.height / 2 : startY;
    const snappedEndX = handle.handleType === "source" && target ? target.position.x : endX;
    const snappedEndY = handle.handleType === "source" && target ? target.position.y + target.height / 2 : endY;
    const distance = Math.abs(snappedEndX - snappedStartX);
    const pathD = `M ${snappedStartX} ${snappedStartY} C ${snappedStartX + distance * 0.5} ${snappedStartY}, ${snappedEndX - distance * 0.5} ${snappedEndY}, ${snappedEndX} ${snappedEndY}`;

    return (
        <g style={{ pointerEvents: "none" }}>
            <path d={pathD} stroke={theme.accent.primary} strokeWidth="6" strokeOpacity="0.14" fill="none" />
            <path d={pathD} stroke={theme.accent.primary} strokeWidth="2" fill="none" strokeDasharray="5,5" style={{ animation: "canvas-connection-flow 0.9s linear infinite" }} />
            <circle cx={snappedEndX} cy={snappedEndY} r={target ? 5 : 3.5} fill={theme.accent.primary} fillOpacity={target ? 0.9 : 0.55} />
        </g>
    );
}
