import { useEffect, useRef, useState } from "react";
import { App as AntApp, Button, DatePicker, Empty, Input, Modal, Select, Slider, Switch, Table, Tabs, Tooltip } from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { ArrowDown, ArrowUp, Gift, GripVertical, ImageOff, Monitor, Pencil, Plus, RefreshCw, Smartphone, Trash2, Upload, X } from "lucide-react";

import { ACTION_OPTIONS, CONTACT_CHANNEL_OPTIONS, FREQUENCY_OPTIONS, INTERNAL_LINK_OPTIONS, contactChannelLabel } from "@/lib/promo";
import { useAdminRequest, useAdminScope } from "../use-admin-request";
import { useAdminPermissions } from "../permissions";
import { uploadBlobToServer } from "@/services/cloud-media";
import type { AdminPromoData, PromoActionType, PromoContact, PromoContactChannel, PromoFrequency, PromoItem, PromoPlacement } from "@/services/api/promo";
import { AdminBadge, AdminField, AdminPanel } from "./ui";

type ItemDraft = {
    id?: string;
    placement: PromoPlacement;
    enabled: boolean;
    title: string;
    description: string;
    imageUrl: string;
    mobileImageUrl: string;
    alt: string;
    ctaLabel: string;
    actionType: PromoActionType;
    actionValue: string;
    countdownAt: string | null;
    frequency: PromoFrequency;
};

type ContactDraft = {
    id?: string;
    channel: PromoContactChannel;
    name: string;
    value: string;
    qrUrl: string;
    description: string;
    enabled: boolean;
};

const SINGLE_PANEL_COPY: Record<"topbar" | "popup" | "corner", { panel: string; column: string; button: string; desc: string; modal: string }> = {
    topbar: {
        panel: "顶部活动条",
        column: "活动文案",
        button: "活动条",
        desc: "同一时间最多启用一条。启用新内容会自动停用旧内容；活动条只出现在首页。",
        modal: "新增顶部活动条",
    },
    popup: {
        panel: "弹窗",
        column: "弹窗内容",
        button: "弹窗",
        desc: "首页加载后居中弹出，可带图片；同一时间最多启用一条；频率按浏览器记录。",
        modal: "新增弹窗",
    },
    corner: {
        panel: "右下角卡片",
        column: "卡片内容",
        button: "卡片",
        desc: "全站右下角浮动小卡，只有文字和按钮；同一时间最多启用一条；频率按浏览器记录。",
        modal: "新增右下角卡片",
    },
};

const EMPTY_DATA: AdminPromoData = { items: [], contacts: [], clicks: [] };
const PLACEMENT_LABEL: Record<string, string> = { topbar: "顶部活动条", carousel: "首页轮播", popup: "弹窗", corner: "右下角卡片", contact: "联系方式" };
const ACTION_LABEL: Record<string, string> = Object.fromEntries(ACTION_OPTIONS.map((option) => [option.value, option.label]));
const FREQUENCY_LABEL: Record<string, string> = Object.fromEntries(FREQUENCY_OPTIONS.map((option) => [option.value, option.label]));

function emptyItem(placement: PromoPlacement): ItemDraft {
    return {
        placement,
        enabled: true,
        title: "",
        description: "",
        imageUrl: "",
        mobileImageUrl: "",
        alt: "",
        ctaLabel: "",
        actionType: placement === "carousel" ? "internal" : "none",
        actionValue: placement === "carousel" ? "/" : "",
        countdownAt: null,
        frequency: "24h",
    };
}

function toDraft(item: PromoItem): ItemDraft {
    return {
        id: item.id,
        placement: item.placement,
        enabled: item.enabled,
        title: item.title,
        description: item.description,
        imageUrl: item.imageUrl,
        mobileImageUrl: item.mobileImageUrl,
        alt: item.alt,
        ctaLabel: item.ctaLabel,
        actionType: item.actionType,
        actionValue: item.actionValue,
        countdownAt: item.countdownAt,
        frequency: item.frequency,
    };
}

function emptyContact(patch: Partial<ContactDraft> = {}): ContactDraft {
    return { channel: "wechat", name: "", value: "", qrUrl: "", description: "", enabled: true, ...patch };
}

function toContactDraft(contact: PromoContact): ContactDraft {
    return { id: contact.id, channel: contact.channel, name: contact.name, value: contact.value, qrUrl: contact.qrUrl, description: contact.description, enabled: contact.enabled };
}

function actionSummary(item: PromoItem) {
    if (item.actionType === "none") return "不跳转";
    if (item.actionType === "internal") return `站内 · ${item.actionValue}`;
    if (item.actionType === "external") return "站外链接";
    if (item.actionType === "contact") return "打开联系弹窗";
    return "复制文本";
}

export function PromoConfigTab() {
    const apiRequest = useAdminRequest();
    const { message, modal } = AntApp.useApp();
    const [data, setData] = useState<AdminPromoData>(EMPTY_DATA);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [tab, setTab] = useState("topbar");
    const [itemDraft, setItemDraft] = useState<ItemDraft | null>(null);
    const [contactDraft, setContactDraft] = useState<ContactDraft | null>(null);

    async function load() {
        setLoading(true);
        try {
            const next = await apiRequest<AdminPromoData>("/api/admin/promo");
            setData(next);
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

    function confirmReplace(label: string) {
        return new Promise<boolean>((resolve) => {
            modal.confirm({
                title: "替换当前启用内容？",
                content: `启用后会立即停用「${label}」，并记录两条审计日志。`,
                okText: "替换并启用",
                cancelText: "取消",
                onOk: () => resolve(true),
                onCancel: () => resolve(false),
            });
        });
    }

    async function saveItem(draft: ItemDraft) {
        if (draft.placement === "topbar" && !draft.title.trim()) return message.warning("请填写顶部活动条文案");
        if (draft.placement !== "topbar" && draft.placement !== "corner" && !draft.imageUrl) return message.warning("请上传图片");
        if ((draft.placement === "carousel" && !draft.alt.trim()) || ((draft.placement === "popup" || draft.placement === "corner") && !draft.title.trim())) return message.warning(draft.placement === "carousel" ? "请填写图片 alt 文案" : "请填写标题");
        if (draft.actionType !== "none" && !draft.ctaLabel && draft.placement !== "carousel") return message.warning(`请填写按钮文案${draft.placement === "corner" ? "（右下角卡片必须要有按钮，否则用户无法关闭以外的操作）" : ""}`);
        if (draft.actionType === "internal" && !draft.actionValue) return message.warning("请选择站内路径");
        if ((draft.actionType === "external" || draft.actionType === "copy") && !draft.actionValue.trim()) return message.warning("请填写点击目标");
        if (draft.enabled && (draft.placement === "topbar" || draft.placement === "popup" || draft.placement === "corner")) {
            const other = data.items.find((item) => item.placement === draft.placement && item.enabled && item.id !== draft.id);
            if (other && !(await confirmReplace(other.title || other.alt || "当前内容"))) return;
        }
        setSaving(true);
        try {
            const { id, ...payload } = draft;
            await apiRequest(id ? `/api/admin/promo/items/${id}` : "/api/admin/promo/items", {
                method: id ? "PATCH" : "POST",
                json: payload,
            });
            setItemDraft(null);
            await load();
            message.success(id ? "已保存" : "已添加");
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    }

    async function toggleItem(item: PromoItem) {
        if (!item.enabled && (item.placement === "topbar" || item.placement === "popup" || item.placement === "corner")) {
            const other = data.items.find((entry) => entry.placement === item.placement && entry.enabled && entry.id !== item.id);
            if (other && !(await confirmReplace(other.title || other.alt || "当前内容"))) return;
        }
        try {
            await apiRequest(`/api/admin/promo/items/${item.id}`, { method: "PATCH", json: { enabled: !item.enabled } });
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    }

    function deleteItem(item: PromoItem) {
        modal.confirm({
            title: "删除这项宣发内容？",
            content: "删除后不可恢复，且会同时删除它的历史点击数据。",
            okText: "删除",
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await apiRequest(`/api/admin/promo/items/${item.id}`, { method: "DELETE" });
                    await load();
                    message.success("已删除");
                } catch (error) {
                    message.error(error instanceof Error ? error.message : String(error));
                    throw error;
                }
            },
        });
    }

    async function reorderItems(kind: "carousel" | "contact", ids: string[]) {
        const itemOrders = new Map(ids.map((id, index) => [id, index]));
        if (kind === "carousel") {
            setData((state) => ({ ...state, items: state.items.map((item) => item.placement === "carousel" ? { ...item, sort: itemOrders.get(item.id) ?? item.sort } : item) }));
        } else {
            setData((state) => ({ ...state, contacts: state.contacts.map((contact) => ({ ...contact, sort: itemOrders.get(contact.id) ?? contact.sort })) }));
        }
        try {
            await apiRequest("/api/admin/promo/order", { method: "PUT", json: { kind, ids } });
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
            await load();
        }
    }

    function moveItem(item: PromoItem, direction: -1 | 1) {
        const list = data.items.filter((entry) => entry.placement === "carousel").sort((a, b) => a.sort - b.sort);
        const index = list.findIndex((entry) => entry.id === item.id);
        const target = index + direction;
        if (target < 0 || target >= list.length) return;
        const next = [...list];
        [next[index], next[target]] = [next[target], next[index]];
        void reorderItems("carousel", next.map((entry) => entry.id));
    }

    function moveContact(contact: PromoContact, direction: -1 | 1) {
        const list = [...data.contacts].sort((a, b) => a.sort - b.sort);
        const index = list.findIndex((entry) => entry.id === contact.id);
        const target = index + direction;
        if (target < 0 || target >= list.length) return;
        const next = [...list];
        [next[index], next[target]] = [next[target], next[index]];
        void reorderItems("contact", next.map((entry) => entry.id));
    }

    async function saveContact(draft: ContactDraft) {
        if (!draft.name.trim()) return message.warning("请填写显示名称");
        if (!draft.value.trim() && !draft.qrUrl) return message.warning("号码/链接和二维码至少填写一项");
        setSaving(true);
        try {
            const { id, ...payload } = draft;
            await apiRequest(id ? `/api/admin/promo/contacts/${id}` : "/api/admin/promo/contacts", {
                method: id ? "PATCH" : "POST",
                json: payload,
            });
            setContactDraft(null);
            await load();
            message.success(id ? "已保存" : "已添加");
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    }

    function deleteContact(contact: PromoContact) {
        modal.confirm({
            title: "删除这个联系方式？",
            content: "删除后不可恢复，且会同时删除它的历史点击数据。",
            okText: "删除",
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await apiRequest(`/api/admin/promo/contacts/${contact.id}`, { method: "DELETE" });
                    await load();
                    message.success("已删除");
                } catch (error) {
                    message.error(error instanceof Error ? error.message : String(error));
                    throw error;
                }
            },
        });
    }

    const topbar = data.items.filter((item) => item.placement === "topbar");
    const carousel = data.items.filter((item) => item.placement === "carousel").sort((a, b) => a.sort - b.sort);
    const popup = data.items.filter((item) => item.placement === "popup");
    const corner = data.items.filter((item) => item.placement === "corner");

    return (
        <div className="space-y-5">
            <Tabs
                activeKey={tab}
                onChange={setTab}
                tabBarExtraContent={<Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>刷新配置</Button>}
                items={[
                    { key: "topbar", label: "顶部活动条", children: <SingleItemPanel placement="topbar" items={topbar} onCreate={() => setItemDraft(emptyItem("topbar"))} onEdit={(item) => setItemDraft(toDraft(item))} onToggle={(item) => void toggleItem(item)} onDelete={deleteItem} /> },
                    { key: "carousel", label: "首页轮播", children: <CarouselPanel items={carousel} onAdd={() => setItemDraft(emptyItem("carousel"))} onEdit={(item) => setItemDraft(toDraft(item))} onToggle={(item) => void toggleItem(item)} onDelete={deleteItem} onMove={moveItem} onReorder={reorderItems} /> },
                    { key: "popup", label: "弹窗", children: <SingleItemPanel placement="popup" items={popup} onCreate={() => setItemDraft(emptyItem("popup"))} onEdit={(item) => setItemDraft(toDraft(item))} onToggle={(item) => void toggleItem(item)} onDelete={deleteItem} /> },
                    { key: "corner", label: "右下角卡片", children: <SingleItemPanel placement="corner" items={corner} onCreate={() => setItemDraft(emptyItem("corner"))} onEdit={(item) => setItemDraft(toDraft(item))} onToggle={(item) => void toggleItem(item)} onDelete={deleteItem} /> },
                    { key: "contacts", label: "联系方式", children: <ContactsPanel contacts={data.contacts} onAdd={() => setContactDraft(emptyContact())} onEdit={(contact) => setContactDraft(toContactDraft(contact))} onToggle={async (contact) => {
                        try {
                            await apiRequest(`/api/admin/promo/contacts/${contact.id}`, { method: "PATCH", json: { enabled: !contact.enabled } });
                            await load();
                        } catch (error) {
                            message.error(error instanceof Error ? error.message : String(error));
                        }
                    }} onDelete={deleteContact} onMove={moveContact} onReorder={reorderItems} /> },
                    { key: "clicks", label: "点击数据", children: <ClicksPanel clicks={data.clicks} onRefresh={() => void load()} loading={loading} /> },
                ]}
            />

            <ItemEditor draft={itemDraft} saving={saving} onChange={setItemDraft} onClose={() => setItemDraft(null)} onSave={() => itemDraft && void saveItem(itemDraft)} />
            <ContactEditor draft={contactDraft} saving={saving} onChange={setContactDraft} onClose={() => setContactDraft(null)} onSave={() => contactDraft && void saveContact(contactDraft)} />
        </div>
    );
}

function AdminImage({ src, alt, className, compact = false }: { src: string; alt: string; className?: string; compact?: boolean }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    if (!src || failed) {
        return (
            <div className={`grid place-items-center bg-[var(--admin-panel-soft)] text-[var(--admin-muted)] ${className ?? ""}`}>
                {compact ? <ImageOff className="size-4" /> : <span className="flex flex-col items-center gap-1 text-[9px]"><ImageOff className="size-4" />图片不可用</span>}
            </div>
        );
    }
    return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

function SingleItemPanel({
    placement,
    items,
    onCreate,
    onEdit,
    onToggle,
    onDelete,
}: {
    placement: "topbar" | "popup" | "corner";
    items: PromoItem[];
    onCreate: () => void;
    onEdit: (item: PromoItem) => void;
    onToggle: (item: PromoItem) => void;
    onDelete: (item: PromoItem) => void;
}) {
    const canManage = useAdminPermissions().includes("promo.manage");
    const isTopbar = placement === "topbar";
    const copy = SINGLE_PANEL_COPY[placement];
    const columns: TableColumnsType<PromoItem> = [
        {
            title: copy.column,
            dataIndex: "title",
            render: (_value, record) => (
                <div className="flex min-w-0 items-center gap-3">
                    {placement === "popup" ? <AdminImage src={record.imageUrl} alt="" className="h-11 w-16 shrink-0 rounded-md object-cover" /> : null}
                    <div className="min-w-0">
                        <div className="line-clamp-1 font-medium text-[var(--admin-ink)]">{record.title || "未命名内容"}</div>
                        <div className="mt-0.5 line-clamp-1 text-xs text-[var(--admin-muted)]">{record.description || record.alt || "暂无补充文案"}</div>
                    </div>
                </div>
            ),
        },
        {
            title: "点击动作",
            key: "action",
            width: 180,
            render: (_value, record) => <span className="text-xs text-[var(--admin-muted)]">{actionSummary(record)}</span>,
        },
        ...(isTopbar
            ? [{
                  title: "倒计时",
                  key: "countdown",
                  width: 150,
                  render: (_value: unknown, record: PromoItem) => record.countdownAt ? <span className="text-xs tabular-nums text-[var(--admin-muted)]">{dayjs(record.countdownAt).format("MM-DD HH:mm")}</span> : <span className="text-xs text-[var(--admin-muted)]">不显示</span>,
              }]
            : [{
                  title: "频率",
                  key: "frequency",
                  width: 150,
                  render: (_value: unknown, record: PromoItem) => <span className="text-xs text-[var(--admin-muted)]">{FREQUENCY_LABEL[record.frequency] ?? record.frequency}</span>,
              }]),
        {
            title: "状态",
            dataIndex: "enabled",
            width: 130,
            render: (value: boolean, record) => {
                const expired = Boolean(record.countdownAt && new Date(record.countdownAt).getTime() <= Date.now());
                return expired ? <AdminBadge tone="warning">倒计时结束</AdminBadge> : <AdminBadge tone={value ? "positive" : "neutral"}>{value ? "启用中" : "已停用"}</AdminBadge>;
            },
        },
        {
            title: "启用",
            key: "toggle",
            width: 72,
            render: (_value, record) => <Switch size="small" checked={record.enabled} onChange={() => onToggle(record)} />,
        },
        {
            title: "操作",
            key: "actions",
            align: "right",
            width: 120,
            render: (_value, record) => (
                <div className="flex justify-end gap-1">
                    <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => onEdit(record)} aria-label="编辑" />
                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(record)} aria-label="删除" />
                </div>
            ),
        },
    ];

    return (
        <AdminPanel
            title={copy.panel}
            description={copy.desc}
            actions={canManage && <Button type="primary" size="small" icon={<Plus className="size-3.5" />} onClick={onCreate}>新增{copy.button}</Button>}
            flush
        >
            <Table<PromoItem> rowKey="id" dataSource={items} columns={canManage ? columns : columns.filter(column => column.key !== "toggle" && column.key !== "actions")} pagination={false} scroll={{ x: 820 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有配置内容" /> }} />
        </AdminPanel>
    );
}

function CarouselPanel({
    items,
    onAdd,
    onEdit,
    onToggle,
    onDelete,
    onMove,
    onReorder,
}: {
    items: PromoItem[];
    onAdd: () => void;
    onEdit: (item: PromoItem) => void;
    onToggle: (item: PromoItem) => void;
    onDelete: (item: PromoItem) => void;
    onMove: (item: PromoItem, direction: -1 | 1) => void;
    onReorder: (kind: "carousel" | "contact", ids: string[]) => Promise<void>;
}) {
    const canManage = useAdminPermissions().includes("promo.manage");
    const [draggingId, setDraggingId] = useState<string | null>(null);

    function drop(target: PromoItem) {
        if (!draggingId || draggingId === target.id) return;
        const from = items.findIndex((item) => item.id === draggingId);
        const to = items.findIndex((item) => item.id === target.id);
        if (from < 0 || to < 0) return;
        const next = [...items];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setDraggingId(null);
        void onReorder("carousel", next.map((item) => item.id));
    }

    return (
        <AdminPanel
            title="首页轮播"
            description="拖拽调整播放顺序；启用哪些就轮播哪些，没有数量上限。只支持图片，整张图可点击。"
            actions={canManage && <Button type="primary" size="small" icon={<Plus className="size-3.5" />} onClick={onAdd}>新增图片</Button>}
            bodyClassName="space-y-2"
        >
            {items.length ? items.map((item, index) => (
                <div
                    key={item.id}
                    draggable={canManage}
                    onDragStart={() => setDraggingId(item.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => drop(item)}
                    className={`flex items-center gap-3 rounded-[10px] border bg-[var(--admin-panel)] p-3 transition ${draggingId === item.id ? "border-[var(--admin-ink)] opacity-60" : "border-[var(--admin-line)]"}`}
                >
                    <GripVertical className="size-4 shrink-0 cursor-grab text-[var(--admin-muted)]" />
                    <AdminImage src={item.imageUrl} alt={item.alt} className="h-12 w-20 shrink-0 rounded-md object-cover" />
                    <div className="min-w-0 flex-1">
                        <div className="line-clamp-1 text-sm font-medium text-[var(--admin-ink)]">{item.alt || "未填写 alt"}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--admin-muted)]">
                            <span>{index + 1}</span>
                            <span>·</span>
                            <span>{actionSummary(item)}</span>
                        </div>
                    </div>
                    {canManage && <div className="flex shrink-0 items-center gap-1">
                        <Tooltip title="上移"><Button size="small" type="text" icon={<ArrowUp className="size-3.5" />} disabled={index === 0} onClick={() => onMove(item, -1)} /></Tooltip>
                        <Tooltip title="下移"><Button size="small" type="text" icon={<ArrowDown className="size-3.5" />} disabled={index === items.length - 1} onClick={() => onMove(item, 1)} /></Tooltip>
                        <Switch size="small" checked={item.enabled} onChange={() => onToggle(item)} />
                        <Button size="small" type="text" icon={<Pencil className="size-3.5" />} onClick={() => onEdit(item)} aria-label="编辑" />
                        <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(item)} aria-label="删除" />
                    </div>}
                </div>
            )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有轮播图" />}
        </AdminPanel>
    );
}

function ContactsPanel({
    contacts,
    onAdd,
    onEdit,
    onToggle,
    onDelete,
    onMove,
    onReorder,
}: {
    contacts: PromoContact[];
    onAdd: () => void;
    onEdit: (contact: PromoContact) => void;
    onToggle: (contact: PromoContact) => Promise<void>;
    onDelete: (contact: PromoContact) => void;
    onMove: (contact: PromoContact, direction: -1 | 1) => void;
    onReorder: (kind: "carousel" | "contact", ids: string[]) => Promise<void>;
}) {
    const canManage = useAdminPermissions().includes("promo.manage");
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const sorted = [...contacts].sort((a, b) => a.sort - b.sort);

    function drop(target: PromoContact) {
        if (!draggingId || draggingId === target.id) return;
        const from = sorted.findIndex((item) => item.id === draggingId);
        const to = sorted.findIndex((item) => item.id === target.id);
        if (from < 0 || to < 0) return;
        const next = [...sorted];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setDraggingId(null);
        void onReorder("contact", next.map((item) => item.id));
    }

    return (
        <AdminPanel
            title="联系方式"
            description="展示在侧栏“联系我们”弹窗里；同一类型可以添加多条，拖拽调整顺序。"
            actions={canManage && <Button type="primary" size="small" icon={<Plus className="size-3.5" />} onClick={onAdd}>新增联系方式</Button>}
            bodyClassName="grid gap-2 md:grid-cols-2"
        >
            {sorted.length ? sorted.map((contact, index) => (
                <div
                    key={contact.id}
                    draggable={canManage}
                    onDragStart={() => setDraggingId(contact.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => drop(contact)}
                    className={`flex min-w-0 items-start gap-3 rounded-[10px] border bg-[var(--admin-panel)] p-3 transition ${draggingId === contact.id ? "border-[var(--admin-ink)] opacity-60" : "border-[var(--admin-line)]"}`}
                >
                    <GripVertical className="mt-0.5 size-4 shrink-0 cursor-grab text-[var(--admin-muted)]" />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-[var(--admin-ink)]">{contact.name}</span>
                            <AdminBadge tone={contact.enabled ? "positive" : "neutral"}>{contact.enabled ? "展示中" : "已停用"}</AdminBadge>
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--admin-muted)]">{contactChannelLabel(contact.channel)} · {contact.value || "二维码"}</div>
                        {contact.description ? <div className="mt-1 line-clamp-1 text-[11px] text-[var(--admin-muted)]">{contact.description}</div> : null}
                    </div>
                    {contact.qrUrl ? <AdminImage src={contact.qrUrl} alt="" className="size-10 shrink-0 rounded border border-[var(--admin-line)] bg-white object-cover" compact /> : null}
                    {canManage && <div className="flex shrink-0 flex-col items-end gap-1">
                        <Switch size="small" checked={contact.enabled} onChange={() => void onToggle(contact)} />
                        <div className="flex">
                            <Button size="small" type="text" icon={<ArrowUp className="size-3" />} disabled={index === 0} onClick={() => onMove(contact, -1)} aria-label="上移" />
                            <Button size="small" type="text" icon={<ArrowDown className="size-3" />} disabled={index === sorted.length - 1} onClick={() => onMove(contact, 1)} aria-label="下移" />
                            <Button size="small" type="text" icon={<Pencil className="size-3" />} onClick={() => onEdit(contact)} aria-label="编辑" />
                            <Button size="small" type="text" danger icon={<Trash2 className="size-3" />} onClick={() => onDelete(contact)} aria-label="删除" />
                        </div>
                    </div>}
                </div>
            )) : <div className="md:col-span-2"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有联系方式" /></div>}
        </AdminPanel>
    );
}

function ClicksPanel({ clicks, onRefresh, loading }: { clicks: AdminPromoData["clicks"]; onRefresh: () => void; loading: boolean }) {
    const columns: TableColumnsType<AdminPromoData["clicks"][number]> = [
        { title: "位置", dataIndex: "placement", width: 130, render: (value: string) => <AdminBadge tone="neutral">{PLACEMENT_LABEL[value] ?? value}</AdminBadge> },
        { title: "内容", dataIndex: "label", render: (value: string) => <span className="font-medium text-[var(--admin-ink)]">{value || "未命名内容"}</span> },
        { title: "今天", dataIndex: "today", width: 100, align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
        { title: "近 7 天", dataIndex: "last7", width: 110, align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
        { title: "累计", dataIndex: "total", width: 100, align: "right", render: (value: number) => <strong className="tabular-nums text-[var(--admin-ink)]">{value}</strong> },
    ];
    return (
        <AdminPanel title="点击数据" description="只记录点击，不记录曝光和关闭；删除宣发内容会同时删除它的历史点击。" actions={<Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={onRefresh}>刷新</Button>} flush>
            <Table rowKey={(record) => `${record.placement}:${record.itemId ?? record.contactId}`} dataSource={clicks} columns={columns} pagination={false} scroll={{ x: 620 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有点击数据" /> }} />
        </AdminPanel>
    );
}

function ItemEditor({ draft, saving, onChange, onClose, onSave }: { draft: ItemDraft | null; saving: boolean; onChange: (next: ItemDraft | null) => void; onClose: () => void; onSave: () => void }) {
    const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
    if (!draft) return null;
    const update = (patch: Partial<ItemDraft>) => onChange({ ...draft, ...patch });
    const title = draft.id ? "编辑宣发内容" : SINGLE_PANEL_COPY[draft.placement as "topbar" | "popup" | "corner"]?.modal ?? "新增宣发内容";

    return (
        <Modal
            title={title}
            open
            onCancel={onClose}
            width={1040}
            footer={
                <div className="flex justify-end gap-2">
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" loading={saving} onClick={onSave}>保存并生效</Button>
                </div>
            }
            styles={{ body: { maxHeight: "calc(100vh - 220px)", overflowY: "auto" } }}
        >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                    {draft.placement === "topbar" ? (
                        <AdminField label="活动文案" required>
                            <Input.TextArea value={draft.title} rows={2} maxLength={120} showCount onChange={(event) => update({ title: event.target.value })} placeholder="例如：双十一狂欢 · 年会员限时赠送 3 个月" />
                        </AdminField>
                    ) : null}

                    {draft.placement !== "topbar" && draft.placement !== "corner" ? (
                        <>
                            <ImageUploadField label={draft.placement === "carousel" ? "桌面图片" : "弹窗图片"} required value={draft.imageUrl} onChange={(imageUrl) => update({ imageUrl })} hint={draft.placement === "carousel" ? "按原图比例展示，建议宽度 ≥ 1200px；移动端可单独上传" : "按原图比例展示，建议宽度 ≥ 1080px；移动端可单独上传"} />
                            <ImageUploadField label="移动端图片（选填）" value={draft.mobileImageUrl} onChange={(mobileImageUrl) => update({ mobileImageUrl })} hint="按原图比例展示；不填则使用桌面图片" />
                        </>
                    ) : null}

                    {draft.placement === "carousel" ? (
                        <AdminField label="图片 alt 文案" required hint="用于读屏和图片加载失败时说明，不显示在画面上">
                            <Input value={draft.alt} maxLength={200} onChange={(event) => update({ alt: event.target.value })} placeholder="例如：双十一会员活动主视觉" />
                        </AdminField>
                    ) : null}

                    {draft.placement === "popup" || draft.placement === "corner" ? (
                        <>
                            <AdminField label={draft.placement === "corner" ? "卡片标题" : "弹窗标题"} required>
                                <Input value={draft.title} maxLength={200} onChange={(event) => update({ title: event.target.value })} placeholder="例如：新人礼包待领取" />
                            </AdminField>
                            <AdminField label="描述" hint={draft.placement === "corner" ? "简短一行效果最好，最多两行" : undefined}>
                                <Input.TextArea value={draft.description} rows={draft.placement === "corner" ? 2 : 3} maxLength={draft.placement === "corner" ? 120 : 1000} showCount onChange={(event) => update({ description: event.target.value })} placeholder="例如：注册即送 300 积分" />
                            </AdminField>
                            <AdminField label="展示频率" hint={draft.placement === "corner" ? "记录在浏览器本地；用户关闭后本次不再出现" : undefined}>
                                <Select className="w-full" value={draft.frequency} options={FREQUENCY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} onChange={(frequency: PromoFrequency) => update({ frequency })} />
                            </AdminField>
                        </>
                    ) : null}

                    {draft.placement !== "carousel" ? (
                        <AdminField label="按钮文案" hint={draft.placement === "corner" ? "建议填写；不填时点整张卡片也能触发动作" : "选填；不填则不显示按钮"}>
                            <Input value={draft.ctaLabel} maxLength={40} onChange={(event) => update({ ctaLabel: event.target.value })} placeholder="例如：前往领取 / 立即查看" />
                        </AdminField>
                    ) : null}

                    <ActionFields draft={draft} onChange={update} />

                    {draft.placement === "topbar" ? (
                        <AdminField label="倒计时截止时间" hint="选填；只影响顶部条的倒计时，不是排期。到点后活动条自动隐藏。">
                            <DatePicker
                                className="w-full"
                                showTime
                                value={draft.countdownAt ? dayjs(draft.countdownAt) : null}
                                disabledDate={(current) => Boolean(current && current.endOf("day").valueOf() < Date.now())}
                                onChange={(value) => update({ countdownAt: value ? value.toISOString() : null })}
                                placeholder="不设置倒计时"
                            />
                        </AdminField>
                    ) : null}

                    <div className="flex items-center justify-between rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-3 py-2.5">
                        <div>
                            <div className="text-xs font-medium text-[var(--admin-ink)]">立即启用</div>
                            <div className="mt-0.5 text-[11px] text-[var(--admin-muted)]">保存后马上在前台生效。</div>
                        </div>
                        <Switch checked={draft.enabled} onChange={(enabled) => update({ enabled })} />
                    </div>
                </div>

                <div className="min-w-0">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-xs font-medium text-[var(--admin-ink)]">实时预览</div>
                        <div className="flex rounded-md border border-[var(--admin-line)] p-0.5">
                            <button type="button" className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] ${device === "desktop" ? "bg-[var(--admin-panel-soft)] text-[var(--admin-ink)]" : "text-[var(--admin-muted)]"}`} onClick={() => setDevice("desktop")}><Monitor className="size-3" />桌面</button>
                            <button type="button" className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] ${device === "mobile" ? "bg-[var(--admin-panel-soft)] text-[var(--admin-ink)]" : "text-[var(--admin-muted)]"}`} onClick={() => setDevice("mobile")}><Smartphone className="size-3" />移动</button>
                        </div>
                    </div>
                    <div className="sticky top-0 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-bg)] p-3">
                        <DraftPreview draft={draft} device={device} />
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function ActionFields({ draft, onChange }: { draft: ItemDraft; onChange: (patch: Partial<ItemDraft>) => void }) {
    const options = ACTION_OPTIONS.filter((option) => draft.placement !== "carousel" || option.value === "internal" || option.value === "external");
    return (
        <div className="space-y-3">
            <AdminField label="点击动作" required={draft.placement === "carousel"}>
                <Select
                    className="w-full"
                    value={draft.actionType}
                    options={options.map((option) => ({ value: option.value, label: option.label }))}
                    onChange={(actionType: PromoActionType) => {
                        onChange({
                            actionType,
                            actionValue: actionType === "internal" ? (draft.actionValue || "/") : actionType === "none" || actionType === "contact" ? "" : draft.actionValue,
                            ctaLabel: actionType === "none" ? "" : draft.ctaLabel,
                        });
                    }}
                />
            </AdminField>
            {draft.actionType === "internal" ? (
                <AdminField label="站内路径" required>
                    <Select className="w-full" value={draft.actionValue || "/"} options={INTERNAL_LINK_OPTIONS.map((option) => ({ value: option.value, label: `${option.label} · ${option.value}` }))} onChange={(actionValue: string) => onChange({ actionValue })} />
                </AdminField>
            ) : null}
            {draft.actionType === "external" ? (
                <AdminField label="站外链接" required hint="只支持 http / https，新窗口打开">
                    <Input value={draft.actionValue} onChange={(event) => onChange({ actionValue: event.target.value })} placeholder="https://" />
                </AdminField>
            ) : null}
            {draft.actionType === "copy" ? (
                <AdminField label="复制内容" required>
                    <Input value={draft.actionValue} onChange={(event) => onChange({ actionValue: event.target.value })} placeholder="例如：微信号或优惠码" />
                </AdminField>
            ) : null}
            {draft.actionType === "contact" ? <p className="text-[11px] text-[var(--admin-muted)]">点击后会打开用户前台的“联系我们”弹窗。</p> : null}
        </div>
    );
}

function ImageUploadField({ label, value, onChange, hint, required, ratio, recommended }: { label: string; value: string; onChange: (url: string) => void; hint?: string; required?: boolean; ratio?: number; recommended?: string }) {
    const scope = useAdminScope();
    const { message } = AntApp.useApp();
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [actualRatio, setActualRatio] = useState<number | null>(null);
    const [crop, setCrop] = useState<{ file: File; src: string } | null>(null);

    useEffect(() => {
        if (!value) return setActualRatio(null);
        const image = new Image();
        image.onload = () => { if (scope.current()) setActualRatio(image.naturalWidth / image.naturalHeight); };
        image.onerror = () => { if (scope.current()) setActualRatio(null); };
        image.src = value;
    }, [value]);

    useEffect(() => () => {
        if (crop) URL.revokeObjectURL(crop.src);
    }, [crop]);

    const ratioMismatch = Boolean(ratio && actualRatio && Math.abs(actualRatio - ratio) / ratio > 0.1);

    async function upload(file: Blob) {
        if (!scope.owner || !scope.current()) return;
        setBusy(true);
        try {
            const uploaded = await uploadBlobToServer(file, "promo", scope.owner);
            if (!scope.current()) return;
            if (!uploaded) throw new Error("上传失败，请稍后重试");
            onChange(uploaded.url);
            message.success("图片已上传");
            if (crop) URL.revokeObjectURL(crop.src);
            setCrop(null);
        } catch (error) {
            if (scope.current()) message.error(error instanceof Error ? error.message : String(error));
        } finally {
            if (scope.current()) setBusy(false);
        }
    }

    function pick(file: File | undefined) {
        if (!file || !scope.current()) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return void message.error("只支持 JPG / PNG / WebP");
        if (file.size > 10 * 1024 * 1024) return void message.error("图片不能超过 10MB");
        if (inputRef.current) inputRef.current.value = "";
        if (ratio) {
            setCrop({ file, src: URL.createObjectURL(file) });
            return;
        }
        void upload(file);
    }

    function closeCrop() {
        if (crop) URL.revokeObjectURL(crop.src);
        setCrop(null);
    }

    return (
        <div>
            <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-[var(--admin-muted)]">
                {label}{required ? <span className="text-[var(--admin-danger)]">*</span> : null}
            </div>
            <div className="flex gap-3 rounded-[9px] border border-dashed border-[var(--admin-line-strong)] bg-[var(--admin-panel-soft)] p-2.5">
                <div className="relative grid h-20 w-32 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--admin-line)] bg-[var(--admin-panel)] text-[var(--admin-muted)]">
                    {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImageOff className="size-5" />}
                </div>
                <div className="flex min-w-0 flex-col justify-center gap-2">
                    <div className="flex flex-wrap gap-2">
                        <Button size="small" icon={<Upload className="size-3.5" />} loading={busy} onClick={() => inputRef.current?.click()}>{value ? "替换图片" : "上传图片"}</Button>
                        {value ? <Button size="small" type="text" danger icon={<X className="size-3.5" />} onClick={() => onChange("")}>移除</Button> : null}
                    </div>
                    <div className={`text-[10px] leading-4 ${ratioMismatch ? "text-[var(--admin-warning)]" : "text-[var(--admin-muted)]"}`}>
                        {ratioMismatch && actualRatio ? `当前比例约 ${actualRatio.toFixed(2)}:1，建议 ${recommended ?? ""}；上传时会按比例裁切。` : hint || "JPG / PNG / WebP，单图 ≤ 10MB"}
                    </div>
                </div>
            </div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => pick(event.target.files?.[0])} />
            <ImageCropDialog file={crop?.file ?? null} src={crop?.src ?? ""} ratio={ratio ?? 1} busy={busy} onCancel={closeCrop} onConfirm={(file) => void upload(file)} />
        </div>
    );
}

function ImageCropDialog({ file, src, ratio, busy, onCancel, onConfirm }: { file: File | null; src: string; ratio: number; busy: boolean; onCancel: () => void; onConfirm: (file: File) => void }) {
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [natural, setNatural] = useState({ width: 0, height: 0 });
    const [frame, setFrame] = useState({ width: 0, height: 0 });
    const [frameElement, setFrameElement] = useState<HTMLDivElement | null>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

    useEffect(() => {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setNatural({ width: 0, height: 0 });
    }, [file]);

    useEffect(() => {
        if (!frameElement) return;
        const update = () => setFrame({ width: frameElement.clientWidth, height: frameElement.clientHeight });
        update();
        const observer = new ResizeObserver(update);
        observer.observe(frameElement);
        return () => observer.disconnect();
    }, [frameElement]);

    const baseScale = natural.width && frame.width ? Math.max(frame.width / natural.width, frame.height / natural.height) : 1;
    const scale = baseScale * zoom;
    const renderedWidth = natural.width * scale;
    const renderedHeight = natural.height * scale;
    const maxX = Math.max(0, (renderedWidth - frame.width) / 2);
    const maxY = Math.max(0, (renderedHeight - frame.height) / 2);
    const left = (frame.width - renderedWidth) / 2 + offset.x;
    const top = (frame.height - renderedHeight) / 2 + offset.y;

    useEffect(() => {
        setOffset((current) => ({
            x: Math.max(-maxX, Math.min(maxX, current.x)),
            y: Math.max(-maxY, Math.min(maxY, current.y)),
        }));
    }, [maxX, maxY]);

    function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
    }

    function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
        const drag = dragRef.current;
        if (!drag) return;
        setOffset({
            x: Math.max(-maxX, Math.min(maxX, drag.offsetX + event.clientX - drag.x)),
            y: Math.max(-maxY, Math.min(maxY, drag.offsetY + event.clientY - drag.y)),
        });
    }

    function confirm() {
        const image = imageRef.current;
        if (!image || !natural.width || !frame.width) return;
        const sourceX = Math.max(0, (renderedWidth - frame.width) / 2 - offset.x) / scale;
        const sourceY = Math.max(0, (renderedHeight - frame.height) / 2 - offset.y) / scale;
        const sourceWidth = frame.width / scale;
        const sourceHeight = frame.height / scale;
        const outputWidth = Math.min(1200, Math.round(sourceWidth));
        const outputHeight = Math.max(1, Math.round(outputWidth / ratio));
        const canvas = document.createElement("canvas");
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);
        canvas.toBlob((blob) => {
            if (!blob || !file) return;
            onConfirm(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
        }, "image/jpeg", 0.92);
    }

    return (
        <Modal
            title={ratio === 1 ? "裁切二维码" : "裁切图片"}
            open={Boolean(file)}
            onCancel={onCancel}
            width={540}
            footer={<div className="flex justify-end gap-2"><Button onClick={onCancel}>取消</Button><Button type="primary" loading={busy} onClick={confirm}>裁切并上传</Button></div>}
        >
            <div className="flex flex-col items-center gap-4">
                <div
                    ref={setFrameElement}
                    className="promo-crop-frame"
                    style={{ aspectRatio: ratio }}
                    onPointerDown={pointerDown}
                    onPointerMove={pointerMove}
                    onPointerUp={() => { dragRef.current = null; }}
                    onPointerCancel={() => { dragRef.current = null; }}
                >
                    {src ? (
                        <img
                            ref={imageRef}
                            src={src}
                            alt="待裁切图片"
                            draggable={false}
                            onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                            style={{ width: renderedWidth || "100%", height: renderedHeight || "auto", left, top }}
                        />
                    ) : null}
                    <div className="promo-crop-grid" />
                </div>
                <div className="w-full">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--admin-muted)]">
                        <span>拖动图片调整位置</span>
                        <span>缩放 {zoom.toFixed(1)}×</span>
                    </div>
                    <Slider min={1} max={3} step={0.01} value={zoom} onChange={setZoom} />
                </div>
                <p className="m-0 text-center text-[11px] leading-4 text-[var(--admin-muted)]">框内即为最终显示区域，建议保持二维码完整。</p>
            </div>
        </Modal>
    );
}

function DraftPreview({ draft, device }: { draft: ItemDraft; device: "desktop" | "mobile" }) {
    const image = device === "mobile" && draft.mobileImageUrl ? draft.mobileImageUrl : draft.imageUrl;
    const mobile = device === "mobile";

    if (draft.placement === "topbar") {
        return (
            <div className="overflow-hidden rounded-lg border border-[var(--admin-line)]">
                <div className="flex min-h-11 items-center justify-center gap-2 bg-[#171412] px-4 text-center text-[11px] leading-4 text-white">
                    <span className="line-clamp-2">{draft.title || "活动文案会显示在这里"}</span>
                    {draft.countdownAt ? <span className="shrink-0 font-medium text-[#D8FF3E]">03 : 13 : 37 : 17</span> : null}
                    {draft.ctaLabel ? <span className="shrink-0 border-b border-[#D8FF3E]/60 text-[#D8FF3E]">{draft.ctaLabel}</span> : null}
                </div>
            </div>
        );
    }

    if (draft.placement === "carousel") {
        return (
            <div className={`overflow-hidden rounded-lg border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] ${mobile ? "mx-auto max-w-[280px]" : ""}`}>
                {image ? <img src={image} alt={draft.alt} className="block h-auto w-full" /> : <div className="grid aspect-[2.28/1] place-items-center text-[var(--admin-muted)]"><ImageOff className="size-6" /></div>}
            </div>
        );
    }

    if (draft.placement === "corner") {
        return (
            <div className={`overflow-hidden rounded-lg border border-[var(--admin-line)] bg-[var(--admin-panel)] p-3 ${mobile ? "mx-auto max-w-[280px]" : ""}`}>
                <div className="rounded-[10px] border border-[var(--admin-line)] bg-[var(--admin-panel)] p-2.5 shadow-sm">
                    <div className="flex items-start gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[rgba(212,255,58,0.16)]"><Gift className="size-3.5" aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[11px] font-semibold text-[var(--admin-ink)]">{draft.title || "卡片标题"}</div>
                            {draft.description ? <div className="mt-0.5 line-clamp-2 text-[9.5px] leading-3 text-[var(--admin-muted)]">{draft.description}</div> : null}
                        </div>
                    </div>
                    {draft.ctaLabel ? <div className="mt-2 flex h-6 items-center justify-center rounded-md bg-[#D8FF3E] text-[10px] font-semibold text-[#121212]">{draft.ctaLabel}</div> : null}
                </div>
                <div className="mt-2 text-[9px] text-[var(--admin-muted)]">实际位置：页面右下角浮动，可关闭</div>
            </div>
        );
    }

    return (
        <div className={`overflow-hidden rounded-xl border border-[var(--admin-line)] bg-[var(--admin-panel)] ${mobile ? "mx-auto max-w-[280px]" : ""}`}>
            <div className="bg-[var(--admin-panel-soft)]">
                {image ? (
                    <img src={image} alt={draft.alt || draft.title} className="block h-auto w-full" />
                ) : (
                    <div className="grid aspect-[16/9] place-items-center text-[var(--admin-muted)]">
                        <ImageOff className="size-6" />
                    </div>
                )}
            </div>
            <div className="p-3">
                <div className="text-sm font-semibold text-[var(--admin-ink)]">{draft.title || "弹窗标题"}</div>
                {draft.description ? <div className="mt-1 line-clamp-3 text-[11px] leading-4 text-[var(--admin-muted)]">{draft.description}</div> : null}
                {draft.ctaLabel ? <div className="mt-3 inline-flex rounded-md bg-[var(--admin-ink)] px-3 py-1.5 text-[10px] font-medium text-[var(--admin-panel)]">{draft.ctaLabel}</div> : null}
            </div>
        </div>
    );
}

function ContactEditor({ draft, saving, onChange, onClose, onSave }: { draft: ContactDraft | null; saving: boolean; onChange: (next: ContactDraft | null) => void; onClose: () => void; onSave: () => void }) {
    if (!draft) return null;
    const update = (patch: Partial<ContactDraft>) => onChange({ ...draft, ...patch });
    const valueLabel = draft.channel === "email" ? "邮箱" : draft.channel === "phone" ? "电话号码" : draft.channel === "link" ? "链接" : "号码 / 用户名";
    return (
        <Modal
            title={draft.id ? "编辑联系方式" : "新增联系方式"}
            open
            onCancel={onClose}
            width={760}
            footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>取消</Button><Button type="primary" loading={saving} onClick={onSave}>保存</Button></div>}
        >
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
                <div className="space-y-4">
                    <AdminField label="类型" required>
                        <Select className="w-full" value={draft.channel} options={CONTACT_CHANNEL_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} onChange={(channel: PromoContactChannel) => update({ channel })} />
                    </AdminField>
                    <AdminField label="显示名称" required>
                        <Input value={draft.name} maxLength={60} onChange={(event) => update({ name: event.target.value })} placeholder="例如：微信客服 / 商务合作" />
                    </AdminField>
                    <AdminField label={valueLabel} hint="和二维码至少填写一项">
                        <Input value={draft.value} maxLength={300} onChange={(event) => update({ value: event.target.value })} placeholder={draft.channel === "link" ? "https://" : ""} />
                    </AdminField>
                    <ImageUploadField label="二维码（选填）" value={draft.qrUrl} onChange={(qrUrl) => update({ qrUrl })} ratio={1} recommended="1:1" hint="上传后会进入 1:1 裁切框，拖动或缩放确认显示区域；用户可点开放大" />
                    <AdminField label="说明（选填）">
                        <Input.TextArea value={draft.description} rows={2} maxLength={300} onChange={(event) => update({ description: event.target.value })} placeholder="例如：工作日 9:00–18:00" />
                    </AdminField>
                    <div className="flex items-center justify-between rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-3 py-2.5">
                        <div><div className="text-xs font-medium text-[var(--admin-ink)]">展示在联系我们</div><div className="mt-0.5 text-[11px] text-[var(--admin-muted)]">关闭后保留记录但不展示。</div></div>
                        <Switch checked={draft.enabled} onChange={(enabled) => update({ enabled })} />
                    </div>
                </div>
                <div>
                    <div className="mb-3 text-xs font-medium text-[var(--admin-ink)]">卡片预览</div>
                    <div className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-bg)] p-3">
                        <div className="flex items-center gap-3 rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel)] p-3">
                            <div className="grid size-8 place-items-center rounded-md border border-[var(--admin-line)] text-[var(--admin-muted)]"><Upload className="size-3.5" /></div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-semibold text-[var(--admin-ink)]">{draft.name || "显示名称"}</div>
                                <div className="mt-0.5 text-[10px] text-[var(--admin-muted)]">{contactChannelLabel(draft.channel)}</div>
                            </div>
                            {draft.qrUrl ? <img src={draft.qrUrl} alt="" className="size-10 rounded border border-[var(--admin-line)] bg-white object-cover" /> : null}
                        </div>
                        {draft.value ? <div className="mt-2 break-all text-[11px] text-[var(--admin-muted)]">{draft.value}</div> : null}
                        {draft.description ? <div className="mt-1 line-clamp-2 text-[10px] text-[var(--admin-muted)]">{draft.description}</div> : null}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
