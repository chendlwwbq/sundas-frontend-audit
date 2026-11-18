import { useEffect, useState } from "react";
import { App as AntApp, Button, DatePicker, Input, InputNumber, Modal, Select, Table, Tabs } from "antd";
import type { TableColumnsType } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { Plus } from "lucide-react";

import { useAdminRequest } from "../use-admin-request";
import { useAdminPermissions } from "../permissions";
import { ADMIN_AUTOFILL_OFF, AdminBadge, AdminField, AdminPanel, AdminToolbar, type AdminBadgeTone } from "./ui";

type Batch = { id: string; name: string; credits: number; count: number; used: number; expiresAt: string | null; createdAt: string };
type Code = { id: string; code: string; credits: number; status: string; expiresAt: string | null; usedAt: string | null; usedBy: string | null };

const STATUS: Record<string, { label: string; tone: AdminBadgeTone }> = {
    unused: { label: "未使用", tone: "positive" },
    used: { label: "已使用", tone: "neutral" },
    void: { label: "已作废", tone: "danger" },
};

export function RedeemTab() {
    const permissions = useAdminPermissions();
    const apiRequest = useAdminRequest();
    const { message, modal } = AntApp.useApp();
    const [batches, setBatches] = useState<Batch[]>([]);
    const [codes, setCodes] = useState<Code[]>([]);
    const [batchId, setBatchId] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("codes");
    const [generating, setGenerating] = useState(false);
    const [generateOpen, setGenerateOpen] = useState(false);
    const [name, setName] = useState("");
    const [credits, setCredits] = useState(100);
    const [count, setCount] = useState(10);
    const [expiresAt, setExpiresAt] = useState<Dayjs | null>(null);

    async function loadBatches() {
        const data = await apiRequest<{ batches: Batch[] }>("/api/admin/redeem/batches");
        setBatches(data.batches);
    }

    async function loadCodes() {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), pageSize: "20", status, batchId });
            const data = await apiRequest<{ items: Code[]; total: number }>(`/api/admin/redeem/codes?${params.toString()}`);
            setCodes(data.items);
            setTotal(data.total);
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadBatches().catch((error: unknown) => message.error(error instanceof Error ? error.message : String(error)));
    }, []);

    useEffect(() => {
        void loadCodes();
    }, [batchId, status, page]);

    async function generate() {
        setGenerating(true);
        try {
            const result = await apiRequest<{ generated: number }>("/api/admin/redeem/batches", {
                method: "POST",
                json: { name, credits, count, expiresAt: expiresAt ? expiresAt.toISOString() : null },
            });
            message.success(`已生成 ${result.generated} 个兑换码`);
            setGenerateOpen(false);
            setName("");
            setActiveTab("codes");
            await loadBatches();
            await loadCodes();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setGenerating(false);
        }
    }

    function voidCode(code: Code) {
        modal.confirm({
            title: "作废该兑换码？",
            content: code.code,
            okButtonProps: { danger: true },
            onOk: async () => {
                await apiRequest(`/api/admin/redeem/codes/${code.id}/void`, { method: "POST" });
                await loadCodes();
            },
        });
    }

    const batchColumns: TableColumnsType<Batch> = [
        { title: "批次", dataIndex: "name", render: (value: string) => <span className="font-medium text-[var(--admin-ink)]">{value || "未命名批次"}</span> },
        { title: "面额", dataIndex: "credits", align: "right", render: (value: number) => <span className="tabular-nums">{value.toLocaleString("zh-CN")}</span> },
        { title: "数量", dataIndex: "count", align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
        { title: "已用", dataIndex: "used", align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
        { title: "过期", dataIndex: "expiresAt", render: (value: string | null) => <span className="text-[var(--admin-muted)]">{value ? dayjs(value).format("YYYY-MM-DD") : "永久"}</span> },
        {
            title: "操作",
            key: "actions",
            align: "right",
            render: (_value, record) => (
                <div className="flex justify-end gap-1.5">
                    <Button
                        size="small"
                        onClick={() => {
                            setBatchId(record.id);
                            setPage(1);
                            setActiveTab("codes");
                        }}
                    >
                        查看
                    </Button>
                    {permissions.includes("redeem.export") && <Button size="small" onClick={() => window.open(`/api/admin/redeem/batches/${record.id}/export`, "_blank")}>
                        导出
                    </Button>}
                </div>
            ),
        },
    ];

    const codeColumns: TableColumnsType<Code> = [
        { title: "兑换码", dataIndex: "code", render: (value: string) => <span className="font-medium tabular-nums text-[var(--admin-ink)]">{value}</span> },
        { title: "面额", dataIndex: "credits", align: "right", render: (value: number) => <span className="tabular-nums">{value.toLocaleString("zh-CN")}</span> },
        { title: "状态", dataIndex: "status", render: (value: string) => <AdminBadge tone={STATUS[value]?.tone ?? "neutral"}>{STATUS[value]?.label ?? value}</AdminBadge> },
        { title: "使用者", dataIndex: "usedBy", render: (value: string | null) => <span className="text-[var(--admin-muted)]">{value ?? "-"}</span> },
        { title: "使用时间", dataIndex: "usedAt", render: (value: string | null) => <span className="tabular-nums text-[var(--admin-muted)]">{value ? dayjs(value).format("MM-DD HH:mm") : "-"}</span> },
        {
            title: "操作",
            key: "actions",
            align: "right",
            render: (_value, record) => (permissions.includes("redeem.manage") && record.status === "unused" ? <Button size="small" danger onClick={() => voidCode(record)}>作废</Button> : null),
        },
    ];

    return (
        <div>
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                tabBarExtraContent={
                    permissions.includes("redeem.manage") && <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setGenerateOpen(true)}>
                        生成兑换码
                    </Button>
                }
                items={[
                    {
                        key: "codes",
                        label: `兑换码 ${total}`,
                        children: (
                            <AdminPanel flush>
                                <AdminToolbar>
                                    <Select
                                        className="w-36"
                                        value={status}
                                        onChange={(value) => {
                                            setStatus(value);
                                            setPage(1);
                                        }}
                                        options={[
                                            { value: "", label: "全部状态" },
                                            { value: "unused", label: "未使用" },
                                            { value: "used", label: "已使用" },
                                            { value: "void", label: "已作废" },
                                        ]}
                                    />
                                    {batchId ? (
                                        <AdminBadge tone="accent" dot={false}>
                                            已筛选批次
                                            <button type="button" className="ml-1 underline underline-offset-2" onClick={() => setBatchId("")}>
                                                清除
                                            </button>
                                        </AdminBadge>
                                    ) : null}
                                    <span className="ml-auto text-xs text-[var(--admin-muted)]">共 {total.toLocaleString("zh-CN")} 个兑换码</span>
                                </AdminToolbar>
                                <Table<Code>
                                    rowKey="id"
                                    loading={loading}
                                    dataSource={codes}
                                    columns={codeColumns}
                                    scroll={{ x: 780 }}
                                    pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
                                />
                            </AdminPanel>
                        ),
                    },
                    {
                        key: "batches",
                        label: `批次 ${batches.length}`,
                        children: (
                            <AdminPanel flush>
                                <AdminToolbar>
                                    <span className="text-xs text-[var(--admin-muted)]">批次用于追踪一次生成的一批兑换码，可按批次导出。</span>
                                </AdminToolbar>
                                <Table<Batch> rowKey="id" dataSource={batches} columns={batchColumns} pagination={false} scroll={{ x: 760 }} />
                            </AdminPanel>
                        ),
                    },
                ]}
            />

            <Modal
                title="生成兑换码"
                open={generateOpen}
                onCancel={() => setGenerateOpen(false)}
                onOk={() => void generate()}
                okText="生成"
                confirmLoading={generating}
                width={480}
            >
                <div className="space-y-4 pt-1">
                    <AdminField label="批次备注" hint="只用于后台识别，不会展示给用户。">
                        <Input {...ADMIN_AUTOFILL_OFF} name="sundas-redeem-batch-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 十月活动" />
                    </AdminField>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <AdminField label="面额（积分）" required>
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-redeem-credits" className="w-full" min={1} value={credits} onChange={(value) => setCredits(Number(value) || 1)} />
                        </AdminField>
                        <AdminField label="数量" required>
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-redeem-count" className="w-full" min={1} max={5000} value={count} onChange={(value) => setCount(Number(value) || 1)} />
                        </AdminField>
                    </div>
                    <AdminField label="过期时间" hint="留空表示永久有效。">
                        <DatePicker className="w-full" showTime value={expiresAt} onChange={setExpiresAt} placeholder="永久有效" />
                    </AdminField>
                </div>
            </Modal>
        </div>
    );
}
