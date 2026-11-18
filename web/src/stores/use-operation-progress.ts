import { create } from "zustand";
import { nanoid } from "nanoid";

export type OperationPhase = "preparing" | "transferring" | "processing" | "done" | "error";

export type OperationProgress = {
    id: string;
    title: string;
    detail: string;
    phase: OperationPhase;
    totalBytes?: number;
    loadedBytes?: number;
    totalFiles?: number;
    doneFiles?: number;
    startedAt: number;
    updatedAt: number;
};

type ProgressStore = { entries: Record<string, OperationProgress>; remove: (id: string) => void };

/**
 * 操作进度（sundas 精简版）。
 *
 * BeefTV 这套 store 还带「画布节点任务」聚合与速率采样；sundas 目前只有导演台
 * 导出白膜视频会用到它，所以只保留 startOperation 的进度契约，
 * 供调用方上报进度/完成/失败，UI 侧按需读取 entries。
 */
export const useOperationProgress = create<ProgressStore>((set) => ({
    entries: {},
    remove: (id) =>
        set((state) => {
            const entries = { ...state.entries };
            delete entries[id];
            return { entries };
        }),
}));

export function startOperation(title: string, options: { detail?: string; totalBytes?: number; totalFiles?: number } = {}) {
    const id = nanoid();
    const startedAt = Date.now();
    let finished = false;

    const patch = (next: Partial<OperationProgress>) => {
        if (finished) return;
        useOperationProgress.setState((state) => {
            const previous = state.entries[id];
            if (!previous) return state;
            return { entries: { ...state.entries, [id]: { ...previous, ...next, updatedAt: Date.now() } } };
        });
    };

    useOperationProgress.setState((state) => ({
        entries: {
            ...state.entries,
            [id]: {
                id,
                title,
                detail: options.detail || "正在准备文件",
                phase: "preparing",
                totalBytes: options.totalBytes,
                totalFiles: options.totalFiles,
                startedAt,
                updatedAt: startedAt,
            },
        },
    }));

    const settle = (phase: "done" | "error", detail: string) => {
        patch({ phase, detail });
        finished = true;
        if (phase === "done") window.setTimeout(() => useOperationProgress.getState().remove(id), 4500);
    };

    return {
        update: patch,
        progress: (loaded: number, total?: number) =>
            patch({ loadedBytes: loaded, totalBytes: total, phase: total && loaded >= total ? "processing" : "transferring", detail: total && loaded >= total ? "文件已传输，正在确认与保存" : "正在传输文件" }),
        done: (detail = "处理完成") => settle("done", detail),
        fail: (detail = "处理没有完成，请重试") => settle("error", detail),
        dismiss: () => {
            finished = true;
            useOperationProgress.getState().remove(id);
        },
    };
}
