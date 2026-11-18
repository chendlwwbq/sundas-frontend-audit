import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageIcon, List, Music2, Settings2, Video, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { getNodeSpec } from "@/constant/canvas";
import { CanvasNodeType, type ConnectionHandle, type Position } from "@/types/canvas";

export type PendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
    /** 屏幕坐标（clientX/clientY），用于把菜单锚定在鼠标落点。 */
    anchor: Position;
};

const MENU_VIEWPORT_MARGIN = 10;

/**
 * 画布上的浮动菜单必须挂在 body 上：
 * 画布内容层带 transform，会形成独立堆叠上下文，菜单的 z-index 只在层内生效，
 * 于是空画布提示（z-10 的兄弟节点）会压在菜单之上，看起来像"弹窗半透明、和画布文字重合"。
 * 改成 fixed 浮层后，菜单永远在最上层，也不会被画布的 overflow 裁掉。
 */
function useMenuAnchor(anchor: Position) {
    const surfaceRef = useRef<HTMLDivElement>(null);
    const [placed, setPlaced] = useState(anchor);

    useLayoutEffect(() => {
        const element = surfaceRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const maxLeft = Math.max(MENU_VIEWPORT_MARGIN, window.innerWidth - rect.width - MENU_VIEWPORT_MARGIN);
        const maxTop = Math.max(MENU_VIEWPORT_MARGIN, window.innerHeight - rect.height - MENU_VIEWPORT_MARGIN);
        const next = { x: Math.min(Math.max(MENU_VIEWPORT_MARGIN, anchor.x), maxLeft), y: Math.min(Math.max(MENU_VIEWPORT_MARGIN, anchor.y), maxTop) };
        setPlaced((current) => (current.x === next.x && current.y === next.y ? current : next));
    }, [anchor.x, anchor.y]);

    return { surfaceRef, placed };
}

function CanvasMenuSurface({
    anchor,
    title,
    onClose,
    closeOnOutsidePointerDown,
    scrollable,
    children,
}: {
    anchor: Position;
    title: string;
    onClose: () => void;
    closeOnOutsidePointerDown?: boolean;
    scrollable?: boolean;
    children: React.ReactNode;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    const menu = theme.menu;
    const { surfaceRef, placed } = useMenuAnchor(anchor);

    // 点击菜单外部时关闭（仅双击创建的菜单需要，连线落点菜单由画布交互负责关闭）。
    useEffect(() => {
        if (!closeOnOutsidePointerDown) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (surfaceRef.current && !surfaceRef.current.contains(event.target as Node)) onClose();
        };
        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [closeOnOutsidePointerDown, onClose, surfaceRef]);

    return createPortal(
        <div
            ref={surfaceRef}
            data-canvas-no-zoom
            data-connection-create-menu
            className="fixed z-[1250] w-[248px] overflow-hidden rounded-[16px] border"
            style={{ left: placed.x, top: placed.y, background: menu.panel, borderColor: menu.border, boxShadow: menu.shadow, color: menu.title }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
        >
            <div className="flex items-center justify-between gap-2 pl-3 pr-2 pb-2 pt-2.5">
                <span className="text-[12.5px] font-medium tracking-wide" style={{ color: menu.header }}>
                    {title}
                </span>
                <button
                    type="button"
                    className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md transition-colors"
                    style={{ color: menu.iconColor }}
                    onMouseEnter={(event) => (event.currentTarget.style.background = menu.itemHover)}
                    onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                    onClick={onClose}
                    aria-label={t("canvas.createMenu.close")}
                >
                    <X className="size-3.5" />
                </button>
            </div>
            <div
                className={`grid gap-0.5 p-1.5 ${scrollable ? "thin-scrollbar max-h-[min(60vh,420px)] overflow-y-auto" : ""}`}
                style={{ borderTop: `1px solid ${menu.divider}` }}
            >
                {children}
            </div>
        </div>,
        document.body,
    );
}

export function ConnectionCreateMenu({ pending, onCreate, onClose }: { pending: PendingConnectionCreate; onCreate: (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    return (
        <CanvasMenuSurface anchor={pending.anchor} title={t("canvas.createMenu.fromNode")} onClose={onClose}>
            <ConnectionCreateOption theme={theme} icon={<List className="size-4" />} title={t("canvas.createMenu.text")} description={t("canvas.createMenu.textDescription")} onClick={() => onCreate(CanvasNodeType.Text)} />
            <ConnectionCreateOption theme={theme} icon={<ImageIcon className="size-4" />} title={t("canvas.createMenu.image")} onClick={() => onCreate(CanvasNodeType.Image)} />
            <ConnectionCreateOption theme={theme} icon={<Video className="size-4" />} title={t("canvas.createMenu.video")} onClick={() => onCreate(CanvasNodeType.Video)} />
            <ConnectionCreateOption theme={theme} icon={<Music2 className="size-4" />} title={t("canvas.createMenu.audio")} onClick={() => onCreate(CanvasNodeType.Audio)} />
            <ConnectionCreateOption theme={theme} icon={<Settings2 className="size-4" />} title={t("canvas.createMenu.config")} description={t("canvas.createMenu.configDescription")} onClick={() => onCreate(CanvasNodeType.Config)} />
        </CanvasMenuSurface>
    );
}

export function ConnectionCreateOption({ theme, icon, title, description, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: React.ReactNode; title: string; description?: string; onClick?: () => void }) {
    const menu = theme.menu;
    return (
        <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition-colors"
            style={{ color: menu.title }}
            onClick={onClick}
            onMouseEnter={(event) => (event.currentTarget.style.background = menu.itemHover)}
            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
        >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: menu.iconBg, color: menu.iconColor }}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[13px] font-medium leading-5">{title}</span>
                {description ? (
                    <span className="mt-0.5 block truncate text-[11px] leading-4" style={{ color: menu.subtitle }}>
                        {description}
                    </span>
                ) : null}
            </span>
        </button>
    );
}

export function NodeCreateMenu({ anchor, onCreate, onClose }: { anchor: Position; onCreate: (type: string) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    useNodeRegistryVersion();
    const definitions = listNodeDefinitions().filter((def) => def.showInCreateMenu !== false);
    return (
        <CanvasMenuSurface anchor={anchor} title={t("canvas.createMenu.select")} onClose={onClose} closeOnOutsidePointerDown scrollable>
            {definitions.map((def) => (
                <ConnectionCreateOption key={def.type} theme={theme} icon={def.icon} title={getNodeSpec(def.type).title} description={def.description} onClick={() => onCreate(def.type)} />
            ))}
        </CanvasMenuSurface>
    );
}
