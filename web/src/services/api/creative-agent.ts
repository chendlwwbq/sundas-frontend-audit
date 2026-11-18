import { apiRequest } from './client';
import { AGENT_CAPABILITIES_HEADER, DIRECTOR_AGENT_CAPABILITY } from '../../../../shared/agent-capabilities';
import { useAuthStore } from '@/stores/use-auth-store';
import type { CanvasConnection, CanvasNodeData } from '@/types/canvas';

export type AgentProject = { id: string; title: string; content: { nodes: CanvasNodeData[]; connections: CanvasConnection[]; [key: string]: unknown }; version: number; updatedAt: string };
export type CreativeSkill = { id: string; source: 'builtin' | 'personal'; enabled: boolean; version: number; name: string; description: string; content: string; requirements: string[] };
export type SkillDraft = Pick<CreativeSkill, 'name' | 'description' | 'content' | 'requirements'>;
export type SkillVersion = SkillDraft & { version: number; createdAt: string };
export type CreativeAgentOperation =
    | { type: 'media_inspect'; modelId: string; renderRequestId?: string; captureItemId?: string; frames: number[]; instructions: string }
    | { type: 'production_capture'; runId: string; frames: number[] }
    | { type: 'production_edit'; commands: Array<{ type: string; [key: string]: unknown }> }
    | { type: 'director_capture'; sceneId: string; parameters: import('./canvas-director').DirectorRenderParameters }
    | { type: 'director_command'; sceneId: string; commands: import('../../../../shared/director-commands').DirectorCommand[] }
    | { type: 'add_node'; id: string; nodeType: 'text' | 'image' | 'video' | 'audio' | 'group'; title: string; position: { x: number; y: number }; text?: string; prompt?: string }
    | { type: 'move_node'; nodeId: string; position: { x: number; y: number } }
    | { type: 'update_prompt'; nodeId: string; prompt: string }
    | { type: 'connect_nodes'; fromNodeId: string; toNodeId: string }
    | { type: 'generate'; nodeId: string; mode: 'text' | 'image' | 'video' | 'audio'; modelId: string; prompt: string; referenceNodeIds: string[]; seconds?: number; size?: string; resolution?: string; voice?: string }
    | { type: 'creative_tool'; tool: 'upscale' | 'character_replacement'; nodeId: string; referenceNodeIds: string[]; instructions: string }
    | { type: 'production_tool'; action: 'script' | 'images' | 'narration' | 'check' | 'preview'; modelId?: string; shotIds?: string[]; narrationIds?: string[]; prompt?: string; voice?: string };
export type AgentQuote = { minCredits: number | null; maxCredits: number | null; message: string };
export type CreativeToolHandoff = { tool: 'upscale' | 'character_replacement'; projectId: string; projectVersion: number; operationId: string; nodeId: string; referenceNodeIds: string[]; instructions: string; sourceKey: string; referenceKeys: string[] };
export type AgentTurn = { id: string; threadId: string; status: 'planning' | 'ready' | 'executing' | 'paused' | 'completed' | 'failed' | 'review'; currentVersion: number; baseVersion: number; prompt: string; planningTaskId: string; planningCredits: number; error?: string; plan?: { reply: string; operations: CreativeAgentOperation[]; quotes: AgentQuote[] }; skillSnapshots: Array<{ id: string; version: number; name: string }>; createdAt: string };
export type AgentItem = { itemId: string; threadId: string; turnId: string; position: number; role: 'user' | 'assistant' | 'tool'; status: 'pending' | 'executing' | 'submitted' | 'succeeded' | 'failed' | 'review'; content: { text?: string; operation?: CreativeAgentOperation; quote?: AgentQuote }; receipt?: { renderReceipt?: { outputs?: Array<{ objectKey: string; frame?: number }> }; inspectedFrames?: Array<{ frame: number; url: string }>; message?: string; toolHandoff?: CreativeToolHandoff; taskIds?: string[]; creditsCharged?: number; outputs?: Array<{ id: string; kind: string; url?: string; text?: string; frame?: number; timeSeconds?: number }>; [key: string]: unknown }; taskIds: string[] };
export type AgentThread = { id: string; title: string; createdAt: string; updatedAt: string };
export type AgentState = { protocolVersion: number; storageVersion: number; thread: AgentThread & { projectId: string }; turns: AgentTurn[]; items: AgentItem[]; project: AgentProject };
export type AgentCatalog = { models: Array<{ id: string; name: string; credits: number }>; generationModels: Array<{ id: string; name: string; capability: string }>; contextMode: 'text'; tools: Array<{ name: string; description: string }> };
export type AgentTurnInput = { clientRequestId: string; modelId: string; expectedVersion: number; prompt: string; selectedNodeIds: string[]; skills: Array<{ id: string; version: number }>; acceptedPlanningCredits: number };

/** Captures account and epoch once; both request and response must belong to this session. */
export function creativeAgentApi(signal?: AbortSignal) {
    const session = useAuthStore.getState();
    const owner = session.user?.id;
    const epoch = session.sessionEpoch;
    const current = () => owner && useAuthStore.getState().user?.id === owner && useAuthStore.getState().sessionEpoch === epoch;
    async function request<T>(path: string, method = 'GET', json?: unknown): Promise<T> {
        if (!current()) throw new Error('登录账户已变化，请重新打开创作助手');
        const result = await apiRequest<T>(path, { method, json, signal, headers: { 'X-Sundas-User': owner!, [AGENT_CAPABILITIES_HEADER]: DIRECTOR_AGENT_CAPABILITY } });
        if (!current() || signal?.aborted) throw new Error('画布会话已变化，本次结果未回填');
        return result;
    }
    async function state(path: string, method = 'GET', json?: unknown) {
        const value = await request<AgentState>(path, method, json);
        if (value.protocolVersion !== 1 || value.storageVersion !== 1) throw new Error('助手数据版本不受支持，请更新应用；原记录已保留');
        if (value.items.some(item => item.threadId !== value.thread.id || !value.turns.some(turn => turn.id === item.turnId && turn.threadId === item.threadId))) throw new Error('助手消息归属不一致，请重新加载');
        return value;
    }
    return {
        undoDirector: (projectId: string, commandId: string, expectedVersion: number) => request<{ project: AgentProject }>(`/api/canvas/projects/${encodeURIComponent(projectId)}/director/commands/${encodeURIComponent(commandId)}/undo`, 'POST', { expectedVersion }),
        catalog: () => request<AgentCatalog>('/api/canvas-agent/models'),
        threads: (projectId: string) => request<{ threads: AgentThread[] }>(`/api/canvas-agent/threads?projectId=${encodeURIComponent(projectId)}`),
        createThread: (projectId: string, title: string) => state('/api/canvas-agent/threads', 'POST', { projectId, title }),
        thread: (id: string) => state(`/api/canvas-agent/threads/${encodeURIComponent(id)}`),
        plan: (id: string, input: AgentTurnInput) => state(`/api/canvas-agent/threads/${encodeURIComponent(id)}/turns`, 'POST', input),
        confirm: (id: string, expectedVersion: number) => state(`/api/canvas-agent/turns/${encodeURIComponent(id)}/confirm`, 'POST', { confirmed: true, expectedVersion }),
        step: (id: string, itemId: string, expectedVersion: number) => state(`/api/canvas-agent/turns/${encodeURIComponent(id)}/steps/${encodeURIComponent(itemId)}`, 'POST', { expectedVersion }),
        pause: (id: string) => state(`/api/canvas-agent/turns/${encodeURIComponent(id)}/pause`, 'POST', {}),
        refresh: (id: string) => state(`/api/canvas-agent/turns/${encodeURIComponent(id)}/refresh`, 'POST', {}),
        skills: () => request<{ skills: CreativeSkill[] }>('/api/creative-skills'),
        versions: (id: string) => request<{ versions: SkillVersion[] }>(`/api/creative-skills/${id}/versions`),
        createSkill: (value: SkillDraft) => request<{ id: string; version: number }>('/api/creative-skills', 'POST', value),
        editSkill: (id: string, value: SkillDraft, expectedVersion: number) => request(`/api/creative-skills/${id}`, 'PUT', { ...value, expectedVersion }),
        enableSkill: (id: string, enabled: boolean) => request(`/api/creative-skills/${id}`, 'PATCH', { enabled }),
        copySkill: (id: string, version: number) => request<{ id: string; version: number }>(`/api/creative-skills/${id}/copy`, 'POST', { version }),
        restoreSkill: (id: string, version: number, expectedVersion: number) => request(`/api/creative-skills/${id}/restore`, 'POST', { version, expectedVersion }),
    };
}
