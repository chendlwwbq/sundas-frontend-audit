import { useEffect, useRef, useState } from 'react';
import { Button, Modal, Tabs, Tag, theme } from 'antd';
import { Pause, Play, RefreshCw, X } from 'lucide-react';
import { applyProductionOperation, createProduction, sameProductionMedia, type ProductionDocument, type ProductionMedia, type ProductionOperation } from '../../../../shared/production';
import { canvasProductionApi, type ProductionCommandRecord, type ProductionQuote, type ProductionRequest, type ProductionRunDetail, type ProductionStep, type ProductionSubmission } from '@/services/api/canvas-production';
import { ApiError } from '@/services/api/client';
import type { AgentProject } from '@/services/api/creative-agent';
import { useAuthStore } from '@/stores/use-auth-store';
import { useCanvasStore } from '@/stores/canvas/use-canvas-store';
import { readProductionSubmission, saveProductionSubmission, useProductionStore, type ProductionTab } from '@/stores/canvas/use-production-store';
import { ProductionContext } from './production-context';
import { ProductionScriptEditor } from './production-script';
import { ProductionLibrary } from './production-library';
import { ProductionShots } from './production-shots';
import { ProductionAudio } from './production-audio';
import { ProductionCompositionEditor } from './production-composition';
import { ProductionMediaPreview } from './production-media';

export type CanvasProductionPanelProps = { projectId: string; initialTab?: ProductionTab; focusShotId?: string; prepareCanvas: () => Promise<AgentProject>; applyProject: (project: AgentProject) => void | Promise<void>; onChangeProduction: (production: ProductionDocument) => void; onLocateNode?: (id: string) => void; onUpscaleCandidate?: (runId: string, media: ProductionMedia) => void | Promise<void>; onClose?: () => void };
const labels: Record<string, string> = { script: '剧本整理', images: '图片生产', narration: '旁白配音', audition: '音色试听', cancelled:'已取消', render: '成片导出', preview: '服务端预览', draft: '草稿', ready: '待执行', pending: '待执行', running: '执行中', submitting: '正在提交', submitted: '等待结果', completed: '已完成', succeeded: '已完成', failed: '失败', review: '待核对', paused: '已暂停', archiving: '正在归档', waiting: '等待上游', adopted: '已采用' };

export function CanvasProductionPanel({ projectId, initialTab = 'script', focusShotId, prepareCanvas, applyProject, onChangeProduction, onLocateNode, onUpscaleCandidate, onClose }: CanvasProductionPanelProps) {
    const { token } = theme.useToken(), [modal, modalHolder] = Modal.useModal();
    const project = useCanvasStore(state => state.projects.find(item => item.id === projectId));
    const state = useProductionStore(), owner = useAuthStore(value => value.user?.id), epoch = useAuthStore(value => value.sessionEpoch);
    const scope = `${owner || ''}:${epoch}:${projectId}`, scopeRef = useRef(scope); scopeRef.current = scope;
    const controller = useRef(new AbortController()), working = useRef(false);
    const [quote, setQuote] = useState<{ value: ProductionQuote; input: ProductionRequest } | null>(null);
    const [commands, setCommands] = useState<ProductionCommandRecord[]>([]);
    const adoptionIds = useRef(new Map<string, string>());
    const current = () => scopeRef.current === scope && !controller.current.signal.aborted && useProductionStore.getState().scope === scope && useAuthStore.getState().user?.id === owner && useAuthStore.getState().sessionEpoch === epoch;
    const error = (message: string) => { if (current()) useProductionStore.getState().patch({ error: message }); };

    useEffect(() => {
        const active = new AbortController(); controller.current = active; working.current = false; setQuote(null); setCommands([]); adoptionIds.current.clear();
        const valid = () => !active.signal.aborted && scopeRef.current === scope;
        useProductionStore.getState().patch({ scope, tab: initialTab, focusShotId: null, busy: true, error: '', models: [], runs: [], detail: null, pending: null });
        const client = canvasProductionApi(projectId, active.signal);
        void Promise.allSettled([client.models(), client.list(), owner ? readProductionSubmission(owner, projectId) : Promise.resolve(null), client.commands()]).then(results => {
            if (!valid()) return;
            const [models, runs, pending] = results;
            if (results[3].status === 'fulfilled') setCommands(results[3].value.commands);
            useProductionStore.getState().patch({ busy: false, ...(models.status === 'fulfilled' ? { models: models.value.models } : {}), ...(runs.status === 'fulfilled' ? { runs: runs.value.runs } : {}), ...(pending.status === 'fulfilled' ? { pending: pending.value } : {}), error: results.filter(result => result.status === 'rejected').map(result => result.status === 'rejected' ? String(result.reason?.message || '制作数据加载失败') : '').join('；') });
        });
        return () => { active.abort(); };
    }, [projectId, owner, epoch, initialTab]);
    useEffect(() => { if (focusShotId) useProductionStore.getState().patch({ tab: 'shots', focusShotId }); }, [focusShotId, projectId, owner, epoch]);

    async function work(action: (client: ReturnType<typeof canvasProductionApi>, valid: () => boolean) => Promise<void>) {
        if (working.current || !current()) return;
        working.current = true; const active = controller.current;
        const valid = () => !active.signal.aborted && current();
        state.patch({ busy: true, error: '' });
        try { await action(canvasProductionApi(projectId, active.signal), valid); }
        catch (e) { if (valid()) state.patch({ error: e instanceof Error ? e.message : '制作操作失败' }); }
        finally { if (valid()) { working.current = false; state.patch({ busy: false }); } }
    }
    function edit(operation: ProductionOperation) {
        if (!current()) return;
        const source = useCanvasStore.getState().projects.find(item => item.id === projectId)?.production;
        if (!source) return;
        if (operation.type === 'shot.adopt') {
            const shot = source.shots.find(item => item.shotId === operation.shotId);
            void modal.confirm({ title: '采用为镜头当前画面？', content: '采用后成片将使用此图片或视频。现有裁剪区间和旁白覆盖需要重新检查，原素材与已导出成片保留。', okText: '采用画面', cancelText: '取消' }).then(accepted => {
                if (!accepted || !current()) return;
                const latest = useCanvasStore.getState().projects.find(item => item.id === projectId)?.production;
                if (!latest || JSON.stringify(latest.shots.find(item => item.shotId === operation.shotId)) !== JSON.stringify(shot)) { error('镜头在确认期间已变化，请重新采用'); return; }
                try { onChangeProduction(applyProductionOperation(latest, operation)); } catch (e) { error(e instanceof Error ? e.message : '采用失败'); }
            }, () => { if (current()) error('采用确认失败，请重试'); });
            return;
        }
        try { onChangeProduction(applyProductionOperation(source, operation)); }
        catch (e) { error(e instanceof Error ? e.message : '制作内容无效'); }
    }
    async function request(input: Omit<ProductionRequest, 'expectedVersion'>) {
        if (state.pending) { error('上次提交结果尚未核对，请先在生产记录中核对原提交'); state.patch({ tab: 'runs' }); return; }
        await work(async (client, valid) => {
            const saved = await prepareCanvas(); if (!valid() || saved.id !== projectId) return;
            const payload = { ...input, expectedVersion: saved.version };
            const result = await client.quote(payload); if (valid()) setQuote({ value: result.quote, input: payload });
        });
    }
    async function showDetail(detail: ProductionRunDetail, client: ReturnType<typeof canvasProductionApi>, valid: () => boolean) {
        if (!valid()) return;
        state.patch({ detail, tab: 'runs' });
        const result = await client.list(); if (valid()) state.patch({ runs: result.runs });
    }
    async function submitSaved(client: ReturnType<typeof canvasProductionApi>, submission: ProductionSubmission, valid: () => boolean) {
        try { return await client.create(submission); }
        catch (e) {
            if (owner && valid() && e instanceof ApiError && [400, 404, 409, 422].includes(e.status)) {
                // A rejected quote/configuration is not an unknown submission. Query the original
                // id first so a changed server schema cannot hide an already-created run.
                const { runs } = await client.list();
                if (!valid()) throw e;
                const existing = runs.find(run => run.clientRequestId === submission.clientRequestId);
                if (existing) return await client.detail(existing.id);
                await saveProductionSubmission(owner, projectId, null);
                if (valid()) state.patch({ pending: null, runs });
            }
            throw e;
        }
    }
    async function confirmQuote() {
        if (!quote || !owner) return;
        await work(async (client, valid) => {
            const saved = await prepareCanvas(); if (!valid()) return;
            if (saved.id !== projectId || saved.version !== quote.input.expectedVersion) throw new Error('制作稿已变化，请关闭此报价并重新预检');
            const submission = { ...quote.input, clientRequestId: crypto.randomUUID(), confirmed: true as const, quoteDigest: quote.value.digest, acceptedCredits: quote.value.maxCredits };
            await saveProductionSubmission(owner, projectId, submission);
            if (!valid()) return;
            state.patch({ pending: submission }); setQuote(null);
            const detail = await submitSaved(client, submission, valid);
            if (!valid()) return;
            await saveProductionSubmission(owner, projectId, null);
            if (!valid()) return;
            state.patch({ pending: null }); await showDetail(detail, client, valid);
        });
    }
    async function retryPending() {
        if (!owner || !state.pending) return;
        const pending = state.pending;
        await work(async (client, valid) => {
            const detail = await submitSaved(client, pending, valid); if (!valid()) return;
            await saveProductionSubmission(owner, projectId, null); if (!valid()) return;
            state.patch({ pending: null }); await showDetail(detail, client, valid);
        });
    }
    async function adopt(step: ProductionStep, index = 0) {
        const detail = useProductionStore.getState().detail;
        if (!detail) return;
        const accepted = await modal.confirm({ title: step.stale ? '采用旧输入生成的候选？' : '采用此候选？', content: step.stale ? '这个结果与当前制作稿的输入版本不一致。确认后使用该候选替换当前采用内容，并使成片预览过期。' : detail.run.kind === 'script' ? '将采用生产记录中的剧本与结构化镜头草稿。当前稿保存在服务端采用历史，可恢复。' : '将更新对应镜头、资料或旁白的当前采用内容。原候选与已提交渲染仍保留，裁剪和字幕需要重新检查。', okText: '确认采用', cancelText: '取消' });
        if (!accepted || !current()) return;
        await work(async (client, valid) => {
            const saved = await prepareCanvas(); if (!valid()) return;
            const key = `${detail.run.id}:${step.id}:${index}:${saved.version}`;
            let clientRequestId = adoptionIds.current.get(key); if (!clientRequestId) { clientRequestId = crypto.randomUUID(); adoptionIds.current.set(key, clientRequestId); }
            const result = await client.adopt({ clientRequestId, expectedVersion: saved.version, command: { type: 'adopt', runId: detail.run.id, stepId: step.id, resultIndex: index, allowStale: step.stale === true } });
            if (!valid()) return;
            await applyProject(result.project); if (!valid()) return;
            adoptionIds.current.delete(key);
            const fresh = await client.detail(detail.run.id); if (valid()) state.patch({ detail: fresh });
            const history = await client.commands(); if (valid()) setCommands(history.commands);
        });
    }
    async function restore(command: ProductionCommandRecord) {
        const accepted = await modal.confirm({ title: '恢复采用前的项目快照？', content: `恢复到项目版本 ${command.beforeVersion} 的画布及制作内容。之后的布局、文字和采用修改都会被替换；已发生的供应商费用和生产记录仍保留。`, okText: '确认恢复', cancelText: '取消' });
        if (!accepted || !current()) return;
        await work(async (client, valid) => {
            const saved = await prepareCanvas(); if (!valid()) return;
            const result = await client.restore({ clientRequestId: crypto.randomUUID(), expectedVersion: saved.version, command: { type: 'restore', requestId: command.clientRequestId } });
            if (!valid()) return; await applyProject(result.project);
            const history = await client.commands(); if (valid()) setCommands(history.commands);
        });
    }

    const tabs = [{ key: 'script', label: '剧本' }, { key: 'library', label: '资料' }, { key: 'shots', label: '分镜' }, { key: 'audio', label: '声音/字幕' }, { key: 'composition', label: '成片' }, { key: 'runs', label: '记录' }];
    return <aside className="fixed inset-0 z-50 flex min-h-0 w-full max-w-[100vw] flex-col border-l md:static md:z-auto md:h-full md:w-[520px]" style={{ background: token.colorBgContainer, color: token.colorText, borderColor: token.colorBorderSecondary }} aria-label="漫剧制作工作台">
        {modalHolder}<div className="flex items-center justify-between px-4 pt-3"><span className="text-sm font-medium">漫剧制作</span><Button type="text" size="small" icon={<X size={16} />} aria-label="关闭制作面板" onClick={onClose} /></div>
        <Tabs className="production-tabs" activeKey={state.tab} onChange={key => state.patch({ tab: key as ProductionTab })} items={tabs} />
        {state.error && <div role="alert" className="px-4 pb-3 text-xs" style={{ color: token.colorError }}>{state.error}</div>}
        {state.scope !== scope ? <p className="p-4 text-sm">正在读取当前制作记录…</p> : !project?.production ? <div className="space-y-4 p-4"><p className="text-sm">开启制作稿，在同一项目整理剧本、资料、镜头和声音。自由画布中的原素材继续保留。</p><Button type="primary" disabled={!project} onClick={() => project && onChangeProduction(createProduction(project.title))}>开启制作稿</Button></div> : <ProductionContext.Provider value={{ projectId, production: project.production, nodes: project.nodes, busy: state.busy, edit, request, locate: id => onLocateNode?.(id), error }}>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
                {state.tab === 'script' && <ProductionScriptEditor />}{state.tab === 'library' && <ProductionLibrary />}{state.tab === 'shots' && <ProductionShots />}{state.tab === 'audio' && <ProductionAudio />}{state.tab === 'composition' && <ProductionCompositionEditor />}
                {state.tab === 'runs' && <div className="space-y-4">
                    {state.pending && <div className="space-y-2"><p className="text-xs" style={{ color: token.colorWarning }}>上次已确认提交尚未收到可靠回执。核对使用原请求身份，不创建新的付费请求。</p><Button disabled={state.busy} onClick={() => void retryPending()}>核对原提交</Button></div>}
                    <Button type="text" icon={<RefreshCw size={14} />} disabled={state.busy} onClick={() => void work(async (client, valid) => { const [list, history] = await Promise.all([client.list(), client.commands()]); if (valid()) { state.patch({ runs: list.runs }); setCommands(history.commands); } })}>刷新生产记录</Button>
                    {!!commands.length && <details><summary className="cursor-pointer text-sm">采用与恢复历史</summary><div className="mt-2 space-y-2">{commands.map(command => <div key={command.clientRequestId} className="flex items-center justify-between gap-2 text-xs"><span>{new Date(command.createdAt).toLocaleString()} · {command.type === 'restore' ? '恢复' : '采用'} · v{command.projectVersion}</span><Button type="text" size="small" disabled={state.busy} onClick={() => void restore(command)}>恢复之前版本</Button></div>)}</div></details>}
                    {state.runs.map(run => <button type="button" key={run.id} className="flex w-full items-center justify-between gap-2 border-b py-2 text-left text-sm" style={{ borderColor: token.colorBorderSecondary }} onClick={() => void work(async (client, valid) => { const detail = await client.detail(run.id); if (valid()) state.patch({ detail }); })}><span>{labels[run.kind] || run.kind}<span className="mt-1 block text-xs" style={{ color: token.colorTextSecondary }}>{new Date(run.createdAt).toLocaleString()}</span></span><Tag>{labels[run.status] || run.status}</Tag></button>)}
                    {state.detail && <section className="space-y-3"><div className="flex flex-wrap gap-1"><Button type="text" size="small" disabled={state.busy} icon={<RefreshCw size={13} />} onClick={() => void work(async (client, valid) => { const detail = await client.detail(state.detail!.run.id); if (valid()) state.patch({ detail }); })}>查询当前状态</Button><Button type="text" size="small" disabled={state.busy || ['cancelled','completed', 'succeeded', 'review'].includes(state.detail.run.status)} icon={<Play size={13} />} onClick={() => void work(async (client, valid) => showDetail(await client.resume(state.detail!.run.id), client, valid))}>恢复原运行</Button><Button type="text" size="small" disabled={state.busy || ['cancelled','completed', 'succeeded', 'failed', 'review'].includes(state.detail.run.status)} icon={<Pause size={13} />} onClick={() => void work(async (client, valid) => showDetail(await client.pause(state.detail!.run.id), client, valid))}>暂停后续步骤</Button>{['preview','render'].includes(state.detail.run.kind) && !['completed','failed','cancelled'].includes(state.detail.run.status) && <Button size="small" danger disabled={state.busy} onClick={()=>void work(async(client,valid)=>showDetail(await client.cancel(state.detail!.run.id),client,valid))}>取消渲染</Button>}</div>
                        {(state.detail.run.error || state.detail.run.errorMessage) && <p className="text-xs" style={{ color: token.colorError }}>{state.detail.run.error || state.detail.run.errorMessage}</p>}
                        {state.detail.steps.map(step => <div key={step.id} className="space-y-2 border-b py-3" style={{ borderColor: token.colorBorderSecondary }}><div className="flex flex-wrap gap-1"><Tag>{labels[step.status] || step.status}</Tag>{step.stale && <Tag color="warning">输入已有变化</Tag>}</div><p className="text-xs">{project.production!.shots.find(shot => shot.shotId === step.targetId)?.title || project.production!.library.find(asset => asset.id === step.targetId)?.name || labels[state.detail!.run.kind]}</p>{step.error && <p role="alert" className="text-xs" style={{ color: token.colorError }}>{step.error}</p>}
                            {step.result?.text && <p className="whitespace-pre-wrap text-sm">{step.result.text}</p>}
                            {step.result?.draft && <details open><summary className="cursor-pointer text-sm">审核结构化剧本草稿</summary><pre className="mt-2 whitespace-pre-wrap break-words text-xs">{JSON.stringify(step.result.draft, null, 2)}</pre></details>}
                            {step.result?.media?.map((media, index) => {
                                const p = project.production!, kind = step.targetKind || step.input?.targetKind;
                                const selected = kind === 'shot' ? p.shots.find(shot => shot.shotId === step.targetId)?.adoptedMedia : kind === 'asset' ? p.library.find(asset => asset.id === step.targetId)?.media : kind === 'narration' ? p.narration.find(line => line.id === step.targetId)?.media : undefined;
                                const adopted = sameProductionMedia(selected, media), candidate = !['render', 'preview', 'audition'].includes(state.detail!.run.kind);
                                return <div key={`${media.url || media.storageKey}:${index}`} className="space-y-1"><Tag color={adopted ? 'success' : undefined}>{candidate ? adopted ? '当前已采用' : '候选' : state.detail!.run.kind === 'audition' ? '试听样本' : '成片产物'}</Tag><ProductionMediaPreview media={media} /><div className="flex flex-wrap gap-1">{media.url && <Button type="text" size="small" href={media.url} download target="_blank" rel="noreferrer">下载产物</Button>}{candidate && !adopted && <Button type="text" size="small" disabled={state.busy} onClick={() => void adopt(step, index)}>采用此候选</Button>}{onUpscaleCandidate && ['image', 'video'].includes(media.kind) && ['cancelled','completed', 'succeeded', 'adopted'].includes(step.status) && <Button type="text" size="small" disabled={state.busy} onClick={() => void work(async (_client, valid) => { if (valid()) await onUpscaleCandidate(state.detail!.run.id, media); })}>加入画布并超分</Button>}</div></div>;
                            })}
                            {step.result?.draft && <Button type="text" size="small" disabled={state.busy} onClick={() => void adopt(step)}>采用草稿</Button>}
                            {!!step.taskIds?.length && <details className="text-xs"><summary className="cursor-pointer">任务回执</summary>{step.taskIds.map(id => <p key={id} className="break-all">{id}</p>)}{step.result?.creditsCharged !== undefined && <p>本次结算 {step.result.creditsCharged} 积分</p>}</details>}
                        </div>)}
                    </section>}
                    {!state.runs.length && !state.busy && <p className="text-sm">尚无生产记录。发起任务后会保留输入、候选及结果状态。</p>}
                </div>}
            </div>
        </ProductionContext.Provider>}
        <Modal open={!!quote && state.scope === scope} title="确认本次制作任务" onCancel={() => !state.busy && setQuote(null)} onOk={() => void confirmQuote()} confirmLoading={state.busy} okButtonProps={{ disabled: state.busy || !quote || !Number.isFinite(quote.value.maxCredits) }} okText="确认发起" cancelText="返回修改" destroyOnHidden>
            {quote && <div className="space-y-3"><p>任务：{labels[quote.input.kind]} · {quote.value.steps.length} 项</p><p>本次预计 {quote.value.minCredits === quote.value.maxCredits ? quote.value.maxCredits : `${quote.value.minCredits}–${quote.value.maxCredits}`} 积分</p><p className="text-sm">{quote.value.message}</p>{quote.value.steps.map(step => <details key={step.targetId} className="text-xs"><summary className="cursor-pointer">{project?.production?.shots.find(shot => shot.shotId === step.targetId)?.title || step.targetKind} · 最多 {step.maxCredits} 积分</summary><p className="mt-2 whitespace-pre-wrap">{step.prompt || '按已保存的制作稿与输出配置执行'}</p></details>)}<p className="text-xs" style={{ color: token.colorTextSecondary }}>确认仅授权这里列出的任务。结果进入生产记录，采用候选另行确认。</p></div>}
        </Modal>
    </aside>;
}
