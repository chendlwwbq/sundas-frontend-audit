type UploadOptions = { owner: string; signal: AbortSignal; onProgress?: (progress: number) => void };

export async function tryDirectMediaUpload(blob: Blob, options: UploadOptions): Promise<Response | null> {
    const headers = { 'Content-Type': 'application/json', 'X-Sundas-User': options.owner };
    const config = await fetch('/api/uploads/config', { credentials: 'include', signal: options.signal, headers: { 'X-Sundas-User': options.owner } });
    if (!config.ok) return config;
    if (!(await config.json()).direct) return null;
    // 图片已由上传入口尝试标准化；未支持的特殊格式仍走现有服务器转换。
    if (/image\/(heic|heif|avif|tiff|bmp)/i.test(blob.type)) return null;
    const prepared = await fetch('/api/uploads/prepare', { method: 'POST', credentials: 'include', headers,
        body: JSON.stringify({ bytes: blob.size }), signal: options.signal });
    if (!prepared.ok) return prepared;
    const upload = await prepared.json() as { id: string; url: string; headers: Record<string, string> };
    const sent = await new Promise<number>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const abort = () => xhr.abort();
        xhr.open('PUT', upload.url);
        // OSS 不接收本站 Cookie 或用户会话头。
        xhr.withCredentials = false;
        Object.entries(upload.headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
        xhr.upload.onprogress = event => { if (event.lengthComputable) options.onProgress?.(Math.min(95, Math.round(event.loaded / event.total * 95))); };
        xhr.onload = () => resolve(xhr.status);
        xhr.onerror = () => reject(new TypeError('文件上传失败，请检查网络后重试'));
        xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
        xhr.onloadend = () => options.signal.removeEventListener('abort', abort);
        if (options.signal.aborted) { reject(new DOMException('Upload aborted', 'AbortError')); return; }
        options.signal.addEventListener('abort', abort, { once: true });
        options.onProgress?.(0);
        xhr.send(blob);
    });
    if (sent < 200 || sent >= 300) return new Response(JSON.stringify({ message: '文件上传失败，请重新上传' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    return fetch(`/api/uploads/${encodeURIComponent(upload.id)}/complete`, { method: 'POST', credentials: 'include', headers, body: '{}', signal: options.signal });
}
