/**
 * 路由预取：鼠标悬停/键盘聚焦导航时，提前把目标页面的 chunk 拉下来。
 * 只在浏览器空闲时下载，避免和首屏资源抢带宽；同一个路由只会预取一次。
 */
import { useAuthStore } from "@/stores/use-auth-store";

type Loader = () => Promise<unknown>;

const ROUTE_LOADERS: Record<string, Loader> = {
    "/": () => import("@/pages/home"),
    "/explore": () => import("@/pages/home"),
    "/create": () => import("@/pages/image"),
    "/assets": () => import("@/pages/assets"),
    "/prompts": () => import("@/pages/prompts"),
    "/canvas": () => import("@/pages/canvas"),
    "/account": () => import("@/pages/account"),
    "/admin": () => import("@/pages/admin"),
};

const started = new Set<string>();

type NetworkConnection = {
    saveData?: boolean;
    effectiveType?: string;
};

function isConstrainedNetwork() {
    if (typeof navigator === "undefined") return false;
    const conn = (navigator as Navigator & { connection?: NetworkConnection }).connection;
    if (!conn) return false;
    return Boolean(conn.saveData) || conn.effectiveType === "slow-2g" || conn.effectiveType === "2g";
}

export function prefetchRoute(to: string) {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (isConstrainedNetwork()) return;
    const path = to.split(/[?#]/)[0] || "/";
    if ((path === "/admin" || path.startsWith("/admin/")) && useAuthStore.getState().user?.role !== "admin") return;
    const loader = ROUTE_LOADERS[path];
    if (!loader || started.has(path)) return;
    started.add(path);

    const run = () => {
        void loader().catch(() => {
            // 预取失败不打扰用户，下次悬停允许重试。
            started.delete(path);
        });
    };

    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(run, { timeout: 1200 });
    else window.setTimeout(run, 200);
}
