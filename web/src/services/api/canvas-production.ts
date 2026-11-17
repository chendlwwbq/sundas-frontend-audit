import { apiRequest } from './client';
import { useAuthStore } from '@/stores/use-auth-store';
import type { AgentProject } from './creative-agent';
import type { ProductionMedia } from '../../../../shared/production';
import type { DirectorCutMapping } from '../../../../shared/director-production';

export type ProductionRequest = { kind: 'script' | 'images' | 'narration' | 'audition' | 'render' | 'preview'; expectedVersion: number; modelId?: string; shotIds?: string[]; narrationIds?: string[]; assetIds?: string[]; prompt?: string; voice?: string; format?: string; speed?: number; instructions?: string; size?: string; resolution?: string; skills?: Array<{ id: string; version: number }>; options?: Record<string, unknown> };
export type ProductionQuote = { digest: string; minCredits: number; maxCredits: number; message: string; steps: Array<{ targetId: string; targetKind: string; inputHash: string; minCredits: number; maxCredits: number; prompt?: string }> };
export type ProductionSubmission = ProductionRequest & { clientRequestId: string; confirmed: true; quoteDigest: string; acceptedCredits: number };
export type ProductionRun = { id: string; projectId: string; kind: ProductionRequest['kind']; status: string; createdAt: string; updatedAt?: string; clientRequestId?: string; error?: string; errorMessage?: string; [key: string]: unknown };
export type ProductionStep = { id: string; runId: string; targetId: string; targetKind?: string; status: string; taskIds?: string[]; error?: string; errorMessage?: string; input?: Record<string, unknown>; output?: Record<string, unknown>; stale?: boolean; result?: { media?: ProductionMedia[]; text?: string; draft?: Record<string, unknown>; creditsCharged?: number; [key: string]: unknown }; [key: string]: unknown };
export type ProductionRunDetail = { run: ProductionRun; steps: ProductionStep[] };
export type ProductionModel = { id: string; name: string; capability: 'text' | 'image' | 'audio' | 'video'; voices: string[]; minCredits: number; maxCredits: number; unit?: string };
export type ProductionCommandRecord = { clientRequestId: string; beforeVersion: number; projectVersion: number; type: 'adopt' | 'director-adopt' | 'restore'; createdAt: string };

export function canvasProductionApi(projectId: string, signal?: AbortSignal) {
    const account = useAuthStore.getState();
    const owner = account.user?.id, epoch = account.sessionEpoch;
    const current = () => owner && useAuthStore.getState().user?.id === owner && useAuthStore.getState().sessionEpoch === epoch && !signal?.aborted;
    const base = `/api/canvas/projects/${encodeURIComponent(projectId)}/production`;
    async function request<T>(path: string, method = 'GET', json?: unknown): Promise<T> {
        if (!current()) throw new Error('登录会话已变化，请重新打开制作面板');
        const result = await apiRequest<T>(path.startsWith('/api/') ? path : `${base}${path}`, { method, json, signal, headers: { 'X-Sundas-User': owner! } });
        if (!current()) throw new Error('账户已变化，本次制作结果未回填');
        if (result && typeof result === 'object') {
            const scoped = result as { run?: ProductionRun; project?: AgentProject; runs?: ProductionRun[] };
            if ((scoped.run && scoped.run.projectId !== projectId) || (scoped.project && scoped.project.id !== projectId) || scoped.runs?.some(run => run.projectId !== projectId)) throw new Error('制作回执项目归属不一致，已停止回填');
        }
        return result;
    }
    return {
        models: () => request<{ models: ProductionModel[]; audioTimestamps: boolean; message?: string }>('/api/canvas/production/models'),
        directorMapping: (renderId: string) => request<{ mapping: DirectorCutMapping[]; sourceVersion: number }>(`/director-mapping/${encodeURIComponent(renderId)}`),
        adoptDirector: (input: { clientRequestId: string; expectedVersion: number; command: { type: 'director-adopt'; renderRequestId: string } }) => request<{ project: AgentProject; receipt: Record<string, unknown> }>('/commands', 'POST', input),
        commands: () => request<{ commands: ProductionCommandRecord[] }>('/commands'),
        quote: (input: ProductionRequest) => request<{ quote: ProductionQuote }>('/quotes', 'POST', input),
        create: (input: ProductionSubmission) => request<ProductionRunDetail>('/runs', 'POST', input),
        list: () => request<{ runs: ProductionRun[] }>('/runs'),
        detail: (id: string) => request<ProductionRunDetail>(`/runs/${encodeURIComponent(id)}`),
        resume: (id: string) => request<ProductionRunDetail>(`/runs/${encodeURIComponent(id)}/resume`, 'POST', {}),
        pause: (id: string) => request<ProductionRunDetail>(`/runs/${encodeURIComponent(id)}/pause`, 'POST', {}),
        adopt: (input: { clientRequestId: string; expectedVersion: number; command: { type: 'adopt'; runId: string; stepId: string; resultIndex?: number; allowStale?: boolean } }) => request<{ project: AgentProject; receipt: Record<string, unknown> }>('/commands', 'POST', input),
        restore: (input: { clientRequestId: string; expectedVersion: number; command: { type: 'restore'; requestId: string } }) => request<{ project: AgentProject; receipt: Record<string, unknown> }>('/commands', 'POST', input),
    };
}
