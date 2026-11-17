import { apiRequest } from './client';

export type UpscaleTarget = { id: string; label: string; scale?: number; width?: number; height?: number };
export type UpscaleModel = {
    id: string; name: string; mediaKind: 'image' | 'video'; inputMimeTypes: string[];
    targets: UpscaleTarget[]; available: boolean; reason: string | null;
};
export type UpscaleCapabilities = { models: UpscaleModel[]; available: boolean; reason: string };
export type UpscaleRun = {
    id: string; sourceNodeId: string; purpose: 'image_upscale' | 'video_upscale';
    source: { objectKey: string; mime: string; bytes: string; durationMs: number | null; info?: { width: number; height: number; duration?: number; fps?: number; hasAudio?: boolean } };
    modelId: string | null; modelName: string | null; parameters: { target?: UpscaleTarget };
    taskId: string | null; status: 'draft' | 'queued' | 'running' | 'succeeded' | 'failed' | 'review' | 'result_unavailable';
    creditsHeld: number | null; creditsCharged: number | null; resultUrl: string | null; error: string | null;
    result: { width: number; height: number; bytes: number; duration?: number; fps?: number; hasAudio?: boolean; mime: string } | null; createdAt: string;
};
export type UpscaleDraft = {
    id: string; sourceNodeId: string; sourceObjectKey: string; mediaKind: 'image' | 'video'; modelId?: string; targetId?: string;
};
type Session = { userId: string; signal: AbortSignal };
const options = ({ userId, signal }: Session) => ({ signal, headers: { 'X-Sundas-User': userId } });
const runsPath = (projectId: string) => `/api/canvas/projects/${encodeURIComponent(projectId)}/upscale-runs`;

export function getUpscaleCapabilities(kind: 'image' | 'video', session: Session) {
    return apiRequest<UpscaleCapabilities>(`/api/canvas/upscale/capabilities?kind=${kind}`, options(session));
}
export function getUpscaleRuns(projectId: string, sourceNodeId: string, session: Session) {
    return apiRequest<{ runs: UpscaleRun[] }>(`${runsPath(projectId)}?${new URLSearchParams({ sourceNodeId })}`, options(session));
}
export function saveUpscaleDraft(projectId: string, draft: UpscaleDraft, session: Session) {
    return apiRequest<{ run: UpscaleRun }>(runsPath(projectId), { ...options(session), method: 'POST', json: draft });
}
export type UpscaleQuote = { credits: number; routeId: string; target: { width: number; height: number }; unit: string; quantity: number };
export function quoteUpscaleRun(projectId: string, runId: string, session: Session) {
    return apiRequest<UpscaleQuote>(`${runsPath(projectId)}/${encodeURIComponent(runId)}/quote`, { ...options(session), method: 'POST' });
}
export function submitUpscaleRun(projectId: string, runId: string, quote: UpscaleQuote, session: Session) {
    return apiRequest<{ run: UpscaleRun }>(`${runsPath(projectId)}/${encodeURIComponent(runId)}/submit`, { ...options(session), method: 'POST', json: { expectedCredits: quote.credits, routeId: quote.routeId } });
}
export function resumeUpscaleRun(projectId: string, runId: string, session: Session) {
    return apiRequest<{ run: UpscaleRun }>(`${runsPath(projectId)}/${encodeURIComponent(runId)}/resume`, { ...options(session), method: 'POST' });
}
