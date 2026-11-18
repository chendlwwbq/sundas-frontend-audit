import { useEffect, useRef, useState } from 'react';
import { Button, Input, Select, Tabs, Tag, theme as antdTheme } from 'antd';
import { ArrowUp, BookOpen, ChevronDown, MessageSquare, Sparkles, Pause, Play, Plus, RefreshCw, Settings2, X, AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { creativeAgentApi, type AgentItem, type AgentProject, type AgentState, type AgentTurn, type AgentTurnInput, type CreativeAgentOperation, type CreativeToolHandoff } from '@/services/api/creative-agent';
import { useCreativeAgentStore } from '@/stores/use-creative-agent-store';
import { useAuthStore } from '@/stores/use-auth-store';
import { useCanvasStore } from '@/stores/canvas/use-canvas-store';
import { validateCreativeToolHandoff } from '@/lib/canvas/creative-tool-handoff';
import { describeAgentChanges } from '@/lib/canvas/creative-agent-changes';
import { CreativeSkillsPanel } from './creative-skills-panel';
import { canvasThemes } from '@/lib/canvas-theme';
import { useThemeStore } from '@/stores/use-theme-store';

export type CreativeAgentPanelProps = {
    projectId: string;
    selectedNodeIds: string[];
    prepareCanvas: () => Promise<AgentProject>;
    applyProject: (project: AgentProject) => void | Promise<void>;
    onClose?: () => void;
    onOpenProductionExport?: () => void;
    onOpenDirector?: () => void;
    onToolHandoff?: (handoff: CreativeToolHandoff) => void;
};
const statuses: Record<string, string> = { planning: '正在规划', ready: '等待确认', executing: '执行中', submitted: '已提交，等待任务结果', pending: '待执行', paused: '已暂停后续步骤', completed: '本轮完成', succeeded: '已完成', failed: '失败', review: '待核对' };
const modes: Record<string, string> = { text: '文字', image: '图片', video: '视频', audio: '配音' };

export function describeAgentOperation(operation: CreativeAgentOperation, state?: AgentState | null) {
    const title = (id: string) => {
        const existing = state?.project.content.nodes.find(node => node.id === id);
        const planned = state?.items.find(item => item.content.operation?.type === 'add_node' && item.content.operation.id === id)?.content.operation;
        return existing?.title || (planned?.type === 'add_node' ? planned.title : id);
    };
    switch (operation.type) {
        case 'media_inspect': return '检查真实参考帧';
        case 'production_capture': return '抽取成片预览参考帧';
        case 'production_edit': return `调整成片编排 · ${operation.commands.length} 项操作`;
        case 'director_capture': return operation.parameters.kind === 'video' ? '录制导演序列参考视频' : '抽取导演参考帧';
        case 'director_command': return `调整导演场景 · ${operation.commands.length} 项操作`;
        case 'add_node': return `新建${modes[operation.nodeType] || '分组'}节点：${operation.title}`;
        case 'move_node': return `移动「${title(operation.nodeId)}」至 ${operation.position.x}, ${operation.position.y}`;
        case 'update_prompt': return `更新「${title(operation.nodeId)}」的提示词`;
        case 'connect_nodes': return `连接「${title(operation.fromNodeId)}」→「${title(operation.toNodeId)}」`;
        case 'generate': return `为「${title(operation.nodeId)}」生成${modes[operation.mode]}${operation.seconds ? ` · ${operation.seconds}秒` : ''}`;
        case 'creative_tool': return `${operation.tool === 'upscale' ? 'AI 超分' : '人物替换'}：「${title(operation.nodeId)}」`;
        case 'production_tool': return `${({ preview: '生成服务端预览', script: '整理剧本草稿', images: '生成分镜图片', narration: '生成旁白', check: '检查制作稿' })[operation.action]}${operation.shotIds?.length ? ` · ${operation.shotIds.length} 个镜头` : ''}${operation.narrationIds?.length ? ` · ${operation.narrationIds.length} 段旁白` : ''}`;
    }
}

function quoteText(item: AgentItem) {
    const value = item.content.quote;
    if (!value || value.maxCredits === null) return '费用需进一步确认';
    if (!value.maxCredits) return '无需模型积分';
    return value.minCredits === value.maxCredits ? `预计 ${value.maxCredits} 积分` : `预计 ${value.minCredits}–${value.maxCredits} 积分`;
}

function operationDetails(operation: CreativeAgentOperation, modelName: (id: string) => string) {
    if (operation.type === 'production_capture') return `来源预览：${operation.runId}\n帧号：${operation.frames.join('、')}\n保留原尺寸，保存到素材库，占用现有存储配额，不调用生成模型。`;
    if (operation.type === 'media_inspect') return `模型：${modelName(operation.modelId)}\n帧号：${operation.frames.join('、')}\n检查要求：${operation.instructions}\n仅检查选定真实画面，结果是建议。`;
    if (operation.type === 'director_capture') return `帧范围 ${operation.parameters.startFrame}–${operation.parameters.endFrame}（结束帧不包含），${operation.parameters.frames?.join('、') || '整段视频'}。需在导演台领取执行，真实产物验收后完成。`;
    if (operation.type === 'generate') return [`模型：${modelName(operation.modelId)}`, `参考素材：${operation.referenceNodeIds.length} 项`, operation.size ? `尺寸：${operation.size}` : '', operation.resolution ? `清晰度：${operation.resolution}` : '', operation.voice ? `音色：${operation.voice}` : '', `提示词：\n${operation.prompt}`].filter(Boolean).join('\n');
    if (operation.type === 'creative_tool') return operation.instructions;
    if (operation.type === 'production_tool') return [operation.modelId ? `模型：${modelName(operation.modelId)}` : '', operation.voice ? `音色：${operation.voice}` : '', operation.prompt || '', '产物进入制作生产记录，采用前可审核。'].filter(Boolean).join('\n');
    if (operation.type === 'add_node') return [operation.text || '', operation.prompt || ''].filter(Boolean).join('\n') || '创建空节点，供后续编辑';
    if (operation.type === 'update_prompt') return operation.prompt;
    return '';
}

function StatusIcon({ status }: { status: string }) {
    if (status === 'succeeded' || status === 'completed') return <CheckCircle2 className="size-3 shrink-0 text-green-500" />;
    if (status === 'failed') return <AlertCircle className="size-3 shrink-0 text-red-400" />;
    if (status === 'executing' || status === 'submitted') return <Loader2 className="size-3 shrink-0 animate-spin opacity-60" />;
    return <Clock className="size-3 shrink-0 opacity-40" />;
}

export function CreativeAgentPanel({ projectId, selectedNodeIds, prepareCanvas, applyProject, onClose, onToolHandoff, onOpenProductionExport, onOpenDirector }: CreativeAgentPanelProps) {
    const { token } = antdTheme.useToken();
    const theme = canvasThemes[useThemeStore(s => s.theme)];
    const [settingsOpen, setSettingsOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const state = useCreativeAgentStore();
    const owner = useAuthStore(value => value.user?.id);
    const epoch = useAuthStore(value => value.sessionEpoch);
    const [prompt, setPrompt] = useState('');
    const [model, setModel] = useState('');
    const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
    const scope = `${owner || ''}:${epoch}:${projectId}`;
    const scopeRef = useRef(scope); scopeRef.current = scope;
    const controller = useRef(new AbortController());
    const running = useRef(false);
    const pauseRequested = useRef(false);
    const pendingPlan = useRef<{ fingerprint: string; input: AgentTurnInput } | null>(null);

    useEffect(() => {
        const active = new AbortController(); controller.current = active; running.current = false; pauseRequested.current = true; pendingPlan.current = null;
        setPrompt(''); setSelectedSkills([]); setModel('');
        useCreativeAgentStore.getState().patch({ projectId, snapshot: null, threads: [], skills: [], catalog: null, busy: true, error: '' });
        const client = creativeAgentApi(active.signal);
        const valid = () => !active.signal.aborted && scopeRef.current === scope;
        void Promise.all([client.catalog(), client.skills(), client.threads(projectId)]).then(async ([catalog, skills, threads]) => {
            if (!valid()) return;
            useCreativeAgentStore.getState().patch({ catalog, skills: skills.skills, threads: threads.threads });
            setModel(catalog.models[0]?.id || '');
            if (threads.threads[0]) { const snapshot = await client.thread(threads.threads[0].id); if (valid()) useCreativeAgentStore.getState().patch({ snapshot }); }
        }).catch(error => { if (valid()) useCreativeAgentStore.getState().patch({ error: error instanceof Error ? error.message : '助手加载失败' }); })
            .finally(() => { if (valid()) useCreativeAgentStore.getState().patch({ busy: false }); });
        return () => { active.abort(); pauseRequested.current = true; };
    }, [projectId, owner, epoch]);

    async function work(action: (client: ReturnType<typeof creativeAgentApi>, valid: () => boolean) => Promise<void>) {
        if (running.current) return;
        running.current = true;
        const active = controller.current; const expected = scope;
        const valid = () => !active.signal.aborted && scopeRef.current === expected;
        const client = creativeAgentApi(active.signal);
        state.patch({ busy: true, error: '' });
        try { await action(client, valid); }
        catch (error) { if (valid()) state.patch({ error: error instanceof Error ? error.message : '助手操作失败' }); }
        finally { if (valid()) { running.current = false; state.patch({ busy: false }); } }
    }
    async function accept(snapshot: AgentState, valid: () => boolean, apply = false) {
        if (!valid() || snapshot.thread.projectId !== projectId) return;
        state.patch({ snapshot });
        if (apply) await applyProject(snapshot.project);
    }
    async function newThread() {
        await work(async (client, valid) => {
            const project = await prepareCanvas(); if (!valid() || project.id !== projectId) return;
            const snapshot = await client.createThread(projectId, '新的创作对话');
            await accept(snapshot, valid);
            const list = await client.threads(projectId); if (valid()) state.patch({ threads: list.threads });
        });
    }
    async function plan() {
        if (!prompt.trim()) return;
        const selectedModel = state.catalog?.models.find(item => item.id === model);
        if (!selectedModel) { state.patch({ error: '请先选择可用文本模型' }); return; }
        await work(async (client, valid) => {
            const project = await prepareCanvas(); if (!valid() || project.id !== projectId) return;
            let snapshot = useCreativeAgentStore.getState().snapshot;
            if (!snapshot) snapshot = await client.createThread(projectId, prompt.trim());
            if (!valid()) return;
            state.patch({ snapshot });
            const payload = { modelId: model, expectedVersion: project.version, prompt: prompt.trim(), selectedNodeIds, skills: state.skills.filter(skill => skill.enabled && selectedSkills.includes(skill.id)).map(skill => ({ id: skill.id, version: skill.version })), acceptedPlanningCredits: selectedModel.credits };
            const fingerprint = JSON.stringify({ threadId: snapshot.thread.id, ...payload });
            if (!pendingPlan.current || pendingPlan.current.fingerprint !== fingerprint) pendingPlan.current = { fingerprint, input: { ...payload, clientRequestId: crypto.randomUUID() } };
            const result = await client.plan(snapshot.thread.id, pendingPlan.current.input);
            if (!valid()) return;
            pendingPlan.current = null; setPrompt('');
            await accept(result, valid);
            const threads = await client.threads(projectId); if (valid()) state.patch({ threads: threads.threads });
        });
    }
    async function execute(turn: AgentTurn) {
        await work(async (client, valid) => {
            pauseRequested.current = false;
            const project = await prepareCanvas(); if (!valid() || project.id !== projectId) return;
            let snapshot = await client.confirm(turn.id, project.version); await accept(snapshot, valid);
            while (valid() && !pauseRequested.current) {
                const liveTurn = snapshot.turns.find(item => item.id === turn.id);
                if (liveTurn?.status !== 'executing') break;
                const items = snapshot.items.filter(item => item.turnId === turn.id && item.role === 'tool').sort((a, b) => a.position - b.position);
                const next = items.find(item => item.status !== 'succeeded');
                if (!next || next.status !== 'pending') break;
                snapshot = await client.step(turn.id, next.itemId, snapshot.project.version);
                await accept(snapshot, valid, true);
                if (!valid()) break;
            }
        });
    }
    async function pause(turn: AgentTurn) {
        pauseRequested.current = true;
        const expected = scope; const active = controller.current;
        try { const snapshot = await creativeAgentApi(active.signal).pause(turn.id); if (!active.signal.aborted && scopeRef.current === expected) state.patch({ snapshot }); }
        catch (error) { if (!active.signal.aborted && scopeRef.current === expected) state.patch({ error: error instanceof Error ? error.message : '暂停未完成' }); }
    }
    async function refresh(turn: AgentTurn) {
        await work(async (client, valid) => {
            const project = await prepareCanvas(); if (!valid() || project.id !== projectId) return;
            const snapshot = await client.refresh(turn.id); await accept(snapshot, valid, snapshot.project.version !== project.version);
        });
    }
    function openTool(handoff: CreativeToolHandoff) {
        const auth = useAuthStore.getState();
        if (controller.current.signal.aborted || scopeRef.current !== scope || auth.user?.id !== owner || auth.sessionEpoch !== epoch) return;
        try {
            validateCreativeToolHandoff(handoff, useCanvasStore.getState().projects.find(project => project.id === projectId), window.location.origin);
            onToolHandoff?.(handoff);
        } catch (error) { state.patch({ error: error instanceof Error ? error.message : '工具准备记录已变化' }); }
    }
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [state.snapshot, state.busy, state.tab]);
    const last = state.snapshot?.turns.at(-1);
    const planningModel = state.catalog?.models.find(item => item.id === model);
    const disabledSend = state.busy || !prompt.trim() || !planningModel || last?.status === 'planning' || last?.status === 'executing';

    // 把所有 turns + items 展平为时间线消息
    const messages = state.snapshot?.turns.flatMap(turn => {
        const items = state.snapshot!.items
            .filter(item => item.threadId === state.snapshot!.thread.id && item.turnId === turn.id)
            .sort((a, b) => a.position - b.position);
        return items;
    }) ?? [];

    return (
        <aside
            className="canvas-redesigned flex h-full min-h-0 w-[400px] max-w-[90vw] flex-col border-l"
            style={{ background: theme.toolbar.panel, color: theme.toolbar.item, borderColor: theme.toolbar.border }}
            aria-label="创作助手"
        >
            {/* 顶栏 */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b px-3" style={{ borderColor: theme.toolbar.border }}>
                <div className="flex items-center gap-2">
                    {/* 对话切换 */}
                    <Select
                        className="agent-select"
                        style={{ width: 160 }}
                        size="small"
                        bordered={false}
                        placeholder="选择对话"
                        suffixIcon={<ChevronDown className="size-3 opacity-50" />}
                        value={state.snapshot?.thread.id}
                        disabled={state.busy}
                        options={state.threads.map(t => ({ value: t.id, label: t.title }))}
                        onChange={id => void work(async (client, valid) => accept(await client.thread(id), valid))}
                    />
                    <button
                        type="button"
                        className="grid size-7 place-items-center rounded-full transition hover:opacity-90"
                        style={{ background: theme.composer.chip, color: theme.composer.muted }}
                        aria-label="新建对话"
                        disabled={state.busy}
                        title="新建对话"
                        onClick={() => void newThread()}
                    >
                        <Plus className="size-3.5" />
                    </button>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        className="grid size-8 place-items-center rounded-full transition hover:opacity-90"
                        style={{ background: settingsOpen ? theme.composer.chipHover : 'transparent', color: theme.composer.muted }}
                        aria-label="设置"
                        aria-expanded={settingsOpen}
                        onClick={() => setSettingsOpen(!settingsOpen)}
                        title="设置"
                    >
                        <Settings2 className="size-3.5" />
                    </button>
                    <button
                        type="button"
                        className="grid size-8 place-items-center rounded-full transition hover:opacity-90"
                        style={{ color: theme.composer.muted }}
                        aria-label="关闭"
                        onClick={onClose}
                        title="关闭"
                    >
                        <X className="size-3.5" />
                    </button>
                </div>
            </div>

            {/* 折叠设置 */}
            {settingsOpen && (
                <div className="shrink-0 space-y-1.5 border-b px-3 py-2.5" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.itemHover }}>
                    <div className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-[11px] opacity-50">模型</span>
                        <Select
                            className="agent-select flex-1"
                            size="small"
                            bordered={false}
                            placeholder="选择模型"
                            value={model || undefined}
                            disabled={state.busy}
                            options={state.catalog?.models.map(item => ({ value: item.id, label: `${item.name} · ${item.credits}积分` })) || []}
                            onChange={setModel}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-[11px] opacity-50">技能</span>
                        <Select
                            mode="multiple"
                            className="agent-select flex-1"
                            size="small"
                            bordered={false}
                            placeholder="选择技能（可选）"
                            value={selectedSkills}
                            disabled={state.busy}
                            options={state.skills.filter(s => s.enabled).map(s => ({ value: s.id, label: `${s.name} v${s.version}` }))}
                            onChange={setSelectedSkills}
                        />
                    </div>
                    <p className="text-[10px] opacity-40">已选 {selectedNodeIds.length} 个节点 · 读取文字与结构，不读取媒体画面</p>
                </div>
            )}

            {/* 标签页 */}
            <Tabs
                className="agent-tabs shrink-0 px-3"
                size="small"
                activeKey={state.tab}
                onChange={key => state.patch({ tab: key as 'chat' | 'skills' })}
                items={[
                    { key: 'chat', label: <span className="inline-flex items-center gap-1 text-[11px]"><MessageSquare className="size-3" />对话</span> },
                    { key: 'skills', label: <span className="inline-flex items-center gap-1 text-[11px]"><BookOpen className="size-3" />技能</span> },
                ]}
            />

            {state.tab === 'skills' ? <CreativeSkillsPanel /> : (
                <>
                    {/* 对话消息区 */}
                    <div ref={scrollRef} className="thin-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
                        {/* 空状态 */}
                        {!messages.length && !state.busy && (
                            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                                <div className="grid size-12 place-items-center rounded-2xl" style={{ background: theme.composer.chip, color: theme.node.text }}>
                                    <Sparkles className="size-5" />
                                </div>
                                <p className="text-sm font-medium" style={{ color: theme.node.text }}>有什么想创作的？</p>
                                <p className="max-w-[240px] text-xs leading-relaxed" style={{ color: theme.composer.muted }}>描述你的创作目标，助手会先列出方案，确认后才修改画布</p>
                            </div>
                        )}

                        {/* 加载中 */}
                        {state.busy && !messages.length && (
                            <div className="flex items-center gap-2 py-4 text-[11px] opacity-45">
                                <Loader2 className="size-3.5 animate-spin" />
                                加载中…
                            </div>
                        )}

                        {/* 消息列表 */}
                        {state.snapshot?.turns.map(turn => {
                            const items = state.snapshot!.items
                                .filter(item => item.threadId === state.snapshot!.thread.id && item.turnId === turn.id)
                                .sort((a, b) => a.position - b.position);
                            const ops = items.filter(i => i.role === 'tool');
                            const known = ops.reduce((s, i) => s + (i.content.quote?.maxCredits || 0), 0);
                            const hasUnknown = ops.some(i => i.content.quote?.maxCredits === null);

                            return (
                                <div key={`${turn.threadId}:${turn.id}`} className="space-y-1">
                                    <div className="flex flex-wrap gap-1 text-xs opacity-70"><span>{statuses[turn.status]} · 规划 {Number(turn.planningCredits)} 积分</span>{turn.skillSnapshots.map(skill => <Tag key={skill.id}>{skill.name} v{skill.version}</Tag>)}</div>
                                    {items.map(item => (
                                        <div key={`${item.threadId}:${item.turnId}:${item.itemId}`}>
                                            {/* 用户消息 */}
                                            {item.role === 'user' && (
                                                <div className="flex justify-end pb-1">
                                                    <div
                                                        className="whitespace-pre-wrap break-words max-w-[86%] rounded-[18px] rounded-br-md px-3.5 py-2 text-[13px] leading-relaxed"
                                                        style={{ background: theme.composer.chipHover, color: theme.node.text }}
                                                    >
                                                        {item.content.text}
                                                    </div>
                                                </div>
                                            )}

                                            {/* 助手方案文字 */}
                                            {item.role === 'assistant' && (
                                                <div className="flex justify-start pb-1">
                                                    <div
                                                        className="whitespace-pre-wrap break-words max-w-[92%] px-1 py-1 text-[13px] leading-relaxed"
                                                        style={{ color: theme.node.text }}
                                                    >
                                                        {item.content.text}
                                                    </div>
                                                </div>
                                            )}

                                            {/* 工具步骤 */}
                                            {item.role === 'tool' && (
                                                <div
                                                    className="ml-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]"
                                                    style={{ borderColor: theme.toolbar.border, background: theme.toolbar.itemHover }}
                                                >
                                                    <StatusIcon status={item.status} />
                                                    <div className="min-w-0 flex-1 space-y-0.5">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="truncate font-medium opacity-85">
                                                                {item.position + 1}. {describeAgentOperation(item.content.operation!, state.snapshot)}
                                                            </span>
                                                            <span className="shrink-0 text-[10px] opacity-45">{quoteText(item)}</span>
                                                        </div>
                                {['director_command', 'production_edit'].includes(item.content.operation!.type) && <div className="text-xs leading-relaxed" aria-label="方案修改内容"><p className="font-medium">方案修改内容</p><ul className="list-disc space-y-1 pl-4">{describeAgentChanges(item.content.operation!, state.snapshot?.project).map((description, index) => <li key={index} className="break-words">{description}</li>)}</ul></div>}
                                {operationDetails(item.content.operation!, id => state.catalog?.generationModels.find(model => model.id === id)?.name || '已下线模型') && <details className="text-xs"><summary className="cursor-pointer" style={{ color: token.colorTextSecondary }}>查看具体参数</summary><p className="mt-2 whitespace-pre-wrap break-words">{operationDetails(item.content.operation!, id => state.catalog?.generationModels.find(model => model.id === id)?.name || '已下线模型')}</p></details>}
                                {['director_command','production_edit'].includes(item.content.operation?.type || '') && item.status === 'succeeded' && <Button type="text" size="small" disabled={state.busy} onClick={() => void work(async (client, valid) => { const project = await prepareCanvas(); if (!valid()) return; const result = await client.undoDirector(projectId, item.itemId, project.version); if (!valid()) return; await applyProject(result.project); const snapshot = await client.thread(item.threadId); await accept(snapshot, valid); })}>撤销本次修改</Button>}
                                {item.receipt?.message && <p className="text-xs leading-relaxed" style={{ color: item.status === 'review' || item.status === 'failed' ? token.colorWarning : token.colorTextSecondary }}>{item.receipt.message}</p>}
                                {typeof item.receipt?.report === 'string' && <div className="whitespace-pre-wrap text-sm">{item.receipt.report}</div>}
                                {item.receipt?.inspectedFrames?.map(frame => <a key={frame.frame} href={frame.url} target="_blank" rel="noreferrer" className="inline-block mr-2 text-xs underline">查看检查依据：第 {frame.frame} 帧</a>)}
                                {item.content.operation?.type === 'director_capture' && <div className="flex flex-wrap items-center gap-2">
                                    {onOpenDirector && <Button type="text" size="small" disabled={state.busy} onClick={onOpenDirector}>{item.status === 'succeeded' ? '打开导演台查看与采用' : '打开导演台执行渲染'}</Button>}
                                    {item.receipt?.renderReceipt?.outputs?.map(output => <a key={output.objectKey} href={`/media/${output.objectKey}`} target="_blank" rel="noreferrer" className="text-xs underline">{output.frame === undefined ? '查看参考视频' : `查看第 ${output.frame} 帧`}</a>)}
                                </div>}
                                {item.content.operation?.type === 'production_capture' && item.receipt?.outputs?.map((output, index) => output.url && <a key={output.id} href={output.url} target="_blank" rel="noreferrer" className="inline-block mr-2 text-xs underline">查看第 {output.frame ?? index + 1} 帧{output.timeSeconds === undefined ? "" : ` · ${output.timeSeconds.toFixed(3)} 秒`}</a>)}
                                {item.content.operation?.type === 'production_tool' && item.content.operation.action === 'preview' && item.receipt?.outputs?.map(output => output.url && <a key={output.id} href={output.url} target="_blank" rel="noreferrer" className="text-xs underline">查看成片预览</a>)}
                                {item.receipt?.toolHandoff?.projectId === projectId && onToolHandoff && <div className="space-y-1"><Button type="text" size="small" disabled={state.busy} onClick={() => openTool(item.receipt!.toolHandoff!)}>打开{item.receipt.toolHandoff.tool === 'upscale' ? '超分' : '人物替换'}设置</Button><p className="text-xs" style={{ color: token.colorTextSecondary }}>打开后仍需检查参数并单独确认费用；此回执只完成工具准备。</p></div>}
                                {item.taskIds.length > 0 && <details className="text-xs"><summary className="cursor-pointer" style={{ color: token.colorTextSecondary }}>任务回执</summary>{item.taskIds.map(id => <div key={id} className="break-all">{id}</div>)}{item.receipt?.creditsCharged !== undefined && <div>本次扣除 {item.receipt.creditsCharged} 积分</div>}</details>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* 轮次操作按钮 */}
                                    {turn.status !== 'completed' && (
                                        <div className="flex flex-wrap items-center gap-1.5 pb-2 pl-2">
                                            {ops.length > 0 && (
                                                <span className="text-[10px] opacity-40">
                                                    最多 {known} 积分{hasUnknown ? ' + 待确认' : ''}
                                                </span>
                                            )}
                                            <div className="ml-auto flex gap-1">
                                                {['ready', 'paused', 'executing'].includes(turn.status) && !ops.some(i => ['failed', 'review'].includes(i.status)) && (
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs font-medium transition disabled:opacity-40"
                                                        style={{ background: theme.accent.primary, color: theme.accent.onPrimary }}
                                                        disabled={state.busy || ops.some(i => ['executing', 'submitted'].includes(i.status))}
                                                        onClick={() => void execute(turn)}
                                                    >
                                                        <Play className="size-2.5" />
                                                        {turn.status === 'ready' ? '执行' : '继续'}
                                                    </button>
                                                )}
                                                {turn.status === 'executing' && (
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs opacity-70 transition hover:opacity-100"
                                                        style={{ background: theme.toolbar.activeBg }}
                                                        onClick={() => void pause(turn)}
                                                    >
                                                        <Pause className="size-2.5" />暂停
                                                    </button>
                                                )}
                                                {(
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs opacity-60 transition hover:opacity-100"
                                                        style={{ background: theme.toolbar.activeBg }}
                                                        disabled={state.busy}
                                                        onClick={() => void refresh(turn)}
                                                    >
                                                        <RefreshCw className="size-2.5" />刷新
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {turn.status === "paused" && <p className="text-xs opacity-60">暂停只停止后续步骤，已提交的供应商任务仍会继续处理。</p>}
                                    {turn.error && (
                                        <div className="ml-2 flex items-start gap-1.5 text-[10px] text-red-400 pb-1">
                                            <AlertCircle className="size-3 shrink-0 mt-px" />{turn.error}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* 助手正在思考 */}
                        {state.busy && messages.length > 0 && (
                            <div className="flex items-center gap-2 py-1 pl-1 text-[11px] opacity-40">
                                <Loader2 className="size-3 animate-spin" />思考中…
                            </div>
                        )}
                    </div>

                    {/* 错误提示 */}
                    {state.error && (
                        <div className="mx-3 mb-1 flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] text-red-400" style={{ borderColor: 'rgba(248,113,113,.2)', background: 'rgba(248,113,113,.06)' }}>
                            <AlertCircle className="size-3 shrink-0 mt-px" />{state.error}
                        </div>
                    )}

                    {/* 制作面板快捷入口 */}
                    {Boolean(state.snapshot?.project.content.production) && onOpenProductionExport && (
                        <div className="mx-3 mb-1">
                            <button
                                type="button"
                                className="flex h-7 w-full items-center justify-center gap-1.5 rounded-lg border text-[11px] opacity-70 transition hover:opacity-100"
                                style={{ borderColor: theme.toolbar.border, background: theme.toolbar.itemHover }}
                                disabled={state.busy}
                                onClick={onOpenProductionExport}
                            >
                                打开制作面板
                            </button>
                        </div>
                    )}

                    {/* 输入区 */}
                    <div className="shrink-0 px-3 pb-3 pt-2">
                        <div
                            className="flex flex-col gap-1 rounded-[18px] border px-3 pb-2.5 pt-2.5 transition-[border-color] duration-150 [border-color:var(--agent-border)] focus-within:[border-color:var(--agent-border-focus)]"
                            style={{ background: theme.composer.chip, ['--agent-border' as string]: theme.composer.border, ['--agent-border-focus' as string]: theme.composer.borderFocus }}
                        >
                            <Input.TextArea
                                className="agent-input"
                                aria-label="创作目标"
                                placeholder="描述创作目标，Enter 发送，Shift + Enter 换行"
                                bordered={false}
                                autoSize={{ minRows: 2, maxRows: 6 }}
                                value={prompt}
                                disabled={state.busy}
                                style={{ padding: 0, fontSize: 13, lineHeight: 1.6, background: 'transparent' }}
                                onChange={e => setPrompt(e.target.value)}
                                onPressEnter={e => {
                                    if (!e.nativeEvent.isComposing && !e.shiftKey && !disabledSend) { e.preventDefault(); void plan(); }
                                }}
                            />
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <button
                                        type="button"
                                        className="inline-flex h-7 min-w-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition hover:opacity-90"
                                        style={{ background: theme.composer.chip, color: theme.composer.chipText, fontSize: 12 }}
                                        title="切换规划模型"
                                        onClick={() => setSettingsOpen(true)}
                                    >
                                        <span className="truncate text-xs">{planningModel ? `${planningModel.name} · ${planningModel.credits} 积分` : '未选模型'}</span>
                                        <ChevronDown className="size-3 shrink-0 opacity-60" />
                                    </button>
                                    <span className="shrink-0 text-[11px]" style={{ color: theme.composer.muted }} title="本轮读取文字与结构，不读取媒体画面">已选 {selectedNodeIds.length} 个节点</span>
                                </div>
                                <button
                                    type="button"
                                    className="grid size-8 shrink-0 place-items-center rounded-full transition-[transform,background-color] duration-150 enabled:hover:scale-105 enabled:active:scale-95 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2"
                                    style={disabledSend ? { background: theme.composer.sendDisabledBg, color: theme.composer.sendDisabledText } : { background: theme.accent.primary, color: theme.accent.onPrimary }}
                                    disabled={disabledSend}
                                    aria-label="生成方案"
                                    title="生成方案"
                                    onClick={() => void plan()}
                                >
                                    {state.busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-4" strokeWidth={2.4} />}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </aside>
    );
}
