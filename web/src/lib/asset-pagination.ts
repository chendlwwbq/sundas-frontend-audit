export type AssetPage<T> = { assets: T[]; nextCursor: string | null; hasMore: boolean };

// No store or baseline mutations until the entire traversal succeeds.
export async function readAllAssetPages<T extends { id: string; version: number }>(read: (cursor?: string) => Promise<AssetPage<T>>, active: () => boolean): Promise<T[]> {
    const assets = new Map<string,T>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
        if (!active()) throw new Error('素材读取会话已变化');
        const page = await read(cursor);
        if (!active()) throw new Error('素材读取会话已变化');
        if (!Array.isArray(page.assets) || typeof page.hasMore !== 'boolean'
            || (page.hasMore ? typeof page.nextCursor !== 'string' || !page.nextCursor || !page.assets.length : page.nextCursor !== null)) throw new Error('素材分页响应不完整，请重新读取');
        for (const asset of page.assets) {
            const previous = assets.get(asset.id);
            if (!previous || asset.version >= previous.version) assets.set(asset.id,asset);
        }
        if (!page.hasMore) break;
        if (cursors.has(page.nextCursor!)) throw new Error('素材分页游标未推进，请重新读取');
        cursor = page.nextCursor!;
        cursors.add(cursor);
    } while (true);
    return [...assets.values()];
}
