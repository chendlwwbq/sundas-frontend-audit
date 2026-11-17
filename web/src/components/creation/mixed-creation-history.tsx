import { RecordActions } from "./record-actions";
import { CreationRequest } from "./creation-conversation";
import { useEffect, useRef, useState } from "react";
import { App, Button, Drawer } from "antd";
import { useNavigate } from "react-router-dom";
import { GenerationHistoryPager, mergeGenerationHistory, type RestoredLog } from "@/services/api/generation-history";
import { creationStatus } from "./creation-status";
import { Lightbox } from "@astryxdesign/core/Lightbox";
import { saveAs } from "file-saver";
import { downloadCloudMedia, refreshExpiredMedia } from "@/services/media-download";
import { imageLogStorage } from "@/lib/image-log-storage";
import { videoLogStorage } from "@/lib/video-log-storage";
import { resolveImageUrl } from "@/services/image-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import { useAssetStore } from "@/stores/use-asset-store";

async function mergedHistory(owner: string, mode: "image" | "video", cloud: ReturnType<GenerationHistoryPager["snapshot"]>) {
    const store = mode === "image" ? imageLogStorage : videoLogStorage;
    const local = await store.list<RestoredLog>(owner).catch(() => [] as RestoredLog[]);
    const resolved = await Promise.all(local.map(async log => ({
        ...log,
        images: await Promise.all((log.images || []).map(async image => ({ ...image, dataUrl: await resolveImageUrl(image.storageKey, image.dataUrl) }))),
        video: log.video ? { ...log.video, url: await resolveMediaUrl(log.video.storageKey, log.video.url) } : undefined,
    })));
    return mergeGenerationHistory(resolved, cloud.logs, cloud.hiddenTaskIds);
}

// The active page keeps its original submission engine and result actions.
// The other media type is read-only until the user chooses to work with it.
export function useOtherCreationHistory(owner: string | undefined, epoch: number, mode: "image" | "video") {
    const [state, setState] = useState<{ owner?: string; epoch: number; logs: RestoredLog[]; more: boolean; error: string }>({ epoch, logs: [], more: false, error: "" });
    const [pager, setPager] = useState<GenerationHistoryPager>();
    const currentPager = useRef<GenerationHistoryPager | undefined>(undefined);
    useEffect(() => {
        if (!owner) return;
        const next = new GenerationHistoryPager(owner, mode);
        currentPager.current = next;
        setPager(next);
        setState({ owner, epoch, logs: [], more: false, error: "" });
        let active = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const refresh = () => {
            let error = "";
            void next.refresh().catch(() => { error = "云端记录暂未加载，显示本地记录"; return next.snapshot(); }).then(async result => {
            const logs = await mergedHistory(owner, mode, result);
            if (active) {
                setState({ owner, epoch, logs, more: result.hasMore, error });
                clearTimeout(timer);
                if (result.logs.some(log => log.status === "pending")) timer = setTimeout(refresh, 5000);
            }
        }).catch(() => { if (active) setState(current => ({ ...current, owner, epoch, error: "另一种创作记录暂未加载" })); }); };
        refresh();
        window.addEventListener("focus", refresh);
        return () => { active = false; currentPager.current = undefined; clearTimeout(timer); window.removeEventListener("focus", refresh); };
    }, [owner, epoch, mode]);
    const current = state.owner === owner && state.epoch === epoch;
    const loadMore = async () => {
        if (!pager || !owner) return;
        try {
            const result = await pager.loadMore();
            const logs = await mergedHistory(owner, mode, result);
            if (currentPager.current !== pager) return;
            setState({ owner, epoch, logs, more: result.hasMore, error: "" });
        } catch (error) {
            if (currentPager.current === pager) setState(value => ({ ...value, error: "加载更早记录失败，请重试" }));
            throw error;
        }
    };
    return { logs: current ? state.logs : [], more: current && state.more, error: current ? state.error : "", loadMore };
}

export function OtherCreationRecord({ log, mode, disabled, onUseImage }: { log: RestoredLog; mode: "image" | "video"; disabled?: boolean; onUseImage?: (image: RestoredLog["images"][number]) => void }) {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const addAsset = useAssetStore(state => state.addAsset);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const download = (url: string, name: string) => {
        if (!downloadCloudMedia(url, name)) saveAs(url, name);
    };
    return <article id={`creation-record-${log.id}`} className="astryx-chat-message mb-12 max-w-[620px]">
        <CreationRequest prompt={log.prompt} />
        <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{mode === "image" ? "图片生成" : "视频生成"}</span><span>{log.model}</span><span>{log.time}</span><span>{log.reconciliationRequired ? "待核对" : creationStatus(log.status)}</span></div>
        {log.images.length > 0 && <div className={`grid gap-3 ${log.images.length > 1 ? "sm:grid-cols-2" : ""}`}>{log.images.map((image, index) => <div key={image.id}>
            <button type="button" className="block w-full" aria-label={`预览图片 ${index + 1}`} onClick={() => setPreviewIndex(index)}><img src={image.dataUrl} alt={log.prompt} loading="lazy" onError={refreshExpiredMedia} className="max-h-[65vh] w-full rounded-lg object-contain" /></button>
            <RecordActions primary={{ key: "continue", label: "继续改图", disabled, run: () => navigate(`/create?mode=image&record=${encodeURIComponent(log.id)}&action=continue&image=${index}`) }} secondary={onUseImage ? { key: "video", label: "用于视频", disabled, run: () => onUseImage(image) } : undefined} more={[
                { key: "download", label: "下载图片", run: () => download(image.dataUrl, `image-${index + 1}.png`) },
                { key: "asset", label: "加入素材库", run: () => { const id = addAsset({ kind: "image", title: log.title, coverUrl: image.dataUrl, tags: [], source: "创作记录", data: image, metadata: { prompt: log.prompt, source: "image-page" } }); if (id) message.success("已加入素材库"); } },
            ]} />
        </div>)}</div>}
        {previewIndex != null && <Lightbox isOpen onOpenChange={open => { if (!open) setPreviewIndex(null); }} media={log.images.map(image => ({ src: image.dataUrl, alt: log.prompt }))} defaultIndex={previewIndex} hasZoom />}
        {log.video && <><video src={log.video.url} onError={refreshExpiredMedia} controls playsInline preload="none" className="aspect-video w-full rounded-lg bg-black object-contain" onPlay={event => { const current = event.currentTarget; current.closest(".creation-stream")?.querySelectorAll("video").forEach(video => { if (video !== current) video.pause(); }); }} /><Button size="small" type="text" onClick={() => download(log.video!.url, "video.mp4")}>下载视频</Button></>}
        {log.error && <p className="mt-2 text-sm text-muted-foreground">{log.error}</p>}
        {log.video && <Button size="small" type="text" onClick={() => { const id = addAsset({ kind: "video", title: log.title, coverUrl: "", tags: [], source: "创作记录", data: log.video!, metadata: { prompt: log.prompt, source: "video-page" } }); if (id) message.success("已加入素材库"); }}>加入我的资产</Button>}
        <RecordActions archiveUrl={log.video?.url} primary={mode === "video" ? { key: "continue", label: "调整后重生成", disabled, run: () => navigate(`/create?mode=video&record=${encodeURIComponent(log.id)}&action=continue`) } : undefined} secondary={{ key: "details", label: "生成详情", run: () => setDetailsOpen(true) }} label="更多生成记录操作" more={[
            { key: "edit", label: "编辑原描述与参数", disabled, run: () => navigate(`/create?mode=${mode}&record=${encodeURIComponent(log.id)}&action=edit`) },
        ]} />
        <Drawer title="生成详情" open={detailsOpen} onClose={() => setDetailsOpen(false)}>
            <dl className="space-y-4 text-sm">
                <div><dt className="text-muted-foreground">提示词</dt><dd className="whitespace-pre-wrap break-words">{log.prompt}</dd></div>
                <div><dt className="text-muted-foreground">模型与规格</dt><dd>{log.model} · {log.size || "比例未记录"} · {mode === "video" ? `${log.resolution || "清晰度未记录"} / ${log.seconds || "未记录"} 秒` : log.config.quality || "质量未记录"}</dd></div>
                <div><dt className="text-muted-foreground">状态</dt><dd>{log.reconciliationRequired ? "待核对" : creationStatus(log.status)} · {log.time}</dd></div>
                <div><dt className="text-muted-foreground">实际积分</dt><dd>{log.creditsCharged == null ? "尚未结算或暂不可用" : `${log.creditsCharged} 积分`}</dd></div>
                {(log.referenceHistoryUnknown || !!log.referenceCount) && <p className="text-muted-foreground">云端历史未提供完整参考素材，重新编辑时请核对。</p>}
            </dl>
        </Drawer>
    </article>;
}
