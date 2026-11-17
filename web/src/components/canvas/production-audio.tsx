import { useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Popconfirm, Select, Tag, theme } from 'antd';
import { Play, Plus, Trash2 } from 'lucide-react';
import type { ProductionNarration, ProductionSubtitle } from '../../../../shared/production';
import { nodeProductionMedia, useProduction, useProductionModels } from './production-context';
import { ProductionMediaPreview, ProductionMediaUpload } from './production-media';

export function ProductionAudio() {
    const { production, nodes, edit, request, busy } = useProduction(), { token } = theme.useToken();
    const models = useProductionModels('audio'), [model, setModel] = useState(''), [voice, setVoice] = useState(''), [sample, setSample] = useState('');
    const [seek, setSeek] = useState<{ lineId: string; timeMs: number; nonce: number } | null>(null);
    const voices = models.find(item => item.id === model)?.voices || [];
    const update = (line: ProductionNarration, changes: Partial<ProductionNarration>) => {
        const changedInput = (['text', 'model', 'voice', 'speed'] as const).some(key => key in changes && changes[key] !== line[key]);
        edit({ type: 'narration.upsert', narration: { ...line, ...changes, revision: line.revision + (changedInput ? 1 : 0) } });
    };
    const cuesFor = (id: string) => production.subtitles.filter(cue => cue.narrationId === id);
    const replaceCue = (cue: ProductionSubtitle, changes: Partial<ProductionSubtitle>) => edit({ type: 'subtitles.replace', narrationId: cue.narrationId, subtitles: cuesFor(cue.narrationId).map(item => item.id === cue.id ? { ...item, ...changes, source: 'startMs' in changes || 'endMs' in changes ? 'manual' : item.source } : item) });
    const estimate = (line: ProductionNarration) => {
        if (!line.media?.durationMs) return;
        const texts = line.text.split(/(?<=[。！？!?；;])\s*|\n+/u).map(item => item.trim()).filter(Boolean);
        const total = texts.reduce((sum, item) => sum + [...item].length, 0); let cursor = 0;
        const subtitles = texts.map((text, index) => { const startMs = cursor; cursor = index === texts.length - 1 ? line.media!.durationMs! : cursor + Math.round(line.media!.durationMs! * [...text].length / total); return { id: crypto.randomUUID(), narrationId: line.id, text, startMs, endMs: cursor, source: 'estimated' as const, reviewed: false }; });
        edit({ type: 'subtitles.replace', narrationId: line.id, subtitles });
    };
    return <div className="space-y-4">
        <Select className="w-full" aria-label="旁白模型" placeholder="选择配音模型" value={model || undefined} options={models.map(item => ({ value: item.id, label: item.name }))} onChange={value => { setModel(value); setVoice(''); }} />
        {voices.length ? <Select className="w-full" aria-label="试听音色" placeholder="选择已配置音色" value={voice || undefined} options={voices.map(value => ({ value, label: value }))} onChange={setVoice} /> : <Input aria-label="试听音色标识" placeholder="填写此模型支持的音色标识，提交前由服务端校验" value={voice} onChange={event => setVoice(event.target.value)} />}
        <Input.TextArea aria-label="同文案试听" value={sample} onChange={event => setSample(event.target.value)} placeholder="使用同一段文案比较音色" autoSize={{ minRows: 2, maxRows: 5 }} />
        <div className="flex flex-wrap gap-1"><Button type="text" disabled={busy || !model || !voice || !sample.trim()} onClick={() => void request({ kind: 'audition', modelId: model, voice, prompt: sample })}>预检试听费用</Button><Button type="text" icon={<Plus size={14} />} onClick={() => edit({ type: 'narration.upsert', narration: { id: crypto.randomUUID(), shotIds: [], text: '', revision: 1, ...(model ? { model } : {}), ...(voice ? { voice } : {}) } })}>新增旁白段</Button></div>
        <p className="text-xs" style={{ color: token.colorTextSecondary }}>一次生成一段连贯旁白。字幕的起止时间均相对于该段音频；按文本比例估算后需要试听校对。</p>
        {production.narration.map((line, index) => <section key={line.id} className="space-y-2 border-b pb-4" style={{ borderColor: token.colorBorderSecondary }}>
            <div className="flex items-center justify-between"><span className="text-sm">旁白 {index + 1} · v{line.revision}</span><Popconfirm title="删除此段旁白及其字幕？" onConfirm={() => edit({ type: 'narration.remove', id: line.id })}><Button type="text" size="small" icon={<Trash2 size={14} />} aria-label="删除旁白" /></Popconfirm></div>
            <Select mode="multiple" className="w-full" aria-label="旁白关联镜头" placeholder="选择连续镜头，按分镜顺序排列" value={line.shotIds} options={production.shots.map(shot => ({ value: shot.shotId, label: shot.title }))} onChange={ids => update(line, { shotIds: production.shots.filter(shot => ids.includes(shot.shotId)).map(shot => shot.shotId) })} />
            <Input.TextArea aria-label="旁白文本" value={line.text} autoSize={{ minRows: 3, maxRows: 8 }} onChange={event => update(line, { text: event.target.value })} />
            <div className="flex flex-wrap items-center gap-1"><span className="text-xs">{models.find(item => item.id === line.model)?.name || '未设置模型'} · {line.voice || '未设置音色'}</span><Button type="text" size="small" disabled={!model || !voice} onClick={() => update(line, { model, voice })}>使用上方音色</Button><Button type="text" size="small" disabled={busy || !line.model || !line.voice || !line.text.trim()} onClick={() => void request({ kind: 'narration', modelId: line.model, narrationIds: [line.id], voice: line.voice, ...(line.speed ? { speed: line.speed } : {}) })}>预检本段配音</Button></div>
            <div className="flex gap-1"><Select className="min-w-0 flex-1" value={undefined} aria-label="采用已有音频" placeholder="从画布采用音频" options={nodes.filter(node => nodeProductionMedia(node)?.kind === 'audio').map(node => ({ value: node.id, label: node.title }))} onChange={id => update(line, { media: nodeProductionMedia(nodes.find(node => node.id === id)), mediaRevision: line.revision })} /><ProductionMediaUpload kind="audio" onMedia={media => update(line, { media, mediaRevision: line.revision })} /></div>
            {line.media && line.mediaRevision !== undefined && line.mediaRevision !== line.revision && <div className="space-y-1"><p className="text-xs" style={{ color: token.colorWarning }}>当前音频对应旧文本或音色。请重配，或核对声音后明确采用原音频。</p><Popconfirm title="确认继续使用原音频？" description="音频内容不会随新文稿改变，请同步检查字幕。" onConfirm={() => update(line, { mediaRevision: line.revision })}><Button type="text" size="small">保留采用原音频</Button></Popconfirm></div>}
            <ProductionMediaPreview media={line.media} seek={seek?.lineId === line.id ? seek : undefined} onDuration={durationMs => line.media && update(line, { media: { ...line.media, durationMs } })} />
            <div className="flex gap-1"><Popconfirm title="按文本长度重新估算字幕？" description="将替换此段当前字幕，包括人工修订；估算结果仍需校对。" disabled={!line.media?.durationMs || !line.text.trim()} onConfirm={() => estimate(line)}><Button type="text" size="small" disabled={!line.media?.durationMs || !line.text.trim()}>估算短字幕</Button></Popconfirm><Button type="text" size="small" onClick={() => edit({ type: 'subtitles.replace', narrationId: line.id, subtitles: [...cuesFor(line.id), { id: crypto.randomUUID(), narrationId: line.id, text: '', startMs: 0, endMs: 0, source: 'manual', reviewed: false }] })}>添加字幕</Button></div>
            {cuesFor(line.id).map(cue => <div key={cue.id} className="space-y-1 py-1"><Input.TextArea aria-label="字幕文字" autoSize={{ minRows: 1, maxRows: 3 }} value={cue.text} onChange={event => replaceCue(cue, { text: event.target.value, reviewed: false })} /><div className="flex flex-wrap items-center gap-1"><InputNumber aria-label="字幕开始毫秒" value={cue.startMs} min={0} addonAfter="ms" onChange={value => replaceCue(cue, { startMs: value ?? 0, reviewed: false })} /><InputNumber aria-label="字幕结束毫秒" value={cue.endMs} min={0} addonAfter="ms" onChange={value => replaceCue(cue, { endMs: value ?? 0, reviewed: false })} /><Tag color={cue.source === 'estimated' ? 'warning' : undefined}>{cue.source === 'estimated' ? '估算' : cue.source === 'model' ? '模型时间戳' : '人工'}</Tag><Checkbox checked={cue.reviewed} onChange={event => replaceCue(cue, { reviewed: event.target.checked })}>已校对</Checkbox><Button type="text" size="small" icon={<Play size={12} />} disabled={!line.media} aria-label="从此字幕播放" onClick={() => setSeek(value => ({ lineId: line.id, timeMs: cue.startMs, nonce: (value?.nonce || 0) + 1 }))} /><Button type="text" size="small" icon={<Trash2 size={12} />} aria-label="删除字幕" onClick={() => edit({ type: 'subtitles.replace', narrationId: line.id, subtitles: cuesFor(line.id).filter(item => item.id !== cue.id) })} /></div></div>)}
        </section>)}
    </div>;
}
