import { useEffect } from "react";
import type { ReactNode } from "react";
import { CircleDot, ClipboardPaste, Eraser, Grid2x2, Maximize2, Scan, Square, SquareDashedMousePointer, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

/**
 * 画布空白处右键菜单。迁移自 BeefTV：以前 sundas 在空白处右键只会被
 * preventDefault 掉、什么都不弹，视口与画布级操作只能去 Dock 里找。
 */
export function CanvasBlankContextMenu({
    x,
    y,
    backgroundMode,
    hasNodes,
    onClose,
    onPaste,
    onSelectAll,
    onFitAll,
    onResetZoom,
    onBackgroundModeChange,
    onUpload,
    onClear,
}: {
    x: number;
    y: number;
    backgroundMode: CanvasBackgroundMode;
    hasNodes: boolean;
    onClose: () => void;
    onPaste: () => void;
    onSelectAll: () => void;
    onFitAll: () => void;
    onResetZoom: () => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onUpload: () => void;
    onClear: () => void;
}) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [onClose]);

    const maxLeft = Math.max(0, window.innerWidth - 220);
    const maxTop = Math.max(0, window.innerHeight - 340);

    return (
        <div
            className="fixed z-[var(--z-canvas-menu)] w-[212px] overflow-hidden rounded-xl border py-1 shadow-2xl backdrop-blur-md"
            style={{ left: Math.min(x, maxLeft), top: Math.min(y, maxTop), background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
        >
            <MenuRow icon={<ClipboardPaste className="size-3.5" />} label={t("canvas.blankMenu.paste")} shortcut="⌘V" onClick={() => { onClose(); onPaste(); }} />
            <MenuRow icon={<SquareDashedMousePointer className="size-3.5" />} label={t("canvas.blankMenu.selectAll")} shortcut="⌘A" onClick={() => { onClose(); onSelectAll(); }} />
            <Divider theme={theme} />
            <MenuRow icon={<Scan className="size-3.5" />} label={t("canvas.blankMenu.fitAll")} shortcut="⌘0" disabled={!hasNodes} onClick={() => { onClose(); onFitAll(); }} />
            <MenuRow icon={<Maximize2 className="size-3.5" />} label={t("canvas.blankMenu.actualSize")} shortcut="⌘1" onClick={() => { onClose(); onResetZoom(); }} />
            <Divider theme={theme} />
            <div className="px-3 pb-1 pt-1.5 text-[10px] font-medium opacity-40">{t("canvas.blankMenu.background")}</div>
            <div className="mx-2 mb-1 flex items-center gap-1">
                <ModeChip icon={<CircleDot className="size-3.5" />} label={t("canvas.toolbar.dots")} active={backgroundMode === "dots"} onClick={() => { onBackgroundModeChange("dots"); onClose(); }} />
                <ModeChip icon={<Grid2x2 className="size-3.5" />} label={t("canvas.toolbar.lines")} active={backgroundMode === "lines"} onClick={() => { onBackgroundModeChange("lines"); onClose(); }} />
                <ModeChip icon={<Square className="size-3.5" />} label={t("canvas.toolbar.blank")} active={backgroundMode === "blank"} onClick={() => { onBackgroundModeChange("blank"); onClose(); }} />
            </div>
            <Divider theme={theme} />
            <MenuRow icon={<Upload className="size-3.5" />} label={t("canvas.toolbar.upload")} onClick={() => { onClose(); onUpload(); }} />
            <Divider theme={theme} />
            <MenuRow icon={<Eraser className="size-3.5" />} label={t("canvas.blankMenu.clear")} danger onClick={() => { onClose(); onClear(); }} />
        </div>
    );
}

function MenuRow({ icon, label, shortcut, danger = false, disabled = false, onClick }: { icon: ReactNode; label: string; shortcut?: string; danger?: boolean; disabled?: boolean; onClick?: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <button
            type="button"
            disabled={disabled}
            className="flex h-8 w-full items-center gap-2 px-3 text-left text-[11.5px] transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35"
            style={{ color: danger ? "#f87171" : theme.node.text }}
            onClick={onClick}
        >
            <span className="grid size-4 place-items-center opacity-70">{icon}</span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {shortcut ? <span className="text-[10px] opacity-35">{shortcut}</span> : null}
        </button>
    );
}

function ModeChip({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <button
            type="button"
            className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-[10.5px] font-medium transition-colors"
            style={{ background: active ? theme.toolbar.activeBg : "transparent", color: active ? theme.toolbar.activeText : theme.node.muted }}
            onClick={onClick}
        >
            {icon}
            <span className="truncate">{label}</span>
        </button>
    );
}

function Divider({ theme }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return <div className="my-1 h-px" style={{ background: theme.toolbar.border }} />;
}
