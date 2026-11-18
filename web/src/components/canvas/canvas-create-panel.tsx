import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Group, Image as ImageIcon, Music2, Puzzle, Search, Settings2, Type, Upload, Video, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { getNodePluginId, listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeTypeId } from "@/types/canvas";

type CreateItem = {
    type: CanvasNodeTypeId;
    label: string;
    icon: ReactNode;
    hint?: string;
};

/**
 * 「添加节点」面板。迁移自 BeefTV 的 CanvasCreateMenu：
 * 搜索优先 + 分类网格 + 导入资源入口，替代原来一排平铺图标。
 */
export function CanvasCreatePanel({ onCreate, onUpload, onOpenAssets, onClose }: { onCreate: (type: CanvasNodeTypeId) => void; onUpload: () => void; onOpenAssets?: () => void; onClose: () => void }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    useNodeRegistryVersion();

    const items = useMemo<CreateItem[]>(() => {
        const builtin: CreateItem[] = [
            { type: CanvasNodeType.Text, label: t("canvas.nodeTypes.text"), icon: <Type className="size-4" />, hint: t("canvas.createPanel.textHint") },
            { type: CanvasNodeType.Image, label: t("canvas.nodeTypes.image"), icon: <ImageIcon className="size-4" />, hint: t("canvas.createPanel.imageHint") },
            { type: CanvasNodeType.Video, label: t("canvas.nodeTypes.video"), icon: <Video className="size-4" />, hint: t("canvas.createPanel.videoHint") },
            { type: CanvasNodeType.Audio, label: t("canvas.nodeTypes.audio"), icon: <Music2 className="size-4" />, hint: t("canvas.createPanel.audioHint") },
            { type: CanvasNodeType.Config, label: t("canvas.nodeTypes.config"), icon: <Settings2 className="size-4" />, hint: t("canvas.createPanel.configHint") },
            { type: CanvasNodeType.Group, label: t("canvas.nodeTypes.group"), icon: <Group className="size-4" />, hint: t("canvas.createPanel.groupHint") },
        ];
        const extensions = listNodeDefinitions()
            .filter((def) => def.showInCreateMenu !== false && getNodePluginId(def.type) !== "builtin")
            .map<CreateItem>((def) => ({ type: def.type, label: def.title, icon: def.icon || <Puzzle className="size-4" /> }));
        return [...builtin, ...extensions];
    }, [t]);

    const normalized = query.trim().toLocaleLowerCase();
    const visible = normalized ? items.filter((item) => `${item.label} ${item.hint || ""}`.toLocaleLowerCase().includes(normalized)) : items;

    return (
        <div
            className="pointer-events-auto absolute bottom-[calc(100%+10px)] left-1/2 z-40 w-[320px] -translate-x-1/2 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-2xl"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            data-canvas-create-panel
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <header className="flex h-10 items-center gap-2 border-b px-3" style={{ borderColor: theme.toolbar.border }}>
                <span className="text-[12px] font-semibold">{t("canvas.createPanel.title")}</span>
                <span className="ml-auto flex items-center gap-0.5">
                    <PanelAction label={t("canvas.createPanel.assets")} onClick={onOpenAssets} icon={<Puzzle className="size-3.5" />} hidden={!onOpenAssets} />
                    <PanelAction label={t("canvas.toolbar.upload")} onClick={onUpload} icon={<Upload className="size-3.5" />} />
                    <button type="button" className="grid size-6 place-items-center rounded-md opacity-55 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label={t("canvas.createPanel.close")}>
                        <X className="size-3.5" />
                    </button>
                </span>
            </header>

            <div className="px-2 pt-2">
                <label className="flex h-8 items-center gap-1.5 rounded-lg border px-2" style={{ borderColor: theme.toolbar.border, background: "rgba(255,255,255,.04)" }}>
                    <Search className="size-3.5 shrink-0 opacity-45" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && visible[0]) onCreate(visible[0].type);
                            if (event.key === "Escape") {
                                if (query) setQuery("");
                                else onClose();
                            }
                        }}
                        placeholder={t("canvas.createPanel.search")}
                        aria-label={t("canvas.createPanel.search")}
                        className="min-w-0 flex-1 bg-transparent text-[11.5px] outline-none placeholder:opacity-45"
                        style={{ color: theme.node.text }}
                    />
                </label>
            </div>

            <div className="thin-scrollbar max-h-[288px] overflow-y-auto p-2">
                {visible.length ? (
                    <div className="grid grid-cols-3 gap-1">
                        {visible.map((item) => (
                            <button
                                key={item.type}
                                type="button"
                                className="group flex h-[62px] flex-col items-center justify-center gap-1.5 rounded-xl border border-transparent text-[11px] font-medium transition hover:border-white/10 hover:bg-white/[0.06]"
                                style={{ color: theme.node.text }}
                                title={item.hint || item.label}
                                onClick={() => onCreate(item.type)}
                            >
                                <span className="grid size-7 place-items-center rounded-lg transition group-hover:bg-white/[0.06]" style={{ color: theme.node.muted }}>
                                    {item.icon}
                                </span>
                                <span className="max-w-full truncate px-1 opacity-90">{item.label}</span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="grid h-20 place-items-center text-[11px] opacity-45">{t("canvas.createPanel.empty")}</div>
                )}
            </div>

            <footer className="flex items-center gap-1.5 border-t px-3 py-2 text-[10.5px] opacity-45" style={{ borderColor: theme.toolbar.border }}>
                <kbd className="rounded border px-1 py-0.5 text-[10px]" style={{ borderColor: theme.toolbar.border }}>
                    Enter
                </kbd>
                {t("canvas.createPanel.hint")}
            </footer>
        </div>
    );
}

function PanelAction({ label, icon, onClick, hidden }: { label: string; icon: ReactNode; onClick?: () => void; hidden?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (hidden) return null;
    return (
        <button
            type="button"
            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10.5px] font-medium opacity-65 transition hover:bg-white/10 hover:opacity-100"
            style={{ color: theme.node.text }}
            onClick={onClick}
            title={label}
        >
            {icon}
            <span className="hidden min-[360px]:inline">{label}</span>
        </button>
    );
}
