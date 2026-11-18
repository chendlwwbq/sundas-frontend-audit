import { MediaThumbnail } from "@/components/media-thumbnail";
import { downloadCloudMedia, refreshExpiredMedia } from "@/services/media-download";
import { Copy, Download, Eye, FileText, Film, FolderOpen, Image as ImageIcon, PencilLine, Plus, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { App, Button, Drawer, Form, Image, Input, Modal, Pagination, Select, Space, Tag, Typography } from "antd";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { useCopyText } from "@/hooks/use-copy-text";
import { useMediaArchive } from "@/hooks/use-media-archive";
import { formatBytes, readFileAsDataUrl } from "@/lib/image-utils";
import { mediaFileKind } from "@/lib/media-file";
import { getMediaBlob } from "@/services/file-storage";
import { currentMediaOwner } from "@/services/cloud-media";
import { getImageBlob, getImagePreviewRevision, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { cn } from "@/lib/utils";
import { assetCoverUrl, isAssetAccountActive, useAssetStore, type Asset, type AssetKind, type ImageAsset } from "@/stores/use-asset-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { exportAssets, readAssetPackage } from "./asset-transfer";
import { captureAccountSession } from "@/lib/account-session";
import { HistoryFilesPanel } from "./history-files";
import { matchesPresentedSession } from "@/lib/canvas/canvas-session";

type AssetFormValues = {
    kind: AssetKind;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    content?: string;
};

type ImageDraft = ImageAsset["data"] | null;

const kindOptions = ["all", "text", "image", "video", "audio"] as const;

export default function AssetsPage() {
    useEffect(() => { window.dispatchEvent(new Event('sundas:assets-opened')); }, []);
    const { message } = App.useApp();
    const { t } = useTranslation();
    const copyText = useCopyText();
    const [form] = Form.useForm<AssetFormValues>();
    const coverInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
    const assets = useAssetStore((state) => state.assets);
    const hydrated = useAssetStore((state) => state.hydrated);
    const userId = useAuthStore((state) => state.user?.id ?? null);
    const authReady = useAuthStore((state) => state.ready);
    const sessionEpoch = useAuthStore((state) => state.sessionEpoch);
    const addAsset = useAssetStore((state) => state.addAsset);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const removeAsset = useAssetStore((state) => state.removeAsset);
    const [libraryTab, setLibraryTab] = useState<"assets" | "history">(() => new URLSearchParams(window.location.search).get("tab") === "history" ? "history" : "assets");
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
    const [isAssetOpen, setIsAssetOpen] = useState(false);
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [deletingAsset, setDeletingAsset] = useState<Asset | null>(null);
    const [formKind, setFormKind] = useState<AssetKind>("text");
    const [imageDraft, setImageDraft] = useState<ImageDraft>(null);
    const sessionKey = `${sessionEpoch}:${userId ?? ""}`;
    const [presentedSession, setPresentedSession] = useState(sessionKey);
    const isAssetViewCurrent = () => matchesPresentedSession(userId, sessionEpoch, presentedSession, useAuthStore.getState(), isAssetAccountActive(userId));
    useEffect(() => {
        setEditingAsset(null);
        setImageDraft(null);
        setIsAssetOpen(false);
        setPreviewAsset(null);
        setDeletingAsset(null);
        setFormKind("text");
        form.resetFields();
        setPresentedSession(sessionKey);
    }, [sessionKey, form]);
    const coverUrl = Form.useWatch("coverUrl", form) || "";
    const title = Form.useWatch("title", form) || "";
    const tags = Form.useWatch("tags", form) || [];
    const content = Form.useWatch("content", form) || "";
    const validAssets = useMemo(() => assets.filter((asset) => asset.kind === "text" || asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"), [assets]);

    const filteredAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return validAssets.filter((asset) => {
            if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
            if (!query) return true;
            return assetSearchText(asset).includes(query);
        });
    }, [validAssets, keyword, kindFilter]);

    const visibleAssets = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAssets.slice(start, start + pageSize);
    }, [filteredAssets, page, pageSize]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
        setPage((value) => Math.min(value, maxPage));
    }, [filteredAssets.length, pageSize]);

    const openCreate = () => {
        if (!isAssetViewCurrent()) return;
        setEditingAsset(null);
        setImageDraft(null);
        setFormKind("text");
        form.setFieldsValue({ kind: "text", title: "", coverUrl: "", tags: [], source: t("assets.manual"), note: "", content: "" });
        setIsAssetOpen(true);
    };

    const openEdit = (asset: Asset) => {
        if (!isAssetViewCurrent()) return;
        setEditingAsset(asset);
        setFormKind(asset.kind);
        setImageDraft(asset.kind === "image" ? asset.data : null);
        form.setFieldsValue({
            kind: asset.kind,
            title: asset.title,
            coverUrl: asset.coverUrl,
            tags: asset.tags || [],
            source: asset.source,
            note: asset.note,
            content: asset.kind === "text" ? asset.data.content : "",
        });
        setIsAssetOpen(true);
    };

    const saveAsset = async () => {
        if (!isAssetViewCurrent()) return;
        let session: ReturnType<typeof captureAccountSession>;
        try { session = captureAccountSession(); } catch { return; }
        const values = await form.validateFields();
        try { session.check(); } catch { return; }
        const base = {
            title: values.title.trim(),
            coverUrl: values.coverUrl?.trim() || (values.kind === "image" && imageDraft ? imageDraft.dataUrl : ""),
            tags: values.tags || [],
            source: values.source?.trim(),
            note: values.note?.trim(),
            metadata: editingAsset?.metadata || { source: "manual" },
        };

        if ((formKind === "video" || formKind === "audio") && editingAsset && (editingAsset.kind === "video" || editingAsset.kind === "audio")) {
            updateAsset(editingAsset.id, { ...base, kind: editingAsset.kind, data: editingAsset.data });
        } else if (values.kind === "text") {
            const asset = { ...base, kind: "text" as const, data: { content: (values.content || "").trim() } };
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
        } else {
            if (!imageDraft) {
                message.error(t("assets.selectImage"));
                return;
            }
            const asset = { ...base, kind: "image" as const, data: imageDraft };
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
        }

        message.success(editingAsset ? t("assets.updated") : t("assets.saved"));
        setIsAssetOpen(false);
    };

    const readCoverFile = async (file?: File) => {
        if (!file || !isAssetViewCurrent()) return;
        let session: ReturnType<typeof captureAccountSession>;
        try { session = captureAccountSession(); } catch { return; }
        const dataUrl = await readFileAsDataUrl(file);
        try { session.check(); } catch { return; }
        form.setFieldValue("coverUrl", dataUrl);
    };

    const readImageFile = async (file?: File) => {
        if (!file || mediaFileKind(file) !== "image" || !isAssetViewCurrent()) return;
        let session: ReturnType<typeof captureAccountSession>;
        try { session = captureAccountSession(); } catch { return; }
        const image = await uploadImage(file, { expectedOwner: session.owner });
        try { session.check(); } catch { return; }
        const draft = { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType };
        setImageDraft(draft);
        if (!form.getFieldValue("coverUrl")) form.setFieldValue("coverUrl", draft.dataUrl);
        if (!form.getFieldValue("title")) form.setFieldValue("title", file.name);
    };

    const copyAssetText = async (asset: Asset) => {
        if (asset.kind !== "text" || !isAssetViewCurrent()) return;
        copyText(asset.data.content, t("assets.textCopied"));
    };

    const downloadImage = async (asset: Asset) => {
        if ((asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio") || !isAssetViewCurrent()) return;
        try {
            const session = captureAccountSession();
            const ext = asset.data.mimeType?.split("/")[1]?.split("+")[0] || (asset.kind === "video" ? "mp4" : "png");
            const filename = `${asset.title || "asset"}.${ext}`;
            const cloudUrl = asset.kind !== 'image' ? asset.data.url : asset.data.dataUrl;
            if (cloudUrl && downloadCloudMedia(cloudUrl, filename)) return;
            const blob = await readAssetMediaBlob(asset);
            session.check();
            if (!blob) {
                message.error(t("assets.downloadFailed"));
                return;
            }
            saveAs(blob, filename);
        } catch {
            message.error(t("assets.downloadFailed"));
        }
    };

    const exportAllAssets = async () => {
        if (!isAssetViewCurrent()) return;
        if (!validAssets.length) {
            message.warning(t("assets.noneToExport"));
            return;
        }
        try { await exportAssets(validAssets, t("assets.packageName")); }
        catch (error) { message.error(error instanceof Error ? error.message : t("assets.downloadFailed")); }
    };

    const importAssetZip = async (file?: File) => {
        if (!file || !isAssetViewCurrent()) return;
        try {
            const session = captureAccountSession();
            const owner = session.owner;
            const importedAssets = await readAssetPackage(file);
            session.check();
            if (!owner || currentMediaOwner() !== owner) throw new Error("登录账户已变化，请重新导入");
            importedAssets.forEach((asset) => {
                const payload = { ...asset } as Record<string, unknown>;
                delete payload.id;
                delete payload.createdAt;
                delete payload.updatedAt;
                addAsset(payload as Parameters<typeof addAsset>[0]);
            });
            message.success(t("assets.imported", { count: importedAssets.length }));
        } catch {
            message.error(t("assets.importFailed"));
        } finally {
            if (assetInputRef.current) assetInputRef.current.value = "";
        }
    };

    const confirmDelete = () => {
        if (!isAssetViewCurrent()) return;
        if (!deletingAsset) return;
        removeAsset(deletingAsset.id);
        message.success(t("assets.deleted"));
        setDeletingAsset(null);
    };

    if (!authReady || !hydrated || presentedSession !== sessionKey || !isAssetAccountActive(userId)) return <main className="flex h-full items-center justify-center text-sm text-stone-500">{t("canvas.loading")}</main>;

    return (
        <div className="page-surface flex h-full flex-col overflow-hidden bg-background text-foreground">
            <main className="jm-page">
                <div className="jm-page-inner flex min-h-full flex-col gap-6">
                    <header className="jm-page-head">
                        <div>
                            <h1 className="jm-page-title">{t("assets.title")}</h1>
                            <p className="jm-page-desc">{t("assets.description")}</p>
                        </div>
                        <div className="jm-segment" role="tablist">
                            {([["assets", t("assets.tabAssets")], ["history", t("assets.tabHistory")]] as const).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    aria-selected={libraryTab === key}
                                    className="jm-segment-item"
                                    onClick={() => {
                                        setLibraryTab(key);
                                        const url = new URL(window.location.href);
                                        if (key === "history") url.searchParams.set("tab", "history");
                                        else url.searchParams.delete("tab");
                                        window.history.replaceState(null, "", url.toString());
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </header>

                    {libraryTab === "assets" ? (
                        <>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            {kindOptions.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    aria-pressed={kindFilter === option}
                                    className={cn("jm-chip", kindFilter === option && "is-active")}
                                    onClick={() => {
                                        setPage(1);
                                        setKindFilter(option);
                                    }}
                                >
                                    {option === "all" ? t("common.all") : t(`assets.kinds.${option}`)}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <label className="jm-search sm:w-[280px]">
                                <Search className="size-4 shrink-0" />
                                <input
                                    value={keyword}
                                    placeholder={t("assets.search")}
                                    onChange={(event) => {
                                        setPage(1);
                                        setKeyword(event.target.value);
                                    }}
                                />
                            </label>
                            <div className="flex items-center gap-2">
                                <Button icon={<Download className="size-4" />} onClick={() => void exportAllAssets()}>
                                    {t("assets.export")}
                                </Button>
                                <Button icon={<Upload className="size-4" />} onClick={() => assetInputRef.current?.click()}>
                                    {t("assets.import")}
                                </Button>
                                <button type="button" className="jm-btn jm-btn-primary" onClick={openCreate}>
                                    <Plus className="size-4" />
                                    {t("assets.add")}
                                </button>
                            </div>
                        </div>
                    </div>

                    {visibleAssets.length ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {visibleAssets.map((asset) => (
                                <AssetCard key={asset.id} asset={asset} onOpen={() => setPreviewAsset(asset)} onEdit={() => openEdit(asset)} onCopy={copyAssetText} onDownload={downloadImage} onDelete={() => setDeletingAsset(asset)} />
                            ))}
                        </div>
                    ) : (
                        <div className="jm-card jm-empty">
                            <div className="jm-empty-icon">
                                <FolderOpen className="size-8" strokeWidth={1.5} />
                            </div>
                            <h2 className="jm-empty-title">{validAssets.length ? t("assets.empty") : t("assets.emptyTitle")}</h2>
                            <p className="jm-empty-desc">{validAssets.length ? t("assets.noMatchHint") : t("assets.emptyHint")}</p>
                            {validAssets.length ? null : (
                                <button type="button" className="jm-btn jm-btn-primary mt-4" onClick={openCreate}>
                                    <Plus className="size-4" />
                                    {t("assets.add")}
                                </button>
                            )}
                        </div>
                    )}

                    {filteredAssets.length ? (
                        <div className="mt-auto flex flex-col items-center justify-between gap-3 border-t border-border pt-5 sm:flex-row">
                            <p className="text-[11.5px] text-muted-foreground">{t("assets.total", { count: filteredAssets.length })}</p>
                            <Pagination
                                current={page}
                                pageSize={pageSize}
                                total={filteredAssets.length}
                                showSizeChanger
                                pageSizeOptions={[10, 20, 50, 100]}
                                onChange={(nextPage, nextPageSize) => {
                                    setPage(nextPage);
                                    setPageSize(nextPageSize);
                                }}
                            />
                        </div>
                    ) : null}
                        </>
                    ) : <HistoryFilesPanel />}
                </div>
            </main>

            <Modal title={editingAsset ? t("assets.edit") : t("assets.add")} open={isAssetOpen} width={980} onCancel={() => setIsAssetOpen(false)} onOk={() => void saveAsset()} okText={t("common.save")} cancelText={t("common.cancel")} destroyOnHidden>
                <div className="grid gap-6 pt-1 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <Form form={form} layout="vertical" requiredMark={false} initialValues={{ kind: "text", tags: [] }}>
                        {formKind === "video" || formKind === "audio" ? (
                            <Form.Item label={t("assets.type")}>
                                <Tag className="m-0">{t(`assets.kinds.${formKind}`)}</Tag>
                            </Form.Item>
                        ) : (
                            <Form.Item name="kind" label={t("assets.type")}>
                                <Select
                                    options={[
                                        { label: t("assets.kinds.text"), value: "text" },
                                        { label: t("assets.kinds.image"), value: "image" },
                                    ]}
                                    onChange={(value) => setFormKind(value)}
                                />
                            </Form.Item>
                        )}
                        <Form.Item name="title" label={t("assets.fields.title")} rules={[{ required: true, message: t("assets.fields.titleRequired") }]}>
                            <Input size="large" placeholder={t("assets.fields.titlePlaceholder")} />
                        </Form.Item>
                        <Form.Item name="coverUrl" label={t("assets.fields.coverUrl")}>
                            <Space.Compact className="w-full">
                                <Input placeholder={t("assets.fields.coverPlaceholder")} />
                                <Button icon={<Upload className="size-3.5" />} onClick={() => coverInputRef.current?.click()}>
                                    {t("common.upload")}
                                </Button>
                            </Space.Compact>
                        </Form.Item>
                        <Form.Item name="tags" label={t("assets.fields.tags")}>
                            <Select mode="tags" tokenSeparators={[",", "，"]} placeholder={t("assets.fields.tagsPlaceholder")} />
                        </Form.Item>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Form.Item name="source" label={t("assets.fields.source")}>
                                <Input placeholder={t("assets.fields.sourcePlaceholder")} />
                            </Form.Item>
                            <Form.Item name="note" label={t("assets.fields.note")}>
                                <Input placeholder={t("assets.fields.optional")} />
                            </Form.Item>
                        </div>
                        {formKind === "text" ? (
                            <Form.Item name="content" label={t("assets.fields.textContent")} rules={[{ required: true, message: t("assets.fields.textRequired") }]}>
                                <Input.TextArea rows={8} placeholder={t("assets.fields.textPlaceholder")} />
                            </Form.Item>
                        ) : formKind === "audio" && editingAsset?.kind === "audio" ? (
                            <Form.Item label="音频"><audio src={editingAsset.data.url} controls onError={refreshExpiredMedia} /></Form.Item>
                        ) : formKind === "video" && editingAsset?.kind === "video" ? (
                            <Form.Item label={t("assets.fields.videoContent")}>
                                <video onError={refreshExpiredMedia} src={editingAsset.data.url} controls playsInline className="aspect-video w-full rounded-lg bg-black" />
                            </Form.Item>
                        ) : (
                            <Form.Item label={t("assets.fields.imageContent")} required>
                                <div className="rounded-lg border border-dashed border-border p-4 dark:border-border">
                                    <Button icon={<Upload className="size-4" />} onClick={() => imageInputRef.current?.click()}>
                                        {t("assets.selectImageFile")}
                                    </Button>
                                    {imageDraft ? (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            {imageDraft.width}x{imageDraft.height} · {formatBytes(imageDraft.bytes)}
                                        </Typography.Text>
                                    ) : (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            {t("assets.noImageSelected")}
                                        </Typography.Text>
                                    )}
                                </div>
                            </Form.Item>
                        )}
                    </Form>
                    <div className="rounded-xl border border-border bg-muted p-4 dark:border-border dark:bg-background">
                        <Typography.Text strong>{t("assets.preview")}</Typography.Text>
                        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background dark:border-border">
                            {coverUrl || imageDraft?.dataUrl ? (
                                <img src={coverUrl || imageDraft?.dataUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                            ) : (
                                <div className="flex aspect-[4/3] items-center justify-center bg-muted p-5 text-center text-sm text-muted-foreground dark:bg-muted">{content || t("assets.noCover")}</div>
                            )}
                            <div className="p-4">
                                <Typography.Text strong ellipsis className="block">
                                    {title || t("assets.untitled")}
                                </Typography.Text>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {tags.length ? (
                                        tags.map((tag) => (
                                            <Tag key={tag} className="m-0">
                                                {tag}
                                            </Tag>
                                        ))
                                    ) : (
                                        <Tag className="m-0">{t("assets.untagged")}</Tag>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        void readCoverFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        void readImageFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
            </Modal>

            <AssetDrawer asset={previewAsset} onClose={() => setPreviewAsset(null)} onCopy={copyAssetText} onDownload={downloadImage} />

            <input ref={assetInputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importAssetZip(event.target.files?.[0])} />

            <Modal title={t("assets.deleteTitle")} open={Boolean(deletingAsset)} onCancel={() => setDeletingAsset(null)} onOk={confirmDelete} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("assets.deleteConfirm", { name: deletingAsset?.title })}
            </Modal>
        </div>
    );
}

function AssetCard({ asset, onOpen, onEdit, onCopy, onDownload, onDelete }: { asset: Asset; onOpen: () => void; onEdit: () => void; onCopy: (asset: Asset) => void; onDownload: (asset: Asset) => void; onDelete: () => void }) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const cover = assetCoverUrl(asset) || (asset.kind === "video" ? asset.data.url : "");
    const summary = assetSummary(asset);
    const KindIcon = asset.kind === "text" ? FileText : asset.kind === "image" ? ImageIcon : Film;
    const canDownload = asset.kind === "image" || asset.kind === "video" || asset.kind === "audio";

    return (
        <article className="asset-card group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5">
            <button type="button" onClick={onOpen} className="relative block w-full cursor-pointer overflow-hidden bg-muted text-left" aria-label={asset.title}>
                {cover ? (
                    <MediaThumbnail source={cover} kind={asset.kind === "video" && cover === asset.data.url ? "video" : "image"} alt={asset.title} className="grid aspect-[4/3] w-full place-items-center" imageClassName="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]" fallback={<KindIcon className="size-6 opacity-60"/>} />
                ) : (
                    <div className="asset-card-fallback relative flex aspect-[4/3] w-full items-center overflow-hidden p-4">
                        <span aria-hidden className="asset-card-fallback-quote">
                            “
                        </span>
                        <p className="relative line-clamp-4 text-[12px] leading-[1.75] text-foreground/75">{asset.kind === "text" ? asset.data.content : t("assets.noCover")}</p>
                    </div>
                )}
                <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-black/5 bg-white/85 px-2 py-0.5 text-[10.5px] font-medium text-neutral-800 backdrop-blur-sm dark:border-white/10 dark:bg-black/55 dark:text-white/85">
                    <KindIcon className="size-3" strokeWidth={2} />
                    {t(`assets.kinds.${asset.kind}`)}
                </span>
            </button>

            <div className="flex min-w-0 flex-1 flex-col p-4">
                <button type="button" onClick={onOpen} className="cursor-pointer text-left">
                    <h2 className="line-clamp-1 text-[15px] font-semibold leading-6 text-foreground">{asset.title}</h2>
                </button>
                {/* 无封面的文本资产，预览区已经展示正文，正文里不再重复一遍 */}
                {cover || asset.kind !== "text" ? <p className="mt-1 line-clamp-2 text-[11.5px] leading-5 text-muted-foreground">{summary}</p> : null}                <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {(asset.tags || []).slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                            {tag}
                        </span>
                    ))}
                    {(asset.tags || []).length > 3 ? <span className="px-1 text-[10.5px] text-muted-foreground">+{(asset.tags || []).length - 3}</span> : null}
                    {!asset.tags?.length ? <span className="rounded-md border border-dashed border-border px-1.5 py-0.5 text-[10.5px] text-muted-foreground/70">{t("assets.noTags")}</span> : null}
                </div>

                <div className="mt-auto pt-3">
                    <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
                        <span className="min-w-0 truncate text-[11px] text-muted-foreground">{asset.source || t("assets.unknownSource")}</span>
                        <div className="flex shrink-0 items-center gap-0.5">
                            <CardIconButton label={t("common.view")} onClick={onOpen}>
                                <Eye className="size-3.5" />
                            </CardIconButton>
                            <CardIconButton label={t("common.edit")} onClick={onEdit}>
                                <PencilLine className="size-3.5" />
                            </CardIconButton>
                            {asset.kind === "text" ? (
                                <CardIconButton label={t("common.copy")} onClick={() => void onCopy(asset)}>
                                    <Copy className="size-3.5" />
                                </CardIconButton>
                            ) : null}
                            {canDownload ? (
                                <CardIconButton label={t("common.download")} onClick={() => onDownload(asset)}>
                                    <Download className="size-3.5" />
                                </CardIconButton>
                            ) : null}
                            <CardIconButton label={t("common.delete")} danger onClick={onDelete}>
                                <Trash2 className="size-3.5" />
                            </CardIconButton>
                        </div>
                    </div>
                </div>
            </div>
        </article>
    );
}

function CardIconButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            onClick={onClick}
            className={cn("asset-icon-btn grid size-7 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors", danger && "is-danger")}
        >
            {children}
        </button>
    );
}

function AssetDrawer({ asset, onClose, onCopy, onDownload }: { asset: Asset | null; onClose: () => void; onCopy: (asset: Asset) => void; onDownload: (asset: Asset) => void }) {
    const { t } = useTranslation();
    const archive = useMediaArchive(asset?.kind === "video" ? asset.data.url : undefined);
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const cover = asset ? asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "") : "";
    return (
        <Drawer title={t("assets.details")} open={Boolean(asset)} size="large" onClose={onClose}>
            {asset ? (
                <div className="space-y-5">
                    {cover ? (
                        <Image src={assetCoverUrl(asset)} preview={{ src: cover }} alt={asset.title} className="rounded-lg" />
                    ) : (
                        <div className="rounded-lg border border-border bg-muted p-5 text-sm leading-6 text-muted-foreground dark:border-border dark:bg-muted dark:text-foreground/80">{asset.kind === "text" ? asset.data.content : t("assets.noCover")}</div>
                    )}
                    <div>
                        <Typography.Title level={4} className="!mb-2">
                            {asset.title}
                        </Typography.Title>
                        <Space size={[4, 4]} wrap>
                            <Tag>{t(`assets.kinds.${asset.kind}`)}</Tag>
                            {(asset.tags || []).map((tag) => (
                                <Tag key={tag}>{tag}</Tag>
                            ))}
                        </Space>
                    </div>
                    <div className="rounded-lg border border-border p-4 dark:border-border">
                        {asset.kind === "text" ? (
                            <Typography.Text type="secondary" className="block text-xs">
                                {t("assets.fields.textContent")}
                            </Typography.Text>
                        ) : null}
                        {asset.kind === "text" ? (
                            <Typography.Paragraph className="mt-2 whitespace-pre-wrap">{asset.data.content}</Typography.Paragraph>
                        ) : asset.kind === "audio" ? (
                            <audio src={asset.data.url} controls onError={refreshExpiredMedia} className="mt-2 w-full" />
                        ) : asset.kind === "video" ? (
                            <video onError={refreshExpiredMedia} src={asset.data.url} controls playsInline className="mt-2 aspect-video w-full rounded-lg bg-black" />
                        ) : asset.kind === "model" ? (
                            <Typography.Text className="mt-2 block">
                                {asset.data.fileName || "3D 模型"} · {formatBytes(asset.data.bytes)} · {asset.data.mimeType}
                            </Typography.Text>
                        ) : (
                            <Typography.Text className="mt-2 block">
                                {asset.data.width}x{asset.data.height} · {formatBytes(asset.data.bytes)} · {asset.data.mimeType}
                            </Typography.Text>
                        )}
                    </div>
                    {asset.note ? (
                        <div>
                            <Typography.Text type="secondary">{t("assets.fields.note")}</Typography.Text>
                            <Typography.Paragraph className="mt-1">{asset.note}</Typography.Paragraph>
                        </div>
                    ) : null}
                    <Space>
                        {archive && <Button disabled={archive.disabled} onClick={archive.run}>{archive.label}</Button>}
                        {asset.kind === "text" ? (
                            <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(asset)}>
                                {t("assets.copyText")}
                            </Button>
                        ) : null}
                        {asset.kind === "image" || asset.kind === "video" || asset.kind === "audio" ? (
                            <Button type="primary" icon={<Download className="size-4" />} onClick={() => onDownload(asset)}>
                                {asset.kind === "audio" ? "下载音频" : asset.kind === "video" ? t("assets.downloadVideo") : t("assets.downloadImage")}
                            </Button>
                        ) : null}
                    </Space>
                </div>
            ) : null}
        </Drawer>
    );
}

async function readAssetMediaBlob(asset: Extract<Asset, { kind: "image" | "video" | "audio" }>) {
    const storageKey = asset.data.storageKey;
    if (storageKey) {
        const stored = asset.kind === "image" ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
        if (stored) return stored;
    }
    const url = asset.kind !== "image" ? asset.data.url : asset.data.dataUrl || asset.coverUrl;
    if (!url) return null;
    const response = await fetch(url);
    return response.ok ? response.blob() : null;
}

function assetSummary(asset: Asset) {
    if (asset.kind === "text") return asset.data.content;
    if (asset.kind === "model") return `${asset.data.fileName || "3D 模型"} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
    return `${asset.data.width}x${asset.data.height} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
}

function assetSearchText(asset: Asset) {
    return [asset.title, asset.source || "", asset.note || "", (asset.tags || []).join(" "), asset.kind === "text" ? asset.data.content : asset.data.mimeType].join(" ").toLowerCase();
}
