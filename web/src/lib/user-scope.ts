import { useAuthStore } from "@/stores/use-auth-store";

const GUEST_SCOPE = "guest";

/**
 * 本地存储命名空间（sundas 版）。
 *
 * BeefTV 用「工作区 id」做命名空间，sundas 没有工作区概念，直接以登录用户 id 为准；
 * 未登录时落到 guest，保证本地缓存键仍然确定、可复用。
 */
export function getActiveUserScope(): string {
    return useAuthStore.getState().user?.id || GUEST_SCOPE;
}

export function scopedStorageKey(name: string, scope = getActiveUserScope()) {
    return `${name}:user:${scope}`;
}

export const scopedLocalStorage = {
    getItem: (name: string) => {
        if (typeof window === "undefined") return null;
        try {
            return window.localStorage?.getItem(scopedStorageKey(name)) ?? null;
        } catch {
            return null;
        }
    },
    setItem: (name: string, value: string) => {
        if (typeof window === "undefined") return;
        try {
            window.localStorage?.setItem(scopedStorageKey(name), value);
        } catch {
            // UI 偏好属于可选数据，写入失败不应该阻断创建流程。
        }
    },
    removeItem: (name: string) => {
        if (typeof window === "undefined") return;
        try {
            window.localStorage?.removeItem(scopedStorageKey(name));
        } catch {
            // 浏览器存储不可用时尽力清理即可。
        }
    },
};
