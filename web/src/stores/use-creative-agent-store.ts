import { create } from 'zustand';
import { useAuthStore } from './use-auth-store';
import type { AgentState, AgentThread, CreativeSkill, AgentCatalog } from '@/services/api/creative-agent';

type State = { projectId: string; open: boolean; tab: 'chat' | 'skills'; snapshot: AgentState | null; threads: AgentThread[]; skills: CreativeSkill[]; catalog: AgentCatalog | null; busy: boolean; error: string };
const initial: State = { projectId: '', open: false, tab: 'chat', snapshot: null, threads: [], skills: [], catalog: null, busy: false, error: '' };
export const useCreativeAgentStore = create<State & { patch: (value: Partial<State>) => void; reset: () => void }>(set => ({ ...initial, patch: value => set(value), reset: () => set(initial) }));
useAuthStore.subscribe((state, previous) => {
    if (state.sessionEpoch !== previous.sessionEpoch || state.user?.id !== previous.user?.id) useCreativeAgentStore.getState().reset();
});
