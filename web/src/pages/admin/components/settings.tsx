import { useCallback, useEffect, useState } from "react";
import { App as AntApp, Button, Checkbox, Input, InputNumber, Select, Switch, Tabs } from "antd";
import { Calculator, CreditCard, Globe2, HardDrive, Home, Mail, ReceiptText, RefreshCw, Sparkles } from "lucide-react";

import { useAdminRequest } from "../use-admin-request";
import { useAdminPermissions } from "../permissions";
import { clearSiteInfoCache } from "@/services/api/site";
import { fetchPromptSources } from "@/services/api/prompts";
import { ADMIN_AUTOFILL_OFF, AdminBadge, AdminField, AdminLoading, AdminPanel } from "./ui";

type FieldType = "text" | "password" | "number" | "bool" | "list" | "textarea" | "payTypes" | "source" | "model";
type SettingField = { name: string; label: string; type?: FieldType; step?: number; hint?: string; placeholder?: string; span?: 2; modelCapability?: "text" };
type SectionKey = "site" | "home" | "smtp" | "epay" | "zpay" | "alipay" | "billing" | "payment" | "storage" | "promptOptimizer" | "creationChat";
type Section = { key: SectionKey; title: string; fields: SettingField[] };

const SECTIONS: Record<SectionKey, Section> = {
    site: {
        key: "site",
        title: "站点信息",
        fields: [
            { name: "name", label: "站点名称", placeholder: "sundas" },
            { name: "apiIntegrationUrl", label: "API 对接链接", span: 2, placeholder: "https://api.example.com", hint: "配置后导航栏显示「API 对接」，点击在新标签页打开。留空隐藏入口。" },
            { name: "description", label: "站点描述", type: "textarea", span: 2, placeholder: "一句话介绍这个站点", hint: "用于页面元信息与前台展示。" },
        ],
    },
    smtp: {
        key: "smtp",
        title: "邮件发送",
        fields: [
            { name: "host", label: "SMTP 主机", placeholder: "smtp.example.com" },
            { name: "port", label: "端口", type: "number", hint: "SSL 常见 465，STARTTLS 常见 587。" },
            { name: "user", label: "用户名" },
            { name: "pass", label: "密码 / 授权码", type: "password" },
            { name: "from", label: "发件人", span: 2, placeholder: "sundas <no-reply@example.com>" },
            { name: "secure", label: "SSL 加密", type: "bool", hint: "465 端口通常需要开启。" },
        ],
    },
    epay: {
        key: "epay",
        title: "易支付",
        fields: [
            { name: "gateway", label: "网关地址", placeholder: "https://pay.example.com" },
            { name: "pid", label: "商户 ID" },
            { name: "key", label: "商户密钥", type: "password" },
            { name: "enabled", label: "启用渠道", type: "bool" },
        ],
    },
    zpay: {
        key: "zpay",
        title: "ZPay",
        fields: [
            { name: "gateway", label: "网关地址", placeholder: "https://zpay.example.com" },
            { name: "pid", label: "商户 ID" },
            { name: "key", label: "商户密钥", type: "password" },
            { name: "enabled", label: "启用渠道", type: "bool" },
        ],
    },
    alipay: {
        key: "alipay",
        title: "支付宝官方 · 电脑 / 手机网站支付",
        fields: [
            { name: "appId", label: "应用 APPID", placeholder: "16 位数字", hint: "使用已开通对应支付产品的网页应用；手机 H5 需签约手机网站支付。" },
            { name: "sellerId", label: "收款账户 UID", placeholder: "16 位数字", hint: "填写该应用实际收款支付宝账户的 UID。" },
            { name: "privateKey", label: "应用私钥（RSA2）", type: "password", span: 2, hint: "使用公钥模式；填写应用私钥的完整 Base64 内容。保存后仅显示掩码。" },
            { name: "alipayPublicKey", label: "支付宝公钥", type: "textarea", span: 2, hint: "上传应用公钥后，从支付宝开放平台获取。请勿填写应用公钥或证书。" },
            { name: "sandbox", label: "沙箱环境", type: "bool", hint: "默认开启，需使用整套沙箱配置；正式收款需换成正式配置并关闭沙箱。" },
            { name: "pageEnabled", label: "电脑网站支付", type: "bool", hint: "仅在应用已开通电脑网站支付时开启。" },
            { name: "wapEnabled", label: "手机 H5 支付", type: "bool", hint: "仅在应用已开通手机网站支付时开启。手机浏览器自动使用 H5 收银台，电脑继续使用电脑网站支付。" },
            { name: "enabled", label: "启用渠道", type: "bool", hint: "默认关闭。完成签约和联调后启用，并在「支付方式与订单」勾选支付宝。" },
        ],
    },
    billing: {
        key: "billing",
        title: "计费规则",
        fields: [
            { name: "memberDiscount", label: "未绑定档位的会员生成折扣", type: "number", step: 0.01, hint: "0.9 表示 9 折，1 表示标准计费。已绑定档位的套餐请在「模型与套餐 → 会员档位」配置；已购会员沿用折扣快照。" },
            { name: "promoMultiplier", label: "活动倍率", type: "number", step: 0.01, hint: "1 表示原价，0.8 表示活动 8 折。" },
            { name: "registerCredits", label: "注册赠送积分", type: "number", hint: "新用户首次注册到账，永久有效。" },
            { name: "creditPriceCents", label: "每积分价格（分）", type: "number", hint: "10 表示 0.1 元/积分。" },
            { name: "minCredits", label: "最少充值积分", type: "number", hint: "单笔充值的最低积分数。" },
            { name: "textRequestCredits", label: "文本请求基础积分", type: "number", hint: "每次文本请求的基础扣费。" },
        ],
    },
    creationChat: {
        key: "creationChat",
        title: "创作对话看图模型",
        fields: [
            { name: "modelId", label: "专用看图模型", type: "model", modelCapability: "text", span: 2, placeholder: "选择支持图片输入的文本模型", hint: "请确认该模型及线路支持图片输入。创作对话带图时固定使用此模型，按该模型现有积分价格计费。" },
            { name: "enabled", label: "启用对话看图", type: "bool", hint: "关闭后普通文字对话仍可使用；带图对话会提示配置，不能冒充已经看图。" },
        ],
    },
    promptOptimizer: {
        key: "promptOptimizer",
        title: "提示词优化",
        fields: [
            { name: "modelId", label: "优化用文本模型", type: "model", modelCapability: "text", span: 2, placeholder: "选择 OpenAI 文本模型", hint: "每次优化按该模型的现有积分价格正常冻结和结算；失败或取消自动退款。支持已启用的 OpenAI Chat 或 Responses 文本模型。" },
            { name: "enabled", label: "启用提示词优化", type: "bool", hint: "关闭后前台按钮仍可见，但请求会提示暂未配置。" },
        ],
    },
    payment: {
        key: "payment",
        title: "订单参数",
        fields: [
            { name: "orderTtlMinutes", label: "订单关单分钟", type: "number", hint: "超时未支付自动关闭。" },
            { name: "payTypes", label: "开启的支付方式", type: "payTypes", span: 2, hint: "可仅开启微信、仅开启支付宝或同时开启；全部取消则暂停新订单。需同时在「支付渠道」启用并配置支付网关。" },
        ],
    },
    home: {
        key: "home",
        title: "首页文案",
        fields: [
            { name: "heroKicker", label: "首屏小标签", placeholder: "AI 视频创作工作台", hint: "轮播图上方那一行带圆点的小字。留空则用内置文案。" },
            { name: "heroTitleLead", label: "大标题（前半）", placeholder: "从一个" },
            { name: "heroTitleAccent", label: "大标题（高亮）", placeholder: "画面" },
            { name: "heroTitleTail", label: "大标题（后半）", placeholder: "开始。" },
            { name: "heroDescription", label: "首屏描述", type: "textarea", span: 2, placeholder: "输入镜头、角色或故事，图片与视频共用同一个入口，进入对应的工作台。" },
            { name: "heroVideoCta", label: "主按钮文案", placeholder: "生成视频" },
            { name: "heroCanvasCta", label: "次按钮文案", placeholder: "进入画布" },
            { name: "composerVideoMode", label: "创作入口：视频", placeholder: "视频" },
            { name: "composerImageMode", label: "创作入口：图片", placeholder: "图片" },
            { name: "composerPlaceholder", label: "输入框占位文案", placeholder: "描述你想生成的画面、镜头运动或故事……" },
            { name: "composerStartCta", label: "开始创作按钮", placeholder: "开始创作" },
            { name: "composerLoginCta", label: "未登录按钮文案", placeholder: "登录后开始创作" },
            { name: "composerHint", label: "底部快捷键提示", span: 2, placeholder: "⌘ / Ctrl + Enter 开始创作" },
            { name: "canvasesEnabled", label: "显示「最近画布」区块", type: "bool" },
            { name: "canvasesTitle", label: "画布区块标题", placeholder: "最近画布" },
            { name: "canvasesNote", label: "画布区块描述", placeholder: "继续上一次的画面", span: 2 },
            { name: "canvasesViewAll", label: "画布区块链接文案", placeholder: "查看全部" },
            { name: "canvasesNew", label: "新建画布卡片文案", placeholder: "新建画布" },
            { name: "canvasesOpen", label: "新建画布副文案", placeholder: "打开画布" },
            { name: "inspirationEnabled", label: "显示「灵感大厅」区块", type: "bool" },
            { name: "inspirationTitle", label: "灵感大厅标题", placeholder: "灵感大厅" },
            { name: "inspirationDescription", label: "灵感大厅描述", type: "textarea", span: 2, placeholder: "从提示词库挑一个方向，继续你的创作。" },
            { name: "inspirationViewAll", label: "提示词库链接文案", placeholder: "查看提示词库" },
            { name: "inspirationVideoTab", label: "灵感大厅：视频标签", placeholder: "视频" },
            { name: "inspirationImageTab", label: "灵感大厅：图片标签", placeholder: "图片" },
            { name: "inspirationEmpty", label: "空列表文案", placeholder: "暂无提示词" },
            { name: "inspirationSourceId", label: "灵感大厅数据来源", type: "source", placeholder: "全部来源（不限）", hint: "选定后，视频页签与图片页签只展示该来源的提示词；不选则展示全部来源。来源列表来自提示词库。" },
            { name: "inspirationVideoLimit", label: "视频页签条数", type: "number", hint: "0 表示沿用下方「灵感大厅展示条数」（默认 12 条，桌面端 4 列正好 3 行）。" },
            { name: "inspirationImageLimit", label: "图片页签条数", type: "number", hint: "0 表示沿用下方「灵感大厅展示条数」（默认 12 条）。" },
            { name: "promptLimit", label: "灵感大厅展示条数", type: "number", hint: "0 表示不限（实际展示 12 条）。仅控制首页展示数量，不影响提示词库本身。" },
        ],
    },
    storage: {
        key: "storage",
        title: "存储空间",
        fields: [
            { name: "quotaGb", label: "单用户存储上限（GB）", type: "number", hint: "所有上传素材和生成媒体的总容量上限；修改后立即影响新上传。" },
        ],
    },
};

type SettingsTab = { key: string; label: string; description: string; icon: typeof Globe2; sections: SectionKey[] };

const TABS: SettingsTab[] = [
    { key: "site", label: "站点", description: "站点名称和描述会出现在页面元信息与前台展示中。", icon: Globe2, sections: ["site"] },
    { key: "home", label: "首页文案", description: "覆盖首页各区块的标题、描述与按钮文案；留空表示沿用内置默认文案（跟随界面语言）。保存后刷新前台页面生效。", icon: Home, sections: ["home"] },
    { key: "smtp", label: "邮件", description: "注册验证码、找回密码等邮件依赖这里的 SMTP 配置。", icon: Mail, sections: ["smtp"] },
    { key: "payments", label: "支付渠道", description: "至少启用一个渠道；密钥只写入不回显，保存后下一次支付请求生效。", icon: CreditCard, sections: ["alipay", "epay", "zpay"] },
    { key: "billing", label: "计费", description: "会员折扣、活动倍率和积分价格会直接影响下单与生成扣费。", icon: Calculator, sections: ["billing"] },
    { key: "orders", label: "支付方式与订单", description: "控制支付订单的有效期与收银台展示的支付方式。", icon: ReceiptText, sections: ["payment"] },
    { key: "storage", label: "存储", description: "配置每个用户的媒体存储空间上限，用户头像菜单会显示已用容量。", icon: HardDrive, sections: ["storage"] },
    { key: "creationChat", label: "对话看图", description: "配置创作聊天专用的视觉模型和启用状态。", icon: Sparkles, sections: ["creationChat"] },
    { key: "promptOptimizer", label: "提示词优化", description: "选择前台提示词优化使用的文本模型（Chat / Responses）；按该模型现有价格正常扣积分。", icon: Sparkles, sections: ["promptOptimizer"] },
];

type SettingsState = Record<string, Record<string, unknown>>;

export function SettingsTab() {
    const apiRequest = useAdminRequest();
    const { message } = AntApp.useApp();
    const [settings, setSettings] = useState<SettingsState>({});
    const [saved, setSaved] = useState<SettingsState>({});
    const [activeTab, setActiveTab] = useState("site");
    const [saving, setSaving] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await apiRequest<{ settings: SettingsState }>("/api/admin/settings");
            setSettings(data.settings);
            setSaved(data.settings);
        } catch (reason) {
            const text = reason instanceof Error ? reason.message : String(reason);
            setError(text);
            message.error(text);
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => {
        void load();
    }, [load]);

    function update(section: SectionKey, field: string, value: unknown) {
        setSettings((previous) => ({ ...previous, [section]: { ...(previous[section] ?? {}), [field]: value } }));
    }

    function isDirty(tab: SettingsTab) {
        return tab.sections.some((section) => JSON.stringify(settings[section] ?? {}) !== JSON.stringify(saved[section] ?? {}));
    }

    async function save(tab: SettingsTab) {
        setSaving(tab.key);
        try {
            for (const section of tab.sections) {
                await apiRequest(`/api/admin/settings/${section}`, { method: "PUT", json: { value: settings[section] ?? {} } });
            }
            setSaved((previous) => {
                const next = { ...previous };
                for (const section of tab.sections) next[section] = settings[section] ?? {};
                return next;
            });
            if (tab.sections.includes("site")) clearSiteInfoCache();
            message.success("设置已保存，下一次请求生效");
        } catch (reason) {
            message.error(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving("");
        }
    }

    if (loading) return <AdminLoading label="正在读取系统设置" />;
    if (error && !Object.keys(settings).length) {
        return (
            <AdminPanel title="设置暂时不可用" description={error} actions={<Button icon={<RefreshCw className="size-4" />} onClick={() => void load()}>重试</Button>}>
                <p className="text-sm text-[var(--admin-muted)]">检查 API 服务或管理员权限后重试。</p>
            </AdminPanel>
        );
    }

    return (
        <div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-[var(--admin-muted)]">修改保存后立即写入数据库，支付与邮件参数会在下一次请求使用。</p>
                <AdminBadge tone="neutral" dot={false}>按页签分别保存</AdminBadge>
            </div>
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={TABS.map((tab) => ({
                    key: tab.key,
                    label: (
                        <span className="inline-flex items-center gap-2">
                            <span className="hidden sm:inline-flex">
                                <tab.icon className="size-3.5" />
                            </span>
                            {tab.label}
                            {isDirty(tab) ? <span className="size-1.5 rounded-full bg-[var(--admin-warning)]" /> : null}
                        </span>
                    ),
                    children: (
                        <SettingsPane
                            tab={tab}
                            settings={settings}
                            update={update}
                            dirty={isDirty(tab)}
                            saving={saving === tab.key}
                            disabled={Boolean(saving)}
                            onSave={() => void save(tab)}
                        />
                    ),
                }))}
            />
        </div>
    );
}

function SettingsPane({
    tab,
    settings,
    update,
    dirty,
    saving,
    disabled,
    onSave,
}: {
    tab: SettingsTab;
    settings: SettingsState;
    update: (section: SectionKey, field: string, value: unknown) => void;
    dirty: boolean;
    saving: boolean;
    disabled: boolean;
    onSave: () => void;
}) {
    const canManage = useAdminPermissions().includes("settings.manage");
    return (
        <AdminPanel
            title={tab.label}
            description={tab.description}
            actions={dirty ? <AdminBadge tone="warning" dot={false}>有未保存修改</AdminBadge> : <AdminBadge tone="positive" dot={false}>已同步</AdminBadge>}
        >
            <form autoComplete="off" onSubmit={(event) => event.preventDefault()}>
                <fieldset disabled={!canManage}>
                {tab.key === "payments" ? (
                    <div className="grid gap-4 xl:grid-cols-2">
                        {tab.sections.map((section) => (
                            <PaymentSection key={section} section={SECTIONS[section]} settings={settings} update={update} />
                        ))}
                    </div>
                ) : (
                    <SectionFields section={SECTIONS[tab.sections[0]]} settings={settings} update={update} />
                )}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--admin-line)] pt-4">
                    <span className="text-[11px] text-[var(--admin-muted)]">保存后立即生效；密钥类字段不会回显明文。</span>
                    {canManage && <Button type="primary" loading={saving} disabled={!dirty || disabled} onClick={onSave}>
                        保存更改
                    </Button>}
                </div>
                </fieldset>
            </form>
        </AdminPanel>
    );
}

function PaymentSection({
    section,
    settings,
    update,
}: {
    section: Section;
    settings: SettingsState;
    update: (section: SectionKey, field: string, value: unknown) => void;
}) {
    const enabled = Boolean(settings[section.key]?.enabled);
    return (
        <section className="rounded-[12px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[var(--admin-ink)]">{section.title}</h3>
                <AdminBadge tone={enabled ? "positive" : "neutral"}>{enabled ? "已启用" : "未启用"}</AdminBadge>
            </div>
            <div className="grid gap-4">
                {section.fields.filter((field) => field.type !== "bool").map((field) => (
                    <SettingControl key={field.name} section={section} field={field} settings={settings} update={update} />
                ))}
            </div>
            <div className="mt-4 border-t border-[var(--admin-line)] pt-4">
                {section.fields.filter((field) => field.type === "bool").map((field) => (
                    <SettingControl key={field.name} section={section} field={field} settings={settings} update={update} />
                ))}
            </div>
        </section>
    );
}

function SectionFields({ section, settings, update }: { section: Section; settings: SettingsState; update: (section: SectionKey, field: string, value: unknown) => void }) {
    return (
        <div className="grid gap-x-5 gap-y-5 md:grid-cols-2">
            {section.fields.map((field) => (
                <SettingControl key={field.name} section={section} field={field} settings={settings} update={update} className={field.span === 2 ? "md:col-span-2" : undefined} />
            ))}
        </div>
    );
}

function SettingControl({
    section,
    field,
    settings,
    update,
    className,
}: {
    section: Section;
    field: SettingField;
    settings: SettingsState;
    update: (section: SectionKey, field: string, value: unknown) => void;
    className?: string;
}) {
    const value = settings[section.key]?.[field.name];
    const name = `sundas-${section.key}-${field.name}`;
    const apiRequest = useAdminRequest();
    const [promptSources, setPromptSources] = useState<{ id: string; name: string }[]>([]);
    const [models, setModels] = useState<{ id: string; displayName: string; capability: string; enabled: boolean; routes: { unit: string; protocol: string; textMode: string; enabled: boolean }[] }[]>([]);

    useEffect(() => {
        if (field.type !== "source") return;
        let alive = true;
        fetchPromptSources().then((list) => { if (alive) setPromptSources(list); }).catch(() => { if (alive) setPromptSources([]); });
        return () => { alive = false; };
    }, [field.type]);

    useEffect(() => {
        if (field.type !== "model") return;
        let alive = true;
        apiRequest<{ models: { id: string; displayName: string; capability: string; enabled: boolean; routes: { unit: string; protocol: string; textMode: string; enabled: boolean }[] }[] }>("/api/admin/models")
            .then((data) => { if (alive) setModels(data.models); })
            .catch(() => { if (alive) setModels([]); });
        return () => { alive = false; };
    }, [apiRequest, field.type]);

    if (field.type === "source") {
        return (
            <AdminField label={field.label} hint={field.hint} className={className}>
                <Select
                    className="w-full"
                    allowClear
                    value={String(value ?? "") || undefined}
                    placeholder={field.placeholder}
                    options={promptSources.map((source) => ({ label: `${source.name}（${source.id}）`, value: source.id }))}
                    onChange={(next) => update(section.key, field.name, next ?? "")}
                />
            </AdminField>
        );
    }

    if (field.type === "model") {
        const options = models.filter((model) => model.enabled && model.capability === field.modelCapability
            && model.routes.some((route) => route.enabled && route.unit === "request" && route.protocol === "openai"))
            .map((model) => ({ value: model.id, label: model.displayName }));
        return (
            <AdminField label={field.label} hint={field.hint} className={className}>
                <Select
                    className="w-full"
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    value={String(value ?? "") || undefined}
                    placeholder={field.placeholder}
                    options={options}
                    notFoundContent="暂无已启用的 OpenAI 文本模型"
                    onChange={(next) => update(section.key, field.name, next ?? "")}
                />
            </AdminField>
        );
    }

    if (field.type === "bool") {
        return (
            <AdminField label={field.label} hint={field.hint} className={className}>
                <div className="flex h-[38px] items-center justify-between rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel)] px-3">
                    <span className="text-xs text-[var(--admin-muted)]">{value ? "已启用" : "未启用"}</span>
                    <Switch checked={Boolean(value)} onChange={(checked) => update(section.key, field.name, checked)} />
                </div>
            </AdminField>
        );
    }

    if (field.type === "payTypes") {
        return (
            <AdminField label={field.label} hint={field.hint} className={className}>
                <Checkbox.Group name={name} value={Array.isArray(value) ? value : []}
                    options={[{ label: "微信支付", value: "wxpay" }, { label: "支付宝", value: "alipay" }]}
                    onChange={(next) => update(section.key, field.name, next)} />
            </AdminField>
        );
    }

    if (field.type === "textarea") {
        return (
            <AdminField label={field.label} hint={field.hint} className={className}>
                <Input.TextArea {...ADMIN_AUTOFILL_OFF} name={name} rows={3} value={String(value ?? "")} placeholder={field.placeholder} onChange={(event) => update(section.key, field.name, event.target.value)} />
            </AdminField>
        );
    }

    if (field.type === "number") {
        return (
            <AdminField label={field.label} hint={field.hint} className={className}>
                <InputNumber {...ADMIN_AUTOFILL_OFF} name={name} className="w-full" value={Number(value ?? 0)} step={field.step} onChange={(next) => update(section.key, field.name, Number(next) || 0)} />
            </AdminField>
        );
    }

    if (field.type === "list") {
        return (
            <AdminField label={field.label} hint={field.hint} className={className}>
                <Input
                    {...ADMIN_AUTOFILL_OFF}
                    name={name}
                    value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
                    placeholder={field.placeholder}
                    onChange={(event) => update(section.key, field.name, event.target.value.split(",").map((item) => item.trim()).filter(Boolean))}
                />
            </AdminField>
        );
    }

    return (
        <AdminField label={field.label} hint={field.hint} className={className}>
            {field.type === "password" ? (
                <Input.Password {...ADMIN_AUTOFILL_OFF} autoComplete="new-password" name={name} value={String(value ?? "")} placeholder={field.placeholder} onChange={(event) => update(section.key, field.name, event.target.value)} />
            ) : (
                <Input {...ADMIN_AUTOFILL_OFF} name={name} value={String(value ?? "")} placeholder={field.placeholder} onChange={(event) => update(section.key, field.name, event.target.value)} />
            )}
        </AdminField>
    );
}
