import { MediaThumbnail } from "@/components/media-thumbnail";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Empty, Input, Modal, Pagination, Tag } from "antd";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { getImagePreviewRevision, subscribeImagePreviews } from "@/services/image-storage";
import { assetCoverUrl, isAssetAccountActive, useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useAuthStore } from "@/stores/use-auth-store";

export type InsertAssetPayload = { kind: "text"; content: string; title: string } | { kind: "image"; dataUrl: string; title: string; storageKey?: string } | ({ kind: "video" } | { kind: "audio" }) & { url: string; title: string; storageKey?: string; width?: number; height?: number };

type AcceptedKind = "text" | "image" | "video" | "audio";
const DEFAULT_ACCEPTED_KINDS: AcceptedKind[] = ["text", "image", "video", "audio"];

type Props = {
    open: boolean;
    defaultTab?: string;
    acceptedKinds?: AcceptedKind[];
    onInsert: (payload: InsertAssetPayload) => void;
    onClose: () => void;
};

export function AssetPickerModal({ open, acceptedKinds = DEFAULT_ACCEPTED_KINDS, onInsert, onClose }: Props) {
    const { t } = useTranslation();
    return (
        <Modal title={t("canvas.assetPicker.title")} open={open} onCancel={onClose} footer={null} width={860} destroyOnHidden styles={{ body: { padding: "0 24px 24px", minHeight: 480 } }}>
            <MyAssetsTab acceptedKinds={acceptedKinds} onInsert={onInsert} />
        </Modal>
    );
}

const PAGE_SIZE = 8;

function PickerCard({ title, kind, cover, video, onClick }: { title: string; kind: string; cover: string; video?:boolean; onClick: () => void }) {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            className="group relative cursor-pointer overflow-hidden rounded-lg border border-border bg-white text-left transition hover:border-muted-foreground/50 hover:shadow-md dark:border-border dark:bg-muted dark:hover:border-muted-foreground/60"
            onClick={onClick}
        >
            {cover ? (
                <MediaThumbnail source={cover} kind={video?"video":"image"} alt={title} className="grid aspect-[4/3] w-full place-items-center" fallback={<span className="text-xs opacity-60">{title}</span>} />
            ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-muted p-3 text-center text-xs leading-5 text-muted-foreground dark:bg-muted dark:text-muted-foreground">{title}</div>
            )}
            <div className="p-2.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="line-clamp-1 text-xs font-medium text-foreground dark:text-foreground">{title}</span>
                    <Tag className="m-0 shrink-0 text-[10px]">{t(`assets.kinds.${kind}`)}</Tag>
                </div>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-sm font-medium text-white opacity-0 transition group-hover:bg-black/55 group-hover:opacity-100">{t("canvas.assetPicker.insert")}</div>
        </button>
    );
}

function MyAssetsTab({ acceptedKinds, onInsert }: { acceptedKinds: AcceptedKind[]; onInsert: (payload: InsertAssetPayload) => void }) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const assets = useAssetStore((state) => state.assets);
    const hydrated = useAssetStore((state) => state.hydrated);
    const userId = useAuthStore((state) => state.user?.id ?? null);
    const authReady = useAuthStore((state) => state.ready);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState("all");
    const [page, setPage] = useState(1);
    const kindOptions = useMemo(() => (acceptedKinds.length > 1 ? ["all", ...acceptedKinds] : acceptedKinds), [acceptedKinds]);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        const allowed = new Set<string>(acceptedKinds);
        return assets
            .filter((a) => allowed.has(a.kind))
            .filter((a) => kindFilter === "all" || a.kind === kindFilter)
            .filter((a) => !query || [a.title, ...(a.tags || [])].join(" ").toLowerCase().includes(query));
    }, [acceptedKinds, assets, keyword, kindFilter]);

    const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        setPage((v) => Math.min(v, maxPage));
    }, [filtered.length]);

    const handleInsert = (asset: Asset) => {
        const auth = useAuthStore.getState();
        if (!userId || !auth.ready || !useAssetStore.getState().hydrated || auth.user?.id !== userId || !isAssetAccountActive(userId)) return;
        // 3D 模型只服务于导演台，不能作为画布资源插入。
        if (asset.kind === "model") return;
        if (asset.kind === "text") {
            onInsert({ kind: "text", content: asset.data.content, title: asset.title });
        } else if (asset.kind === "video" || asset.kind === "audio") {
            onInsert({ kind: asset.kind, url: asset.data.url, storageKey: asset.data.storageKey, title: asset.title, width: asset.data.width, height: asset.data.height });
        } else {
            onInsert({ kind: "image", dataUrl: asset.data.dataUrl, storageKey: asset.data.storageKey, title: asset.title });
        }
    };

    if (!authReady || !hydrated || !isAssetAccountActive(userId)) return <div className="py-8 text-center text-sm text-stone-500">{t("canvas.loading")}</div>;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    className="w-full min-w-0 sm:w-56"
                    size="small"
                    prefix={<Search className="size-3.5 text-muted-foreground" />}
                    placeholder={t("canvas.assetPicker.search")}
                    value={keyword}
                    allowClear
                    onChange={(e) => {
                        setPage(1);
                        setKeyword(e.target.value);
                    }}
                />
                <div className="flex gap-1.5">
                    {kindOptions.map((option) => (
                        <Tag.CheckableTag
                            key={option}
                            checked={kindFilter === option}
                            className={cn("prompt-filter-tag", kindFilter === option && "is-active")}
                            onChange={() => {
                                setPage(1);
                                setKindFilter(option);
                            }}
                        >
                            {option === "all" ? t("common.all") : t(`assets.kinds.${option}`)}
                        </Tag.CheckableTag>
                    ))}
                </div>
            </div>

            {visible.length ? (
                <div className="grid grid-cols-3 gap-3 min-[480px]:grid-cols-4">
                    {visible.map((asset) => (
                        <PickerCard key={asset.id} title={asset.title} kind={asset.kind} video={asset.kind === "video" && !assetCoverUrl(asset)} cover={assetCoverUrl(asset) || (asset.kind === "video" ? asset.data.url : "")} onClick={() => handleInsert(asset)} />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.assetPicker.empty")} className="py-12" />
            )}

            {filtered.length > PAGE_SIZE && (
                <div className="flex justify-center">
                    <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} showSizeChanger={false} />
                </div>
            )}
        </div>
    );
}
