export type ProjectSyncBaseline = { version: number; updatedAt: string };

export function decideProjectMerge(localUpdatedAt: string, remote: { version: number; updatedAt: string } | null, base?: ProjectSyncBaseline, contentsEqual = false) {
    if (!remote) {
        if (!base) return "local";
        return localUpdatedAt === base.updatedAt ? "deleted" : "conflict";
    }
    if (!base) return contentsEqual ? "same" : "conflict";
    const localChanged = localUpdatedAt !== base.updatedAt;
    const remoteChanged = remote.version !== base.version;
    if (localChanged && remoteChanged) return contentsEqual ? "same" : "conflict";
    if (remoteChanged) return "remote";
    if (localChanged) return "local";
    return "same";
}
