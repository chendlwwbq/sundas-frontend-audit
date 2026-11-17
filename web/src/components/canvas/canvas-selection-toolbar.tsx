import type { ReactNode } from "react";
import { Group, Ungroup } from "lucide-react";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { nodeBounds } from "@/lib/canvas/canvas-node-geometry";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData, ViewportTransform } from "@/types/canvas";

const SELECTION_PAD = 14;

export function CanvasSelectionToolbar({
    nodes,
    viewport,
    showToolbar,
    canGroup,
    canUngroup,
    onGroup,
    onUngroup,
}: {
    nodes: CanvasNodeData[];
    viewport: ViewportTransform;
    showToolbar: boolean;
    canGroup: boolean;
    canUngroup: boolean;
    onGroup: () => void;
    onUngroup: () => void;
}) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (nodes.length < 2) return null;

    const bounds = nodeBounds(nodes);
    const left = viewport.x + bounds.left * viewport.k - SELECTION_PAD;
    const top = viewport.y + bounds.top * viewport.k - SELECTION_PAD;
    const width = (bounds.right - bounds.left) * viewport.k + SELECTION_PAD * 2;
    const height = (bounds.bottom - bounds.top) * viewport.k + SELECTION_PAD * 2;
    const showActions = showToolbar && (canGroup || canUngroup);

    return (
        <>
            <svg className="pointer-events-none absolute z-[65] overflow-visible" style={{ left, top, width, height }}>
                <rect
                    x={1}
                    y={1}
                    width={Math.max(width - 2, 0)}
                    height={Math.max(height - 2, 0)}
                    rx={12}
                    ry={12}
                    fill={theme.canvas.selectionFill}
                    stroke={theme.canvas.selectionStroke}
                    strokeOpacity={0.5}
                    strokeWidth={1}
                    strokeDasharray="6 5"
                    strokeLinecap="round"
                />
            </svg>
            {showActions ? (
                <div
                    className="absolute z-[70] flex h-10 -translate-x-1/2 -translate-y-full items-center gap-0.5 overflow-visible rounded-[14px] px-1.5 backdrop-blur-2xl"
                    style={{
                        left: left + width / 2,
                        top: top - 8,
                        background: theme.toolbar.panel,
                        border: `1px solid ${theme.toolbar.border}`,
                        color: theme.toolbar.item,
                        boxShadow: "0 18px 40px rgba(0,0,0,.45)",
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    {canGroup ? <SelectionAction title={t("canvas.nodeToolbar.groupTitle")} label={t("canvas.nodeToolbar.group")} icon={<Group className="size-3.5" />} onClick={onGroup} /> : null}
                    {canUngroup ? <SelectionAction title={t("canvas.nodeToolbar.ungroupTitle")} label={t("canvas.nodeToolbar.ungroup")} icon={<Ungroup className="size-3.5" />} onClick={onUngroup} /> : null}
                </div>
            ) : null}
        </>
    );
}

function SelectionAction({ title, label, icon, onClick }: { title: string; label: string; icon: ReactNode; onClick: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <Tooltip title={title} placement="top" mouseEnterDelay={0.2} color="rgba(24,24,24,.98)" styles={{ root: { color: "#f2f2f2", boxShadow: "0 10px 26px rgba(0,0,0,.5)", fontSize: 12, fontWeight: 500, border: "1px solid rgba(255,255,255,.1)" } }}>
            <button type="button" className="group relative flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[11px] font-medium transition-colors hover:bg-white/[0.07]" style={{ color: theme.toolbar.item }} onClick={onClick} aria-label={title}>
                {icon}
                <span>{label}</span>
            </button>
        </Tooltip>
    );
}
