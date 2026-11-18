import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Drawer } from "antd";
import { Code2, Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { PromoContactButton } from "@/components/promo/promo-contact-button";
import { UserAccountMenu } from "@/components/layout/account-menu";
import { NavAdminIcon, NavAssetsIcon, NavCanvasIcon, NavCreateIcon, NavExploreIcon, NavHomeIcon, NavPromptsIcon } from "@/components/layout/nav-icons";
import { useAuthStore } from "@/stores/use-auth-store";
import { AppConfigModalHost } from "@/components/layout/lazy-overlays";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/route-prefetch";
import { loadSiteInfo } from "@/services/api/site";
import "./app-top-nav.css";

export function useApiIntegrationUrl() {
    const [url, setUrl] = useState("");
    useEffect(() => {
        let active = true;
        void loadSiteInfo().then(({ site }) => {
            const value = site.apiIntegrationUrl?.trim();
            if (active && value && /^https?:\/\//i.test(value)) setUrl(value);
        }).catch(() => undefined);
        return () => { active = false; };
    }, []);
    return url;
}

type NavIcon = ComponentType<{ className?: string }>;
type NavItem = { to: string; labelKey: string; icon: NavIcon; match: (pathname: string) => boolean };

const creationNav: NavItem[] = [
    { to: "/", labelKey: "navigation.home", icon: NavHomeIcon, match: path => path === "/" },
    { to: "/canvas", labelKey: "navigation.canvas", icon: NavCanvasIcon, match: path => path === "/canvas" },
    { to: "/create", labelKey: "navigation.create", icon: NavCreateIcon, match: path => ["/create", "/image", "/video"].includes(path) },
    { to: "/explore", labelKey: "navigation.explore", icon: NavExploreIcon, match: path => path === "/explore" },
];
const resourceNav: NavItem[] = [
    { to: "/assets", labelKey: "navigation.assets", icon: NavAssetsIcon, match: path => path === "/assets" },
    { to: "/prompts", labelKey: "navigation.prompts", icon: NavPromptsIcon, match: path => path === "/prompts" },
];

function useNavItems(): NavItem[] {
    const user = useAuthStore((state) => state.user);
    return user?.role === "admin"
        ? [...creationNav, ...resourceNav, { to: "/admin", labelKey: "navigation.admin", icon: NavAdminIcon, match: (path: string) => path === "/admin" }]
        : [...creationNav, ...resourceNav];
}

export function AppTopNav({ mobileOpen, onMobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileOpen: () => void; onMobileClose: () => void }) {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const items = useNavItems();
    const apiUrl = useApiIntegrationUrl();

    return (
        <>
            <header className="app-top-nav sticky top-0 z-40 shrink-0 border-b border-[rgba(255,255,255,0.08)] bg-rail/85 backdrop-blur-[20px]">
                {/* 头部通栏：布局保留（logo 贴左、导航居中、账户区贴右），视觉按即梦规范 */}
                <div className="flex h-[64px] w-full items-center gap-3 px-4 md:px-6 xl:gap-5 xl:px-8">
                    <Link to="/" className="flex shrink-0 items-center gap-2.5 !text-foreground transition hover:opacity-80">
                        <img src="/brand/sundas-symbol.svg" alt="" className="size-[26px]" />
                        <BrandWordmark height={17} decorative />
                    </Link>

                    <nav className="hidden min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] lg:flex [&::-webkit-scrollbar]:hidden" aria-label="primary">
                        <div className="mx-auto flex w-max items-center gap-0.5 xl:gap-1">
                            {apiUrl && <a href={apiUrl} target="_blank" rel="noopener noreferrer" className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2 text-[12.5px] font-medium !text-muted-foreground transition-colors hover:text-foreground xl:gap-2 xl:px-2.5 xl:text-[13px]"><Code2 className="size-4" />API 对接</a>}
                            {items.map((item) => {
                                const Icon = item.icon;
                                const active = item.match(pathname);
                                return (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        aria-current={active ? "page" : undefined}
                                        onMouseEnter={() => prefetchRoute(item.to)}
                                        onFocus={() => prefetchRoute(item.to)}
                                        className={cn(
                                            "nav-item relative flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2 text-[12.5px] font-medium transition-colors duration-150 xl:gap-2 xl:px-2.5 xl:text-[13px] min-[1360px]:px-3",
                                            active ? "is-active !text-white" : "!text-muted-foreground hover:!text-foreground",
                                        )}
                                    >
                                        <Icon className="size-4 shrink-0" />
                                        <span className="nav-label">{t(item.labelKey)}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </nav>

                    <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-0 xl:gap-2">
                        {/* 右侧动作区：不套背景容器，会员/积分/头像三枚胶囊直接贴在顶栏上 */}
                        <div className="hidden items-center gap-1.5 md:flex xl:gap-2">
                            <PromoContactButton variant="topbar" />
                            <UserAccountMenu />
                        </div>
                        <div className="flex items-center md:hidden">
                            <UserAccountMenu />
                        </div>
                        <button
                            type="button"
                            className="grid size-9 place-items-center rounded-[8px] border border-border text-muted-foreground transition hover:text-foreground lg:hidden"
                            onClick={onMobileOpen}
                            aria-expanded={mobileOpen}
                            aria-label={t("navigation.openMenu")}
                        >
                            <Menu className="size-5" />
                        </button>
                    </div>
                </div>
            </header>
            <MobileDrawer open={mobileOpen} items={items} pathname={pathname} onNavigate={onMobileClose} />
            <AppConfigModalHost />
        </>
    );
}

function MobileDrawer({ open, items, pathname, onNavigate }: { open: boolean; items: NavItem[]; pathname: string; onNavigate: () => void }) {
    const { t } = useTranslation();
    const apiUrl = useApiIntegrationUrl();
    return (
        <Drawer
            placement="left"
            open={open}
            onClose={onNavigate}
            closable={false}
            size={280}
            destroyOnHidden
            rootClassName="lg:hidden"
            styles={{ body: { padding: 0, display: "flex", flexDirection: "column", height: "100%" } }}
        >
            <aside className="flex h-full flex-col bg-popover text-popover-foreground">
                <div className="relative flex h-[72px] shrink-0 items-center px-5">
                    <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 text-foreground">
                        <img src="/brand/sundas-symbol.svg" alt="" className="size-6" />
                        <BrandWordmark height={16} decorative />
                    </Link>
                    <button type="button" className="absolute right-3 grid size-8 place-items-center text-muted-foreground hover:text-foreground" onClick={onNavigate} aria-label={t("navigation.closeMenu")}>
                        <X className="size-4" />
                    </button>
                </div>
                <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-3" aria-label={t("navigation.openMenu")}>
                    {apiUrl && <a href={apiUrl} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className="flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm !text-muted-foreground hover:!bg-accent hover:text-foreground"><Code2 className="size-4" />API 对接</a>}
                    {items.map((item) => {
                        const Icon = item.icon;
                        const active = item.match(pathname);
                        return (
                            <Link
                                key={item.to}
                                to={item.to}
                                aria-current={active ? "page" : undefined}
                                onClick={onNavigate}
                                onPointerDown={() => prefetchRoute(item.to)}
                                className={cn(
                                    "relative flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors",
                                    active ? "bg-[rgba(255,255,255,0.08)] font-medium !text-foreground" : "!text-muted-foreground hover:!bg-accent hover:!text-foreground",
                                )}
                            >
                                <Icon className={cn("size-4 shrink-0", active ? "text-white" : "text-muted-foreground")} />
                                <span>{t(item.labelKey)}</span>
                            </Link>
                        );
                    })}
                </nav>
                <div className="shrink-0 border-t border-border p-3">
                    <PromoContactButton />
                </div>
            </aside>
        </Drawer>
    );
}
