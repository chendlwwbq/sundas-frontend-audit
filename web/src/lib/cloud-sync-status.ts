export type CloudSaveStatus = 'reading' | 'pending' | 'saving' | 'saved' | 'conflict' | 'failed' | 'local-media';
export function cloudSaveStatus(input: { ready: boolean; reading: boolean; saving: boolean; dirty: boolean; conflict: boolean; error: boolean; localMedia: boolean }): CloudSaveStatus {
    if (input.conflict) return 'conflict';
    if (input.reading) return 'reading';
    if (input.error) return 'failed';
    if (!input.ready) return 'reading';
    if (input.saving) return 'saving';
    if (input.dirty) return 'pending';
    return input.localMedia ? 'local-media' : 'saved';
}

export function hasLocalMedia(value: unknown): boolean {
    if (typeof value === 'string') return /^(blob:|data:(image|audio|video)\/)/.test(value) || /^[^:]+:(user|unowned):/.test(value);
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    if (record.pendingRemoteUpload === true) return true;
    const hosted = typeof record.storageKey === 'string' && /^(private|public)\//.test(record.storageKey)
        || [record.url,record.dataUrl,record.content].some(item => typeof item === 'string' && item.startsWith('/media/'));
    return Object.entries(record).some(([key,item]) => {
        if (key === 'thumbnail' || key === 'thumbnailUrl') return false;
        if (hosted && ['url','dataUrl','content','coverUrl'].includes(key) && typeof item === 'string') return false;
        return hasLocalMedia(item);
    });
}

export const cloudSaveLabels: Record<CloudSaveStatus,string> = {
    reading:'正在读取云端',pending:'有修改待同步',saving:'正在同步',saved:'云端已保存',conflict:'存在冲突，等待处理',failed:'同步失败，点击重试','local-media':'文档已同步，媒体仍在本机',
};
