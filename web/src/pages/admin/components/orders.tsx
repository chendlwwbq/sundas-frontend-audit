import { useEffect, useRef, useState } from "react";
import { App as AntApp, Button, Checkbox, DatePicker, Input, Modal, Segmented, Table, Tabs } from "antd";
import type { TableColumnsType } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { RefreshCw, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { useAdminRequest } from "../use-admin-request";
import { useAdminPermissions } from "../permissions";
import { ADMIN_AUTOFILL_OFF, AdminBadge, AdminField, AdminPanel, AdminStat, AdminToolbar, type AdminBadgeTone } from "./ui";

type AdminOrder = {
    orderNo: string;
    email: string;
    type: string;
    credits: number;
    amountCents: number;
    provider: string;
    payType: string;
    status: string;
    createdAt: string;
    paidAt: string | null;
    refundedAt: string | null;
    refundAmountCents: number | null;
    fulfillmentIssue: string | null;
    refundCreditTarget: number | null;
    refundCreditDeducted: number | null;
    refundDeductRequested: boolean | null;
};
type FulfillmentReview = {
    order: { orderNo: string; amountCents: number; paidAt: string | null; fulfillmentIssue: string };
    quote: { subscriptionId: string | null; previousOrderId: string | null; previousPlanId: string | null; previousEndsAt: string | null; previousNextGrantAt: string | null; previousMonthlyCredits: number | null; quotedAt: string | null } | null;
    subscriptions: { id: string; planId: string; planName: string | null; status: string; endsAt: string; nextGrantAt: string | null; currentOrderId: string | null; monthlyCredits: number | null }[];
    notifications: { total: number; verified: number; processed: number };
};
type PendingNotification = { id: string; provider: string; orderNo: string | null; createdAt: string; tradeStatus: string | null; tradeNo: string | null; money: string | null; orderStatus: string | null; orderAmountCents: number | null; reason: string; reviewedAt: string | null; reviewNote: string | null; reviewedBy: string | null };

function PaymentNotifications() {
    const permissions = useAdminPermissions();
    const apiRequest = useAdminRequest();
    const { message } = AntApp.useApp();
    const [data, setData] = useState<{ items: PendingNotification[]; total: number }>({ items: [], total: 0 });
    const [page, setPage] = useState(1);
    const [reviewFilter, setReviewFilter] = useState("unreviewed");
    const [loading, setLoading] = useState(false);
    const [target, setTarget] = useState<PendingNotification | null>(null);
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const loadSequence = useRef(0);
    async function load() {
        const sequence = ++loadSequence.current;
        setLoading(true);
        try { const result = await apiRequest<{ items: PendingNotification[]; total: number }>(`/api/admin/payment-notifications/unprocessed?page=${page}&pageSize=20&review=${reviewFilter}`); if (sequence === loadSequence.current) setData(result); }
        catch (error) { if (sequence === loadSequence.current) message.error(error instanceof Error ? error.message : String(error)); }
        finally { if (sequence === loadSequence.current) setLoading(false); }
    }
    useEffect(() => { void load(); return () => { loadSequence.current++; }; }, [page, reviewFilter]);
    async function review() {
        if (!target || !note.trim()) { message.warning("请填写核对说明"); return; }
        setSaving(true);
        try {
            await apiRequest(`/api/admin/payment-notifications/${target.id}/review`, { method: "POST", json: { note: note.trim() } });
            message.success("已记录人工核对，不改变支付状态"); setTarget(null); setNote(""); await load();
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setSaving(false); }
    }
    const columns: TableColumnsType<PendingNotification> = [
        { title: "收到时间", dataIndex: "createdAt", render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm:ss") },
        { title: "渠道", dataIndex: "provider" },
        { title: "订单号", dataIndex: "orderNo", render: (value: string | null) => value || "未提供" },
        { title: "平台交易号", dataIndex: "tradeNo", render: (value: string | null) => value || "未提供" },
        { title: "通知状态", dataIndex: "tradeStatus", render: (value: string | null) => value || "未提供" },
        { title: "通知金额", dataIndex: "money", render: (value: string | null) => value || "未提供" },
        { title: "当前核对结果", dataIndex: "reason" },
        { title: "站内订单", render: (_value, row) => row.orderStatus ? `${STATUS[row.orderStatus]?.label ?? row.orderStatus} · ¥${((row.orderAmountCents ?? 0) / 100).toFixed(2)}` : "未找到" },
        { title: "人工核对", render: (_value, row) => row.reviewedAt ? <span>已记录：{row.reviewNote} · {dayjs(row.reviewedAt).format("YYYY-MM-DD HH:mm:ss")} · 管理员 {row.reviewedBy}</span> : permissions.includes("orders.manage") ? <Button size="small" onClick={() => { setTarget(row); setNote(""); }}>记录核对</Button> : "未核对" },
    ];
    return <><AdminPanel title="未处理支付通知" description="仅列出验签通过、未处理且状态为成功或未提供状态的通知。核对结果基于当前订单信息，历史失败重试即使后续成功仍会保留；请对照支付平台核实，不代表资金已到账，也不会自动重放。" actions={<Button size="small" onClick={() => void load()}>刷新</Button>} flush>
        <AdminToolbar><Segmented value={reviewFilter} onChange={(value) => { setPage(1); setReviewFilter(String(value)); }} options={[{ label: "待人工核对", value: "unreviewed" }, { label: "已记录核对", value: "reviewed" }, { label: "全部", value: "all" }]} /></AdminToolbar>
        <Table rowKey="id" columns={columns} dataSource={data.items} loading={loading} scroll={{ x: 1100 }} pagination={{ current: page, pageSize: 20, total: data.total, onChange: setPage, showSizeChanger: false }} />
    </AdminPanel><Modal title="记录人工核对" open={Boolean(target)} onCancel={() => { if (!saving) setTarget(null); }} onOk={() => void review()} confirmLoading={saving} okText="保存核对记录" cancelText="取消">
        <p>通知 {target?.id}，订单 {target?.orderNo || "未提供"}。请先核实支付平台及站内订单；这里只记录核对说明，不会处理通知、修改订单或发放积分。</p>
        <Input.TextArea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="填写核对结果和依据" />
    </Modal></>;
}

const STATUS: Record<string, { label: string; tone: AdminBadgeTone }> = {
    pending: { label: "待支付", tone: "warning" },
    paid: { label: "已支付", tone: "positive" },
    closed: { label: "已关闭", tone: "neutral" },
    refunded: { label: "站内已登记退款", tone: "danger" },
};

type OrderSummary = {
    revenueCents: number;
    refundCents: number;
    netCents: number;
    paidOrders: number;
    paidUsers: number;
    credits: number;
    planRevenueCents: number;
    creditRevenueCents: number;
    pendingOrders: number;
};
type SummaryPreset = "today" | "24h" | "week" | "month" | "lastWeek" | "lastMonth";
const SUMMARY_PRESETS: { label: string; value: SummaryPreset }[] = [
    { label: "当天", value: "today" },
    { label: "近24小时", value: "24h" },
    { label: "本周", value: "week" },
    { label: "本月", value: "month" },
    { label: "上周", value: "lastWeek" },
    { label: "上月", value: "lastMonth" },
];
function weekStart(now: Dayjs) {
    return now.subtract((now.day() + 6) % 7, "day").startOf("day");
}
function rangeForPreset(preset: SummaryPreset): [Dayjs, Dayjs] {
    const now = dayjs();
    if (preset === "24h") return [now.subtract(24, "hour"), now];
    if (preset === "week") return [weekStart(now), now];
    if (preset === "month") return [now.startOf("month"), now];
    if (preset === "lastWeek") return [weekStart(now).subtract(7, "day"), weekStart(now)];
    if (preset === "lastMonth") return [now.subtract(1, "month").startOf("month"), now.startOf("month")];
    return [now.startOf("day"), now];
}
function formatRange(range: [Dayjs, Dayjs]) {
    return `${range[0].format("YYYY-MM-DD HH:mm")} ~ ${range[1].format("YYYY-MM-DD HH:mm")}`;
}
function formatMoney(cents: number) {
    return `¥${(cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_OPTIONS = [
    { value: "", label: "全部" },
    { value: "pending", label: "待支付" },
    { value: "paid", label: "已支付" },
    { value: "review", label: "权益待核对" },
    { value: "closed", label: "已关闭" },
    { value: "refunded", label: "站内已登记退款" },
];

export function OrdersTab() {
    const permissions = useAdminPermissions();
    const [urlParams] = useSearchParams();
    const apiRequest = useAdminRequest();
    const { message } = AntApp.useApp();
    const [status, setStatus] = useState("");
    const [search, setSearch] = useState(urlParams.get("search") ?? "");
    const [query, setQuery] = useState(urlParams.get("search") ?? "");
    const [page, setPage] = useState(1);
    const [data, setData] = useState<{ items: AdminOrder[]; total: number }>({ items: [], total: 0 });
    const [loading, setLoading] = useState(false);
    const [summaryPreset, setSummaryPreset] = useState<SummaryPreset | "">("today");
    const [summaryRange, setSummaryRange] = useState<[Dayjs, Dayjs]>(() => rangeForPreset("today"));
    const [summary, setSummary] = useState<OrderSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState("");
    const [target, setTarget] = useState<AdminOrder | null>(null);
    const [deduct, setDeduct] = useState(true);
    const [note, setNote] = useState("");
    const [refunding, setRefunding] = useState(false);
    const [refundPreview, setRefundPreview] = useState<{ refundAmountCents: number; durationDays: number; calculatedAt: string; canRefund: boolean } | null>(null);
    const [previewError, setPreviewError] = useState("");
    const [reviewTarget, setReviewTarget] = useState<AdminOrder | null>(null);
    const [review, setReview] = useState<FulfillmentReview | null>(null);
    const [reviewError, setReviewError] = useState("");
    const [externalAmount, setExternalAmount] = useState("");
    const [externalNote, setExternalNote] = useState("");
    const [externalConfirmed, setExternalConfirmed] = useState(false);
    const [noFulfillmentConfirmed, setNoFulfillmentConfirmed] = useState(false);
    const [recordingExternal, setRecordingExternal] = useState(false);

    useEffect(() => {
        let active = true;
        setReview(null); setReviewError(""); setExternalAmount(""); setExternalNote(""); setExternalConfirmed(false); setNoFulfillmentConfirmed(false);
        if (reviewTarget) void apiRequest<FulfillmentReview>(`/api/admin/orders/${encodeURIComponent(reviewTarget.orderNo)}/fulfillment-review`)
            .then((value) => { if (active) setReview(value); })
            .catch((error) => { if (active) setReviewError(error instanceof Error ? error.message : String(error)); });
        return () => { active = false; };
    }, [reviewTarget?.orderNo]);

    useEffect(() => {
        let active = true;
        setRefundPreview(null); setPreviewError("");
        if (target?.type === "plan") {
            void apiRequest<{ refundAmountCents: number; durationDays: number; calculatedAt: string; canRefund: boolean }>(`/api/admin/orders/${encodeURIComponent(target.orderNo)}/refund-preview`)
                .then((value) => { if (active) setRefundPreview(value); })
                .catch((error) => { if (active) setPreviewError(error instanceof Error ? error.message : String(error)); });
        }
        return () => { active = false; };
    }, [target?.orderNo, target?.type]);

    async function load() {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), pageSize: "20", status, search: query });
            setData(await apiRequest<{ items: AdminOrder[]; total: number }>(`/api/admin/orders?${params.toString()}`));
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, [page, status, query]);

    useEffect(() => {
        let active = true;
        setSummaryLoading(true);
        setSummaryError("");
        const params = new URLSearchParams({ from: summaryRange[0].toISOString(), to: summaryRange[1].toISOString() });
        void apiRequest<OrderSummary>(`/api/admin/orders/summary?${params.toString()}`)
            .then((value) => { if (active) setSummary(value); })
            .catch((error) => { if (active) setSummaryError(error instanceof Error ? error.message : String(error)); })
            .finally(() => { if (active) setSummaryLoading(false); });
        return () => { active = false; };
    }, [summaryRange[0].valueOf(), summaryRange[1].valueOf()]);

    async function refund() {
        if (!target) return;
        setRefunding(true);
        try {
            const result = await apiRequest<{ deducted: number; shortfall: number; waived: number; rebateDeducted: number; rebateShortfall: number; refundAmountCents?: number; previousCycleTarget?: number; previousCycleAdjustment?: number }>(`/api/admin/orders/${target.orderNo}/refund`, {
                method: "POST",
                json: { deduct, note },
            });
            message.success(`已记录退款${result.refundAmountCents !== undefined ? ` ¥${(result.refundAmountCents / 100).toFixed(2)}，需另行在支付平台处理资金` : ""}，扣回 ${result.deducted} 积分${result.previousCycleTarget !== undefined ? `；旧周期保留 ${result.previousCycleTarget} 积分，调整 ${result.previousCycleAdjustment}` : ""}${result.shortfall ? `，差额 ${result.shortfall}` : ""}${result.waived ? `，未要求扣回 ${result.waived}` : ""}；返佣扣回 ${result.rebateDeducted}${result.rebateShortfall ? `，差额 ${result.rebateShortfall}` : ""}`);
            setTarget(null);
            setNote("");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setRefunding(false);
        }
    }

    async function recordExternalRefund() {
        if (!reviewTarget || !externalConfirmed || !noFulfillmentConfirmed || !externalNote.trim() || !/^\d+(?:\.\d{1,2})?$/.test(externalAmount.trim())) { message.warning("请填写实际退款金额、核对说明并完成两项确认"); return; }
        const [yuan, fraction = ""] = externalAmount.trim().split(".");
        const amountCents = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
        if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > reviewTarget.amountCents) { message.warning("退款金额须大于零且不超过实付金额"); return; }
        setRecordingExternal(true);
        try {
            await apiRequest(`/api/admin/orders/${encodeURIComponent(reviewTarget.orderNo)}/record-external-refund`, { method: "POST", json: { amountCents, note: externalNote.trim(), confirmedExternalRefund: true, confirmedNoFulfillment: true } });
            message.success("已登记管理员确认的外部退款；系统未调用支付平台");
            setReviewTarget(null); await load();
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setRecordingExternal(false); }
    }

    const columns: TableColumnsType<AdminOrder> = [
        { title: "订单号", dataIndex: "orderNo", render: (value: string) => <span className="font-medium tabular-nums text-[var(--admin-ink)]">{value}{permissions.includes("invites.read") && <> · <Link to={`/admin?tab=invite&orderNo=${encodeURIComponent(value)}`}>返佣记录</Link></>}</span> },
        { title: "用户", dataIndex: "email", render: (value: string) => <span className="text-[var(--admin-muted)]">{value}</span> },
        { title: "类型", dataIndex: "type", render: (value: string) => (value === "plan" ? "会员" : "积分") },
        { title: "金额", dataIndex: "amountCents", align: "right", render: (value: number) => <span className="font-medium tabular-nums text-[var(--admin-ink)]">¥{(value / 100).toFixed(2)}</span> },
        { title: "积分", dataIndex: "credits", align: "right", render: (value: number) => <span className="tabular-nums">{value.toLocaleString("zh-CN")}</span> },
        { title: "状态", dataIndex: "status", render: (value: string, row) => <AdminBadge tone={row.fulfillmentIssue ? "warning" : STATUS[value]?.tone ?? "neutral"}>{row.fulfillmentIssue ? "支付成功，权益待核对" : STATUS[value]?.label ?? value}</AdminBadge> },
        { title: "权益异常", dataIndex: "fulfillmentIssue", render: (value: string | null) => value ?? "—" },
        { title: "退款积分", render: (_value, row) => row.status !== "refunded" ? "—" : row.refundDeductRequested === null ? "历史记录未知" : row.refundDeductRequested ? `扣回 ${row.refundCreditDeducted} / ${row.refundCreditTarget}` : `未要求扣回 ${row.refundCreditTarget}` },
        { title: "记录应退", render: (_value, row) => row.refundAmountCents == null ? "—" : `¥${(row.refundAmountCents / 100).toFixed(2)}` },
        { title: "创建", dataIndex: "createdAt", render: (value: string) => <span className="tabular-nums text-[var(--admin-muted)]">{dayjs(value).format("MM-DD HH:mm")}</span> },
        {
            title: "操作",
            key: "actions",
            align: "right",
            render: (_value, record) =>
                record.fulfillmentIssue ? <Button size="small" onClick={() => setReviewTarget(record)}>查看核对信息</Button> : record.status === "paid" && permissions.includes("orders.manage") ? (
                    <Button size="small" danger onClick={() => setTarget(record)}>
                        退款
                    </Button>
                ) : null,
        },
    ];

    return (
        <div className="space-y-5">
            <Tabs
                defaultActiveKey="summary"
                items={[
                    {
                        key: "summary",
                        label: "账单总览",
                        children: <AdminPanel
                title="订单总览"
                description={`统计 ${formatRange(summaryRange)}；收入按支付时间，退款按退款时间。`}
                actions={<DatePicker.RangePicker allowClear={false} format="YYYY-MM-DD" value={summaryRange} onChange={(value) => {
                    if (!value?.[0] || !value[1]) return;
                    setSummaryPreset("");
                    setSummaryRange([value[0].startOf("day"), value[1].endOf("day")]);
                }} />}
                flush
            >
                <div className="border-b border-[var(--admin-line)] px-5 py-3">
                    <Segmented value={summaryPreset} options={SUMMARY_PRESETS} onChange={(value) => {
                        const preset = value as SummaryPreset;
                        setSummaryPreset(preset);
                        setSummaryRange(rangeForPreset(preset));
                    }} />
                </div>
                {summaryError ? <p className="border-b border-[var(--admin-line)] px-5 py-3 text-xs text-[var(--admin-danger)]">{summaryError}</p> : null}
                <div className="grid divide-y divide-[var(--admin-line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3">
                    <AdminStat label="净收入" value={summaryLoading || !summary ? "—" : formatMoney(summary.netCents)} note={summary ? `支付 ${formatMoney(summary.revenueCents)} · 退款 ${formatMoney(summary.refundCents)}` : "加载中"} accent />
                    <AdminStat label="支付订单" value={summaryLoading || !summary ? "—" : summary.paidOrders.toLocaleString("zh-CN")} note={summary ? `${summary.paidUsers.toLocaleString("zh-CN")} 位用户 · 客单价 ${formatMoney(summary.paidOrders ? summary.revenueCents / summary.paidOrders : 0)}` : "加载中"} />
                    <AdminStat label="退款金额" value={summaryLoading || !summary ? "—" : formatMoney(summary.refundCents)} note="按退款时间统计" />
                    <AdminStat label="会员收入" value={summaryLoading || !summary ? "—" : formatMoney(summary.planRevenueCents)} note="已支付会员订单" />
                    <AdminStat label="积分收入" value={summaryLoading || !summary ? "—" : formatMoney(summary.creditRevenueCents)} note="已支付积分订单" />
                    <AdminStat label="发放积分 / 待支付" value={summaryLoading || !summary ? "—" : `${summary.credits.toLocaleString("zh-CN")} / ${summary.pendingOrders.toLocaleString("zh-CN")}`} note="发放按已支付订单；待支付按创建时间" />
                </div>
            </AdminPanel>,
                    },
                    {
                        key: "orders",
                        label: "账单流水",
                        children: <AdminPanel title="订单流水" description="充值、会员购买与退款记录；退款只做标记，资金请在支付平台原路退回。" actions={<Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>刷新</Button>} flush>
                <AdminToolbar>
                    <div className="w-full sm:w-80">
                        <Input.Search
                            {...ADMIN_AUTOFILL_OFF}
                            name="sundas-admin-order-search"
                            placeholder="订单号或邮箱"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            onSearch={(value) => {
                                setPage(1);
                                setQuery(value.trim());
                            }}
                            className="w-full"
                            allowClear
                            prefix={<Search className="size-4 text-[var(--admin-muted)]" />}
                        />
                    </div>
                    <Segmented
                        value={status}
                        onChange={(value) => {
                            setPage(1);
                            setStatus(String(value));
                        }}
                        options={STATUS_OPTIONS}
                    />
                    <span className="ml-auto text-xs text-[var(--admin-muted)]">共 {data.total.toLocaleString("zh-CN")} 笔</span>
                </AdminToolbar>
                <Table<AdminOrder>
                    rowKey="orderNo"
                    loading={loading}
                    dataSource={data.items}
                    columns={columns}
                    scroll={{ x: 980 }}
                    pagination={{ current: page, pageSize: 20, total: data.total, onChange: setPage, showSizeChanger: false }}
                />
            </AdminPanel>,
                    },
                    {
                        key: "notifications",
                        label: "未处理支付通知",
                        children: <PaymentNotifications />,
                    },
                ]}
            />

            <Modal title="订单权益核对" open={Boolean(reviewTarget)} onCancel={() => { if (!recordingExternal) setReviewTarget(null); }} closable={!recordingExternal} maskClosable={!recordingExternal} footer={<div className="flex justify-end gap-2"><Button disabled={recordingExternal} onClick={() => setReviewTarget(null)}>关闭</Button>{permissions.includes("orders.manage") && <Button danger loading={recordingExternal} disabled={!review || !externalConfirmed || !noFulfillmentConfirmed} onClick={() => void recordExternalRefund()}>登记外部已退款</Button>}</div>} width={640}>
                {reviewError ? <p>{reviewError}</p> : !review ? <p>正在加载核对信息…</p> : <div className="space-y-3 text-sm">
                    <p>{review.order.fulfillmentIssue}</p>
                    <p>订单 {review.order.orderNo} · 已付 ¥{(review.order.amountCents / 100).toFixed(2)} · 支付时间 {review.order.paidAt ? dayjs(review.order.paidAt).format("YYYY-MM-DD HH:mm:ss") : "未知"}</p>
                    <p>支付通知：共 {review.notifications.total} 条，验签通过 {review.notifications.verified} 条，已处理 {review.notifications.processed} 条。</p>
                    {review.quote ? <div className="rounded border border-[var(--admin-line)] p-3"><p>报价时原会员</p><p>订阅 ID：{review.quote.subscriptionId ?? "未知"}</p><p>原订单 ID：{review.quote.previousOrderId ?? "未知"}</p><p>原套餐 ID：{review.quote.previousPlanId ?? "未知"}</p><p>到期时间：{review.quote.previousEndsAt ? dayjs(review.quote.previousEndsAt).format("YYYY-MM-DD HH:mm:ss") : "未知"}；周期积分：{review.quote.previousMonthlyCredits ?? "未知"}</p><p>下次发放：{review.quote.previousNextGrantAt ? dayjs(review.quote.previousNextGrantAt).format("YYYY-MM-DD HH:mm:ss") : "无或未记录"}；报价时间：{review.quote.quotedAt ? dayjs(review.quote.quotedAt).format("YYYY-MM-DD HH:mm:ss") : "未知"}</p></div> : <p>订单没有升档报价快照，请结合历史订单人工核对。</p>}
                    <div className="rounded border border-[var(--admin-line)] p-3"><p>当前相关会员记录</p>{review.subscriptions.length ? review.subscriptions.map((item) => <p key={item.id}>{item.planName ?? item.planId} · {item.status} · 到期 {dayjs(item.endsAt).format("YYYY-MM-DD HH:mm:ss")} · 周期积分 {item.monthlyCredits ?? "未知"} · 订阅 {item.id} · 当前订单 {item.currentOrderId ?? "未知"} · 下次发放 {item.nextGrantAt ? dayjs(item.nextGrantAt).format("YYYY-MM-DD HH:mm:ss") : "无或未记录"}</p>) : <p>没有可显示的当前会员记录。</p>}</div>
                    <p>系统不会调用或核实支付平台。仅在已核实该订单未发放权益、应退资金处理完成后登记实际金额；登记会结束此订单的待核对状态。</p>
                    <AdminField label="支付平台实际退款金额（元）"><Input value={externalAmount} onChange={(event) => setExternalAmount(event.target.value)} placeholder="例如 150.00" inputMode="decimal" /></AdminField>
                    <AdminField label="核对说明或支付平台退款凭证"><Input.TextArea value={externalNote} onChange={(event) => setExternalNote(event.target.value)} maxLength={300} rows={2} /></AdminField>
                    <Checkbox checked={externalConfirmed} onChange={(event) => setExternalConfirmed(event.target.checked)}>已核实该订单应退资金处理完成及实际退款金额</Checkbox>
                    <Checkbox checked={noFulfillmentConfirmed} onChange={(event) => setNoFulfillmentConfirmed(event.target.checked)}>已核实该订单未发放会员权益及积分</Checkbox>
                </div>}
            </Modal>
            <Modal
                title="退款确认"
                open={Boolean(target)}
                onCancel={() => setTarget(null)}
                onOk={() => void refund()}
                okText="确认退款"
                okButtonProps={{ danger: true, disabled: target?.type === "plan" && (!refundPreview?.canRefund || !deduct) }}
                confirmLoading={refunding}
                width={480}
            >
                <div className="space-y-4 pt-1">
                    <div className="rounded-[10px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="font-medium tabular-nums text-[var(--admin-ink)]">{target?.orderNo}</span>
                            <span className="font-semibold tabular-nums text-[var(--admin-ink)]">¥{((target?.amountCents ?? 0) / 100).toFixed(2)}</span>
                        </div>
                        <div className="mt-1 text-xs text-[var(--admin-muted)]">{target?.email}</div>
                    </div>
                    {target?.type === "plan" && <p className="rounded-[9px] border border-[var(--admin-warning-line)] bg-[var(--admin-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--admin-warning)]">
                        {previewError || (refundPreview ? `按约 ${refundPreview.durationDays} 天权益时长估算可退 ¥${(refundPreview.refundAmountCents / 100).toFixed(2)}，计算时间 ${dayjs(refundPreview.calculatedAt).format("YYYY-MM-DD HH:mm:ss")}。${refundPreview.canRefund ? "最终金额以提交时计算结果为准；若账目不完整或有冻结，提交时会拒绝处理。" : "该订单暂不支持自动处理，请人工核对。"}` : "正在计算比例退款金额…")}
                    </p>}
                    <Checkbox checked={deduct} onChange={(event) => setDeduct(event.target.checked)}>
                        扣回该订单发放的积分
                    </Checkbox>
                    <AdminField label="备注">
                        <Input {...ADMIN_AUTOFILL_OFF} name="sundas-order-refund-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注（可选）" />
                    </AdminField>
                    <p className="rounded-[9px] border border-[var(--admin-warning-line)] bg-[var(--admin-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--admin-warning)]">
                        {target?.type === "plan" ? "系统只记录应退金额并调整会员权益，不会调用支付平台退款接口；请按记录金额另行处理资金。" : "系统只标记退款，不会调用支付平台退款接口。请先在支付平台完成原路退回。"}
                    </p>
                </div>
            </Modal>
        </div>
    );
}

