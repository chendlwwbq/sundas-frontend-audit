import { apiRequest, type ApiRequestInit } from "./client";
import { useAuthStore } from "@/stores/use-auth-store";

export type CharacterInput = {
    sourceKey: string; characterKey: string; target: string; instructions: string;
    imageModel: string; videoModel: string; imageSize?: string; resolution: string; ratio: string;
    start: number; end: number | null; keepAudio: boolean;
};
export type CharacterMedia = { key: string; kind: "image" | "video"; url?: string; mime?: string; bytes?: number; width?: number; height?: number; duration?: number };
export type CharacterStepName = "prepare" | "image" | "video" | "assemble";
export type CharacterStep = {
    id: string; name: CharacterStepName; attempt: number; status: "queued" | "running" | "succeeded" | "failed" | "review";
    taskIds: string[]; error?: string; output: { media?: CharacterMedia[]; range?: { start: number; end: number; duration: number }; frame?: CharacterMedia; clip?: CharacterMedia };
};
export type CharacterRun = { id: string; projectId: string; input: CharacterInput; selectedKey?: string; paused: boolean; createdAt: string; steps?: CharacterStep[] };

export function characterRequest<T>(path: string, init: ApiRequestInit = {}) {
    const auth = useAuthStore.getState();
    if (!auth.user) return Promise.reject(new Error("请先登录"));
    const owner = auth.user.id, epoch = auth.sessionEpoch;
    return apiRequest<T>(`/api/canvas/character-runs${path}`, { ...init, headers: { ...init.headers, "X-Sundas-User": owner } }).then(result => {
        const current = useAuthStore.getState();
        if (current.user?.id !== owner || current.sessionEpoch !== epoch) throw new DOMException("登录账户已变化", "AbortError");
        return result;
    });
}
