import type { StateStorage } from "zustand/middleware";

import { getLocalForageStore, lazyStore } from "@/lib/localforage-store";

const appStateStore = () => getLocalForageStore("app_state");

/**
 * zustand 持久化用的存储适配器。
 * localforage 驱动按需加载，读写语义与直接调用完全一致。
 */
export const localForageStorage = {
    getItem: async (name: string) => {
        if (typeof window === "undefined") return null;
        try {
            return (await (await appStateStore()).getItem<string>(name)) || null;
        } catch {
            return window.localStorage.getItem(name);
        }
    },
    setItem: async (name: string, value: string) => {
        if (typeof window === "undefined") return;
        try {
            await (await appStateStore()).setItem(name, value);
        } catch {
            window.localStorage.setItem(name, value);
        }
    },
    removeItem: async (name: string) => {
        if (typeof window === "undefined") return;
        try {
            await (await appStateStore()).removeItem(name);
        } catch {
            window.localStorage.removeItem(name);
        }
    },
} satisfies StateStorage;

/**
 * 按作用域取一个 localforage 实例（对齐 BeefTV 的同名导出）。
 * sundas 的素材/画布都是单实例存储，这里把 scope 只用作实例名后缀，
 * 保证不同账号的本地缓存互不串门。
 */
export function localForageStorageForScope(scope: string) {
    return lazyStore("kv", `sundas:${scope || "guest"}`);
}
