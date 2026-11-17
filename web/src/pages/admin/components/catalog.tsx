import { useEffect, useState } from "react";
import { App as AntApp, Button, Input, InputNumber, Modal, Select, Switch, Table, Tabs } from "antd";
import type { TableColumnsType } from "antd";

import { useAdminRequest } from "../use-admin-request";
import { useAdminPermissions } from "../permissions";
import { ADMIN_AUTOFILL_OFF, AdminBadge, AdminField, AdminPanel } from "./ui";
import { ModelEditorModal, type AdminFamily, type AdminModel } from "./model-editor";
import { ChannelBalances } from './channel-balances';

type Channel = {
    id: string;
    name: string;
    textMode: string;
    protocol: string;
    baseUrl: string;
    enabled: boolean;
    modelCount: number;
    healthStatus: string;
    latencyMs: number | null;
    checkedAt: string | null;
    healthMessage: string | null;
};
type Plan = { id: string; name: string; days: number; priceCents: number; monthlyCredits: number; tierId: string | null; enabled: boolean; sort: number };
type MembershipTier = { id: string; level: number; name: string; description: string; consumptionDiscount: number; grantCredits: number; enabled: boolean };
type RechargePackage = { id: string; name: string; credits: number; priceCents: number; originalPriceCents: number | null; description: string; enabled: boolean; sort: number };

const CAPABILITIES = [
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
    { value: "text", label: "文本" },
    { value: "audio", label: "音频" },
];

function healthBadge(status: string) {
    if (status === "healthy") return <AdminBadge tone="positive">正常</AdminBadge>;
    if (status === "degraded") return <AdminBadge tone="warning">波动</AdminBadge>;
    if (status === "down") return <AdminBadge tone="danger">异常</AdminBadge>;
    return <AdminBadge tone="neutral">未检测</AdminBadge>;
}

function priceRange(routes: AdminModel["routes"]) {
    const values = routes.map((route) => Number(route.baseCredits)).filter((value) => Number.isFinite(value) && value > 0);
    if (!values.length) return "—";
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? `${min}` : `${min}–${max}`;
}

export function CatalogTab() {
    const permissions = useAdminPermissions();
    const apiRequest = useAdminRequest();
    const { message, modal } = AntApp.useApp();
    const [channels, setChannels] = useState<Channel[]>([]);
    const [models, setModels] = useState<AdminModel[]>([]);
    const [families, setFamilies] = useState<AdminFamily[]>([]);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [tiers, setTiers] = useState<MembershipTier[]>([]);
    const [packages, setPackages] = useState<RechargePackage[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(() => permissions.includes("channels.read") ? "channels" : permissions.includes("models.read") ? "models" : "tiers");
    const permissionKey = permissions.join("|");

    const [channelModal, setChannelModal] = useState<{ open: boolean; id?: string; name: string; textMode: string; baseUrl: string; apiKey: string; protocol?: string; accessKeyId?: string; accessKeySecret?: string }>({ open: false, name: "", textMode: "responses", baseUrl: "", apiKey: "" });
    const [testingChannel, setTestingChannel] = useState(false);
    const [channelModels, setChannelModels] = useState<string[]>([]);
    const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
    const [familyModal, setFamilyModal] = useState<{ open: boolean; id?: string; name: string; vendor: string; description: string; icon: string; sort: number }>({ open: false, name: "", vendor: "", description: "", icon: "", sort: 0 });
    const [modelOpen, setModelOpen] = useState(false);
    const [editingModel, setEditingModel] = useState<AdminModel | null>(null);
    const [planModal, setPlanModal] = useState<{ open: boolean; id?: string; name: string; days: number; priceYuan: number; monthlyCredits: number; tierId: string; enabled: boolean }>({ open: false, name: "", days: 30, priceYuan: 59, monthlyCredits: 500, tierId: "", enabled: true });
    const [tierModal, setTierModal] = useState<{ open: boolean; id?: string; level: number; name: string; description: string; discountZhe: number; grantCredits: number; enabled: boolean }>({ open: false, level: 1, name: "", description: "", discountZhe: 10, grantCredits: 0, enabled: true });
    const [packageModal, setPackageModal] = useState<{ open: boolean; id?: string; name: string; credits: number; priceYuan: number; originalPriceYuan: number; description: string; sort: number; enabled: boolean }>({ open: false, name: "", credits: 100, priceYuan: 10, originalPriceYuan: 0, description: "", sort: 0, enabled: true });

    async function load() {
        setLoading(true);
        try {
            const [channelData, modelData, familyData, planData, tierData, packageData] = await Promise.all([
                permissions.includes("channels.read") ? apiRequest<{ channels: Channel[] }>("/api/admin/channels") : Promise.resolve({channels: []}),
                permissions.includes("models.read") ? apiRequest<{ models: AdminModel[] }>("/api/admin/models") : Promise.resolve({models: []}),
                permissions.includes("models.read") ? apiRequest<{ families: AdminFamily[] }>("/api/admin/model-families") : Promise.resolve({families: []}),
                permissions.includes("catalog.read") ? apiRequest<{ plans: Plan[] }>("/api/admin/plans") : Promise.resolve({plans: []}),
                permissions.includes("catalog.read") ? apiRequest<{ tiers: MembershipTier[] }>("/api/admin/membership-tiers") : Promise.resolve({tiers: []}),
                permissions.includes("catalog.read") ? apiRequest<{ packages: RechargePackage[] }>("/api/admin/recharge-packages") : Promise.resolve({packages: []}),
            ]);
            setChannels(channelData.channels);
            setModels(modelData.models);
            setFamilies(familyData.families);
            setPlans(planData.plans);
            setTiers(tierData.tiers);
            setPackages(packageData.packages);
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, [permissionKey]);

    useEffect(() => {
        const permitted = ["channels", "balances"].includes(activeTab) ? permissions.includes("channels.read") : ["models", "families"].includes(activeTab) ? permissions.includes("models.read") : permissions.includes("catalog.read");
        if (!permitted) setActiveTab(permissions.includes("channels.read") ? "channels" : permissions.includes("models.read") ? "models" : "tiers");
    }, [permissionKey, activeTab]);

    useEffect(() => {
        if (!permissions.includes("channels.manage")) setChannelModal(current => ({ ...current, open:false, apiKey:"", accessKeyId:'', accessKeySecret:'' }));
        if (!permissions.includes("models.manage")) { setModelOpen(false); setFamilyModal(current => ({ ...current, open:false })); }
        if (!permissions.includes("catalog.manage")) { setPlanModal(current => ({ ...current, open:false })); setTierModal(current => ({ ...current, open:false })); setPackageModal(current => ({ ...current, open:false })); }
    }, [permissionKey]);

    useEffect(() => {
        if (!channelModal.open) setChannelModels([]);
    }, [channelModal.open]);

    async function saveChannel() {
        const aliyun = channelModal.protocol === 'aliyun-viapi';
        if (aliyun && (channelModal.accessKeyId || channelModal.accessKeySecret) && (!channelModal.accessKeyId || !channelModal.accessKeySecret)) { message.error('请同时填写 AccessKey ID 和 Secret'); return; }
        const apiKey = aliyun ? (channelModal.accessKeyId && channelModal.accessKeySecret ? JSON.stringify({ accessKeyId: channelModal.accessKeyId, accessKeySecret: channelModal.accessKeySecret }) : '') : channelModal.apiKey;
        const payload = { name: channelModal.name, protocol: channelModal.protocol || 'openai', textMode: channelModal.textMode, baseUrl: channelModal.baseUrl, ...(apiKey ? { apiKey } : {}) };
        try {
            await apiRequest(channelModal.id ? `/api/admin/channels/${channelModal.id}` : "/api/admin/channels", { method: channelModal.id ? "PATCH" : "POST", json: payload });
            setChannelModal({ open: false, name: "", textMode: "responses", baseUrl: "", apiKey: "" });
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    }

    async function saveFamily() {
        try {
            await apiRequest(familyModal.id ? `/api/admin/model-families/${familyModal.id}` : "/api/admin/model-families", {
                method: familyModal.id ? "PATCH" : "POST",
                json: { name: familyModal.name, vendor: familyModal.vendor, description: familyModal.description, icon: familyModal.icon, sort: familyModal.sort },
            });
            setFamilyModal({ open: false, name: "", vendor: "", description: "", icon: "", sort: 0 });
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    }

    async function savePlan() {
        try {
            await apiRequest(planModal.id ? `/api/admin/plans/${planModal.id}` : "/api/admin/plans", {
                method: planModal.id ? "PATCH" : "POST",
                json: { name: planModal.name, days: planModal.days, priceCents: Math.round(planModal.priceYuan * 100), monthlyCredits: planModal.monthlyCredits, tierId: planModal.tierId, enabled: planModal.enabled },
            });
            setPlanModal({ open: false, name: "", days: 30, priceYuan: 59, monthlyCredits: 500, tierId: "", enabled: true });
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    }

    async function saveTier() {
        try {
            await apiRequest(`/api/admin/membership-tiers/${tierModal.id}`, {
                method: "PATCH",
                json: {
                    name: tierModal.name,
                    description: tierModal.description,
                    consumptionDiscount: Number((tierModal.discountZhe / 10).toFixed(4)),
                    grantCredits: tierModal.grantCredits,
                    enabled: tierModal.enabled,
                },
            });
            setTierModal({ ...tierModal, open: false });
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    }

    async function savePackage() {
        try {
            await apiRequest(packageModal.id ? `/api/admin/recharge-packages/${packageModal.id}` : "/api/admin/recharge-packages", {
                method: packageModal.id ? "PATCH" : "POST",
                json: {
                    name: packageModal.name,
                    credits: packageModal.credits,
                    priceCents: Math.round(packageModal.priceYuan * 100),
                    originalPriceCents: packageModal.originalPriceYuan > 0 ? Math.round(packageModal.originalPriceYuan * 100) : null,
                    description: packageModal.description,
                    sort: packageModal.sort,
                    enabled: packageModal.enabled,
                },
            });
            setPackageModal({ open: false, name: "", credits: 100, priceYuan: 10, originalPriceYuan: 0, description: "", sort: 0, enabled: true });
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    }

    async function testChannel() {
        setTestingChannel(true);
        try {
            const result = await apiRequest<{ count: number; models: string[] }>("/api/admin/channels/test", {
                method: "POST",
                json: { id: channelModal.id, baseUrl: channelModal.baseUrl, apiKey: channelModal.apiKey },
            });
            setChannelModels(result.models);
            setDiscoveredModels(result.models);
            message.success(`连接成功，当前 Key 可见 ${result.count} 个模型`);
            if (channelModal.id) await load();
        } catch (error) {
            setChannelModels([]);
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setTestingChannel(false);
        }
    }

    function remove(path: string, label: string) {
        modal.confirm({
            title: `删除${label}？`,
            okButtonProps: { danger: true },
            onOk: async () => {
                await apiRequest(path, { method: "DELETE" });
                await load();
            },
        });
    }

    const channelColumns: TableColumnsType<Channel> = [
        { title: "名称", dataIndex: "name", render: (value: string) => <span className="font-medium text-[var(--admin-ink)]">{value}</span> },
        { title: "文本接口", dataIndex: "textMode", render: (value: string) => <span className="text-[var(--admin-muted)]">{value === "chat" ? "Chat Completions" : "Responses"}</span> },
        { title: "Base URL", dataIndex: "baseUrl", ellipsis: true, render: (value: string) => <span className="text-[var(--admin-muted)]">{value}</span> },
        { title: "线路", dataIndex: "modelCount", align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
        { title: "健康", dataIndex: "healthStatus", render: (value: string, record) => <div>{healthBadge(value)}{record.latencyMs ? <div className="mt-1 text-[10px] text-[var(--admin-muted)]">{record.latencyMs}ms</div> : null}</div> },
        { title: "状态", dataIndex: "enabled", render: (value: boolean) => <AdminBadge tone={value ? "positive" : "neutral"}>{value ? "已启用" : "未启用"}</AdminBadge> },
        {
            title: "操作",
            key: "actions",
            align: "right",
            render: (_value, record) => (
                <div className="flex justify-end gap-1.5">
                    <Button size="small" onClick={() => setChannelModal({ open: true, id: record.id, name: record.name, protocol: record.protocol, textMode: record.textMode, baseUrl: record.baseUrl, apiKey: "" })}>编辑</Button>
                    <Button size="small" danger onClick={() => remove(`/api/admin/channels/${record.id}`, "渠道")}>删除</Button>
                </div>
            ),
        },
    ];

    const modelColumns: TableColumnsType<AdminModel> = [
        {
            title: "模型",
            dataIndex: "displayName",
            render: (value: string, record) => (
                <div>
                    <div className="font-medium text-[var(--admin-ink)]">{value}</div>
                    <div className="mt-0.5 text-xs text-[var(--admin-muted)]">{record.upstreamName}</div>
                </div>
            ),
        },
        { title: "模型族", dataIndex: "familyName", render: (value: string | null) => <span className="text-[var(--admin-muted)]">{value || "未分组"}</span> },
        { title: "能力", dataIndex: "capability", render: (value: string) => CAPABILITIES.find((item) => item.value === value)?.label ?? value },
        { title: "线路", dataIndex: "routes", render: (routes: AdminModel["routes"]) => <span className="tabular-nums text-[var(--admin-muted)]">{routes.length}</span> },
        { title: "价格区间", dataIndex: "routes", render: (routes: AdminModel["routes"]) => <span className="tabular-nums">{priceRange(routes)}</span> },
        { title: "状态", dataIndex: "enabled", render: (value: boolean) => <AdminBadge tone={value ? "positive" : "neutral"}>{value ? "已启用" : "未启用"}</AdminBadge> },
        {
            title: "操作",
            key: "actions",
            align: "right",
            render: (_value, record) => (
                <div className="flex justify-end gap-1.5">
                    <Button size="small" disabled={!permissions.includes("channels.read")} title={!permissions.includes("channels.read") ? "编辑模型需要渠道查看权限" : undefined} onClick={() => { setEditingModel(record); setModelOpen(true); }}>编辑</Button>
                    <Button size="small" danger onClick={() => remove(`/api/admin/models/${record.id}`, "模型")}>删除</Button>
                </div>
            ),
        },
    ];

    const familyColumns: TableColumnsType<AdminFamily> = [
        { title: "模型族", dataIndex: "name", render: (value: string) => <span className="font-medium text-[var(--admin-ink)]">{value}</span> },
        { title: "厂商", dataIndex: "vendor", render: (value: string) => <span className="text-[var(--admin-muted)]">{value || "—"}</span> },
        { title: "模型", dataIndex: "modelCount", align: "right", render: (value: number) => <span className="tabular-nums">{value ?? 0}</span> },
        { title: "排序", dataIndex: "sort", align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
        {
            title: "操作",
            key: "actions",
            align: "right",
            render: (_value, record) => (
                <div className="flex justify-end gap-1.5">
                    <Button size="small" onClick={() => setFamilyModal({ open: true, id: record.id, name: record.name, vendor: record.vendor, description: record.description, icon: record.icon, sort: record.sort })}>编辑</Button>
                    <Button size="small" danger onClick={() => remove(`/api/admin/model-families/${record.id}`, "模型族")}>删除</Button>
                </div>
            ),
        },
    ];

    const tierName = (id: string | null) => tiers.find((item) => item.id === id)?.name ?? "—";

    const planColumns: TableColumnsType<Plan> = [
        { title: "套餐", dataIndex: "name", render: (value: string) => <span className="font-medium text-[var(--admin-ink)]">{value}</span> },
        { title: "会员档位", dataIndex: "tierId", render: (value: string | null) => <span className="text-[var(--admin-muted)]">{tierName(value)}</span> },
        { title: "天数", dataIndex: "days", align: "right", render: (value: number) => <span className="tabular-nums">{value} 天</span> },
        { title: "价格", dataIndex: "priceCents", align: "right", render: (value: number) => <span className="font-medium tabular-nums">¥{(value / 100).toFixed(2)}</span> },
        { title: "月度积分", dataIndex: "monthlyCredits", align: "right", render: (value: number) => <span className="tabular-nums">{value.toLocaleString("zh-CN")}</span> },
        { title: "状态", dataIndex: "enabled", render: (value: boolean) => <AdminBadge tone={value ? "positive" : "neutral"}>{value ? "已启用" : "未启用"}</AdminBadge> },
        {
            title: "操作",
            key: "actions",
            align: "right",
            render: (_value, record) => (
                <div className="flex justify-end gap-1.5">
                    <Button size="small" onClick={() => setPlanModal({ open: true, id: record.id, name: record.name, days: record.days, priceYuan: record.priceCents / 100, monthlyCredits: record.monthlyCredits, tierId: record.tierId ?? "", enabled: record.enabled })}>编辑</Button>
                    <Button size="small" danger onClick={() => remove(`/api/admin/plans/${record.id}`, "套餐")}>删除</Button>
                </div>
            ),
        },
    ];

    const tierColumns: TableColumnsType<MembershipTier> = [
        { title: "档位", dataIndex: "level", align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
        { title: "名称", dataIndex: "name", render: (value: string) => <span className="font-medium text-[var(--admin-ink)]">{value}</span> },
        { title: "生成折扣", dataIndex: "consumptionDiscount", align: "right", render: (value: number) => <span className="tabular-nums">{(Number(value) * 10).toFixed(1)} 折</span> },
        { title: "开通赠送积分", dataIndex: "grantCredits", align: "right", render: (value: number) => <span className="tabular-nums">{value.toLocaleString("zh-CN")}</span> },
        { title: "状态", dataIndex: "enabled", render: (value: boolean) => <AdminBadge tone={value ? "positive" : "neutral"}>{value ? "已启用" : "未启用"}</AdminBadge> },
        {
            title: "操作",
            key: "actions",
            align: "right",
            render: (_value, record) => (
                <div className="flex justify-end gap-1.5">
                    <Button size="small" onClick={() => setTierModal({ open: true, id: record.id, level: record.level, name: record.name, description: record.description ?? "", discountZhe: Number(record.consumptionDiscount) * 10, grantCredits: record.grantCredits, enabled: record.enabled })}>编辑</Button>
                </div>
            ),
        },
    ];

    const packageColumns: TableColumnsType<RechargePackage> = [
        { title: "套餐", dataIndex: "name", render: (value: string) => <span className="font-medium text-[var(--admin-ink)]">{value}</span> },
        { title: "积分", dataIndex: "credits", align: "right", render: (value: number) => <span className="tabular-nums">{value.toLocaleString("zh-CN")}</span> },
        { title: "实付", dataIndex: "priceCents", align: "right", render: (value: number) => <span className="font-medium tabular-nums">¥{(value / 100).toFixed(2)}</span> },
        { title: "原价", dataIndex: "originalPriceCents", align: "right", render: (value: number | null) => <span className="tabular-nums text-[var(--admin-muted)]">{value ? `¥${(value / 100).toFixed(2)}` : "—"}</span> },
        { title: "排序", dataIndex: "sort", align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
        { title: "状态", dataIndex: "enabled", render: (value: boolean) => <AdminBadge tone={value ? "positive" : "neutral"}>{value ? "已启用" : "未启用"}</AdminBadge> },
        {
            title: "操作",
            key: "actions",
            align: "right",
            render: (_value, record) => (
                <div className="flex justify-end gap-1.5">
                    <Button size="small" onClick={() => setPackageModal({ open: true, id: record.id, name: record.name, credits: record.credits, priceYuan: record.priceCents / 100, originalPriceYuan: record.originalPriceCents ? record.originalPriceCents / 100 : 0, description: record.description, sort: record.sort, enabled: record.enabled })}>编辑</Button>
                    <Button size="small" danger onClick={() => remove(`/api/admin/recharge-packages/${record.id}`, "充值套餐")}>删除</Button>
                </div>
            ),
        },
    ];

    return (
        <div>
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    { key: 'balances', label: '额度预警', children: <ChannelBalances /> },
                    {
                        key: "channels",
                        label: `渠道 ${channels.length}`,
                        children: (
                            <AdminPanel
                                title="渠道"
                                description="上游 OpenAI 兼容服务；Key 只在保存时写入，不会回显。测试连接会更新渠道健康状态。"
                                actions={permissions.includes("channels.manage") && <Button type="primary" size="small" onClick={() => setChannelModal({ open: true, name: "", textMode: "responses", baseUrl: "", apiKey: "" })}>新增渠道</Button>}
                                flush
                            >
                                <Table<Channel> rowKey="id" loading={loading} dataSource={channels} columns={permissions.includes("channels.manage") ? channelColumns : channelColumns.filter(column => column.key !== "actions")} pagination={false} scroll={{ x: 980 }} />
                            </AdminPanel>
                        ),
                    },
                    {
                        key: "models",
                        label: `模型 ${models.length}`,
                        children: (
                            <AdminPanel
                                title="模型与线路"
                                description="一个模型可绑多个渠道；前台按模型族聚合，价格取线路区间，网关按优先级与健康状态选路。"
                                actions={permissions.includes("models.manage") && <Button type="primary" size="small" disabled={!permissions.includes("channels.read")} title={!permissions.includes("channels.read") ? "新增模型需要渠道查看权限" : undefined} onClick={() => { setEditingModel(null); setModelOpen(true); }}>新增模型</Button>}
                                flush
                            >
                                <Table<AdminModel> rowKey="id" loading={loading} dataSource={models} columns={permissions.includes("models.manage") ? modelColumns : modelColumns.filter(column => column.key !== "actions")} pagination={false} scroll={{ x: 1000 }} />
                            </AdminPanel>
                        ),
                    },
                    {
                        key: "families",
                        label: `模型族 ${families.length}`,
                        children: (
                            <AdminPanel
                                title="模型族"
                                description="用于前台模型选择器分组，例如 Seedance、Grok、Claude。"
                                actions={permissions.includes("models.manage") && <Button type="primary" size="small" onClick={() => setFamilyModal({ open: true, name: "", vendor: "", description: "", icon: "", sort: 0 })}>新增模型族</Button>}
                                flush
                            >
                                <Table<AdminFamily> rowKey="id" loading={loading} dataSource={families} columns={permissions.includes("models.manage") ? familyColumns : familyColumns.filter(column => column.key !== "actions")} pagination={false} scroll={{ x: 760 }} />
                            </AdminPanel>
                        ),
                    },
                    {
                        key: "tiers",
                        label: `会员档位 ${tiers.length}`,
                        children: (
                            <AdminPanel
                                title="会员档位"
                                description="三档固定，只能在套餐上绑定。消耗折扣作用于生成扣费，开通赠送积分在会员订单支付成功后一次性发放。"
                                flush
                            >
                                <Table<MembershipTier> rowKey="id" loading={loading} dataSource={tiers} columns={permissions.includes("catalog.manage") ? tierColumns : tierColumns.filter(column => column.key !== "actions")} pagination={false} scroll={{ x: 720 }} />
                            </AdminPanel>
                        ),
                    },
                    {
                        key: "plans",
                        label: `套餐 ${plans.length}`,
                        children: (
                            <AdminPanel
                                title="会员套餐"
                                description="购买后立即发放月度积分；绑定档位后按档位折扣计费。"
                                actions={permissions.includes("catalog.manage") && <Button type="primary" size="small" onClick={() => setPlanModal({ open: true, name: "", days: 30, priceYuan: 59, monthlyCredits: 500, tierId: "", enabled: true })}>新增套餐</Button>}
                                flush
                            >
                                <Table<Plan> rowKey="id" loading={loading} dataSource={plans} columns={permissions.includes("catalog.manage") ? planColumns : planColumns.filter(column => column.key !== "actions")} pagination={false} scroll={{ x: 840 }} />
                            </AdminPanel>
                        ),
                    },
                    {
                        key: "packages",
                        label: `充值套餐 ${packages.length}`,
                        children: (
                            <AdminPanel
                                title="充值套餐"
                                description="前台充值页展示的固定档位；不配置时用户只能按单价自定义积分数量。"
                                actions={permissions.includes("catalog.manage") && <Button type="primary" size="small" onClick={() => setPackageModal({ open: true, name: "", credits: 100, priceYuan: 10, originalPriceYuan: 0, description: "", sort: 0, enabled: true })}>新增套餐</Button>}
                                flush
                            >
                                <Table<RechargePackage> rowKey="id" loading={loading} dataSource={packages} columns={permissions.includes("catalog.manage") ? packageColumns : packageColumns.filter(column => column.key !== "actions")} pagination={false} scroll={{ x: 860 }} />
                            </AdminPanel>
                        ),
                    },
                ].filter(item => ["channels", "balances"].includes(item.key) ? permissions.includes("channels.read") : ["models", "families"].includes(item.key) ? permissions.includes("models.read") : permissions.includes("catalog.read"))}
            />

            <Modal title={channelModal.id ? "编辑渠道" : "新增渠道"} open={channelModal.open} onCancel={() => setChannelModal({ ...channelModal, open: false, apiKey:'', accessKeyId:'', accessKeySecret:'' })} onOk={() => void saveChannel()} okText="保存" width={480}>
                <div className="space-y-4 pt-1">
                    <AdminField label="渠道名称" required>
                        <Input {...ADMIN_AUTOFILL_OFF} name="sundas-channel-name" value={channelModal.name} onChange={(event) => setChannelModal({ ...channelModal, name: event.target.value })} placeholder="例如 OpenAI 主渠道" />
                    </AdminField>
                    <AdminField label="渠道协议"><Select className="w-full" value={channelModal.protocol || 'openai'} options={[{ value:'openai',label:'OpenAI 兼容' },{ value:'gemini',label:'Gemini' },{ value:'aliyun-viapi',label:'阿里云视觉智能 · 超分' }]}
                        onChange={protocol => setChannelModal({ ...channelModal, protocol, apiKey:'', accessKeyId:'', accessKeySecret:'', ...(protocol === 'aliyun-viapi' ? { baseUrl:'https://viapi.cn-shanghai.aliyuncs.com' } : {}) })} /></AdminField>
                    <AdminField label="Base URL" hint={channelModal.protocol === 'aliyun-viapi' ? '官方 SDK 按图片/视频选择上海服务端点。请分别开通图像生产和视频生产服务。' : '填中转站根地址；不要包含 /v1。'}>
                        <Input {...ADMIN_AUTOFILL_OFF} name="sundas-channel-base-url" value={channelModal.baseUrl} onChange={(event) => setChannelModal({ ...channelModal, baseUrl: event.target.value })} placeholder="https://example.invalid" />
                    </AdminField>
                    {channelModal.protocol !== 'aliyun-viapi' && <AdminField label="文本接口" hint="EVA / 多数中转站选 Chat Completions；官方 OpenAI Responses 选 Responses。">
                        <Select className="w-full" value={channelModal.textMode} onChange={(value) => setChannelModal({ ...channelModal, textMode: value })} options={[{ value: "responses", label: "Responses" }, { value: "chat", label: "Chat Completions" }]} />
                    </AdminField>}
                    {channelModal.protocol === 'aliyun-viapi' ? <>
                        <AdminField label="AccessKey ID" hint={channelModal.id ? 'ID 和 Secret 都留空则保留原凭据。' : '使用已授权 VIAPI 的 RAM 用户凭据，只保存到服务端渠道。'}><Input.Password {...ADMIN_AUTOFILL_OFF} autoComplete="new-password" value={channelModal.accessKeyId || ''} onChange={event => setChannelModal({ ...channelModal, accessKeyId:event.target.value })} /></AdminField>
                        <AdminField label="AccessKey Secret"><Input.Password {...ADMIN_AUTOFILL_OFF} autoComplete="new-password" value={channelModal.accessKeySecret || ''} onChange={event => setChannelModal({ ...channelModal, accessKeySecret:event.target.value })} /></AdminField>
                    </> : <AdminField label="API Key" hint={channelModal.id ? "留空则不修改现有 Key。" : "使用对应线路分组的 Key；不同分组建议建多个渠道。"}>
                        <Input.Password {...ADMIN_AUTOFILL_OFF} autoComplete="new-password" name="sundas-channel-api-key" value={channelModal.apiKey} onChange={(event) => setChannelModal({ ...channelModal, apiKey: event.target.value })} placeholder={channelModal.id ? "留空不修改" : "sk-..."} />
                    </AdminField>}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-3 py-2.5">
                        <span className="text-[11px] leading-5 text-[var(--admin-muted)]">{channelModal.protocol === 'aliyun-viapi' ? '超分渠道需配置对应模型与售价后，以授权素材验收。' : '保存前可先验证 Base URL 和 Key。'}</span>
                        <Button size="small" disabled={channelModal.protocol === 'aliyun-viapi'} loading={testingChannel} onClick={() => void testChannel()}>测试连接</Button>
                    </div>
                    {channelModels.length ? (
                        <div className="rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3">
                            <div className="mb-2 text-[11px] text-[var(--admin-muted)]">当前 Key 可见的模型（点击复制）</div>
                            <div className="max-h-32 space-y-1 overflow-y-auto">
                                {channelModels.map((item) => (
                                    <button key={item} type="button" onClick={() => void navigator.clipboard?.writeText(item)} className="block w-full truncate rounded px-1.5 py-1 text-left font-mono text-[11px] text-[var(--admin-ink)] transition hover:bg-[var(--admin-panel)]" title="复制模型 ID">
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            </Modal>

            <Modal title={familyModal.id ? "编辑模型族" : "新增模型族"} open={familyModal.open} onCancel={() => setFamilyModal({ ...familyModal, open: false })} onOk={() => void saveFamily()} okText="保存" width={500}>
                <div className="space-y-4 pt-1">
                    <AdminField label="模型族名称" required>
                        <Input {...ADMIN_AUTOFILL_OFF} name="sundas-family-name" value={familyModal.name} onChange={(event) => setFamilyModal({ ...familyModal, name: event.target.value })} placeholder="例如 Seedance" />
                    </AdminField>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <AdminField label="厂商">
                            <Input {...ADMIN_AUTOFILL_OFF} name="sundas-family-vendor" value={familyModal.vendor} onChange={(event) => setFamilyModal({ ...familyModal, vendor: event.target.value })} placeholder="例如 字节跳动" />
                        </AdminField>
                        <AdminField label="排序">
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-family-sort" className="w-full" value={familyModal.sort} onChange={(value) => setFamilyModal({ ...familyModal, sort: Number(value) || 0 })} />
                        </AdminField>
                    </div>
                    <AdminField label="图标 URL">
                        <Input {...ADMIN_AUTOFILL_OFF} name="sundas-family-icon" value={familyModal.icon} onChange={(event) => setFamilyModal({ ...familyModal, icon: event.target.value })} placeholder="可选" />
                    </AdminField>
                    <AdminField label="描述">
                        <Input.TextArea {...ADMIN_AUTOFILL_OFF} name="sundas-family-description" value={familyModal.description} onChange={(event) => setFamilyModal({ ...familyModal, description: event.target.value })} autoSize={{ minRows: 2, maxRows: 4 }} />
                    </AdminField>
                </div>
            </Modal>

            <ModelEditorModal
                open={modelOpen}
                model={editingModel}
                families={families}
                channels={channels}
                modelSuggestions={discoveredModels}
                onClose={() => setModelOpen(false)}
                onSaved={async () => {
                    setModelOpen(false);
                    await load();
                }}
            />

            <Modal title={planModal.id ? "编辑套餐" : "新增套餐"} open={planModal.open} onCancel={() => setPlanModal({ ...planModal, open: false })} onOk={() => void savePlan()} okText="保存" width={500}>
                <div className="space-y-4 pt-1">
                    <AdminField label="套餐名称" required>
                        <Input {...ADMIN_AUTOFILL_OFF} name="sundas-plan-name" value={planModal.name} onChange={(event) => setPlanModal({ ...planModal, name: event.target.value })} placeholder="例如 创作者会员" />
                    </AdminField>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <AdminField label="有效天数">
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-plan-days" className="w-full" min={1} value={planModal.days} onChange={(value) => setPlanModal({ ...planModal, days: Number(value) || 30 })} />
                        </AdminField>
                        <AdminField label="价格（元）">
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-plan-price" className="w-full" min={0.01} step={1} value={planModal.priceYuan} onChange={(value) => setPlanModal({ ...planModal, priceYuan: Number(value) || 0 })} />
                        </AdminField>
                    </div>
                    <AdminField label="月度积分" hint="购买后立即发放，30 天后过期。">
                        <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-plan-monthly-credits" className="w-full" min={0} value={planModal.monthlyCredits} onChange={(value) => setPlanModal({ ...planModal, monthlyCredits: Number(value) || 0 })} />
                    </AdminField>
                    <AdminField label="会员档位" hint="决定该套餐的消耗折扣与开通赠送积分；不绑档位则使用全局会员折扣。">
                        <Select
                            className="w-full"
                            value={planModal.tierId || null}
                            onChange={(value) => setPlanModal({ ...planModal, tierId: value ?? "" })}
                            options={[{ value: "", label: "不绑定档位" }, ...tiers.map((tier) => ({ value: tier.id, label: `${tier.level} · ${tier.name}` }))]}
                        />
                    </AdminField>
                    <div className="flex items-center justify-between rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-3 py-2.5">
                        <div className="text-xs font-medium text-[var(--admin-ink)]">启用套餐</div>
                        <Switch checked={planModal.enabled} onChange={(checked) => setPlanModal({ ...planModal, enabled: checked })} />
                    </div>
                </div>
            </Modal>

            <Modal title={`编辑档位 · ${tierModal.level} 档`} open={tierModal.open} onCancel={() => setTierModal({ ...tierModal, open: false })} onOk={() => void saveTier()} okText="保存" width={460}>
                <div className="space-y-4 pt-1">
                    <AdminField label="档位名称" required>
                        <Input {...ADMIN_AUTOFILL_OFF} name="sundas-tier-name" value={tierModal.name} onChange={(event) => setTierModal({ ...tierModal, name: event.target.value })} placeholder="例如 执笔者" />
                    </AdminField>
                    <AdminField label="会员权益描述" hint="显示在会员套餐卡片上；请填写真实提供的权益。">
                        <Input.TextArea {...ADMIN_AUTOFILL_OFF} name="sundas-tier-description" rows={3} value={tierModal.description} onChange={(event) => setTierModal({ ...tierModal, description: event.target.value })} placeholder="例如：适合日常创作，享受图片与视频生成积分优惠。" />
                    </AdminField>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <AdminField label="生成折扣（折）" hint="9.5 表示 9.5 折，10 表示标准计费；新购/续费订单采用此配置，已购会员保留购买时折扣。">
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-tier-discount" className="w-full" min={0.1} max={10} step={0.1} value={tierModal.discountZhe} onChange={(value) => setTierModal({ ...tierModal, discountZhe: Number(value) || 10 })} />
                        </AdminField>
                        <AdminField label="开通赠送积分">
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-tier-grant" className="w-full" min={0} value={tierModal.grantCredits} onChange={(value) => setTierModal({ ...tierModal, grantCredits: Number(value) || 0 })} />
                        </AdminField>
                    </div>
                    <div className="flex items-center justify-between rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-3 py-2.5">
                        <div className="text-xs font-medium text-[var(--admin-ink)]">启用档位</div>
                        <Switch checked={tierModal.enabled} onChange={(checked) => setTierModal({ ...tierModal, enabled: checked })} />
                    </div>
                </div>
            </Modal>

            <Modal title={packageModal.id ? "编辑充值套餐" : "新增充值套餐"} open={packageModal.open} onCancel={() => setPackageModal({ ...packageModal, open: false })} onOk={() => void savePackage()} okText="保存" width={500}>
                <div className="space-y-4 pt-1">
                    <AdminField label="套餐名称" required>
                        <Input {...ADMIN_AUTOFILL_OFF} name="sundas-package-name" value={packageModal.name} onChange={(event) => setPackageModal({ ...packageModal, name: event.target.value })} placeholder="例如 100 积分" />
                    </AdminField>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <AdminField label="到账积分">
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-package-credits" className="w-full" min={1} value={packageModal.credits} onChange={(value) => setPackageModal({ ...packageModal, credits: Number(value) || 1 })} />
                        </AdminField>
                        <AdminField label="实付价格（元）">
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-package-price" className="w-full" min={0.01} step={1} value={packageModal.priceYuan} onChange={(value) => setPackageModal({ ...packageModal, priceYuan: Number(value) || 0 })} />
                        </AdminField>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <AdminField label="原价（元）" hint="留空则不展示划线价。">
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-package-original-price" className="w-full" min={0} step={1} value={packageModal.originalPriceYuan} onChange={(value) => setPackageModal({ ...packageModal, originalPriceYuan: Number(value) || 0 })} />
                        </AdminField>
                        <AdminField label="排序">
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-package-sort" className="w-full" value={packageModal.sort} onChange={(value) => setPackageModal({ ...packageModal, sort: Number(value) || 0 })} />
                        </AdminField>
                    </div>
                    <AdminField label="描述">
                        <Input {...ADMIN_AUTOFILL_OFF} name="sundas-package-description" value={packageModal.description} onChange={(event) => setPackageModal({ ...packageModal, description: event.target.value })} placeholder="可选，展示在套餐卡片下方" />
                    </AdminField>
                    <div className="flex items-center justify-between rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-3 py-2.5">
                        <div className="text-xs font-medium text-[var(--admin-ink)]">启用套餐</div>
                        <Switch checked={packageModal.enabled} onChange={(checked) => setPackageModal({ ...packageModal, enabled: checked })} />
                    </div>
                </div>
            </Modal>
        </div>
    );
}

