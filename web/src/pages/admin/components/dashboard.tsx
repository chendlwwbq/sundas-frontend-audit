import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { Alert, Button } from "antd";
import { ArrowUpRight, ReceiptText, RefreshCw, Settings2, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";

import { useAdminRequest } from "../use-admin-request";
import { AdminBadge, AdminLoading, AdminPanel, AdminStat } from "./ui";
import { adminDashboardApi } from "@/services/api/admin/dashboard";
import { useAdminPermissions } from "../permissions";

type Dashboard = {
    users: { total: number; today: number };
    orders: { todayCount: number; gmvCents: number };
    credits: { issued: number; consumed: number };
    tasks: { total: number; succeeded: number; failed: number; inProgress: number; review: number };
    unreviewedPaymentNotifications: number;
};

export function DashboardTab() {
    const permissions = useAdminPermissions();
    const apiRequest = useAdminRequest();
    const [data, setData] = useState<Dashboard | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [todos, setTodos] = useState<{ key:string; label:string; count:number; tab:string }[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const now = dayjs();
            const range = new URLSearchParams({ from: now.startOf("day").toISOString(), to: now.toISOString() });
            const [dashboard, pending] = await Promise.all([apiRequest<Dashboard>(`/api/admin/dashboard?${range.toString()}`), adminDashboardApi(apiRequest).todos()]);
            setData(dashboard); setTodos(pending.items);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    if (!data && loading) return <AdminLoading label="正在读取今日数据" />;
    if (!data && error) {
        return (
            <AdminPanel title="数据暂时不可用" description={error} actions={<Button icon={<RefreshCw className="size-4" />} onClick={() => void load()} loading={loading}>重试</Button>}>
                <p className="text-sm text-[var(--admin-muted)]">检查 API 服务是否正常，然后重试。</p>
            </AdminPanel>
        );
    }
    if (!data) return null;

    const finished = data.tasks.succeeded + data.tasks.failed;
    const hasFinished = finished > 0;
    const successRate = hasFinished ? Math.round((data.tasks.succeeded / finished) * 100) : 0;
    const taskTone = !hasFinished ? "neutral" : successRate >= 95 ? "positive" : successRate >= 90 ? "warning" : "danger";
    const taskLabel = !hasFinished ? "暂无已结束任务" : successRate >= 95 ? "运行稳定" : successRate >= 90 ? "需要关注" : "异常偏高";
    const creditMax = Math.max(data.credits.issued, data.credits.consumed, 1);
    const netCredits = data.credits.issued - data.credits.consumed;

    return (
        <div className="space-y-5">
            {error ? (
                <Alert
                    type="warning"
                    showIcon
                    title={`刷新失败，正在展示上次成功获取的数据：${error}`}
                    action={<Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>重试</Button>}
                />
            ) : null}
            <AdminPanel title="待处理事项" description="异常仍然存在时会继续显示，不因填写核对记录而消失。"><div className="flex flex-wrap gap-3">{todos.map(item => <Link key={item.key} to={`/admin?tab=${item.tab}${item.key === "tasks" ? "&review=pending" : ["wallet", "lots", "unlinked"].includes(item.key) ? "&view=held" : ""}`} className="rounded border border-[var(--admin-line)] px-3 py-2">{item.label}：{item.count}</Link>)}</div></AdminPanel>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--admin-muted)]">今天的实时运营快照，数据来自订单、积分账本与生成任务。</p>
                <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>
                    刷新
                </Button>
            </div>

            <section className="overflow-hidden rounded-[14px] border border-[var(--admin-line)] bg-[var(--admin-panel)]">
                <div className="grid divide-y divide-[var(--admin-line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
                    <AdminStat label="今日 GMV" value={formatMoney(data.orders.gmvCents)} note={`${data.orders.todayCount} 笔已支付订单`} accent />
                    <AdminStat label="用户总数" value={formatNumber(data.users.total)} note={`今日新增 ${formatNumber(data.users.today)}`} />
                    <AdminStat label="今日消耗积分" value={formatNumber(data.credits.consumed)} note={`发放 ${formatNumber(data.credits.issued)} · 净变化 ${netCredits >= 0 ? "+" : ""}${formatNumber(netCredits)}`} />
                    <AdminStat label="任务成功率" value={hasFinished ? `${successRate}%` : "—"} note={`${formatNumber(data.tasks.succeeded)} / ${formatNumber(finished)} 个已结束任务成功`} />
                </div>
            </section>

            {data.unreviewedPaymentNotifications > 0 && <AdminPanel title="支付通知待核对" description={`有 ${formatNumber(data.unreviewedPaymentNotifications)} 条验签通过但未处理且未记录人工核对的通知；请结合支付平台确认。`} actions={<Link to="/admin?tab=orders">查看订单</Link>}>{null}</AdminPanel>}

            <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <AdminPanel
                    title="任务健康度"
                    description="今日创建的任务中，成功率按已结束的成功和失败任务计算。"
                    actions={<AdminBadge tone={taskTone}>{taskLabel}</AdminBadge>}
                >
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <div className="text-[34px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-[var(--admin-ink)]">{hasFinished ? `${successRate}%` : "—"}</div>
                            <div className="mt-2 text-xs text-[var(--admin-muted)]">成功 {formatNumber(data.tasks.succeeded)} 个，已结束 {formatNumber(finished)} 个</div>
                        </div>
                        <div className="text-right text-xs text-[var(--admin-muted)]">
                            <div>失败 {formatNumber(data.tasks.failed)} 个 · 进行中 {formatNumber(data.tasks.inProgress)} 个</div>
                            <div className="mt-1">待核对 {formatNumber(data.tasks.review)} 个</div>
                        </div>
                    </div>
                    <div className="mt-6 h-2 overflow-hidden rounded-full bg-[var(--admin-panel-soft)]">
                        <div className="h-full rounded-full bg-[var(--admin-accent)] transition-[width] duration-500" style={{ width: `${hasFinished ? successRate : 0}%` }} />
                    </div>
                    <div className="mt-3 flex justify-between text-[11px] text-[var(--admin-muted)]">
                        <span>0%</span>
                        <span>目标 90%</span>
                        <span>100%</span>
                    </div>
                </AdminPanel>

                <AdminPanel title="积分流动" description="今天发放与消耗的积分规模，用于判断活动力度与消耗速度。">
                    <div className="space-y-5">
                        <CreditBar label="发放" value={data.credits.issued} max={creditMax} tone="accent" />
                        <CreditBar label="消耗" value={data.credits.consumed} max={creditMax} tone="ink" />
                    </div>
                    <div className="mt-6 flex items-center justify-between border-t border-[var(--admin-line)] pt-4 text-xs">
                        <span className="text-[var(--admin-muted)]">净变化</span>
                        <span className="font-semibold tabular-nums text-[var(--admin-ink)]">{netCredits >= 0 ? "+" : ""}{formatNumber(netCredits)}</span>
                    </div>
                </AdminPanel>
            </div>

            <AdminPanel title="常用入口" description="直接前往最常用的管理页面。">
                <div className="grid gap-px overflow-hidden rounded-[10px] border border-[var(--admin-line)] bg-[var(--admin-line)] sm:grid-cols-3">
                    {[
                        { to: "/admin?tab=users", permission: "users.read", icon: UsersRound, title: "用户与积分", description: "搜索用户、调整积分与访问状态" },
                        { to: "/admin?tab=orders", permission: "orders.read", icon: ReceiptText, title: "订单与退款", description: "查看支付流水，处理退款" },
                        { to: "/admin?tab=settings", permission: "settings.read", icon: Settings2, title: "系统设置", description: "邮件、支付、计费与订单参数" },
                    ].filter(item => permissions.includes(item.permission)).map((item) => (
                        <Link key={item.to} to={item.to} className="admin-quick-link group flex items-start gap-3 p-4 transition-colors">
                            <span className="grid size-9 shrink-0 place-items-center rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] text-[var(--admin-muted)]">
                                <item.icon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1 text-sm font-medium text-[var(--admin-ink)]">
                                    {item.title}
                                    <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-[var(--admin-muted)]">{item.description}</span>
                            </span>
                        </Link>
                    ))}
                </div>
            </AdminPanel>
        </div>
    );
}

function CreditBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: "accent" | "ink" }) {
    return (
        <div>
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-[var(--admin-muted)]">{label}</span>
                <span className="text-sm font-semibold tabular-nums text-[var(--admin-ink)]">{formatNumber(value)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--admin-panel-soft)]">
                <div className={tone === "accent" ? "h-full rounded-full bg-[var(--admin-accent)]" : "h-full rounded-full bg-[var(--admin-ink)]/55"} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
            </div>
        </div>
    );
}

function formatNumber(value: number) {
    return value.toLocaleString("zh-CN");
}

function formatMoney(cents: number) {
    return `¥${(cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
