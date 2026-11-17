import { create } from 'zustand';
import { localForageStorage } from '@/lib/localforage-storage';
import { useAuthStore } from '@/stores/use-auth-store';
import type { ProductionModel, ProductionRun, ProductionRunDetail, ProductionSubmission } from '@/services/api/canvas-production';

export type ProductionTab = 'script' | 'library' | 'shots' | 'audio' | 'composition' | 'runs';
type State = { scope: string; tab: ProductionTab; focusShotId: string | null; busy: boolean; error: string; models: ProductionModel[]; runs: ProductionRun[]; detail: ProductionRunDetail | null; pending: ProductionSubmission | null; patch: (value: Partial<Omit<State, 'patch'>>) => void };
const initial = { scope: '', tab: 'script' as const, focusShotId: null, busy: false, error: '', models: [], runs: [], detail: null, pending: null };
export const useProductionStore = create<State>(set => ({ ...initial, patch: value => set(value) }));
useAuthStore.subscribe((state, previous) => {
    if (state.sessionEpoch !== previous.sessionEpoch || state.user?.id !== previous.user?.id) useProductionStore.getState().patch(initial);
});

/** Persist the authorized idempotency key before submission, including a lost HTTP response. */
export async function saveProductionSubmission(owner: string, projectId: string, value: ProductionSubmission | null) {
    const key = `sundas:production-pending:${owner}:${projectId}`;
    if (value) await localForageStorage.setItem(key, JSON.stringify(value));
    else await localForageStorage.removeItem(key);
}
export async function readProductionSubmission(owner: string, projectId: string): Promise<ProductionSubmission | null> {
    const value = await localForageStorage.getItem(`sundas:production-pending:${owner}:${projectId}`);
    if (!value) return null;
    const parsed = JSON.parse(value) as ProductionSubmission;
    if (!parsed.clientRequestId || parsed.confirmed !== true || !parsed.quoteDigest) throw new Error('原提交记录损坏，请先在生产记录核对任务');
    return parsed;
}
