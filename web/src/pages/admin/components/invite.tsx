import { useEffect, useState } from "react";
import { App as AntApp, Button, Input, InputNumber, Select, Switch, Table } from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { Link, useSearchParams } from "react-router-dom";

import { useAdminRequest } from "../use-admin-request";
import { ADMIN_AUTOFILL_OFF, AdminBadge, AdminField, AdminPanel, AdminStat, AdminToolbar } from "./ui";
import { useAdminPermissions } from "../permissions";

type InviteSettings = { enabled: boolean; rebatePercent: number; membershipRebatePercent: number };
type Relation = { id: string; inviterEmail: string; inviteeEmail: string; status: string; totalRebate: number; createdAt: string };
type Rebate = {
    id: string;
    orderNo: string;
    inviterEmail: string;
    inviteeEmail: string;
    orderCredits: number;
    amountCents: number;
    rebatePercent: number;
    rebateCredits: number;
    recoveredCredits: number | null;
    recoveryShortfall: number | null;
    status: string;
    createdAt: string;
    revokedAt: string | null;
};

const formatTime = (value?: string | null) => (value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-");

export function InviteTab() {
    const permissions = useAdminPermissions();
    const [urlParams] = useSearchParams();
    const apiRequest = useAdminRequest();
    const { message } = AntApp.useApp();
    const [settings, setSettings] = useState<InviteSettings>({ enabled: true, rebatePercent: 10, membershipRebatePercent: 10 });
    const [saving, setSaving] = useState(false);
    const [relations, setRelations] = useState<Relation[]>([]);
    const [relationTotal, setRelationTotal] = useState(0);
    const [relationPage, setRelationPage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [rebates, setRebates] = useState<Rebate[]>([]);
    const [rebateTotal, setRebateTotal] = useState(0);
    const [rebatePage, setRebatePage] = useState(1);
    const [totals, setTotals] = useState({ granted: 0, revoked: 0 });
    const [loading, setLoading] = useState(false);
    const [filterUser, setFilterUser] = useState(urlParams.get("userId") ?? "");
    const [relationStatus, setRelationStatus] = useState("");
    const [rebateStatus, setRebateStatus] = useState("");
    const [orderNo, setOrderNo] = useState(urlParams.get("orderNo") ?? "");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    function appendFilters(params: URLSearchParams, status: string) {
        if (filterUser.trim()) params.set("userId", filterUser.trim());
        if (status) params.set("status", status);
        if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
        if (to) { const end = new Date(`${to}T00:00:00`); end.setDate(end.getDate() + 1); params.set("to", end.toISOString()); }
    }

    async function loadSettings() {
        const data = await apiRequest<{ settings: InviteSettings }>("/api/admin/invite/settings");
        setSettings({ ...data.settings, membershipRebatePercent: Number(data.settings.membershipRebatePercent ?? data.settings.rebatePercent) || 0 });
    }

    async function loadRelations(currentPage = relationPage) {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(currentPage), pageSize: "20", keyword });
            appendFilters(params, relationStatus);
            const data = await apiRequest<{ items: Relation[]; total: number }>(`/api/admin/invite/relations?${params.toString()}`);
            setRelations(data.items);
            setRelationTotal(data.total);
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setLoading(false);
        }
    }

    async function loadRebates(currentPage = rebatePage) {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(currentPage), pageSize: "20" });
            appendFilters(params, rebateStatus);
            if (orderNo.trim()) params.set("orderNo", orderNo.trim());
            const data = await apiRequest<{ items: Rebate[]; total: number; totals: { granted: number; revoked: number } }>(`/api/admin/invite/rebates?${params}`);
            setRebates(data.items);
            setRebateTotal(data.total);
            setTotals(data.totals);
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadSettings().catch((error: unknown) => message.error(error instanceof Error ? error.message : String(error)));
    }, []);

    useEffect(() => {
        void loadRelations();
    }, [relationPage]);

    useEffect(() => {
        void loadRebates();
    }, [rebatePage]);

    async function saveSettings() {
        setSaving(true);
        try {
            await apiRequest("/api/admin/invite/settings", { method: "PUT", json: settings });
            message.success("邀请设置已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    }

    async function toggleRelation(relation: Relation) {
        const status = relation.status === "active" ? "disabled" : "active";
        try {
            await apiRequest(`/api/admin/invite/relations/${relation.id}`, { method: "PATCH", json: { status } });
            await loadRelations();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    }

    const relationColumns: TableColumnsType<Relation> = [
        { title: "邀请人", dataIndex: "inviterEmail", render: (value: string) => <Link to={`/admin?tab=users&search=${encodeURIComponent(value)}`}>{value}</Link> },
        { title: "被邀请人", dataIndex: "inviteeEmail", render: (value: string) => <Link to={`/admin?tab=users&search=${encodeURIComponent(value)}`}>{value}</Link> },
        { title: "累计返佣", dataIndex: "totalRebate", align: "right", render: (value: number) => <span className="tabular-nums">{value.toLocaleString("zh-CN")}</span> },
        { title: "状态", dataIndex: "status", render: (value: string) => <AdminBadge tone={value === "active" ? "positive" : "neutral"}>{value === "active" ? "生效" : "已禁用"}</AdminBadge> },
        { title: "建立时间", dataIndex: "createdAt", render: formatTime },
        {
            title: "操作",
            key: "actions",
            align: "right",
            render: (_value, record) => (
                permissions.includes("invites.manage") ? <Button size="small" onClick={() => void toggleRelation(record)}>
                    {record.status === "active" ? "禁用" : "启用"}
                </Button> : null
            ),
        },
    ];

    const rebateColumns: TableColumnsType<Rebate> = [
        { title: "订单号", dataIndex: "orderNo", render: (value: string) => <Link to={`/admin?tab=orders&search=${encodeURIComponent(value)}`} className="font-mono text-[11px]">{value}</Link> },
        { title: "邀请人", dataIndex: "inviterEmail", render: (value: string) => <span className="text-[var(--admin-ink)]">{value}</span> },
        { title: "被邀请人", dataIndex: "inviteeEmail", render: (value: string) => <span className="text-[var(--admin-muted)]">{value}</span> },
        { title: "订单积分", dataIndex: "orderCredits", align: "right", render: (value: number) => <span className="tabular-nums">{value.toLocaleString("zh-CN")}</span> },
        { title: "比例", dataIndex: "rebatePercent", align: "right", render: (value: number) => <span className="tabular-nums">{Number(value)}%</span> },
        { title: "返佣积分", dataIndex: "rebateCredits", align: "right", render: (value: number) => <span className="font-medium tabular-nums">{value.toLocaleString("zh-CN")}</span> },
        { title: "实际扣回", dataIndex: "recoveredCredits", align: "right", render: (value: number | null) => value == null ? "—" : value },
        { title: "扣回差额", dataIndex: "recoveryShortfall", align: "right", render: (value: number | null) => value == null ? "—" : value },
        { title: "状态", dataIndex: "status", render: (value: string) => <AdminBadge tone={value === "granted" ? "positive" : "danger"}>{value === "granted" ? "已发放" : "已撤回"}</AdminBadge> },
        { title: "时间", dataIndex: "createdAt", render: formatTime },
    ];

    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
                <AdminStat label="累计发放返佣" value={totals.granted.toLocaleString("zh-CN")} note="积分" accent />
                <AdminStat label="已撤销返佣" value={totals.revoked.toLocaleString("zh-CN")} note="原返佣额度，实际扣回见明细" />
                <AdminStat label="邀请关系" value={relationTotal.toLocaleString("zh-CN")} note="一个用户只能被邀请一次" />
            </div>

            <AdminPanel
                title="返佣规则"
                description="被邀请人充值或会员订单支付成功后，按对应比例给邀请人发放积分；订单退款时自动撤回并扣回。"
                actions={
                    <Button type="primary" size="small" disabled={!permissions.includes("invites.manage")} loading={saving} onClick={() => void saveSettings()}>
                        保存设置
                    </Button>
                }
            >
                <div className="grid gap-4 sm:grid-cols-3">
                    <AdminField label="积分充值返佣比例（%）" hint="按充值订单到账积分计算，例如 10 表示充值 100 积分返 10 积分。">
                        <InputNumber
                            {...ADMIN_AUTOFILL_OFF}
                            name="sundas-invite-credits-percent"
                            className="w-full"
                            disabled={!permissions.includes("invites.manage")}
                            min={0}
                            max={100}
                            step={1}
                            value={settings.rebatePercent}
                            onChange={(value) => setSettings({ ...settings, rebatePercent: Number(value) || 0 })}
                        />
                    </AdminField>
                    <AdminField label="会员订单返佣比例（%）" hint="按会员套餐订单到账积分计算，例如 10 表示到账 100 积分返 10 积分。">
                        <InputNumber
                            {...ADMIN_AUTOFILL_OFF}
                            name="sundas-invite-membership-percent"
                            className="w-full"
                            disabled={!permissions.includes("invites.manage")}
                            min={0}
                            max={100}
                            step={1}
                            value={settings.membershipRebatePercent}
                            onChange={(value) => setSettings({ ...settings, membershipRebatePercent: Number(value) || 0 })}
                        />
                    </AdminField>
                    <div className="flex items-center justify-between rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-3 py-2.5">
                        <div>
                            <div className="text-xs font-medium text-[var(--admin-ink)]">启用邀请返佣</div>
                            <div className="mt-0.5 text-[11px] text-[var(--admin-muted)]">关闭后不再发放新的返佣</div>
                        </div>
                        <Switch disabled={!permissions.includes("invites.manage")} checked={settings.enabled} onChange={(checked) => setSettings({ ...settings, enabled: checked })} />
                    </div>
                </div>
            </AdminPanel>

            <AdminPanel title="邀请关系" description="禁用后该关系不再产生返佣，已发放的积分不会扣回。" flush>
                <AdminToolbar>
                    <Input placeholder="用户 ID" value={filterUser} onChange={e => setFilterUser(e.target.value)} className="max-w-[220px]" />
                    <Select value={relationStatus} onChange={setRelationStatus} options={[{value:"",label:"全部关系"},{value:"active",label:"生效"},{value:"disabled",label:"禁用"}]} />
                    <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="max-w-[160px]" />
                    <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="max-w-[160px]" />
                    <Input.Search
                        allowClear
                        placeholder="搜索邮箱"
                        className="max-w-[260px]"
                        value={keyword}
                        onChange={(event) => setKeyword(event.target.value)}
                        onSearch={() => {
                            if (relationPage === 1) void loadRelations(1);
                            else setRelationPage(1);
                        }}
                    />
                    <Button onClick={() => { if (relationPage === 1) void loadRelations(1); else setRelationPage(1); }}>查询关系</Button>
                </AdminToolbar>
                <Table<Relation>
                    rowKey="id"
                    loading={loading}
                    dataSource={relations}
                    columns={relationColumns}
                    scroll={{ x: 860 }}
                    pagination={{ current: relationPage, pageSize: 20, total: relationTotal, onChange: setRelationPage, size: "small" }}
                />
            </AdminPanel>

            <AdminPanel title="返佣记录" description="同一笔订单只返佣一次；退款后状态变为已撤回并扣回积分。" flush>
                <AdminToolbar><Input placeholder="订单号" value={orderNo} onChange={e => setOrderNo(e.target.value)} className="max-w-[240px]" /><Select value={rebateStatus} onChange={setRebateStatus} options={[{value:"",label:"全部返佣"},{value:"granted",label:"已发放"},{value:"revoked",label:"已撤回"}]} /><Button onClick={() => { if (rebatePage === 1) void loadRebates(1); else setRebatePage(1); }}>查询</Button></AdminToolbar>
                <Table<Rebate>
                    rowKey="id"
                    loading={loading}
                    dataSource={rebates}
                    columns={rebateColumns}
                    scroll={{ x: 1080 }}
                    pagination={{ current: rebatePage, pageSize: 20, total: rebateTotal, onChange: setRebatePage, size: "small" }}
                />
            </AdminPanel>
        </div>
    );
}
