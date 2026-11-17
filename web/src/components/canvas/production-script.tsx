import { useRef, useState } from 'react';
import { Button, Input, Select, theme } from 'antd';
import { useProduction, useProductionModels } from './production-context';

export function ProductionScriptEditor() {
    const { production, edit, request, error, busy } = useProduction(), { token } = theme.useToken();
    const models = useProductionModels('text'), [model, setModel] = useState(''), input = useRef<HTMLInputElement>(null);
    return <div className="space-y-4">
        <p className="text-xs leading-relaxed" style={{ color: token.colorTextSecondary }}>先整理剧本草稿，再审核采用。AI 整理会进入生产记录，不会直接删除或替换现有镜头。</p>
        <div className="flex flex-wrap gap-1"><Button type="text" onClick={() => input.current?.click()}>导入 UTF-8 TXT</Button><Button type="text" disabled={!production.script.draft.trim() || production.script.adoptedRevision === production.script.revision} onClick={() => edit({ type: 'script.adopt' })}>采用当前稿</Button></div>
        <input ref={input} type="file" accept=".txt,text/plain" className="hidden" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); edit({ type: 'script.edit', text, original: text }); } catch { error('无法按 UTF-8 读取，请将文件另存为 UTF-8 TXT'); } }} />
        <label className="block space-y-2"><span className="text-sm">当前草稿 · v{production.script.revision}</span><Input.TextArea aria-label="剧本草稿" value={production.script.draft} autoSize={{ minRows: 12, maxRows: 24 }} onChange={event => edit({ type: 'script.edit', text: event.target.value })} placeholder="粘贴剧本，或导入 TXT。人物、场景和旁白都可以继续手工修改。" /></label>
        {production.script.adopted !== undefined && <details><summary className="cursor-pointer text-sm">对照已采用稿 v{production.script.adoptedRevision}{production.script.adopted === production.script.draft ? '（内容一致）' : '（当前草稿有修改）'}</summary><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: token.colorTextSecondary }}>{production.script.adopted}</p></details>}
        {production.script.original && <details><summary className="cursor-pointer text-sm">查看导入原文</summary><p className="mt-2 whitespace-pre-wrap text-sm">{production.script.original}</p></details>}
        <Select className="w-full" aria-label="剧本整理模型" placeholder="选择文本模型" value={model || undefined} onChange={setModel} options={models.map(item => ({ value: item.id, label: item.name }))} />
        <Button type="primary" block disabled={busy || !model || !production.script.draft.trim()} onClick={() => void request({ kind: 'script', modelId: model, prompt: production.script.draft })}>预检 AI 整理费用</Button>
    </div>;
}
