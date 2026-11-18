import { Keyboard, X } from "lucide-react";

import { CANVAS_SHORTCUTS, formatShortcutKeys } from "@/lib/canvas/canvas-shortcuts";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

/**
 * 画布快捷键面板。迁移自 BeefTV：底部 Dock 的键盘入口点开后，
 * 用一张紧凑清单交代「这个画布到底能怎么操作」。
 */
export function CanvasShortcutsPopover({ onClose }: { onClose: () => void }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];

    return (
        <div
            role="dialog"
            aria-label="画布快捷键"
            className="pointer-events-auto absolute bottom-[calc(100%+10px)] left-1/2 z-40 w-[320px] -translate-x-1/2 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-2xl"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <header className="flex h-10 items-center gap-2 border-b px-3" style={{ borderColor: theme.toolbar.border }}>
                <Keyboard className="size-3.5 opacity-55" />
                <span className="text-[12px] font-semibold">画布快捷键</span>
                <button type="button" className="ml-auto grid size-6 place-items-center rounded-md opacity-55 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label="关闭快捷键面板">
                    <X className="size-3.5" />
                </button>
            </header>
            <div className="thin-scrollbar max-h-[320px] overflow-y-auto p-1.5">
                {CANVAS_SHORTCUTS.map((shortcut) => (
                    <div key={shortcut.id} className="flex h-8 items-center gap-3 rounded-lg px-2 text-[11.5px] transition-colors hover:bg-white/[0.05]">
                        <span className="min-w-0 flex-1 truncate opacity-80">{shortcut.title}</span>
                        <span className="flex shrink-0 items-center gap-1">
                            {shortcut.keys.map((keys, index) => (
                                <span key={index} className="flex items-center gap-0.5">
                                    {index ? <span className="px-0.5 text-[10px] opacity-30">/</span> : null}
                                    {keys.map((key) => (
                                        <kbd
                                            key={key}
                                            className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border px-1 font-sans text-[10px] font-medium leading-none"
                                            style={{ borderColor: theme.toolbar.border, background: "rgba(255,255,255,.05)", color: theme.node.text }}
                                        >
                                            {formatShortcutKeys([key])}
                                        </kbd>
                                    ))}
                                </span>
                            ))}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
