import { lazyStore } from "@/lib/localforage-store";

// localforage 按需加载，首屏不下载驱动代码。
const store = lazyStore("image_generation_logs");
const keyFor = (owner: string, id: string) => `${owner}:${id}`;
export const imageLogStorage = {
    set: <T>(owner: string, id: string, value: T) => store.setItem(keyFor(owner, id), value),
    remove: (owner: string, id: string) => store.removeItem(keyFor(owner, id)),
    async list<T>(owner: string) {
        const items: T[] = [];
        await store.iterate<T, void>((value, key) => { if (key.startsWith(`${owner}:`)) items.push(value); });
        return items;
    },
};
