import { useEffect, useRef, useState } from "react";
import { App, Button, Empty, Modal, Pagination, Popconfirm, Spin, Tag } from "antd";
import dayjs from "dayjs";
import { FileClock, Image as ImageIcon, Trash2, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Link } from "react-router-dom";
import { formatBytes } from "@/lib/image-utils";
import { useAuthStore } from "@/stores/use-auth-store";
import { storageSources, releaseStorageSource, type StorageSource, cleanupHistoryStorage, deleteStorageMedia, fetchStorageItems, fetchStorageSummary, type StorageItem, type StorageSummary } from "@/services/api/storage";

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
    const [protectedOnly, setProtectedOnly] = useState(false);
    const [detail, setDetail] = useState<StorageItem | null>(null);
    const [cleaning, setCleaning] = useState(false);

    const loadVersion = useRef(0);
    const load = async (nextPage = page) => {
        const version = ++loadVersion.current;
        setLoading(true);
        try {
            const [nextSummary, nextItems] = await Promise.all([
                fetchStorageSummary(),
                fetchStorageItems("history_uploads", nextPage, 20, protectedOnly),
            ]);
            if (version !== loadVersion.current) return;
            setSummary(nextSummary);
            setItems(nextItems.items);
            setTotal(nextItems.total);
            setPage(nextPage);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("assets.historyLoadFailed"));
        } finally { if(version === loadVersion.current) setLoading(false); }
    };

    useEffect(() => { void load(1); }, [protectedOnly]);

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

            <div className="flex gap-2">
                <Button size="small" type={protectedOnly ? 'text' : 'default'} onClick={() => setProtectedOnly(false)}>历史文件</Button>
                <Button size="small" type={protectedOnly ? 'default' : 'text'} onClick={() => setProtectedOnly(true)}>被占用的文件</Button>
            </div>
            {detail && <SourceDialog key={detail.id} item={detail} close={() => setDetail(null)} changed={() => void load(page)} />}
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
                            {!item.canDelete && <Button size="small" onClick={() => setDetail(item)}>查看占用</Button>}
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

const sourceNames:Record<string,string> = {prompt:'提示词',promo:'站点展示',contact:'站点联系',canvas:'画布',asset:'素材库',document:'制作稿',command:'编辑历史',run:'制作记录',upscale:'超分记录',director:'导演台记录',capture:'抽帧记录',character:'人物工作流'};
function SourceDialog({item,close,changed}:{item:StorageItem;close:()=>void;changed:()=>void}) {
    const {message} = App.useApp();
    const [data,setData] = useState<Awaited<ReturnType<typeof storageSources>>>();
    const [error,setError] = useState('');
    const [busy,setBusy] = useState(false);
    useEffect(() => {
        let active=true;
        storageSources(item.id).then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(e.message);});
        return ()=>{active=false;};
    },[item.id]);
    async function release(source:StorageSource) {
        setBusy(true);
        try {
            await releaseStorageSource(item.id,source);
            changed();
            setData(await storageSources(item.id));
        } catch(e) { message.error(e instanceof Error ? e.message : '释放失败'); }
        finally { setBusy(false); }
    }
    return <Modal open title="文件占用来源" footer={null} onCancel={close}>
        {error || (!data && <Spin />)}
        {data && <div className="space-y-3">
            {data.sources.map(s=><div key={s.kind+s.owner} className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-all">{s.draft?'超分草稿':sourceNames[s.kind]} · {s.title || s.owner}</span>
                {s.kind==='canvas' && <Link to={`/canvas/${s.owner}`}>打开画布</Link>}
                {s.releasable && <Popconfirm title={s.draft?'删除这个未提交的超分草稿？':'解除这条历史对文件的占用？'}
                    description="文件仍会保留。之后删除文件可能影响历史回放。" onConfirm={()=>release(s)}>
                    <Button size="small" disabled={busy}>{s.draft?'删除草稿':'解除占用'}</Button>
                </Popconfirm>}
            </div>)}
            {data.pinned && <p>文件有固定保护。旧记录未保存完整的固定来源，需要人工核对。</p>}
            {data.active && <p>有任务正在使用或核对该文件。</p>}
            {data.disputed && <p>素材归属待核对。</p>}
            {!data.sources.length && !data.pinned && !data.active && !data.disputed && <p>{item.canDelete?'文件可删除。':'其他站点引用或占用状态已变化，请刷新列表。'}</p>}
        </div>}
    </Modal>;
}
