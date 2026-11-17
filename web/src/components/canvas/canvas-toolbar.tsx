import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { CircleDot, Clapperboard, Grid2x2, ListVideo, Hand, Image as ImageIcon, Keyboard, MousePointer2, Palette, Plus, Puzzle, Square, Trash2, Undo2, Redo2 } from "lucide-react";
import { Segmented, Switch } from "antd";
import { useTranslation } from "react-i18next";

import { CanvasCreatePanel } from "@/components/canvas/canvas-create-panel";
import { CanvasShortcutsPopover } from "@/components/canvas/canvas-shortcuts-popover";
import { canvasThemes, type CanvasBackgroundMode, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeTypeId } from "@/types/canvas";

type TipState = { id: string; label: string; shortcut?: string; x: number } | null;

/**
 * 画布底部 Dock。迁移自 BeefTV 的 LibTV 浮动工具栏：
 * 常态只留 5～7 个核心入口（添加节点 / 抓手 / 外观 / 资产 / 快捷键），
 * 其余能力收进「添加节点」面板与右键菜单，避免一排 14 个图标挤成一堵墙。
 */
export function CanvasToolbar({
    selectedCount,
    canvasTool,
    canUndo,
    canRedo,
    backgroundMode,
    showImageInfo,
    onAddImage,
    onAddVideo,
    onAddAudio,
    onAddText,
    onAddConfig,
    onAddGroup,
    onAddExtensionNode,
    onUndo,
    onRedo,
    onUpload,
    onOpenAssets,
    onOpenDirector,
    onOpenStoryboard,
    onDelete,
    onClear,
    onCanvasToolChange,
    onBackgroundModeChange,
    onShowImageInfoChange,
    onFocusSelected,
}: {
    selectedCount: number;
    canvasTool: "select" | "pan";
    canUndo: boolean;
    canRedo: boolean;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddText: () => void;
    onAddConfig: () => void;
    onAddGroup: () => void;
    onAddExtensionNode: (type: string) => void;
    onUndo: () => void;
    onRedo: () => void;
    onUpload: () => void;
    onOpenAssets?: () => void;
    onOpenDirector?: () => void;
    onOpenStoryboard?: () => void;
    onDelete: () => void;
    onClear: () => void;
    onCanvasToolChange: (tool: "select" | "pan") => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onShowImageInfoChange: (show: boolean) => void;
    onFocusSelected: () => void;
}) {
    const { t } = useTranslation();
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const rootRef = useRef<HTMLDivElement>(null);
    const dockRef = useRef<HTMLDivElement>(null);
    const [tip, setTip] = useState<TipState>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    const closePanels = () => {
        setCreateOpen(false);
        setAppearanceOpen(false);
        setShortcutsOpen(false);
    };

    // 浮层只允许同时存在一个；点击 Dock 之外一律收起。
    useEffect(() => {
        if (!createOpen && !appearanceOpen && !shortcutsOpen) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) closePanels();
        };
        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [createOpen, appearanceOpen, shortcutsOpen]);

    const showTip = (event: { currentTarget: HTMLElement }, id: string, label: string, shortcut?: string) => {
        // 提示条挂在整条底部容器上（不是 Dock 本身），所以基准要取 rootRef 的盒子，
        // 否则 Dock 居中后提示会整体左移半个 Dock 宽度。
        const root = rootRef.current;
        if (!root) return;
        const rootBox = root.getBoundingClientRect();
        const box = event.currentTarget.getBoundingClientRect();
        setTip({ id, label, shortcut, x: box.left - rootBox.left + box.width / 2 });
    };

    const handleCreate = (type: CanvasNodeTypeId) => {
        if (type === "text") onAddText();
        else if (type === "image") onAddImage();
        else if (type === "video") onAddVideo();
        else if (type === "audio") onAddAudio();
        else if (type === "config") onAddConfig();
        else if (type === "group") onAddGroup();
        else onAddExtensionNode(type);
        closePanels();
    };

    return (
        <div ref={rootRef} className="pointer-events-none absolute bottom-4 z-50 flex justify-center max-lg:bottom-3" style={{ left: 16, right: 16 }} data-canvas-bottom-toolbar>
            {tip ? <DockTip label={tip.label} shortcut={tip.shortcut} x={tip.x} theme={theme} /> : null}

            <div
                ref={dockRef}
                className="pointer-events-auto flex h-11 items-center gap-[3px] rounded-2xl border px-1.5 backdrop-blur-2xl"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: "0 18px 44px rgba(0,0,0,.46)" }}
            >
                <DockButton
                    id="dock-add"
                    label={t("canvas.dock.add")}
                    prominent
                    active={createOpen}
                    tip={tip}
                    onTip={(event) => showTip(event, "dock-add", t("canvas.dock.add"))}
                    onTipEnd={() => setTip(null)}
                    onClick={() => {
                        const next = !createOpen;
                        closePanels();
                        setCreateOpen(next);
                    }}
                >
                    <Plus className="size-[18px]" />
                </DockButton>

                <DockDivider theme={theme} />

                <DockButton
                    id={`dock-tool-${canvasTool}`}
                    label={canvasTool === "select" ? t("canvas.dock.selectTool") : t("canvas.dock.handTool")}
                    shortcut={canvasTool === "select" ? "V" : "H"}
                    tip={tip}
                    onTip={(event) => showTip(event, `dock-tool-${canvasTool}`, canvasTool === "select" ? t("canvas.dock.selectTool") : t("canvas.dock.handTool"), canvasTool === "select" ? "V" : "H")}
                    onTipEnd={() => setTip(null)}
                    onClick={() => onCanvasToolChange(canvasTool === "select" ? "pan" : "select")}
                >
                    {canvasTool === "select" ? <MousePointer2 className="size-[18px]" /> : <Hand className="size-[18px]" />}
                </DockButton>
                <DockButton
                    id="dock-undo"
                    label={t("canvas.undo")}
                    shortcut="⌘Z"
                    disabled={!canUndo}
                    tip={tip}
                    onTip={(event) => showTip(event, "dock-undo", t("canvas.undo"), "⌘Z")}
                    onTipEnd={() => setTip(null)}
                    onClick={onUndo}
                >
                    <Undo2 className="size-[18px]" />
                </DockButton>
                <DockButton
                    id="dock-redo"
                    label={t("canvas.redo")}
                    shortcut="⌘⇧Z"
                    disabled={!canRedo}
                    tip={tip}
                    onTip={(event) => showTip(event, "dock-redo", t("canvas.redo"), "⌘⇧Z")}
                    onTipEnd={() => setTip(null)}
                    onClick={onRedo}
                >
                    <Redo2 className="size-[18px]" />
                </DockButton>

                <DockDivider theme={theme} />

                <DockButton
                    id="dock-appearance"
                    label={t("canvas.toolbar.appearance")}
                    active={appearanceOpen}
                    tip={tip}
                    onTip={(event) => showTip(event, "dock-appearance", t("canvas.toolbar.appearance"))}
                    onTipEnd={() => setTip(null)}
                    onClick={() => {
                        const next = !appearanceOpen;
                        closePanels();
                        setAppearanceOpen(next);
                    }}
                >
                    <Palette className="size-[18px]" />
                </DockButton>
                {onOpenStoryboard ? (
                    <DockButton
                        id="dock-storyboard"
                        label={t("canvas.dock.storyboard")}
                        tip={tip}
                        onTip={(event) => showTip(event, "dock-storyboard", t("canvas.dock.storyboard"))}
                        onTipEnd={() => setTip(null)}
                        onClick={() => {
                            closePanels();
                            onOpenStoryboard();
                        }}
                    >
                        <ListVideo className="size-[18px]" />
                    </DockButton>
                ) : null}
                {onOpenDirector ? (
                    <DockButton
                        id="dock-director"
                        label={t("canvas.dock.director")}
                        tip={tip}
                        onTip={(event) => showTip(event, "dock-director", t("canvas.dock.director"))}
                        onTipEnd={() => setTip(null)}
                        onClick={() => {
                            closePanels();
                            onOpenDirector();
                        }}
                    >
                        <Clapperboard className="size-[18px]" />
                    </DockButton>
                ) : null}
                <DockButton
                    id="dock-assets"
                    label={t("canvas.dock.assets")}
                    tip={tip}
                    onTip={(event) => showTip(event, "dock-assets", t("canvas.dock.assets"))}
                    onTipEnd={() => setTip(null)}
                    onClick={() => {
                        closePanels();
                        if (onOpenAssets) onOpenAssets();
                        else onUpload();
                    }}
                >
                    <Puzzle className="size-[18px]" />
                </DockButton>
                <DockButton
                    id="dock-shortcuts"
                    label={t("canvas.dock.shortcuts")}
                    active={shortcutsOpen}
                    tip={tip}
                    onTip={(event) => showTip(event, "dock-shortcuts", t("canvas.dock.shortcuts"))}
                    onTipEnd={() => setTip(null)}
                    onClick={() => {
                        const next = !shortcutsOpen;
                        closePanels();
                        setShortcutsOpen(next);
                    }}
                >
                    <Keyboard className="size-[18px]" />
                </DockButton>

                {selectedCount ? (
                    <>
                        <DockDivider theme={theme} />
                        <DockButton
                            id="dock-focus"
                            label={t("canvas.toolbar.focus")}
                            tip={tip}
                            onTip={(event) => showTip(event, "dock-focus", t("canvas.toolbar.focus"))}
                            onTipEnd={() => setTip(null)}
                            onClick={onFocusSelected}
                        >
                            <Square className="size-[18px]" />
                        </DockButton>
                        <DockButton
                            id="dock-delete"
                            label={t("canvas.deleteSelected")}
                            danger
                            tip={tip}
                            onTip={(event) => showTip(event, "dock-delete", t("canvas.deleteSelected"))}
                            onTipEnd={() => setTip(null)}
                            onClick={onDelete}
                        >
                            <Trash2 className="size-[18px]" />
                        </DockButton>
                    </>
                ) : null}
            </div>

            {createOpen ? <CanvasCreatePanel onCreate={handleCreate} onUpload={() => { closePanels(); onUpload(); }} onOpenAssets={onOpenAssets ? () => { closePanels(); onOpenAssets(); } : undefined} onClose={() => setCreateOpen(false)} /> : null}

            {appearanceOpen ? (
                <div
                    className="pointer-events-auto absolute bottom-[calc(100%+10px)] left-1/2 z-40 w-[252px] -translate-x-1/2 rounded-2xl border p-2.5 shadow-2xl backdrop-blur-2xl"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <div className="px-1 pb-2 text-[12px] font-semibold">{t("canvas.toolbar.appearance")}</div>
                    <div className="px-1 pb-1.5 text-[10.5px] font-medium opacity-45">{t("canvas.toolbar.gridStyle")}</div>
                    <Segmented
                        className="w-full !bg-white/[0.04] !p-1 [&_.ant-segmented-group]:!flex [&_.ant-segmented-item]:!min-h-7 [&_.ant-segmented-item]:!flex-1 [&_.ant-segmented-item-label]:!min-h-7 [&_.ant-segmented-item-label]:!leading-7"
                        value={backgroundMode}
                        onChange={(value) => onBackgroundModeChange(value as CanvasBackgroundMode)}
                        options={[
                            {
                                value: "dots",
                                label: (
                                    <span className="inline-flex items-center gap-1.5 text-[11px]">
                                        <CircleDot className="size-3.5" />
                                        {t("canvas.toolbar.dots")}
                                    </span>
                                ),
                            },
                            {
                                value: "lines",
                                label: (
                                    <span className="inline-flex items-center gap-1.5 text-[11px]">
                                        <Grid2x2 className="size-3.5" />
                                        {t("canvas.toolbar.lines")}
                                    </span>
                                ),
                            },
                            {
                                value: "blank",
                                label: (
                                    <span className="inline-flex items-center gap-1.5 text-[11px]">
                                        <Square className="size-3.5" />
                                        {t("canvas.toolbar.blank")}
                                    </span>
                                ),
                            },
                        ]}
                    />
                    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-lg px-1.5 py-1">
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-[10.5px] font-medium opacity-55">
                            <ImageIcon className="size-3.5" />
                            {t("canvas.toolbar.imageInfo")}
                        </span>
                        <Switch size="small" checked={showImageInfo} onChange={onShowImageInfoChange} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 rounded-lg px-1.5 py-1">
                        <span className="text-[10.5px] font-medium opacity-55">{t("canvas.toolbar.clear")}</span>
                        <button
                            type="button"
                            className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[10.5px] font-medium text-red-400 transition hover:bg-red-500/10"
                            onClick={() => {
                                closePanels();
                                onClear();
                            }}
                        >
                            <Trash2 className="size-3" />
                            {t("canvas.projectPage.clear")}
                        </button>
                    </div>
                </div>
            ) : null}

            {shortcutsOpen ? <CanvasShortcutsPopover onClose={() => setShortcutsOpen(false)} /> : null}
        </div>
    );
}

function DockButton({
    id,
    label,
    shortcut,
    active = false,
    disabled = false,
    danger = false,
    prominent = false,
    tip,
    onTip,
    onTipEnd,
    onClick,
    children,
}: {
    id: string;
    label: string;
    shortcut?: string;
    active?: boolean;
    disabled?: boolean;
    danger?: boolean;
    prominent?: boolean;
    tip: TipState;
    onTip: (event: { currentTarget: HTMLButtonElement }) => void;
    onTipEnd: () => void;
    onClick?: () => void;
    children: ReactNode;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isActive = active || tip?.id === id;
    const background = prominent ? (isActive ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.1)") : isActive ? theme.toolbar.itemHover : "transparent";
    const color = disabled ? theme.toolbar.item : danger ? "#f87171" : isActive ? theme.toolbar.activeText : theme.toolbar.item;

    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={active || undefined}
            disabled={disabled}
            className="grid size-8 shrink-0 place-items-center rounded-[10px] transition-[background-color,color,transform] duration-150 active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-35"
            style={{ background, color }}
            onMouseEnter={onTip}
            onMouseLeave={onTipEnd}
            onFocus={onTip}
            onBlur={onTipEnd}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function DockDivider({ theme }: { theme: CanvasTheme }) {
    return <div className="mx-1 h-4 w-px shrink-0" style={{ background: theme.toolbar.border }} />;
}

function DockTip({ label, shortcut, x, theme }: { label: string; shortcut?: string; x: number; theme: CanvasTheme }) {
    return (
        <span
            className="pointer-events-none absolute bottom-[calc(100%-2px)] z-50 flex h-6 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[11px] shadow-xl"
            style={{ left: x, background: theme.node.text, color: theme.node.panel }}
        >
            {label}
            {shortcut ? <kbd className="rounded-[3px] px-1 text-[9.5px] opacity-60" style={{ background: "rgba(0,0,0,.14)" }}>{shortcut}</kbd> : null}
        </span>
    );
}
