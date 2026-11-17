import { useEffect, useRef, useState } from "react";
import type { Key } from "react";
import { App as AntApp, Button, Input, InputNumber, Modal, Select, Table } from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { RefreshCw, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { useAdminRequest } from "../use-admin-request";
import { ADMIN_AUTOFILL_OFF, AdminBadge, AdminField, AdminPanel, AdminToolbar } from "./ui";
import { UserDetail } from "../users/user-detail";
import { useAdminPermissions } from "../permissions";

type AdminUser = {
    id: string;
    email: string;
    displayName: string;
    role: string;
    status: string;
    balance: number;
    held: number;
    member: boolean;
    createdAt: string;
    lastLoginAt: string | null;
};

export function UsersTab() {
    const permissions = useAdminPermissions();
    const [urlParams] = useSearchParams();
    const apiRequest = useAdminRequest();
    const { message, modal } = AntApp.useApp();
    const [search, setSearch] = useState(urlParams.get("search") ?? "");
    const [query, setQuery] = useState(urlParams.get("search") ?? "");
    const [statusFilter, setStatusFilter] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState<{ items: AdminUser[]; total: number }>({ items: [], total: 0 });
    const [loading, setLoading] = useState(false);
    const [target, setTarget] = useState<AdminUser | null>(null);
    const [detailUserId, setDetailUserId] = useState<string | null>(null);
    const [amount, setAmount] = useState(0);
    const [remark, setRemark] = useState("");
    const [adjusting, setAdjusting] = useState(false);
    const [selected, setSelected] = useState<Key[]>([]);
    const [batchStatus, setBatchStatus] = useState<"active" | "banned" | null>(null);
    const [batchNote, setBatchNote] = useState("");
    const [batchResult, setBatchResult] = useState<{ id: string; success: boolean; error?: string }[] | null>(null);

    const loadSequence = useRef(0);

    async function load() {
        const sequence = ++loadSequence.current;
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), pageSize: "20", search: query, status: statusFilter });
            const result = await apiRequest<{ items: AdminUser[]; total: number }>(`/api/admin/users?${params}`);
            if (sequence === loadSequence.current) setData(result);
        } catch (error) {
            if (sequence === loadSequence.current) message.error(error instanceof Error ? error.message : String(error));
        } finally {
            if (sequence === loadSequence.current) setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, [page, query, statusFilter]);

    async function adjust() {
        if (!target) return;
        setAdjusting(true);
        try {
            await apiRequest(`/api/admin/users/${target.id}/credits`, { method: "POST", json: { amount, remark } });
            message.success("积分已调整");
            setTarget(null);
            setAmount(0);
            setRemark("");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setAdjusting(false);
        }
    }

    function toggleStatus(user: AdminUser) {
        modal.confirm({
            title: user.status === "active" ? "禁用该用户？" : "恢复该用户？",
            content: user.email,
            okText: user.status === "active" ? "禁用" : "恢复",
            okButtonProps: { danger: user.status === "active" },
            onOk: async () => {
                await apiRequest(`/api/admin/users/${user.id}`, { method: "PATCH", json: { status: user.status === "active" ? "banned" : "active" } });
                await load();
            },
        });
    }

    async function batchUpdate() {
        if (!batchStatus || !batchNote.trim()) { message.warning("请填写操作原因"); return; }
        setAdjusting(true);
        try {
            const result = await apiRequest<{ results: { id: string; success: boolean; error?: string }[] }>("/api/admin/users/batch-status", { method: "POST", json: { userIds: selected, status: batchStatus, note: batchNote } });
            setBatchStatus(null); setBatchNote(""); setSelected([]); setBatchResult(result.results); await load();
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setAdjusting(false); }
    }

    const columns: TableColumnsType<AdminUser> = [
        {
            title: "用户",
            dataIndex: "email",
            render: (value: string, record) => (
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-[var(--admin-ink)]">{value}</span>
                        {record.role === "admin" ? <AdminBadge tone="accent">管理员</AdminBadge> : null}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[var(--admin-muted)]">{record.displayName || "未设置昵称"}</div>
                </div>
            ),
        },
        {
            title: "积分",
            dataIndex: "balance",
            render: (value: number, record) => (
                <div>
                    <div className="font-medium tabular-nums text-[var(--admin-ink)]">{value.toLocaleString("zh-CN")}</div>
                    {record.held ? <div className="mt-0.5 text-[11px] text-[var(--admin-muted)]">冻结 {record.held}</div> : null}
                </div>
            ),
        },
        { title: "会员", dataIndex: "member", render: (value: boolean) => <AdminBadge tone={value ? "positive" : "neutral"}>{value ? "会员" : "普通"}</AdminBadge> },
        { title: "状态", dataIndex: "status", render: (value: string) => <AdminBadge tone={value === "active" ? "positive" : "danger"}>{value === "active" ? "正常" : "禁用"}</AdminBadge> },
        { title: "注册时间", dataIndex: "createdAt", render: (value: string) => <span className="tabular-nums text-[var(--admin-muted)]">{dayjs(value).format("YYYY-MM-DD HH:mm")}</span> },
        {
            title: "操作",
            key: "actions",
            align: "right",
            render: (_value, record) => (
                <div className="flex justify-end gap-1.5">
                    <Button size="small" onClick={() => setDetailUserId(record.id)}>详情</Button>
                    {permissions.includes("credits.adjust") && <Button size="small" onClick={() => setTarget(record)}>
                        调积分
                    </Button>}
                    {permissions.includes("users.manage") && <Button size="small" danger={record.status === "active"} onClick={() => toggleStatus(record)}>
                        {record.status === "active" ? "禁用" : "恢复"}
                    </Button>}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-5">
            <UserDetail userId={detailUserId} onClose={() => setDetailUserId(null)} onChanged={() => void load()} />
            <AdminPanel title="用户列表" description="按邮箱或昵称搜索，调整积分或控制账户访问。" actions={<Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>刷新</Button>} flush>
                <AdminToolbar>
                    <div className="w-full sm:w-80">
                        <Input.Search
                            {...ADMIN_AUTOFILL_OFF}
                            name="sundas-admin-user-search"
                            placeholder="搜索邮箱或昵称"
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
                    <Select value={statusFilter} onChange={value => { setPage(1); setStatusFilter(value); }} options={[{ value: "", label: "全部状态" }, { value: "active", label: "正常" }, { value: "banned", label: "已禁用" }]} />
                    <span className="ml-auto text-xs text-[var(--admin-muted)]">共 {data.total.toLocaleString("zh-CN")} 位用户</span>
                    {permissions.includes("users.manage") && <><Button disabled={!selected.length} onClick={() => setBatchStatus("active")}>批量恢复</Button><Button danger disabled={!selected.length} onClick={() => setBatchStatus("banned")}>批量禁用</Button></>}
                </AdminToolbar>
                <Table<AdminUser>
                    rowKey="id"
                    loading={loading}
                    dataSource={data.items}
                    columns={columns}
                    rowSelection={permissions.includes("users.manage") ? { selectedRowKeys: selected, onChange: setSelected } : undefined}
                    scroll={{ x: 900 }}
                    pagination={{ current: page, pageSize: 20, total: data.total, onChange: setPage, showSizeChanger: false }}
                />
            </AdminPanel>

            <Modal title={`确认${batchStatus === "banned" ? "禁用" : "恢复"} ${selected.length} 位用户`} open={Boolean(batchStatus)} onCancel={() => { setBatchStatus(null); setBatchNote(""); }} onOk={() => void batchUpdate()} confirmLoading={adjusting}>
                <p>选中用户：{selected.join("、")}</p><AdminField label="操作原因"><Input value={batchNote} onChange={event => setBatchNote(event.target.value)} /></AdminField>
            </Modal>
            <Modal title="批量操作结果" open={Boolean(batchResult)} onCancel={() => setBatchResult(null)} footer={<Button onClick={() => setBatchResult(null)}>关闭</Button>}>
                {batchResult?.map(item => <p key={item.id}>{item.id}：{item.success ? "成功" : item.error}</p>)}
            </Modal>

            <Modal
                title="调整积分"
                open={Boolean(target)}
                onCancel={() => setTarget(null)}
                onOk={() => void adjust()}
                okText="确认调整"
                confirmLoading={adjusting}
                okButtonProps={{ disabled: amount === 0 }}
                width={460}
            >
                <div className="space-y-4 pt-1">
                    <div className="rounded-[10px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-4 py-3">
                        <div className="truncate text-sm font-medium text-[var(--admin-ink)]">{target?.email}</div>
                        <div className="mt-1 text-xs text-[var(--admin-muted)]">
                            当前余额 <span className="font-semibold tabular-nums text-[var(--admin-ink)]">{target?.balance ?? 0}</span>
                            {target?.held ? ` · 冻结 ${target.held}` : ""}
                        </div>
                    </div>
                    <AdminField label="调整数量" hint="正数增加，负数扣减；扣减时最多扣到余额为 0。">
                        <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-user-credit-amount" className="w-full" value={amount} onChange={(value) => setAmount(Number(value) || 0)} placeholder="例如 100 或 -50" />
                    </AdminField>
                    <AdminField label="备注">
                        <Input {...ADMIN_AUTOFILL_OFF} name="sundas-user-credit-remark" value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="说明这次调整的原因" />
                    </AdminField>
                </div>
            </Modal>
        </div>
    );
}
