import { useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { Play } from 'lucide-react';
import { resolveImageUrl } from '@/services/image-storage';
import { resolveMediaUrl, uploadMediaFile } from '@/services/file-storage';
import { uploadImage } from '@/services/image-storage';
import { useAuthStore } from '@/stores/use-auth-store';
import { useMediaPreview } from '@/hooks/use-media-preview';
import type { ProductionMedia } from '../../../../shared/production';
import { useProduction } from './production-context';

export function ProductionMediaPreview({ media, onDuration, seek }: { media?: ProductionMedia; onDuration?: (durationMs: number) => void; seek?: { timeMs: number; nonce: number } }) {
    const [url, setUrl] = useState(''), [active, setActive] = useState(false);
    const [visible, setVisible] = useState(false), container = useRef<HTMLDivElement>(null);
    const player = useRef<HTMLMediaElement | null>(null);
    const owner = useAuthStore(state => state.user?.id), epoch = useAuthStore(state => state.sessionEpoch);
    const thumbnail = useMediaPreview(visible && media?.kind !== 'audio' ? media?.url : undefined);
    useEffect(() => { const element = container.current; if (!element) return; if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; } const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting))); observer.observe(element); return () => observer.disconnect(); }, []);
    useEffect(() => { setUrl(''); setActive(false); }, [media?.url, media?.storageKey, media?.kind, owner, epoch]);
    useEffect(() => {
        let mounted = true;
        if (media && (visible || active)) void (media.kind === 'image' ? resolveImageUrl(media.storageKey, media.url) : resolveMediaUrl(media.storageKey, media.url)).then(value => { if (mounted) setUrl(value); }).catch(() => {});
        return () => { mounted = false; };
    }, [media?.url, media?.storageKey, media?.kind, owner, epoch, visible, active]);
    useEffect(() => { const element = player.current; return () => { if (element) { element.pause(); element.removeAttribute('src'); element.load(); } }; }, [active, url]);
    useEffect(() => { if (!seek) return; setActive(true); const element = player.current; if (element && element.readyState > 0) { element.currentTime = seek.timeMs / 1000; void element.play().catch(() => {}); } }, [seek?.nonce]);
    if (!media) return <div ref={container} />;
    const metadata = (element: HTMLMediaElement) => { if (seek) element.currentTime = seek.timeMs / 1000; if (Number.isFinite(element.duration) && element.duration > 0 && !media.durationMs) onDuration?.(Math.round(element.duration * 1000)); };
    return <div ref={container} className="min-h-8">{media.kind === 'image' ? (visible && (thumbnail.url || (!thumbnail.cloud && url)) ? <img src={thumbnail.url || url} alt="画面预览" className="max-h-44 w-full rounded object-contain" loading="lazy" decoding="async" /> : thumbnail.error ? <Button type="text" size="small" onClick={thumbnail.retry}>重新加载缩略图</Button> : <span className="text-xs">画面预览</span>) : !active ? <div>{visible && thumbnail.url && <img src={thumbnail.url} alt="视频封面" className="max-h-40 w-full object-contain" loading="lazy" />}<Button type="text" icon={<Play size={14} />} disabled={!url} onClick={() => setActive(true)}>播放{media.kind === 'audio' ? '音频' : '视频'}{media.durationMs ? ` · ${(media.durationMs / 1000).toFixed(2)} 秒` : ''}</Button></div> : media.kind === 'audio' ? <audio ref={element => { player.current = element; }} src={url} controls autoPlay preload="none" className="w-full" onLoadedMetadata={event => metadata(event.currentTarget)} /> : <video ref={element => { player.current = element; }} src={url} controls autoPlay preload="none" className="max-h-56 w-full" onLoadedMetadata={event => metadata(event.currentTarget)} />}</div>;
}

export function ProductionMediaUpload({ kind, onMedia }: { kind: ProductionMedia['kind']; onMedia: (media: ProductionMedia) => void }) {
    const { error } = useProduction();
    const input = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false);
    const callback = useRef(onMedia); callback.current = onMedia;
    const scope = useRef(0);
    useEffect(() => () => { scope.current++; }, []);
    return <><input ref={input} className="hidden" type="file" accept={`${kind}/*`} onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        const token = scope.current, auth = useAuthStore.getState(), owner = auth.user?.id, epoch = auth.sessionEpoch;
        const current = () => token === scope.current && useAuthStore.getState().user?.id === owner && useAuthStore.getState().sessionEpoch === epoch;
        setBusy(true);
        try {
            const result = kind === 'image' ? await uploadImage(file, { expectedOwner: owner }) : await uploadMediaFile(file, kind, { expectedOwner: owner });
            if (current()) callback.current({ kind, ...(result.storageKey ? { storageKey: result.storageKey } : { url: result.url }), ...('durationMs' in result && result.durationMs ? { durationMs: result.durationMs } : {}) });
        } catch (e) { if (current()) error(e instanceof Error ? e.message : '素材上传失败'); }
        finally { if (current()) setBusy(false); }
    }} /><Button type="text" size="small" loading={busy} onClick={() => input.current?.click()}>上传{kind === 'image' ? '图片' : kind === 'audio' ? '音频' : '视频'}</Button></>;
}
