import { apiRequest } from './client';
import type { DirectorScene } from '@/types/director';

export type DirectorRenderParameters = { sequenceId: string; kind: 'frames' | 'video'; startFrame: number; endFrame: number; frames?: number[]; fixedCameraId?: string };
export type DirectorRenderOutput = { url: string; objectKey: string; frame?: number; width: number; height: number; duration?: number; mime: string; bytes: string };
export type DirectorRenderRequest = { id: string; sceneId: string; projectVersion: number; parameters: DirectorRenderParameters; status: 'waiting' | 'claimed' | 'completed' | 'failed' | 'cancelled'; snapshot?: DirectorScene; claimToken?: string; error?: string; receipt?: { fps: number; outputs: DirectorRenderOutput[] } };
export type AdoptDirectorRender = (task: DirectorRenderRequest, output: DirectorRenderOutput, target?: 'canvas' | 'production') => Promise<void>;
export function directorClient(projectId: string, userId: string, signal: AbortSignal) {
    const root = `/api/canvas/projects/${encodeURIComponent(projectId)}/director/render-requests`;
    const options = { signal, headers: { 'X-Sundas-User': userId } };
    const action = <T>(id: string, action: string, json: unknown = {}) => apiRequest<T>(`${root}/${encodeURIComponent(id)}/${action}`, { ...options, method: 'POST', json });
    return {
        list: () => apiRequest<{ requests: DirectorRenderRequest[] }>(root, options),
        create: (input: { id: string; expectedVersion: number; sceneId: string; parameters: DirectorRenderParameters }) => apiRequest<{ request: DirectorRenderRequest }>(root, { ...options, method: 'POST', json: input }),
        claim: (id: string, browserSession: string) => action<{ request: DirectorRenderRequest }>(id, 'claim', { browserSession }),
        complete: (id: string, claimToken: string, outputs: Array<{ objectKey: string; frame?: number }>) => action<{ receipt: DirectorRenderRequest['receipt'] }>(id, 'complete', { claimToken, outputs }),
        fail: (id: string, claimToken: string, error: string) => action(id, 'fail', { claimToken, error }),
        cancel: (id: string) => action(id, 'cancel'),
        resume: (id: string) => action(id, 'resume'),
    };
}
