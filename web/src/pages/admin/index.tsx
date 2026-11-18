import { useEffect, useState } from "react";
import { App as AntApp, ConfigProvider, Drawer } from "antd";
import { ArrowUpRight, BookOpen, ChevronRight, GalleryHorizontalEnd, Gift, LayoutDashboard, ListChecks, Megaphone, Menu, NotebookPen, Package, ReceiptText, ScrollText, Settings2, ShieldCheck, Ticket, UsersRound, WandSparkles, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { RequireAdmin } from "@/components/layout/require-admin";
import { PageTransition } from "@/components/layout/page-transition";
import { useAuthStore } from "@/stores/use-auth-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { cn } from "@/lib/utils";
import { getAdminThemeConfig } from "./admin-theme";
import { AnnouncementsTab } from "./components/announcements";
import { AuditTab } from "./components/audit";
import { CatalogTab } from "./components/catalog";
import { DashboardTab } from "./components/dashboard";
import { InviteTab } from "./components/invite";
import { OrdersTab } from "./components/orders";
import { PromoConfigTab } from "./components/promo";
import { PromptsTab } from "./components/prompts";
import { RedeemTab } from "./components/redeem";
import { SettingsTab } from "./components/settings";
import { TasksTab } from "./tasks";
import { UsersTab } from "./components/users";
import { PromptSourcesTab } from "./prompts";
import { AccessTab } from "./access";
import { AnalyticsTab } from "./analytics";
import { useAdminRequest } from "./use-admin-request";
import { accessApi } from "@/services/api/admin/access";
import { AdminPermissionsContext } from "./permissions";

type TabKey = "dashboard" | "users" | "orders" | "tasks" | "catalog" | "redeem" | "announcements" | "promo" | "invite" | "settings" | "audit" | "prompts" | "access" | "analytics" | "prompt-items";

const TAB_PERMISSION: Record<TabKey, string[]> = {
    "prompt-items": ["prompts.read"], dashboard: ["dashboard.read"], users: ["users.read"], orders: ["orders.read"], tasks: ["tasks.read"],
    catalog: ["channels.read", "models.read", "catalog.read"], redeem: ["redeem.read"], announcements: ["announcements.read"],
    promo: ["promo.read"], invite: ["invites.read"], settings: ["settings.read"], audit: ["audit.read"], prompts: ["prompts.read"], access: ["admins.manage"], analytics: ["tasks.read"],
};
function canAccessTab(key: TabKey, permissions: string[] | null) {
    if (!permissions) return false;
    if (key === "tasks") return permissions.includes("tasks.read") || permissions.includes("credits.read");
    if (key === "catalog") return TAB_PERMISSION.catalog.some(permission => permissions.includes(permission));
    return TAB_PERMISSION[key].every(permission => permissions.includes(permission));
}

type NavItem = {
    key: TabKey;
    label: string;
    icon: LucideIcon;
    title: string;
    description: string;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
    {
        label: "总览",
        items: [{ key: "dashboard", label: "看板", icon: LayoutDashboard, title: "今日概览", description: "今天的收入、用户、积分与生成任务健康度。" }],
    },
    {
        label: "运营",
        items: [
            { key: "users", label: "用户", icon: UsersRound, title: "用户", description: "查看账户状态、会员信息，处理积分调整与访问控制。" },
            { key: "prompts", label: "提示词源", icon: BookOpen, title: "提示词源", description: "管理来源、同步和同步结果。" },
            { key: "orders", label: "订单", icon: ReceiptText, title: "订单", description: "跟踪充值、会员购买与退款处理。" },
            { key: "tasks", label: "任务管理", icon: ListChecks, title: "任务管理", description: "查看任务及冻结积分异常。" },
            { key: "redeem", label: "兑换码", icon: Ticket, title: "兑换码", description: "生成批次、导出兑换码并追踪使用状态。" },
            { key: "announcements", label: "公告", icon: Megaphone, title: "公告", description: "管理前台展示的公告内容与发布状态。" },
            { key: "promo", label: "宣发配置", icon: GalleryHorizontalEnd, title: "宣发配置", description: "管理首页活动条、轮播、弹窗、联系方式与点击数据。" },
            { key: "prompt-items", label: "提示词库", icon: NotebookPen, title: "提示词库", description: "管理灵感大厅与提示词页的数据：增删改、上下架、精选与排序。" },
            { key: "invite", label: "邀请返佣", icon: Gift, title: "邀请返佣", description: "配置返佣比例，查看邀请关系与返佣发放记录。" },
        ],
    },
    {
        label: "商品",
        items: [{ key: "catalog", label: "模型与套餐", icon: Package, title: "模型与套餐", description: "维护渠道、模型计费规则与会员套餐。" }, { key: "analytics", label: "渠道模型统计", icon: ListChecks, title: "渠道模型统计", description: "查看渠道、模型调用与失败情况。" }],
    },
    {
        label: "系统",
        items: [
            { key: "access", label: "管理员权限", icon: ShieldCheck, title: "管理员权限", description: "管理角色和管理员权限。" },
            { key: "settings", label: "系统设置", icon: Settings2, title: "系统设置", description: "站点信息、邮件、支付渠道、计费与订单参数。" },
            { key: "audit", label: "审计日志", icon: ScrollText, title: "审计日志", description: "管理员操作留痕，按时间倒序查看。" },
        ],
    },
];

const MENU = NAV_GROUPS.flatMap((group) => group.items);
const DATE_FORMAT = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

function isTabKey(value: string | null): value is TabKey {
    return MENU.some((item) => item.key === value);
}

export default function AdminPage() {
    const userId = useAuthStore((state) => state.user?.id ?? null);
    const sessionEpoch = useAuthStore((state) => state.sessionEpoch);
    return (
        <RequireAdmin>
            <AdminTheme key={`${sessionEpoch}:${userId ?? ""}`} />
        </RequireAdmin>
    );
}

function AdminTheme() {
    const dark = useThemeStore((state) => state.theme) === "dark";
    return (
        <ConfigProvider theme={getAdminThemeConfig(dark)}>
            <AntApp>
                <AdminShell />
            </AntApp>
        </ConfigProvider>
    );
}

function AdminShell() {
    const user = useAuthStore((state) => state.user);
    const request = useAdminRequest();
    const [permissions, setPermissions] = useState<string[] | null>(null);
    const [permissionError, setPermissionError] = useState("");
    useEffect(() => {
        let current = true;
        setPermissions(null); setPermissionError("");
        const refresh = () => accessApi(request).me().then(result => { if (current) { setPermissions(result.permissions); setPermissionError(""); } }).catch(error => { if (current) setPermissionError(error instanceof Error ? error.message : String(error)); });
        void refresh();
        window.addEventListener("sundas-admin-permissions-changed", refresh);
        return () => { current = false; window.removeEventListener("sundas-admin-permissions-changed", refresh); };
    }, [request]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [mobileOpen, setMobileOpen] = useState(false);
    const tabParam = searchParams.get("tab");
    const allowed = MENU.filter(item => canAccessTab(item.key, permissions));
    const activeTab: TabKey = isTabKey(tabParam) && allowed.some(item => item.key === tabParam) ? tabParam : allowed[0]?.key ?? "dashboard";
    const meta = MENU.find((item) => item.key === activeTab) ?? MENU[0];

    function selectTab(key: TabKey) {
        setSearchParams({ tab: key }, { replace: true });
        setMobileOpen(false);
    }

    useEffect(() => {
        document.body.classList.add("admin-theme");
        return () => document.body.classList.remove("admin-theme");
    }, []);

    useEffect(() => {
        const previous = document.title;
        document.title = `${meta.title} · sundas 管理后台`;
        return () => {
            document.title = previous;
        };
    }, [meta.title]);

    if (permissionError) return <div className="p-8">权限加载失败：{permissionError}，请刷新页面重试。</div>;
    if (!permissions) return <div className="p-8">正在加载管理员权限…</div>;
    if (!allowed.length) return <div className="p-8">当前账号没有可访问的后台页面。</div>;

    return (
        <AdminPermissionsContext.Provider value={permissions}><div className="admin-shell flex h-dvh overflow-hidden">
            <aside className="hidden w-[248px] shrink-0 flex-col bg-[var(--admin-sidebar)] lg:flex">
                <SidebarBrand />
                <AdminNav active={activeTab} onSelect={selectTab} permissions={permissions} />
                <SidebarFooter email={user?.email} />
            </aside>

            <Drawer
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                placement="left"
                width={280}
                closable={false}
                styles={{ body: { padding: 0, background: "var(--admin-sidebar)" } }}
            >
                <div className="flex h-full flex-col bg-[var(--admin-sidebar)]">
                    <div className="flex h-[72px] items-center justify-between border-b border-white/10 px-5">
                        <BrandWordmark height={18} />
                        <button type="button" onClick={() => setMobileOpen(false)} className="grid size-8 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="关闭菜单">
                            <X className="size-4" />
                        </button>
                    </div>
                    <AdminNav active={activeTab} onSelect={selectTab} permissions={permissions} />
                    <SidebarFooter email={user?.email} />
                </div>
            </Drawer>

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-[var(--admin-line)] px-4 py-3 lg:hidden">
                    <div className="flex items-center gap-2">
                        <BrandWordmark height={15} />
                        <span className="text-[11px] text-[var(--admin-muted)]">管理后台</span>
                    </div>
                    <button type="button" onClick={() => setMobileOpen(true)} className="grid size-9 place-items-center rounded-lg border border-[var(--admin-line)] text-[var(--admin-ink)]" aria-label="打开菜单">
                        <Menu className="size-4" />
                    </button>
                </div>

                <header className="border-b border-[var(--admin-line)] bg-[var(--admin-bg)]">
                    <div className="mx-auto flex w-full max-w-[1480px] flex-col px-5 py-6 sm:px-8 lg:px-10">
                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--admin-muted)]">
                            <span>管理后台</span>
                            <ChevronRight className="size-3" />
                            <span>{NAV_GROUPS.find((group) => group.items.some((item) => item.key === activeTab))?.label}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                            {/* 行内 margin：全局 markdown 排版对 h1/p 的 margin 会盖掉 tailwind 间距类，这里显式归零以保证与右侧区块垂直居中对齐 */}
                            <h1 style={{ margin: 0 }} className="min-w-0 text-[26px] font-semibold leading-tight tracking-[-0.035em] text-[var(--admin-ink)]">{meta.title}</h1>
                            <div className="flex shrink-0 items-center gap-3">
                                <div className="hidden text-right md:block">
                                    <div className="text-xs leading-5 text-[var(--admin-muted)]">{DATE_FORMAT.format(new Date())}</div>
                                    <div className="text-[11px] leading-4 text-[var(--admin-muted)]">{user?.email}</div>
                                </div>
                                <div className="grid size-9 place-items-center rounded-full border border-[var(--admin-line)] bg-[var(--admin-panel)] text-xs font-semibold text-[var(--admin-ink)]">
                                    {(user?.email?.[0] ?? "A").toUpperCase()}
                                </div>
                            </div>
                        </div>
                        <p style={{ margin: "16px 0 0" }} className="max-w-[70ch] text-sm leading-6 text-[var(--admin-muted)]">{meta.description}</p>
                    </div>
                </header>

                <main className="min-h-0 flex-1 overflow-y-auto">
                    <PageTransition className="mx-auto w-full max-w-[1480px] px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
                        {activeTab === "dashboard" ? <DashboardTab /> : null}
                        {activeTab === "users" ? <UsersTab /> : null}
                        {activeTab === "prompts" ? <PromptSourcesTab /> : null}
                        {activeTab === "access" ? <AccessTab /> : null}
                        {activeTab === "analytics" ? <AnalyticsTab /> : null}
                        {activeTab === "orders" ? <OrdersTab /> : null}
                        {activeTab === "tasks" ? <TasksTab /> : null}
                        {activeTab === "catalog" ? <CatalogTab /> : null}
                        {activeTab === "redeem" ? <RedeemTab /> : null}
                        {activeTab === "announcements" ? <AnnouncementsTab /> : null}
                        {activeTab === "promo" ? <PromoConfigTab /> : null}
                        {activeTab === "prompt-items" ? <PromptsTab /> : null}
                        {activeTab === "invite" ? <InviteTab /> : null}
                        {activeTab === "settings" ? <SettingsTab /> : null}
                        {activeTab === "audit" ? <AuditTab /> : null}
                    </PageTransition>
                </main>
            </div>
        </div></AdminPermissionsContext.Provider>
    );
}

function SidebarBrand() {
    return (
        <div className="flex h-[88px] items-center gap-3 border-b border-[var(--admin-sidebar-line)] px-5">
            <BrandWordmark height={18} />
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-white/45">Admin</span>
        </div>
    );
}

function AdminNav({ active, onSelect, permissions }: { active: TabKey; onSelect: (key: TabKey) => void; permissions: string[] }) {
    return (
        <nav className="flex-1 overflow-y-auto px-3 py-5">
            {NAV_GROUPS.filter(group => group.items.some(item => canAccessTab(item.key, permissions))).map((group) => (
                <div key={group.label} className="mb-6 last:mb-0">
                    <div className="mb-2 px-3 text-[10px] text-white/35">{group.label}</div>
                    <div className="space-y-1.5">
                        {group.items.filter(item => canAccessTab(item.key, permissions)).map((item) => {
                            const Icon = item.icon;
                            const selected = active === item.key;
                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => onSelect(item.key)}
                                    aria-current={selected ? "page" : undefined}
                                    className={cn(
                                        "relative flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-left text-[13px] transition-colors",
                                        selected
                                            ? "bg-white/[0.07] text-white"
                                            : "text-[var(--admin-sidebar-text)] hover:bg-white/[0.06] hover:text-white",
                                    )}
                                >
                                    {selected ? <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--admin-accent)]" /> : null}
                                    <Icon className={cn("size-4", selected ? "text-[var(--admin-accent)]" : "text-[var(--admin-sidebar-muted)]")} />
                                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                    {selected ? <span className="size-1.5 rounded-full bg-[var(--admin-accent)]" /> : null}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </nav>
    );
}

function SidebarFooter({ email }: { email?: string }) {
    return (
        <div className="border-t border-[var(--admin-sidebar-line)] p-4">
            <div className="truncate text-center text-[11px] text-white/45">{email}</div>
            <Link
                to="/"
                className="admin-sidebar-cta mt-2.5 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-semibold"
            >
                <WandSparkles className="size-4" />
                返回前台
                <ArrowUpRight className="size-3.5" />
            </Link>
        </div>
    );
}
