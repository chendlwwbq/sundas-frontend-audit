import { useEffect, useState } from "react";
import { App as AntApp, AutoComplete, Button, Input, InputNumber, Modal, Select, Switch } from "antd";
import { Plus, Trash2 } from "lucide-react";

import { useAdminRequest } from "../use-admin-request";
import { ADMIN_AUTOFILL_OFF, AdminBadge, AdminField } from "./ui";

export type AdminFamily = {
    id: string;
    name: string;
    vendor: string;
    description: string;
    icon: string;
    sort: number;
    modelCount?: number;
};

export type AdminModelRoute = {
    id?: string;
    channelId: string;
    channelName?: string;
    unit: string;
    baseCredits: number | string;
    resolutionMultipliers: Record<string, number>;
    priority: number;
    weight: number;
    enabled: boolean;
    healthStatus?: string;
};

export type AdminModel = {
    id: string;
    familyId: string | null;
    familyName: string | null;
    upstreamName: string;
    displayName: string;
    description: string;
    capability: string;
    metadata: Record<string, unknown>;
    enabled: boolean;
    sort: number;
    routes: AdminModelRoute[];
};

type ChannelOption = { id: string; name: string; enabled: boolean; healthStatus?: string };
type ResolutionRow = { value: string; multiplier: number };
type RouteDraft = {
    channelId: string;
    unit: string;
    baseCredits: number;
    priority: number;
    weight: number;
    enabled: boolean;
    resolutions: ResolutionRow[];
};
type MetadataDraft = {
    visionInput: boolean;
    upscaleAdapter: string;
    imageProtocol: string;
    tags: string;
    refImages: number;
    refVideos: number;
    refAudios: number;
    durationMin: number;
    durationMax: number;
    aspectRatios: string;
    docsUrl: string;
    promptSkill: string;
};

type PromptSkillOption = { key: string; label: string; capability: "image" | "video"; description: string };

const CAPABILITIES = [
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
    { value: "text", label: "文本" },
    { value: "audio", label: "音频" },
];
const IMAGE_PROTOCOLS = [
    { value: "", label: "OpenAI Images（默认）" },
    { value: "gemini", label: "Gemini 原生" },
    { value: "gpt88", label: "GPT88" },
    { value: "catcode", label: "Catcode" },
    { value: "cangyuan", label: "Cangyuan" },
];
const UNITS = [
    { value: "image", label: "按张" },
    { value: "second", label: "按秒" },
    { value: "request", label: "按次" },
    { value: "1k_chars", label: "按千字符" },
];
const UNITS_BY_CAPABILITY: Record<string, string[]> = {
    image: ["image", "request"],
    video: ["second", "request"],
    text: ["request"],
    audio: ["1k_chars", "request"],
};
const defaultResolutions: ResolutionRow[] = [
    { value: "720", multiplier: 1 },
    { value: "1080", multiplier: 2 },
];

function unitsFor(capability: string) {
    return UNITS.filter((unit) => (UNITS_BY_CAPABILITY[capability] ?? []).includes(unit.value));
}

function nextUnit(capability: string, current: string) {
    const allowed = UNITS_BY_CAPABILITY[capability] ?? [];
    return allowed.includes(current) ? current : allowed[0] ?? "request";
}

function normalizeResolutionKey(value: string) {
    return String(value || "").trim().toLowerCase().replace(/p$/i, "");
}

function resolutionRowsFromMap(multipliers: Record<string, number> | undefined): ResolutionRow[] {
    const rows = Object.entries(multipliers ?? {}).map(([value, multiplier]) => ({ value: normalizeResolutionKey(value), multiplier: Number(multiplier) > 0 ? Number(multiplier) : 1 }));
    const unique = rows.filter((row, index) => row.value && rows.findIndex((item) => item.value === row.value) === index);
    return unique.length ? unique : defaultResolutions.map((row) => ({ ...row }));
}

function resolutionsToMap(rows: ResolutionRow[]) {
    const multipliers: Record<string, number> = {};
    for (const row of rows) {
        const value = normalizeResolutionKey(row.value);
        if (!value || multipliers[value] !== undefined) continue;
        multipliers[value] = Number(row.multiplier) > 0 ? Number(row.multiplier) : 1;
    }
    return multipliers;
}

function metadataDraftOf(metadata: Record<string, unknown> | undefined): MetadataDraft {
    const reference = (metadata?.referenceLimits ?? {}) as Record<string, unknown>;
    const durations = (metadata?.durations ?? {}) as Record<string, unknown>;
    return {
        upscaleAdapter: String((metadata?.upscale as { adapter?: string } | undefined)?.adapter ?? ''),
        imageProtocol: String(metadata?.imageProtocol ?? ""),
        tags: Array.isArray(metadata?.tags) ? metadata.tags.join(", ") : "",
        refImages: Number(reference.images) || 0,
        refVideos: Number(reference.videos) || 0,
        refAudios: Number(reference.audios) || 0,
        durationMin: Number(durations.min) || 0,
        durationMax: Number(durations.max) || 0,
        aspectRatios: Array.isArray(metadata?.aspectRatios) ? metadata.aspectRatios.join(", ") : "",
        docsUrl: String(metadata?.docsUrl ?? ""),
        promptSkill: String(metadata?.promptSkill ?? ""),
        visionInput: metadata?.visionInput === true,
    };
}

function metadataFromDraft(draft: MetadataDraft): Record<string, unknown> {
    const referenceLimits = {
        ...(draft.refImages > 0 ? { images: draft.refImages } : {}),
        ...(draft.refVideos > 0 ? { videos: draft.refVideos } : {}),
        ...(draft.refAudios > 0 ? { audios: draft.refAudios } : {}),
    };
    const durations = {
        ...(draft.durationMin > 0 ? { min: draft.durationMin } : {}),
        ...(draft.durationMax > 0 ? { max: draft.durationMax } : {}),
    };
    const aspectRatios = draft.aspectRatios.split(",").map((item) => item.trim()).filter(Boolean);
    return {
        ...(draft.upscaleAdapter ? { upscale: { enabled: true, adapter: draft.upscaleAdapter } } : {}),
        visionInput: draft.visionInput,
        ...(draft.tags.trim() ? { tags: draft.tags.split(",").map((item) => item.trim()).filter(Boolean) } : {}),
        ...(Object.keys(referenceLimits).length ? { referenceLimits } : {}),
        ...(Object.keys(durations).length ? { durations } : {}),
        ...(aspectRatios.length ? { aspectRatios } : {}),
        ...(draft.docsUrl.trim() ? { docsUrl: draft.docsUrl.trim() } : {}),
        ...(draft.promptSkill ? { promptSkill: draft.promptSkill } : {}),
    };
}

function routeDraftsOf(model: AdminModel | null, channels: ChannelOption[]): RouteDraft[] {
    if (model?.routes?.length) {
        return model.routes.map((route) => ({
            channelId: route.channelId,
            unit: nextUnit(model.capability, route.unit),
            baseCredits: Number(route.baseCredits) || 1,
            priority: Number(route.priority) || 0,
            weight: Number(route.weight) || 100,
            enabled: route.enabled !== false,
            resolutions: resolutionRowsFromMap(route.resolutionMultipliers),
        }));
    }
    return [
        {
            channelId: channels[0]?.id ?? "",
            unit: model?.capability === "video" ? "second" : "request",
            baseCredits: 1,
            priority: 0,
            weight: 100,
            enabled: true,
            resolutions: defaultResolutions.map((row) => ({ ...row })),
        },
    ];
}

export function ModelEditorModal({
    open,
    model,
    families,
    channels,
    modelSuggestions,
    onClose,
    onSaved,
}: {
    open: boolean;
    model: AdminModel | null;
    families: AdminFamily[];
    channels: ChannelOption[];
    modelSuggestions: string[];
    onClose: () => void;
    onSaved: () => Promise<void> | void;
}) {
    const apiRequest = useAdminRequest();
    const { message } = AntApp.useApp();
    const [familyId, setFamilyId] = useState("");
    const [upstreamName, setUpstreamName] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [description, setDescription] = useState("");
    const [capability, setCapability] = useState("image");
    const [metadata, setMetadata] = useState<MetadataDraft>(metadataDraftOf({}));
    const [routes, setRoutes] = useState<RouteDraft[]>([]);
    const [enabled, setEnabled] = useState(true);
    const [saving, setSaving] = useState(false);
    const [promptSkills, setPromptSkills] = useState<PromptSkillOption[]>([]);
    const imageResolutionPricing = capability === 'image' && Boolean(model?.metadata?.cangyuanImage);

    useEffect(() => {
        if (!open) return;
        setFamilyId(model?.familyId ?? families[0]?.id ?? "");
        setUpstreamName(model?.upstreamName ?? "");
        setDisplayName(model?.displayName ?? "");
        setDescription(model?.description ?? "");
        setCapability(model?.capability ?? "image");
        setMetadata(metadataDraftOf(model?.metadata));
        setRoutes(routeDraftsOf(model, channels));
        setEnabled(model?.enabled !== false);
    }, [open, model]);

    useEffect(() => {
        if (!open) return;
        let alive = true;
        apiRequest<{ skills: PromptSkillOption[] }>("/api/admin/prompt-skills")
            .then((data) => { if (alive) setPromptSkills(data.skills); })
            .catch(() => { if (alive) setPromptSkills([]); });
        return () => { alive = false; };
    }, [open, apiRequest]);

    function updateRoute(index: number, patch: Partial<RouteDraft>) {
        setRoutes((current) => current.map((route, routeIndex) => (routeIndex === index ? { ...route, ...patch } : route)));
    }

    function changeCapability(value: string) {
        setCapability(value);
        setMetadata((current) => ({
            ...current,
            upscaleAdapter: '',
            promptSkill: promptSkills.some((skill) => skill.key === current.promptSkill && skill.capability === value) ? current.promptSkill : "",
        }));
        setRoutes((current) => current.map((route) => ({ ...route, unit: nextUnit(value, route.unit) })));
    }

    async function save() {
        if (metadata.upscaleAdapter && routes.some(route => !(route.baseCredits > 0))) { message.error('请填写超分模型的实际售价'); return; }
        if (!upstreamName.trim()) {
            message.error("请填写上游模型名");
            return;
        }
        if (!routes.length || routes.some((route) => !route.channelId)) {
            message.error("请至少配置一条完整线路");
            return;
        }
        setSaving(true);
        try {
            const { tags: _tags, referenceLimits: _referenceLimits, durations: _durations, aspectRatios: _aspectRatios, docsUrl: _docsUrl, promptSkill: _promptSkill, ...protocolMetadata } = model?.metadata ?? {};
            const editedMetadata = metadataFromDraft(metadata);
            if (protocolMetadata.videoProtocol === "tongxin") {
                editedMetadata.referenceLimits = { ...(editedMetadata.referenceLimits as Record<string, number> | undefined), videos: 0, audios: 0 };
            }
            const nextMetadata = { ...protocolMetadata, ...editedMetadata };
            if (!metadata.upscaleAdapter) delete nextMetadata.upscale;
            if (capability === "image" && metadata.imageProtocol) nextMetadata.imageProtocol = metadata.imageProtocol;
            else delete nextMetadata.imageProtocol;
            if (capability === "image" || capability === "video") {
                if (metadata.promptSkill) nextMetadata.promptSkill = metadata.promptSkill;
                else delete nextMetadata.promptSkill;
            } else {
                delete nextMetadata.promptSkill;
            }
            const payload = {
                familyId: familyId || null,
                upstreamName: upstreamName.trim(),
                displayName: displayName.trim() || upstreamName.trim(),
                description,
                capability,
                metadata: nextMetadata,
                enabled,
                routes: routes.map((route) => ({
                    channelId: route.channelId,
                    unit: route.unit,
                    baseCredits: route.baseCredits,
                    resolutionMultipliers: capability === "video" || imageResolutionPricing ? resolutionsToMap(route.resolutions) : {},
                    priority: route.priority,
                    weight: route.weight,
                    enabled: route.enabled,
                })),
            };
            await apiRequest(model?.id ? `/api/admin/models/${model.id}` : "/api/admin/models", {
                method: model?.id ? "PATCH" : "POST",
                json: payload,
            });
            message.success("模型已保存");
            await onSaved();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal title={model ? "编辑模型" : "新增模型"} open={open} onCancel={onClose} onOk={() => void save()} okText="保存" confirmLoading={saving} width={760}>
            <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1 pt-1">
                <div className="grid gap-4 sm:grid-cols-2">
                    <AdminField label="模型族" hint="用于前台按 Seedance、Grok 等系列分组。">
                        <Select className="w-full" value={familyId || undefined} placeholder="未分组" onChange={setFamilyId} options={families.map((family) => ({ value: family.id, label: family.name }))} allowClear />
                    </AdminField>
                    <AdminField label="能力">
                        <Select className="w-full" value={capability} onChange={changeCapability} options={CAPABILITIES} />
                    </AdminField>
                    <AdminField label="上游模型名" required>
                        <AutoComplete className="w-full" value={upstreamName} onChange={setUpstreamName} options={modelSuggestions.map(value => ({ value }))} filterOption={(input, option) => String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())} placeholder="选择已获取的模型，或手动输入名称" />
                    </AdminField>
                    <AdminField label="展示名">
                        <Input {...ADMIN_AUTOFILL_OFF} name="sundas-model-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="用户看到的名字" />
                    </AdminField>
                </div>

                <AdminField label="模型描述" hint="显示在模型选择器详情里，可写适用场景、限制等。">
                    <Input.TextArea {...ADMIN_AUTOFILL_OFF} name="sundas-model-description" value={description} onChange={(event) => setDescription(event.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} placeholder="例如：1080p 快速生成，适合口播和商品展示。" />
                </AdminField>

                {capability === 'text' && <AdminField label="图像理解能力" hint="仅在已验证上游支持图片输入时启用，供创作助手检查真实参考帧。"><label><input type="checkbox" checked={metadata.visionInput} onChange={event => setMetadata({ ...metadata, visionInput: event.target.checked })} /> 支持图像理解</label></AdminField>}
                {(capability === 'image' || capability === 'video') && <AdminField label="模型用途" hint="超分使用阿里云 VIAPI 渠道；配置售价并完成实际验收后启用，不会出现在普通生成列表。">
                    <Select className="w-full" value={metadata.upscaleAdapter} options={[{ value: '', label: '普通生成 / 编辑' },
                        { value: capability === 'image' ? 'aliyun-image-super-resolution' : 'aliyun-video-super-resolution', label: capability === 'image' ? '阿里云图片超分（1–4 倍）' : '阿里云视频超分（2 倍）' }]}
                        onChange={value => { setMetadata({ ...metadata, upscaleAdapter: value }); if (value) { setUpstreamName(capability === 'image' ? 'MakeSuperResolutionImage' : 'SuperResolveVideo'); setEnabled(false); setRoutes(items => items.map(item => ({ ...item, baseCredits: 0, resolutions: [] }))); } }} />
                </AdminField>}

                {capability === "image" || capability === "video" ? (
                    <AdminField label="提示词优化 Skill" hint="默认自动识别；也可按模型系列手动指定。">
                        <Select
                            className="w-full"
                            allowClear
                            value={metadata.promptSkill || undefined}
                            placeholder="自动识别"
                            options={promptSkills.filter((skill) => skill.capability === capability).map((skill) => ({ value: skill.key, label: skill.label }))}
                            onChange={(value) => setMetadata({ ...metadata, promptSkill: value ?? "" })}
                        />
                    </AdminField>
                ) : null}

                <div className="rounded-[9px] border border-[var(--admin-line)] p-3">
                    <div className="mb-3 text-xs font-medium text-[var(--admin-ink)]">能力与限制</div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <AdminField label="参考图上限">
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-model-ref-images" className="w-full" min={0} value={metadata.refImages} onChange={(value) => setMetadata({ ...metadata, refImages: Number(value) || 0 })} />
                        </AdminField>
                        {capability === "image" ? <AdminField label="图片协议" hint="Gemini 图片模型请选择 Gemini 原生。">
                            <Select className="w-full" value={metadata.imageProtocol} onChange={(value) => setMetadata({ ...metadata, imageProtocol: value })} options={IMAGE_PROTOCOLS} />
                        </AdminField> : null}
                        <AdminField label="参考视频上限">
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-model-ref-videos" className="w-full" min={0} value={metadata.refVideos} onChange={(value) => setMetadata({ ...metadata, refVideos: Number(value) || 0 })} />
                        </AdminField>
                        <AdminField label="参考音频上限">
                            <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-model-ref-audios" className="w-full" min={0} value={metadata.refAudios} onChange={(value) => setMetadata({ ...metadata, refAudios: Number(value) || 0 })} />
                        </AdminField>
                        {capability === "video" ? (
                            <>
                                <AdminField label="最短时长（秒）">
                                    <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-model-duration-min" className="w-full" min={0} value={metadata.durationMin} onChange={(value) => setMetadata({ ...metadata, durationMin: Number(value) || 0 })} />
                                </AdminField>
                                <AdminField label="最长时长（秒）">
                                    <InputNumber {...ADMIN_AUTOFILL_OFF} name="sundas-model-duration-max" className="w-full" min={0} value={metadata.durationMax} onChange={(value) => setMetadata({ ...metadata, durationMax: Number(value) || 0 })} />
                                </AdminField>
                                <AdminField label="宽高比">
                                    <Input {...ADMIN_AUTOFILL_OFF} name="sundas-model-aspect-ratios" value={metadata.aspectRatios} onChange={(event) => setMetadata({ ...metadata, aspectRatios: event.target.value })} placeholder="16:9, 9:16, 1:1" />
                                </AdminField>
                            </>
                        ) : null}
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <AdminField label="标签">
                            <Input {...ADMIN_AUTOFILL_OFF} name="sundas-model-tags" value={metadata.tags} onChange={(event) => setMetadata({ ...metadata, tags: event.target.value })} placeholder="快速, 人物, 口播" />
                        </AdminField>
                        <AdminField label="文档链接">
                            <Input {...ADMIN_AUTOFILL_OFF} name="sundas-model-docs-url" value={metadata.docsUrl} onChange={(event) => setMetadata({ ...metadata, docsUrl: event.target.value })} placeholder="https://..." />
                        </AdminField>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-xs font-medium text-[var(--admin-ink)]">模型线路</div>
                            <div className="mt-0.5 text-[11px] text-[var(--admin-muted)]">一个模型绑多个渠道；前台只显示一次，网关按优先级和健康状态选路。</div>
                        </div>
                        <Button size="small" icon={<Plus size={13} />} onClick={() => setRoutes([...routes, { channelId: channels[0]?.id ?? "", unit: nextUnit(capability, "request"), baseCredits: 1, priority: routes.length, weight: 100, enabled: true, resolutions: defaultResolutions.map((row) => ({ ...row })) }])}>
                            添加线路
                        </Button>
                    </div>
                    {routes.map((route, index) => (
                        <div key={index} className="space-y-3 rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-[var(--admin-ink)]">线路 {index + 1}</span>
                                    {route.channelId ? <AdminBadge tone={route.enabled ? "positive" : "neutral"}>{route.enabled ? "启用" : "停用"}</AdminBadge> : null}
                                </div>
                                <Button type="text" danger icon={<Trash2 size={14} />} aria-label="删除线路" onClick={() => setRoutes(routes.filter((_item, routeIndex) => routeIndex !== index))} />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <AdminField label="渠道" required>
                                    <Select className="w-full" value={route.channelId || undefined} placeholder="选择渠道" onChange={(value) => updateRoute(index, { channelId: value })} options={channels.map((channel) => ({ value: channel.id, label: `${channel.name}${channel.healthStatus === "down" ? "（异常）" : ""}` }))} />
                                </AdminField>
                                <AdminField label="计量单位">
                                    <Select className="w-full" value={route.unit} onChange={(value) => updateRoute(index, { unit: value })} options={unitsFor(capability)} />
                                </AdminField>
                                <AdminField label="单价（积分）">
                                    <InputNumber {...ADMIN_AUTOFILL_OFF} name={`sundas-route-credits-${index}`} className="w-full" min={0.0001} step={0.5} value={route.baseCredits} onChange={(value) => updateRoute(index, { baseCredits: Number(value) || 0 })} />
                                </AdminField>
                                <div className="grid grid-cols-2 gap-2">
                                    <AdminField label="优先级">
                                        <InputNumber {...ADMIN_AUTOFILL_OFF} name={`sundas-route-priority-${index}`} className="w-full" value={route.priority} onChange={(value) => updateRoute(index, { priority: Number(value) || 0 })} />
                                    </AdminField>
                                    <AdminField label="权重">
                                        <InputNumber {...ADMIN_AUTOFILL_OFF} name={`sundas-route-weight-${index}`} className="w-full" min={1} value={route.weight} onChange={(value) => updateRoute(index, { weight: Number(value) || 100 })} />
                                    </AdminField>
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[11px] text-[var(--admin-muted)]">优先级越小越先尝试，权重用于同优先级排序。</span>
                                <Switch checked={route.enabled} onChange={(checked) => updateRoute(index, { enabled: checked })} />
                            </div>
                            {capability === "video" || imageResolutionPricing ? (
                                <div className="space-y-2 border-t border-[var(--admin-line)] pt-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-[var(--admin-muted)]">该线路支持的分辨率</span>
                                        <Button size="small" type="text" icon={<Plus size={12} />} onClick={() => updateRoute(index, { resolutions: [...route.resolutions, { value: "", multiplier: 1 }] })}>分辨率</Button>
                                    </div>
                                    {route.resolutions.map((row, resolutionIndex) => (
                                        <div key={resolutionIndex} className="grid grid-cols-[1fr_100px_28px] gap-2">
                                            <Input {...ADMIN_AUTOFILL_OFF} name={`sundas-route-resolution-${index}-${resolutionIndex}`} value={row.value} placeholder="720 / 1080 / 2k / 4k" onChange={(event) => updateRoute(index, { resolutions: route.resolutions.map((item, itemIndex) => (itemIndex === resolutionIndex ? { ...item, value: event.target.value } : item)) })} />
                                            <InputNumber {...ADMIN_AUTOFILL_OFF} name={`sundas-route-resolution-multiplier-${index}-${resolutionIndex}`} className="w-full" min={0.1} step={0.1} value={row.multiplier} onChange={(value) => updateRoute(index, { resolutions: route.resolutions.map((item, itemIndex) => (itemIndex === resolutionIndex ? { ...item, multiplier: Number(value) || 1 } : item)) })} />
                                            <Button type="text" danger icon={<Trash2 size={13} />} aria-label="删除分辨率" onClick={() => updateRoute(index, { resolutions: route.resolutions.filter((_item, itemIndex) => itemIndex !== resolutionIndex) })} />
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>

                <div className="flex items-center justify-between rounded-[9px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-3 py-2.5">
                    <div>
                        <div className="text-xs font-medium text-[var(--admin-ink)]">启用模型</div>
                        <div className="mt-0.5 text-[11px] text-[var(--admin-muted)]">关闭后前台不会展示该模型。</div>
                    </div>
                    <Switch checked={enabled} onChange={setEnabled} />
                </div>
            </div>
        </Modal>
    );
}
