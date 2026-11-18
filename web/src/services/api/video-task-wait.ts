import type { VideoGenerationResult, VideoGenerationTaskState } from './video';

export async function waitForVideoResult(poll: () => Promise<VideoGenerationTaskState>, signal?: AbortSignal): Promise<VideoGenerationResult> {
    const startedAt = Date.now();
    while (true) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        let state: VideoGenerationTaskState | undefined;
        try { state = await poll(); }
        catch (error) {
            if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
            // 查询异常不代表生成失败，继续查询同一任务；不创建新任务或改变计费。
        }
        if (state?.status === "completed") return state.result;
        if (state?.status === "failed") {
            const error = new Error(state.error); error.name = "VideoTaskFailed"; throw error;
        }
        if (state?.status === "unavailable") throw new Error(state.error);
        if (Date.now() - startedAt >= 60 * 60 * 1000) throw new Error("已等待超过 60 分钟，任务结果尚未确认，积分以后台任务状态为准；请查询原任务，不要重复生成。");
        await delay(5000, signal);
    }
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const abort = () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        };
        const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
        signal?.addEventListener("abort", abort, { once: true });
    });
}
