import { creationSystemCss } from "@/components/creation/creation-system";
import "@/components/creation/creation-controls.css";
import { Suspense, lazy, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { AppConfigModalHost, PromoContactDialogHost } from "@/components/layout/lazy-overlays";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { DotField } from "@/components/background/dot-field";
import { CreationSidebar } from "@/components/layout/creation-sidebar";
import { PageTransition } from "@/components/layout/page-transition";
import { loadPromoConfig, type PromoItem } from "@/services/api/promo";
import { useThemeStore } from "@/stores/use-theme-store";

const PromoCorner = lazy(() => import("@/components/promo/promo-corner").then((module) => ({ default: module.PromoCorner })));
const PromoTopBar = lazy(() => import("@/components/promo/promo-top-bar").then((module) => ({ default: module.PromoTopBar })));

export default function UserLayout({ children }: { children: ReactNode }) {
    const { pathname, search } = useLocation();
    const theme = useThemeStore(state => state.theme);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [topbar, setTopbar] = useState<PromoItem | null>(null);
    const [corner, setCorner] = useState<PromoItem | null>(null);
    const bare = /^\/canvas\/[^/]+/.test(pathname) || /^\/(login|register|forgot-password)\/?$/.test(pathname);
    const canvas = /^\/canvas(?:\/|$)/.test(pathname);
    // 我的画布 / 创作 / 发现灵感 / 素材库 / 提示词库 / 账号中心 统一铺点阵底纹
    const dots = !bare && /^\/(canvas|create|explore|assets|prompts|account)(?:\/|$)/.test(pathname);
    const content = canvas ? children : (
        <Suspense fallback={<div role="status" className="p-6 text-sm text-muted-foreground">页面加载中…</div>}>
            <PageTransition>{children}</PageTransition>
        </Suspense>
    );

    useEffect(() => {
        // 右下角卡片全站展示，顶部活动条只在首页展示，两者共用同一份宣发配置（已带缓存合流）。
        void loadPromoConfig()
            .then((data) => {
                setCorner(data.corner ?? null);
                if (pathname === "/" || pathname === "/explore") setTopbar(data.topbar);
            })
            .catch(() => {
                setCorner(null);
                setTopbar(null);
            });
    }, [pathname]);

    useEffect(() => {
        setMobileOpen(false);
    }, [pathname, search]);

    if (bare) {
        return (
            <div className="h-dvh overflow-hidden">
                {content}
                <AppConfigModalHost />
            </div>
        );
    }

    const creation = ["/create", "/image", "/video"].includes(pathname);
    return (
        <div
            className="creation-shell flex h-dvh flex-col overflow-hidden bg-background text-foreground"
            data-astryx-theme="neutral"
            style={{ colorScheme: theme, "--top-nav-height": "64px" } as CSSProperties}
        >
            <style>{creationSystemCss}</style>
            {topbar && (pathname === "/" || pathname === "/explore") ? (
                <Suspense fallback={null}>
                    <PromoTopBar item={topbar} />
                </Suspense>
            ) : null}
            <AppTopNav mobileOpen={mobileOpen} onMobileOpen={() => setMobileOpen(true)} onMobileClose={() => setMobileOpen(false)} />
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                {creation && <CreationSidebar />}
                <main
                    className={
                        dots
                            ? "jm-dot-host relative isolate min-h-[calc(100dvh-var(--top-nav-height))] min-w-0 flex-1 overflow-hidden"
                            : "min-h-[calc(100dvh-var(--top-nav-height))] min-w-0 flex-1 overflow-hidden"
                    }
                >
                    {dots ? <DotField /> : null}
                    {content}
                </main>
            </div>
            <PromoContactDialogHost />
            {corner ? (
                <Suspense fallback={null}>
                    <PromoCorner item={corner} workbench={creation} />
                </Suspense>
            ) : null}
        </div>
    );
}
