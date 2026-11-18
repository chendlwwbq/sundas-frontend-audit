import { useEffect, useMemo, useState } from "react";
import { App as AntApp, Button, Input, InputNumber, Modal, Select, Switch, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { Plus, RefreshCw } from "lucide-react";

import { useAdminRequest } from "../use-admin-request";
import { useAdminPermissions } from "../permissions";
import { uploadBlobToServer } from "@/services/cloud-media";
import { ADMIN_AUTOFILL_OFF, AdminBadge, AdminField, AdminPanel, AdminToolbar } from "./ui";

type AdminPrompt = {
    id: string;
    sourceId: string;
    sourceName: string;
    title: string;
    prompt: string;
    description: string;
    coverUrl: string;
    referenceImageUrls: string[];
    tags: string[];
    preview: string;
    previewVideoUrl: string;
    sourceUrl: string;
    author: string;
    enabled: boolean;
    featured: boolean;
    sort: number;
    locked: boolean;
    sourceUpdatedAt: string;
    updatedAt: string;
};

type PromptDraft = {
    id?: string;
    sourceId: string;
    title: string;
    prompt: string;
    description: string;
    coverUrl: string;
    referenceImageUrls: string[];
    tags: string[];
    preview: string;
    previewVideoUrl: string;
    sourceUrl: string;
    author: string;
    enabled: boolean;
    featured: boolean;
    sort: number;
};

type AdminPromptList = { items: AdminPrompt[]; sources: { id: string; name: string; kind: string; count: number }[]; total: number; page: number; pageSize: number };

const EMPTY_DRAFT: PromptDraft = {
    sourceId: "manual",
    title: "",
    prompt: "",
    description: "",
    coverUrl: "",
    referenceImageUrls: [],
    tags: [],
    preview: "",
    previewVideoUrl: "",
    sourceUrl: "",
    author: "",
    enabled: true,
    featured: false,
    sort: 0,
};

function toDraft(item: AdminPrompt): PromptDraft {
    return {
        id: item.id,
        sourceId: item.sourceId,
        title: item.title,
        prompt: item.prompt,
        description: item.description,
        coverUrl: item.coverUrl,
        referenceImageUrls: item.referenceImageUrls ?? [],
        tags: item.tags ?? [],
        preview: item.preview,
        previewVideoUrl: item.previewVideoUrl ?? "",
        sourceUrl: item.sourceUrl,
        author: item.author,
        enabled: item.enabled,
        featured: item.featured,
        sort: item.sort,
    };
}

export function PromptsTab() {
    const apiRequest = useAdminRequest();
    const permissions = useAdminPermissions();
    const canManage = permissions.includes("prompts.manage");
    const { message, modal } = AntApp.useApp();
    const [data, setData] = useState<AdminPromptList>({ items: [], sources: [], total: 0, page: 1, pageSize: 20 });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [search, setSearch] = useState("");
    const [sourceId, setSourceId] = useState("all");
    const [page, setPage] = useState(1);
    const [draft, setDraft] = useState<PromptDraft & { open: boolean }>({ ...EMPTY_DRAFT, open: false });
    const [uploading, setUploading] = useState(false);
    const [videoUploading, setVideoUploading] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), pageSize: "20" });
            if (search) params.set("keyword", search);
            if (sourceId !== "all") params.set("sourceId", sourceId);
            setData(await apiRequest<AdminPromptList>(`/api/admin/prompts?${params.toString()}`));
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, [page, search, sourceId]);

    const sourceOptions = useMemo(
        () => [{ value: "all", label: "全部来源" }, ...data.sources.map((source) => ({ value: source.id, label: `${source.name}（${source.count}）` }))],
        [data.sources],
    );

    function update<K extends keyof PromptDraft>(key: K, value: PromptDraft[K]) {
        setDraft((current) => ({ ...current, [key]: value }));
    }

    async function pickCover(file: File | undefined) {
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return void message.error("只支持 JPG / PNG / WebP");
        if (file.size > 10 * 1024 * 1024) return void message.error("图片不能超过 10MB");
        setUploading(true);
        try {
            const uploaded = await uploadBlobToServer(file, "prompts");
            if (!uploaded) throw new Error("上传失败，请稍后重试");
            update("coverUrl", uploaded.url);
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setUploading(false);
        }
    }

    async function pickVideo(file: File | undefined) {
        if (!file) return;
        if (!file.type.startsWith("video/")) return void message.error("请选择视频文件");
        if (file.size > 200 * 1024 * 1024) return void message.error("视频不能超过 200MB");
        setVideoUploading(true);
        try {
            const uploaded = await uploadBlobToServer(file, "prompt-video");
            if (!uploaded) throw new Error("上传失败，请稍后重试");
            update("previewVideoUrl", uploaded.url);
            message.success("视频已上传，保存后生效");
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setVideoUploading(false);
        }
    }

    async function save() {
        if (!draft.title.trim()) return void message.warning("请填写标题");
        if (!draft.prompt.trim()) return void message.warning("请填写提示词正文");
        setSaving(true);
        try {
            await apiRequest(draft.id ? `/api/admin/prompts/${encodeURIComponent(draft.id)}` : "/api/admin/prompts", {
                method: draft.id ? "PUT" : "POST",
                json: {
                    sourceId: draft.sourceId,
                    title: draft.title.trim(),
                    prompt: draft.prompt.trim(),
                    description: draft.description.trim(),
                    coverUrl: draft.coverUrl.trim(),
                    referenceImageUrls: draft.referenceImageUrls,
                    tags: draft.tags,
                    preview: draft.preview.trim(),
                    previewVideoUrl: draft.previewVideoUrl.trim(),
                    sourceUrl: draft.sourceUrl.trim(),
                    author: draft.author.trim(),
                    enabled: draft.enabled,
                    featured: draft.featured,
                    sort: draft.sort,
                },
            });
            message.success(draft.id ? "已保存，前台刷新后生效" : "已新增");
            setDraft({ ...EMPTY_DRAFT, open: false });
            if (page !== 1) setPage(1);
            else await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    }

    async function quickToggle(item: AdminPrompt, key: "enabled" | "featured", value: boolean) {
        try {
            await apiRequest(`/api/admin/prompts/${encodeURIComponent(item.id)}`, { method: "PUT", json: { [key]: value } });
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    }

    const columns: TableColumnsType<AdminPrompt> = [
        {
            title: "内容",
            dataIndex: "title",
            render: (_value, record) => (
                <div className="flex min-w-0 items-start gap-3">
                    {record.coverUrl ? (
                        <img src={record.coverUrl} alt="" className="size-14 shrink-0 rounded-md object-cover" loading="lazy" />
                    ) : (
                        <span className="grid size-14 shrink-0 place-items-center rounded-md border border-[var(--admin-line)] text-[10px] text-[var(--admin-muted)]">无封面</span>
                    )}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="line-clamp-1 font-medium text-[var(--admin-ink)]">{record.title}</span>
                            {record.featured ? <AdminBadge tone="accent" dot={false}>精选</AdminBadge> : null}
                            {record.previewVideoUrl ? <AdminBadge tone="accent" dot={false}>视频</AdminBadge> : null}
                            {record.locked ? <AdminBadge tone="warning" dot={false}>已改</AdminBadge> : null}
                        </div>
                        <div className="mt-0.5 line-clamp-2 max-w-[56ch] text-xs text-[var(--admin-muted)]">{record.prompt}</div>
                        {record.tags.length ? <div className="mt-1 flex flex-wrap gap-1">{record.tags.slice(0, 4).map((tag) => <Tag key={tag} bordered={false} className="m-0 text-[10px]">{tag}</Tag>)}</div> : null}
                    </div>
                </div>
            ),
        },
        { title: "来源", dataIndex: "sourceName", width: 160, render: (_value, record) => <span className="text-xs text-[var(--admin-muted)]">{record.sourceName}</span> },
        {
            title: "排序",
            dataIndex: "sort",
            width: 90,
            render: (value: number) => <span className="tabular-nums text-[var(--admin-muted)]">{value}</span>,
        },
        {
            title: "上架",
            dataIndex: "enabled",
            width: 90,
            render: (value: boolean, record) => <Switch size="small" disabled={!canManage} checked={value} onChange={(checked) => void quickToggle(record, "enabled", checked)} />,
        },
        {
            title: "精选",
            dataIndex: "featured",
            width: 90,
            render: (value: boolean, record) => <Switch size="small" disabled={!canManage} checked={value} onChange={(checked) => void quickToggle(record, "featured", checked)} />,
        },
        {
            title: "更新时间",
            dataIndex: "updatedAt",
            width: 130,
            render: (value: string) => <span className="tabular-nums text-[var(--admin-muted)]">{dayjs(value).format("YYYY-MM-DD HH:mm")}</span>,
        },
        {
            title: "操作",
            key: "actions",
            width: 170,
            align: "right",
            render: (_value, record) => (
                <div className="flex justify-end gap-1.5">
                    <Button disabled={!canManage} size="small" onClick={() => setDraft({ ...toDraft(record), open: true })}>
                        编辑
                    </Button>
                    <Button
                        size="small"
                        danger
                        disabled={!canManage}
                        onClick={() =>
                            modal.confirm({
                                title: "删除这条提示词？",
                                content: record.sourceId === "manual" ? record.title : `${record.title}（来自来源「${record.sourceName}」，下次自动同步可能把它重新拉取回来）`,
                                okButtonProps: { danger: true },
                                onOk: async () => {
                                    await apiRequest(`/api/admin/prompts/${encodeURIComponent(record.id)}`, { method: "DELETE" });
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
                title="提示词列表"
                description={`共 ${data.total} 条。关闭「上架」前台立即隐藏；打开「精选」会优先出现在首页灵感大厅；排序值越大越靠前。编辑过的条目会自动锁定，不会被自动同步覆盖。`}
                actions={
                    <div className="flex items-center gap-2">
                        <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>
                            刷新
                        </Button>
                        <Button disabled={!canManage} type="primary" size="small" icon={<Plus className="size-3.5" />} onClick={() => setDraft({ ...EMPTY_DRAFT, open: true })}>
                            新增提示词
                        </Button>
                    </div>
                }
                flush
            >
                <AdminToolbar>
                    <Input.Search
                        allowClear
                        size="small"
                        className="w-64"
                        placeholder="搜索标题 / 正文 / 描述"
                        value={keyword}
                        onChange={(event) => setKeyword(event.target.value)}
                        onSearch={(value) => {
                            setPage(1);
                            setSearch(value.trim());
                        }}
                    />
                    <Select size="small" className="w-52" value={sourceId} options={sourceOptions} onChange={(value) => { setPage(1); setSourceId(value); }} />
                    <span className="ml-auto text-xs text-[var(--admin-muted)]">第 {data.page} 页 / 共 {Math.max(1, Math.ceil(data.total / data.pageSize))} 页</span>
                    <Button size="small" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
                    <Button size="small" disabled={page * data.pageSize >= data.total} onClick={() => setPage((value) => value + 1)}>下一页</Button>
                </AdminToolbar>
                <Table<AdminPrompt> rowKey="id" loading={loading} dataSource={data.items} columns={columns} pagination={false} scroll={{ x: 1080 }} />
            </AdminPanel>

            <Modal
                title={draft.id ? "编辑提示词" : "新增提示词"}
                open={draft.open}
                width={720}
                okText="保存"
                cancelText="取消"
                confirmLoading={saving}
                onCancel={() => setDraft({ ...draft, open: false })}
                onOk={() => void save()}
            >
                <div className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                    <AdminField label="标题" required className="sm:col-span-2">
                        <Input {...ADMIN_AUTOFILL_OFF} value={draft.title} maxLength={200} onChange={(event) => update("title", event.target.value)} placeholder="例如：赛博城市夜景" />
                    </AdminField>
                    <AdminField label="提示词正文" required className="sm:col-span-2" hint="用户点击「用这个提示词创作」时填入的内容。">
                        <Input.TextArea value={draft.prompt} rows={6} showCount maxLength={4000} onChange={(event) => update("prompt", event.target.value)} placeholder="完整的提示词文本" />
                    </AdminField>
                    <AdminField label="简短描述" className="sm:col-span-2">
                        <Input.TextArea value={draft.description} rows={2} maxLength={500} onChange={(event) => update("description", event.target.value)} placeholder="列表与详情页的补充说明，可留空" />
                    </AdminField>
                    <AdminField label="封面图" className="sm:col-span-2" hint="留空时列表会显示占位块。上传后可直接替换远程封面。">
                        <div className="flex items-center gap-2">
                            <Input value={draft.coverUrl} onChange={(event) => update("coverUrl", event.target.value)} placeholder="https://... 或点击右侧上传" />
                            <Button size="small" loading={uploading} onClick={() => document.getElementById("admin-prompt-cover")?.click()}>
                                上传
                            </Button>
                            <input id="admin-prompt-cover" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { void pickCover(event.target.files?.[0]); event.target.value = ""; }} />
                        </div>
                    </AdminField>
                    {draft.coverUrl ? <img src={draft.coverUrl} alt="" className="mb-1 h-32 w-full rounded-lg object-cover sm:col-span-2" /> : null}
                    <AdminField label="预览视频" className="sm:col-span-2" hint="上传后地址会存进这条提示词，前台详情页可直接播放，列表显示「视频」角标。可留空。">
                        <div className="flex items-center gap-2">
                            <Input value={draft.previewVideoUrl} onChange={(event) => update("previewVideoUrl", event.target.value)} placeholder="https://... 或点击右侧上传 MP4 / WebM / MOV" />
                            <Button size="small" loading={videoUploading} onClick={() => document.getElementById("admin-prompt-video")?.click()}>
                                上传视频
                            </Button>
                            <input id="admin-prompt-video" type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(event) => { void pickVideo(event.target.files?.[0]); event.target.value = ""; }} />
                        </div>
                    </AdminField>
                    {draft.previewVideoUrl ? <video src={draft.previewVideoUrl} controls playsInline preload="metadata" className="mb-1 w-full rounded-lg bg-black sm:col-span-2" /> : null}
                    <AdminField label="标签" hint="逗号分隔，用于前台筛选与灵感大厅分类">
                        <Input value={draft.tags.join(", ")} onChange={(event) => update("tags", event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))} placeholder="short_video, 海报" />
                    </AdminField>
                    <AdminField label="作者">
                        <Input value={draft.author} maxLength={80} onChange={(event) => update("author", event.target.value)} />
                    </AdminField>
                    <AdminField label="参考图链接" hint="逗号分隔，可留空">
                        <Input value={draft.referenceImageUrls.join(", ")} onChange={(event) => update("referenceImageUrls", event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))} placeholder="https://..." />
                    </AdminField>
                    <AdminField label="原链接">
                        <Input value={draft.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} placeholder="https://" />
                    </AdminField>
                    <AdminField label="所属来源">
                        <Select className="w-full" value={draft.sourceId} options={data.sources.map((source) => ({ value: source.id, label: source.name }))} onChange={(value) => update("sourceId", value)} disabled={Boolean(draft.id)} />
                    </AdminField>
                    <AdminField label="排序权重" hint="越大越靠前">
                        <InputNumber className="w-full" value={draft.sort} onChange={(value) => update("sort", Number(value) || 0)} />
                    </AdminField>
                    <AdminField label="上架显示">
                        <Switch checked={draft.enabled} onChange={(checked) => update("enabled", checked)} />
                    </AdminField>
                    <AdminField label="首页灵感大厅精选" hint="打开后会排在灵感大厅最前面">
                        <Switch checked={draft.featured} onChange={(checked) => update("featured", checked)} />
                    </AdminField>
                </div>
            </Modal>
        </div>
    );
}
