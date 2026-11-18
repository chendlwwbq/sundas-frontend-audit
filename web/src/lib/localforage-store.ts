import type localforageType from "localforage";

export type LocalForageInstance = ReturnType<typeof localforageType.createInstance>;

/**
 * localforage 驱动按需加载：只有真正读写本地缓存时才下载它，
 * 首屏不为这 30KB+ 的 IndexedDB/WebSQL 适配层买单。
 * 加载失败时清掉缓存的 Promise，下一次调用可以重试。
 */
let driver: Promise<typeof localforageType> | null = null;

export function loadLocalforage(): Promise<typeof localforageType> {
    if (!driver) {
        driver = import("localforage").then((module) => module.default);
        driver.catch(() => {
            driver = null;
        });
    }
    return driver;
}

const instances = new Map<string, Promise<LocalForageInstance>>();

/** 取（并缓存）某个 name/storeName 组合的实例。 */
export function getLocalForageStore(storeName: string, name = "sundas"): Promise<LocalForageInstance> {
    const key = `${name}::${storeName}`;
    const cached = instances.get(key);
    if (cached) return cached;
    const created = loadLocalforage().then((localforage) => localforage.createInstance({ name, storeName }));
    instances.set(key, created);
    created.catch(() => instances.delete(key));
    return created;
}

export type LazyStore = Pick<LocalForageInstance, "getItem" | "setItem" | "removeItem" | "iterate">;

/**
 * 与 `localforage.createInstance()` 行为一致的懒加载代理：
 * 调用点不需要改成 `await`，每次方法调用的返回值仍然是原来的 Promise。
 */
export function lazyStore(storeName: string, name = "sundas"): LazyStore {
    const withStore = <T>(run: (store: LocalForageInstance) => T | Promise<T>): Promise<T> => getLocalForageStore(storeName, name).then(run);
    const api = {
        getItem: <T>(key: string) => withStore((store) => store.getItem<T>(key)),
        setItem: (key: string, value: unknown) => withStore((store) => store.setItem(key, value)),
        removeItem: (key: string) =>
            withStore(async (store) => {
                await store.removeItem(key);
            }),
        iterate: <T, U>(callback: (value: T, key: string, iterationNumber: number) => U) => withStore((store) => store.iterate<T, U>(callback)),
    };
    return api as LazyStore;
}
