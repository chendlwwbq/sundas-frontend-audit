import { lazyStore } from "@/lib/localforage-store";

const keyFor = (owner: string, id: string) => `${owner}:${id}`;

// localforage 按需加载，避免把驱动代码算进首屏。
const store = lazyStore("video_generation_logs");

export const videoLogStorage = {
    set: <T>(owner: string, id: string, value: T) => store.setItem(keyFor(owner, id), value),
    remove: (owner: string, id: string) => store.removeItem(keyFor(owner, id)),
    async list<T>(owner: string) {
        const items: T[] = [];
        await store.iterate<T, void>((value, key) => { if (key.startsWith(`${owner}:`)) items.push(value); });
        return items;
    },
};
