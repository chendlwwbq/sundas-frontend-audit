import { Image, Popconfirm } from "antd";
import { Maximize2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { resolveImageUrl } from "@/services/image-storage";
import type { DirectorScreenshot } from "@/types/director";

export function DirectorScreenshotGallery({ screenshots, title = "相机截图", compact = false, onRemove }: { screenshots: DirectorScreenshot[]; title?: string; compact?: boolean; onRemove?: (screenshot: DirectorScreenshot) => void }) {
    return <section aria-label="相机截图" className={compact ? "space-y-2" : "space-y-2 border-t pt-3"} style={compact ? undefined : { borderColor: "var(--director-sequencer-border)" }}>
        <h3 className="text-sm font-medium">{title}</h3>
        {screenshots.length ? <div className="grid grid-cols-2 gap-2">{screenshots.map((screenshot) => <ScreenshotCard key={screenshot.id} screenshot={screenshot} compact={compact} onRemove={onRemove} />)}</div> : <p className="text-xs opacity-55">暂无截图</p>}
    </section>;
}

function ScreenshotCard({ screenshot, compact, onRemove }: { screenshot: DirectorScreenshot; compact: boolean; onRemove?: (screenshot: DirectorScreenshot) => void }) {
    const [url, setUrl] = useState(screenshot.url);
    const [previewOpen, setPreviewOpen] = useState(false);
    useEffect(() => {
        let active = true;
        void resolveImageUrl(screenshot.storageKey, screenshot.url, { cacheMiss: true }).then((resolved) => { if (active) setUrl(resolved); }).catch(() => {});
        return () => { active = false; };
    }, [screenshot.storageKey, screenshot.url]);
    return <div className={`group relative min-w-0 overflow-hidden rounded-lg border transition-colors hover:border-white/25 ${compact ? "max-w-28" : ""}`} style={{ borderColor: "var(--director-sequencer-border)" }}>
        <Image
            src={url}
            alt={screenshot.name}
            width="100%"
            className="aspect-video cursor-zoom-in object-cover"
            preview={{ visible: previewOpen, onVisibleChange: setPreviewOpen, mask: null }}
        />
        {/* hover 操作层：完整查看 + 删除 */}
        <div className="pointer-events-none absolute inset-x-1.5 top-1.5 z-1 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
            <button
                type="button"
                aria-label={`完整查看 ${screenshot.name}`}
                title="完整查看"
                className="grid size-6 place-items-center rounded-full bg-black/65 text-white/85 backdrop-blur transition hover:bg-black/85 hover:text-white"
                onClick={(event) => { event.stopPropagation(); setPreviewOpen(true); }}
            >
                <Maximize2 className="size-3" />
            </button>
            {onRemove ? (
                <Popconfirm
                    title="删除截图"
                    description="删除后不可恢复，确定删除吗？"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={(event) => { event?.stopPropagation(); onRemove(screenshot); }}
                    onCancel={(event) => event?.stopPropagation()}
                >
                    <button
                        type="button"
                        aria-label={`删除 ${screenshot.name}`}
                        title="删除"
                        className="grid size-6 place-items-center rounded-full bg-black/65 text-white/85 backdrop-blur transition hover:bg-red-600 hover:text-white"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <Trash2 className="size-3" />
                    </button>
                </Popconfirm>
            ) : null}
        </div>
        <span className={`block truncate py-1 text-xs ${compact ? "px-0.5 opacity-60" : "px-2"}`} title={screenshot.name}>{screenshot.name}</span>
    </div>;
}
