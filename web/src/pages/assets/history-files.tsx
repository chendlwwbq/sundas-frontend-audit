import { useEffect, useState } from "react";
import { App, Button, Empty, Pagination, Popconfirm, Spin, Tag } from "antd";
import dayjs from "dayjs";
import { FileClock, Image as ImageIcon, Trash2, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatBytes } from "@/lib/image-utils";
import { useAuthStore } from "@/stores/use-auth-store";
import { cleanupHistoryStorage, deleteStorageMedia, fetchStorageItems, fetchStorageSummary, type StorageItem, type StorageSummary } from "@/services/api/storage";

export function HistoryFilesPanel() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const refreshWallet = useAuthStore(state => state.refreshWallet);
    const [summary, setSummary] = useState<StorageSummary | null>(null);
    const [items, setItems] = useState<StorageItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [cleaning, setCleaning] = useState(false);

    const load = async (nextPage = page) => {
        setLoading(true);
        try {
            const [nextSummary, nextItems] = await Promise.all([
                fetchStorageSummary(),
                fetchStorageItems("history_uploads", nextPage, 20),
            ]);
            setSummary(nextSummary);
            setItems(nextItems.items);
            setTotal(nextItems.total);
            setPage(nextPage);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("assets.historyLoadFailed"));
        } finally { setLoading(false); }
    };

    useEffect(() => { void load(1); }, []);

    const remove = async (item: StorageItem) => {
        setDeleting(item.id);
        try {
            await deleteStorageMedia(item.id);
            message.success(t("assets.historyCleaned"));
            await load(page);
            await refreshWallet().catch(() => undefined);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("assets.historyCleanupFailed"));
        } finally { setDeleting(null); }
    };

    const cleanupAll = async () => {
        setCleaning(true);
        try {
            const result = await cleanupHistoryStorage();
            if (result.failed) message.warning(t("assets.historyCleanupAllPartial", { count: result.deleted, failed: result.failed }));
            else message.success(t("assets.historyCleanupAllDone", { count: result.deleted }));
            await load(1);
            await refreshWallet().catch(() => undefined);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("assets.historyCleanupFailed"));
        } finally { setCleaning(false); }
    };

    const percent = summary?.limitBytes ? Math.min(100, summary.usedBytes / summary.limitBytes * 100) : 0;

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-sm font-medium"><FileClock className="size-4" />{t("assets.historyTitle")}</span>
                    <div className="flex items-center gap-3">
                        <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(summary?.usedBytes ?? 0)} / {formatBytes(summary?.limitBytes ?? 0)}</span>
                        <Popconfirm
                            title={t("assets.historyCleanupAllConfirm", { count: summary?.cleanableFiles ?? 0, size: formatBytes(summary?.cleanableBytes ?? 0) })}
                            okText={t("assets.historyCleanupAll")}
                            cancelText={t("common.cancel")}
                            onConfirm={() => void cleanupAll()}
                            disabled={!summary?.cleanableFiles}
                        >
                            <Button danger size="small" icon={<Trash2 className="size-3.5" />} loading={cleaning} disabled={!summary?.cleanableFiles}>
                                {t("assets.historyCleanupAll")}
                            </Button>
                        </Popconfirm>
                    </div>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("assets.historyDescription")}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-[#D8FF3E]" style={{ width: `${percent}%` }} />
                </div>
            </div>

            <Spin spinning={loading}>
                <div className="space-y-2">
                    {items.length ? items.map(item => (
                        <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card/40 px-3 py-2.5">
                            {item.kind === "image" ? (
                                <img src={item.url} alt={item.name} loading="lazy" className="size-12 shrink-0 rounded-lg border border-border bg-muted object-cover" />
                            ) : (
                                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                    {item.kind === "video" ? <Video className="size-4" /> : <ImageIcon className="size-4" />}
                                </span>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-xs text-foreground">{item.name}</div>
                                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.mime} · {formatBytes(item.bytes)} · {dayjs(item.createdAt).format("YYYY-MM-DD HH:mm")}</div>
                            </div>
                            {item.pinned ? <Tag className="m-0">{t("assets.historyInUse")}</Tag> : null}
                            {item.canDelete ? (
                                <Popconfirm title={t("assets.historyCleanupConfirm")} okText={t("assets.historyCleanup")} cancelText={t("common.cancel")} onConfirm={() => void remove(item)}>
                                    <Button danger type="text" size="small" loading={deleting === item.id} icon={<Trash2 className="size-3.5" />}>{t("assets.historyCleanup")}</Button>
                                </Popconfirm>
                            ) : null}
                        </div>
                    )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("assets.historyEmpty")} />}
                </div>
            </Spin>

            {total > 20 ? <Pagination className="text-center" size="small" current={page} pageSize={20} total={total} showSizeChanger={false} onChange={(next) => void load(next)} /> : null}
            <p className="text-[11px] text-muted-foreground">{t("assets.historyHint")}</p>
        </div>
    );
}
