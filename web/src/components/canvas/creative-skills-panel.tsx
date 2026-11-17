import { useEffect, useRef, useState } from 'react';
import { Button, Input, Modal, Select, Switch, Tag, theme } from 'antd';
import { Copy, Download, History, Plus, Upload } from 'lucide-react';
import { creativeAgentApi, type CreativeSkill, type SkillDraft, type SkillVersion } from '@/services/api/creative-agent';
import { useCreativeAgentStore } from '@/stores/use-creative-agent-store';
import { useAuthStore } from '@/stores/use-auth-store';

const empty: SkillDraft = { name: '', description: '', content: '', requirements: ['text'] };
const capabilityNames: Record<string, string> = { text: '文字', vision: '视觉理解', image: '图片生成', video: '视频生成', audio: '音频生成' };

export function CreativeSkillsPanel() {
    const { token } = theme.useToken();
    const skills = useCreativeAgentStore(state => state.skills);
    const [editing, setEditing] = useState<CreativeSkill | 'new' | null>(null);
    const [draft, setDraft] = useState<SkillDraft>(empty);
    const [history, setHistory] = useState<{ skill: CreativeSkill; versions: SkillVersion[] } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const uploadRef = useRef<HTMLInputElement>(null);
    const controller = useRef(new AbortController());
    const owner = useAuthStore(state => state.user?.id);
    const epoch = useAuthStore(state => state.sessionEpoch);
    useEffect(() => { const active = new AbortController(); controller.current = active; setEditing(null); setHistory(null); setDraft(empty); setError(''); setBusy(false); return () => active.abort(); }, [owner, epoch]);
    const reload = async (client: ReturnType<typeof creativeAgentApi>) => { const result = await client.skills(); useCreativeAgentStore.getState().patch({ skills: result.skills }); };
    async function act(action: (client: ReturnType<typeof creativeAgentApi>, valid: () => boolean) => Promise<void>) {
        if (busy) return;
        const active = controller.current;
        const valid = () => !active.signal.aborted && controller.current === active;
        setBusy(true); setError('');
        try { await action(creativeAgentApi(active.signal), valid); } catch (error) { if (valid()) setError(error instanceof Error ? error.message : '技能操作失败'); }
        finally { if (valid()) setBusy(false); }
    }
    function edit(skill: CreativeSkill | 'new') { setEditing(skill); setDraft(skill === 'new' ? empty : { name: skill.name, description: skill.description, content: skill.content, requirements: skill.requirements }); }
    function exportSkill(skill: CreativeSkill) {
        const blob = new Blob([JSON.stringify({ format: 'sundas-creative-skill', version: 1, skill: { name: skill.name, description: skill.description, content: skill.content, requirements: skill.requirements } }, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
        anchor.href = url; anchor.download = `${skill.name.replace(/[\\/:*?"<>|]/g, '_')}.json`; anchor.click(); URL.revokeObjectURL(url);
    }
    async function importFile(file: File, client: ReturnType<typeof creativeAgentApi>) {
        const text = await file.text();
        let value: SkillDraft;
        if (file.name.toLowerCase().endsWith('.json')) {
            const parsed = JSON.parse(text);
            if (parsed.format !== 'sundas-creative-skill' || parsed.version !== 1 || !parsed.skill) throw new Error('不是支持的文本技能文件');
            value = parsed.skill;
        } else value = { name: file.name.replace(/\.(md|txt)$/i, ''), description: '从文本文件导入', content: text, requirements: ['text'] };
        await client.createSkill(value); await reload(client);
    }
    return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        <p className="text-xs leading-relaxed" style={{ color: token.colorTextSecondary }}>技能是提示词与创作方法。每轮固定技能版本；文本导入不会运行脚本。本轮助手仅读取文字和画布结构，视觉核验仍需实际画面检查。</p>
        <div className="flex flex-wrap gap-1">
            <Button type="text" icon={<Plus size={15} />} onClick={() => edit('new')}>新建</Button>
            <Button type="text" icon={<Upload size={15} />} disabled={busy} onClick={() => uploadRef.current?.click()}>导入文本</Button>
            <input ref={uploadRef} type="file" accept=".md,.txt,.json" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void act(client => importFile(file, client)); }} />
        </div>
        {error && <p role="alert" className="text-xs" style={{ color: token.colorError }}>{error}</p>}
        {skills.map(skill => <div key={skill.id} className="space-y-2 border-b py-3" style={{ borderColor: token.colorBorderSecondary }}>
            <div className="flex items-center justify-between gap-2"><button type="button" className="text-left text-sm font-medium" onClick={() => edit(skill)}>{skill.name}</button><Switch size="small" checked={skill.enabled} disabled={busy} onChange={enabled => void act(async client => { await client.enableSkill(skill.id, enabled); await reload(client); })} aria-label={`启用${skill.name}`} /></div>
            <p className="text-xs" style={{ color: token.colorTextSecondary }}>{skill.description}</p>
            <div className="flex flex-wrap items-center gap-1 text-xs"><Tag>{skill.source === 'builtin' ? '内置' : '个人'} · v{skill.version}</Tag>{skill.requirements.map(capability => <span key={capability} style={{ color: token.colorTextSecondary }}>{capabilityNames[capability] || capability}</span>)}</div>
            <div className="flex flex-wrap">
                <Button size="small" type="text" icon={<Copy size={13} />} disabled={busy} onClick={() => void act(async client => { await client.copySkill(skill.id, skill.version); await reload(client); })}>复制</Button>
                <Button size="small" type="text" icon={<Download size={13} />} onClick={() => exportSkill(skill)}>导出</Button>
                <Button size="small" type="text" icon={<History size={13} />} disabled={busy} onClick={() => void act(async (client, valid) => { const result = await client.versions(skill.id); if (valid()) setHistory({ skill, versions: result.versions }); })}>版本</Button>
            </div>
        </div>)}
        <Modal open={editing !== null} title={editing === 'new' ? '新建个人技能' : editing?.source === 'builtin' ? '内置技能' : '编辑个人技能'} onCancel={() => setEditing(null)} destroyOnHidden footer={editing && editing !== 'new' && editing.source === 'builtin' ? <Button onClick={() => setEditing(null)}>关闭</Button> : <Button type="primary" loading={busy} disabled={!draft.name.trim() || !draft.content.trim()} onClick={() => void act(async (client, valid) => { if (editing === 'new') await client.createSkill(draft); else if (editing) await client.editSkill(editing.id, draft, editing.version); await reload(client); if (valid()) setEditing(null); })}>保存新版本</Button>}>
            <div className="space-y-3">
                <Input aria-label="技能名称" placeholder="技能名称" value={draft.name} disabled={editing !== 'new' && editing?.source === 'builtin'} onChange={event => setDraft({ ...draft, name: event.target.value })} />
                <Input aria-label="技能用途" placeholder="用途与触发场景" value={draft.description} disabled={editing !== 'new' && editing?.source === 'builtin'} onChange={event => setDraft({ ...draft, description: event.target.value })} />
                <Select mode="multiple" className="w-full" aria-label="所需能力" value={draft.requirements} options={Object.entries(capabilityNames).map(([value, label]) => ({ value, label }))} disabled={editing !== 'new' && editing?.source === 'builtin'} onChange={requirements => setDraft({ ...draft, requirements })} />
                <Input.TextArea aria-label="技能内容" rows={12} value={draft.content} readOnly={editing !== 'new' && editing?.source === 'builtin'} onChange={event => setDraft({ ...draft, content: event.target.value })} />
            </div>
        </Modal>
        <Modal open={Boolean(history)} title="技能版本记录" onCancel={() => setHistory(null)} footer={null} destroyOnHidden>
            <div className="max-h-[60vh] space-y-3 overflow-auto">{history?.versions.map(version => <details key={version.version} className="border-b pb-3" style={{ borderColor: token.colorBorderSecondary }}><summary className="cursor-pointer text-sm">v{version.version} · {version.name}</summary><pre className="mt-2 whitespace-pre-wrap text-xs">{version.content}</pre>{history.skill.source === 'personal' && version.version !== history.skill.version && <Button type="text" size="small" disabled={busy} onClick={() => void act(async (client, valid) => { await client.restoreSkill(history.skill.id, version.version, history.skill.version); await reload(client); if (valid()) setHistory(null); })}>恢复为新版本</Button>}</details>)}</div>
        </Modal>
    </div>;
}
