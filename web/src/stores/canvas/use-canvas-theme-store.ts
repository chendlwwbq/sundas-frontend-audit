import { create } from "zustand";
import { useLayoutEffect } from "react";

import { useThemeStore, type ThemeName } from "@/stores/use-theme-store";

type CanvasThemeStore = {
    theme: ThemeName;
    active: boolean;
    followGlobal: boolean;
    setTheme: (theme?: string) => void;
};

/**
 * 画布主题作用域（sundas 版）。
 *
 * BeefTV 这套 store 承载「画布可独立选外观」，sundas 的外观已锁定暗色，
 * 所以这里只保留导演台等调用方需要的契约：useActiveTheme() 返回当前主题、
 * useCanvasThemeScope() 标记画布处于激活态。
 */
export const useCanvasThemeStore = create<CanvasThemeStore>()((set) => ({
    theme: useThemeStore.getState().theme,
    active: false,
    followGlobal: true,
    setTheme: (theme) => set({ theme: theme === "light" ? "light" : "dark", followGlobal: false }),
}));

useThemeStore.subscribe((state, previous) => {
    if (state.theme !== previous.theme && useCanvasThemeStore.getState().followGlobal) {
        useCanvasThemeStore.setState({ theme: state.theme });
    }
});

export function useCanvasThemeScope() {
    useLayoutEffect(() => {
        useCanvasThemeStore.setState({ active: true });
        return () => {
            useCanvasThemeStore.setState({ active: false });
        };
    }, []);
}

export function useActiveTheme() {
    const workspaceTheme = useThemeStore((state) => state.theme);
    const canvasTheme = useCanvasThemeStore((state) => state.theme);
    const active = useCanvasThemeStore((state) => state.active);
    return active ? canvasTheme : workspaceTheme;
}
