import { create } from "zustand";

export type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
};

/**
 * 主题已锁定为暗色（浅色模式功能已移除）。
 * 保留 store 形状与 setTheme 空实现，画布等依赖 theme 的组件零改动。
 */
export const useThemeStore = create<ThemeStore>()((set) => ({
    theme: "dark",
    setTheme: () => set({ theme: "dark" }),
}));
