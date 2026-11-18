import { useEffect, useState } from "react";
import { App as AntApp, Button, Input, Modal, Switch, Table } from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { Plus, RefreshCw } from "lucide-react";

import { useAdminRequest } from "../use-admin-request";
import { useAdminPermissions } from "../permissions";
import { ADMIN_AUTOFILL_OFF, AdminBadge, AdminField, AdminPanel } from "./ui";

type Announcement = { id: string; title: string; content: string; enabled: boolean; createdAt: string };

export function AnnouncementsTab() {
    const permissions = useAdminPermissions();
    const apiRequest = useAdminRequest();
    const { message, modal } = AntApp.useApp();
    const [items, setItems] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState<{ open: boolean; id?: string; title: string; content: string; enabled: boolean }>({ open: false, title: "", content: "", enabled: true });

    async function load() {
        setLoading(true);
        try {
            const data = await apiRequest<{ announcements: Announcement[] }>("/api/admin/announcements");
            setItems(data.announcements);
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

    async function save() {
        setSaving(true);
        try {
            await apiRequest(editing.id ? `/api/admin/announcements/${editing.id}` : "/api/admin/announcements", {
                method: editing.id ? "PATCH" : "POST",
                json: { title: editing.title, content: editing.content, enabled: editing.enabled },
            });
            setEditing({ open: false, title: "", content: "", enabled: true });
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    }

    const columns: TableColumnsType<Announcement> = [
        {
            title: "公告",
            dataIndex: "title",
            render: (value: string, record) => (
                <div className="min-w-0">
                    <div className="font-medium text-[var(--admin-ink)]">{value}</div>
                    <div className="mt-0.5 line-clamp-1 max-w-[48ch] text-xs text-[var(--admin-muted)]">{record.content}</div>
                </div>
            ),
        },
        { title: "状态", dataIndex: "enabled", render: (value: boolean) => <AdminBadge tone={value ? "positive" : "neutral"}>{value ? "展示中" : "已隐藏"}</AdminBadge> },
        { title: "创建时间", dataIndex: "createdAt", render: (value: string) => <span className="tabular-nums text-[var(--admin-muted)]">{dayjs(value).format("YYYY-MM-DD HH:mm")}</span> },
        {
            title: "操作",
            key: "actions",
            align: "right",
            render: (_value, record) => (
                <div className="flex justify-end gap-1.5">
                    <Button size="small" onClick={() => setEditing({ open: true, id: record.id, title: record.title, content: record.content, enabled: record.enabled })}>
                        编辑
                    </Button>
                    <Button
                        size="small"
                        danger
                        onClick={() =>
                            modal.confirm({
                                title: "删除公告？",
                                content: record.title,
                                okButtonProps: { danger: true },
                                onOk: async () => {
                                    await apiRequest(`/api/admin/announcements/${record.id}`, { method: "DELETE" });
                                    await load();
                                },
                            })
                        }
                    >
                        删除
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-5">
            <AdminPanel
                title="公告列表"
                description="启用后会展示在前台；关闭后立即隐藏，不会删除内容。"
                actions={
                    <div className="flex items-center gap-2">
                        <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>
                            刷新
                        </Button>
                        {permissions.includes("announcements.manage") && <Button type="primary" size="small" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ open: true, title: "", content: "", enabled: true })}>
                            新增公告
                        </Button>}
                    </div>
                }
                flush
            >
                <Table<Announcement> rowKey="id" loading={loading} dataSource={items} columns={permissions.includes("announcements.manage") ? columns : columns.filter(column => column.key !== "actions")} pagination={false} scroll={{ x: 720 }} />
            </AdminPanel>

            <Modal
                title={editing.id ? "编辑公告" : "新增公告"}
                open={editing.open}
                onCancel={() => setEditing({ ...editing, open: false })}
                onOk={() => void save()}
                okText="保存"
                confirmLoading={saving}
                width={520}
            >
                <div className="space-y-4 pt-1">
                    <AdminField label="标题" required>
                        <Input {...ADMIN_AUTOFILL_OFF} name="sundas-announcement-title" value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} placeholder="公告标题" />
                    </AdminField>
                    <AdminField label="内容" required>
                        <Input.TextArea {...ADMIN_AUTOFILL_OFF} name="sundas-announcement-content" rows={6} value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} placeholder="公告正文" />
                    </AdminField>
                    <div className="flex items-center justify-between rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-3 py-2.5">
                        <div>
                            <div className="text-xs font-medium text-[var(--admin-ink)]">立即展示</div>
                            <div className="mt-0.5 text-[11px] text-[var(--admin-muted)]">关闭后仅保存在后台。</div>
                        </div>
                        <Switch checked={editing.enabled} onChange={(checked) => setEditing({ ...editing, enabled: checked })} />
                    </div>
                </div>
            </Modal>
        </div>
    );
}
