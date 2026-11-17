/** 返回 true 表示已使用同源授权下载；其他 URL 继续原有下载行为。 */
export function downloadCloudMedia(value: string, filename: string) {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/media/private/')) return false;
    url.searchParams.set('download', filename);
    const anchor = document.createElement('a');
    anchor.href = url.toString();
    anchor.download = filename;
    anchor.rel = 'noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
}

const pendingMediaRefresh = new WeakMap<HTMLMediaElement | HTMLImageElement, string>();

/** 只重取本站私有媒体；同一次失败不循环重试，读取成功后允许之后再次过期恢复。 */
export function refreshExpiredMedia(event: { currentTarget: HTMLMediaElement | HTMLImageElement }) {
    const video = event.currentTarget;
    const src = new URL(video.getAttribute('src') || '', window.location.origin);
    if (src.origin !== window.location.origin || !src.pathname.startsWith('/media/private/') || (video instanceof HTMLMediaElement && video.error && [1, 3].includes(video.error.code))) return;
    src.searchParams.delete('_refresh');
    const source = src.toString();
    if (pendingMediaRefresh.get(video) === source) return;
    pendingMediaRefresh.set(video, source);
    const position = video instanceof HTMLMediaElement ? video.currentTime : 0;
    src.searchParams.set('_refresh', String(Date.now()));
    const refreshedUrl = src.toString();
    if (video instanceof HTMLMediaElement) video.addEventListener('loadedmetadata', () => { if (video.src === refreshedUrl && position > 0) video.currentTime = position; }, { once: true });
    video.addEventListener(video instanceof HTMLMediaElement ? 'loadeddata' : 'load', () => { if (pendingMediaRefresh.get(video) === source) pendingMediaRefresh.delete(video); }, { once: true });
    video.src = refreshedUrl;
    if (video instanceof HTMLMediaElement) video.load();
}
