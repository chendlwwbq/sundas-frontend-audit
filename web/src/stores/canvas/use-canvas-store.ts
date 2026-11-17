import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import i18n from "@/i18n";
import { localForageStorage } from "@/lib/localforage-storage";
import { nextUpdatedAt } from "@/lib/next-updated-at";
import { createSerializedWriter } from "@/lib/serialized-writer";
import type { DirectorScene } from "@/types/director";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "@/types/canvas";
import type { ProductionDocument } from "../../../../shared/production";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
    production?: ProductionDocument;
    /** 导演台场景：跟随画布项目一起持久化，一个项目可存多条镜头场景。 */
    directorScenes?: DirectorScene[];
};

export type CanvasDeletedProject = {
    id: string;
    deletedAt: string;
};

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    deletedProjects: CanvasDeletedProject[];
    createProject: (title?: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    clearDeletedProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[], deletedProjects?: CanvasDeletedProject[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport" | "production" | "directorScenes">>) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "sundas:canvas_store";
export function isCanvasAccountActive(userId: string | null) {
    return useCanvasStore.persist.getOptions().name === (userId ? `${CANVAS_STORE_KEY}:${userId}` : CANVAS_STORE_KEY);
}
type PersistedCanvasState = Pick<CanvasStore, "projects" | "deletedProjects">;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedCanvasState | null = null;
let switchingCanvas = false;
let canvasHydrationError: unknown;
const canvasWrites = createSerializedWriter();

function writeCanvas(name: string, value: string) {
    return canvasWrites.write(() => localForageStorage.setItem(name, value));
}

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<CanvasStore>;
        queuedPersistState = parsed.state as PersistedCanvasState;
        return parsed;
    },
    setItem: (name, value) => {
        if (switchingCanvas) return;
        const nextState = value.state as PersistedCanvasState;
        if (queuedPersistState && queuedPersistState.projects === nextState.projects && queuedPersistState.deletedProjects === nextState.deletedProjects) return;
        const deletedChanged = Boolean(queuedPersistState && queuedPersistState.deletedProjects !== nextState.deletedProjects);
        queuedPersistState = nextState;
        if (saveTimer) clearTimeout(saveTimer);
        if (deletedChanged) {
            saveTimer = null;
            void writeCanvas(name, JSON.stringify(value)).catch((error) => console.error("画布本地保存失败", error));
            return;
        }
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void writeCanvas(name, JSON.stringify(value)).catch((error) => console.error("画布本地保存失败", error));
        }, 400);
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

function nextProjectTitle(projects: CanvasProject[]) {
    let highest = 0;
    for (const project of projects) {
        const match = project.title.match(/(\d+)\s*$/);
        if (match) highest = Math.max(highest, Number(match[1]));
    }
    return i18n.t("canvas.defaultTitle", { count: Math.max(projects.length + 1, highest + 1) });
}

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            deletedProjects: [],
            createProject: (title) => {
                const now = new Date().toISOString();
                const id = crypto.randomUUID();
                const project: CanvasProject = {
                    id,
                    title: title?.trim() || nextProjectTitle(get().projects),
                    createdAt: now,
                    updatedAt: now,
                    nodes: [],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "dots",
                    showImageInfo: false,
                    viewport: initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return id;
            },
            importProject: (source) => {
                const now = new Date().toISOString();
                const project: CanvasProject = {
                    id: crypto.randomUUID(),
                    title: source.title || i18n.t("canvas.project.imported"),
                    createdAt: source.createdAt || now,
                    updatedAt: now,
                    nodes: source.nodes || [],
                    connections: source.connections || [],
                    chatSessions: source.chatSessions || [],
                    activeChatId: source.activeChatId || null,
                    backgroundMode: source.backgroundMode || "dots",
                    showImageInfo: source.showImageInfo || false,
                    viewport: source.viewport || initialViewport,
                    ...(source.production ? { production: source.production } : {}),
                    ...(source.directorScenes ? { directorScenes: source.directorScenes } : {}),
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return project.id;
            },
            openProject: (id) => {
                return get().projects.find((item) => item.id === id) || null;
            },
            renameProject: (id, title) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: nextUpdatedAt(project.updatedAt) } : project)),
                })),
            deleteProjects: (ids) =>
                set((state) => {
                    const now = new Date().toISOString();
                    const removing = new Set(ids);
                    const projects = state.projects.filter((project) => !removing.has(project.id));
                    const deletedProjects = [...state.deletedProjects.filter((item) => !removing.has(item.id)), ...ids.map((id) => ({ id, deletedAt: now }))];
                    return { projects, deletedProjects };
                }),
            clearDeletedProjects: (ids) =>
                set((state) => {
                    const removing = new Set(ids);
                    return { deletedProjects: state.deletedProjects.filter((item) => !removing.has(item.id)) };
                }),
            replaceProjects: (projects, deletedProjects = []) => set({ projects, deletedProjects }),
            updateProject: (id, patch) =>
                set((state) => {
                    const current = state.projects.find(project => project.id === id);
                    if (!current || Object.entries(patch).every(([key, value]) => current[key as keyof CanvasProject] === value)) return state;
                    return { projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch, updatedAt: nextUpdatedAt(project.updatedAt) } : project)) };
                }),
        }),
        {
            name: CANVAS_STORE_KEY,
            skipHydration: true,
            storage: canvasStorage,
            partialize: (state) =>
                ({
                    projects: state.projects,
                    deletedProjects: state.deletedProjects,
                }) as StorageValue<CanvasStore>["state"],
            onRehydrateStorage: () => (_state, error) => {
                canvasHydrationError = error;
                if (!error) useCanvasStore.setState({ hydrated: true });
            },
        },
    ),
);

export async function flushCanvasAccount() {
    const previous = useCanvasStore.persist.getOptions().name;
    if (!previous?.trim()) throw new Error("画布缓存标识缺失，已停止保存和切换账户");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    await canvasWrites.flush();
    if (previous !== CANVAS_STORE_KEY && queuedPersistState) {
        await writeCanvas(previous, JSON.stringify({ state: queuedPersistState, version: 0 }));
    }
}

export async function switchCanvasAccount(userId: string | null, alreadyFlushed = false) {
    if (!alreadyFlushed) await flushCanvasAccount();
    switchingCanvas = true;
    try {
        queuedPersistState = null;
        useCanvasStore.setState({ projects: [], deletedProjects: [], hydrated: false });
        useCanvasStore.persist.setOptions({ name: userId ? `${CANVAS_STORE_KEY}:${userId}` : CANVAS_STORE_KEY });
        if (userId) {
            canvasHydrationError = undefined;
            await useCanvasStore.persist.rehydrate();
            if (canvasHydrationError) throw canvasHydrationError;
        }
    } finally {
        switchingCanvas = false;
    }
}
