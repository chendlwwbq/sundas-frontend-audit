/** Shared, environment-free production document. Array order in shots is the only edit order. */
export type ProductionMedia = { kind: 'image' | 'video' | 'audio'; url?: string; storageKey?: string; mediaId?: string | number; durationMs?: number };
export function sameProductionMedia(left?: ProductionMedia, right?: ProductionMedia): boolean {
    if (!left || !right || left.kind !== right.kind) return false;
    if (left.mediaId !== undefined && right.mediaId !== undefined) return String(left.mediaId) === String(right.mediaId);
    return Boolean((left.url && left.url === right.url) || (left.storageKey && left.storageKey === right.storageKey));
}
export type ProductionAsset = { id: string; kind: 'character' | 'scene' | 'prop' | 'style'; name: string; aliases: string[]; description: string; revision: number; media?: ProductionMedia };
export type ProductionShot = { shotId: string; title: string; description: string; action: string; prompt: string; references: Array<{ assetId: string; revision: number }>; nodeId?: string; adoptedMedia?: ProductionMedia; revision?: number; mediaRevision?: number };
export type ProductionNarration = { id: string; shotIds: string[]; text: string; revision: number; model?: string; voice?: string; speed?: number; media?: ProductionMedia; mediaRevision?: number };
export type ProductionSubtitle = { id: string; narrationId: string; text: string; startMs: number; endMs: number; source: 'model' | 'estimated' | 'manual'; reviewed: boolean };
export type ShotComposition = { included: boolean; durationMs?: number; inMs?: number; outMs?: number; fit: 'contain' | 'cover'; motion: 'none' | 'zoom-in' | 'zoom-out'; focusX?: number; focusY?: number; transitionMs: number; originalAudioVolume: number };
export type NarrationPlacement = { anchorShotId: string; offsetMs: number; volume: number; enabled: boolean };
export type ProductionComposition = {
    shots: Record<string, ShotComposition>;
    narration: Record<string, NarrationPlacement>;
    bgm?: { media: ProductionMedia; inMs: number; outMs?: number; loop: boolean; volume: number };
    output?: { width: number; height: number; fps: number };
    subtitles: { burnIn: boolean; fontSize?: number; fontFamily?: string };
};
export type ProductionDocument = {
    schemaVersion: 1;
    title: string;
    script: { original: string; draft: string; revision: number; adopted?: string; adoptedRevision?: number };
    library: ProductionAsset[];
    shots: ProductionShot[];
    narration: ProductionNarration[];
    subtitles: ProductionSubtitle[];
    composition: ProductionComposition;
};
export type ProductionOperation =
    | { type: 'script.edit'; text: string; original?: string }
    | { type: 'script.adopt' }
    | { type: 'asset.upsert'; asset: ProductionAsset }
    | { type: 'asset.remove'; id: string }
    | { type: 'shot.upsert'; shot: ProductionShot }
    | { type: 'shot.remove'; shotId: string }
    | { type: 'shot.reorder'; shotIds: string[] }
    | { type: 'shot.adopt'; shotId: string; media: ProductionMedia }
    | { type: 'narration.upsert'; narration: ProductionNarration }
    | { type: 'narration.remove'; id: string }
    | { type: 'subtitles.replace'; narrationId: string; subtitles: ProductionSubtitle[] }
    | { type: 'composition.replace'; composition: ProductionComposition }
    | { type: 'replace'; production: ProductionDocument };

export function createProduction(title = ''): ProductionDocument {
    return { schemaVersion: 1, title, script: { original: '', draft: '', revision: 1 }, library: [], shots: [], narration: [], subtitles: [], composition: { shots: {}, narration: {}, subtitles: { burnIn: false } } };
}
export function defaultShotComposition(): ShotComposition {
    return { included: true, fit: 'contain', motion: 'none', transitionMs: 0, originalAudioVolume: 1 };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const id = (value: unknown): value is string => text(value) && value.trim().length > 0 && !['__proto__', 'prototype', 'constructor'].includes(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown) => finite(value) && value > 0;
const nonnegative = (value: unknown) => finite(value) && value >= 0;
const revision = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0;
const optional = (value: unknown, check: (v: unknown) => boolean) => value === undefined || check(value);
export function isProductionMediaUrl(value: unknown): value is string {
    if (!text(value) || !value.startsWith('/media/') || /[?#\\\s]/.test(value)) return false;
    try { const url = new URL(value, 'https://production.invalid'); return url.pathname === value && !decodeURIComponent(value).split('/').some(part => part === '.' || part === '..' || part.includes('\\')); }
    catch { return false; }
}
function mediaValid(value: unknown) {
    return object(value) && ['image', 'video', 'audio'].includes(String(value.kind))
        && (id(value.storageKey) || isProductionMediaUrl(value.url))
        && optional(value.storageKey, text) && optional(value.url, isProductionMediaUrl)
        && optional(value.mediaId, v => id(v) || positive(v)) && optional(value.durationMs, positive);
}

/** Validate editable data, not export readiness: incomplete timing and missing selections may be saved. */
export function validateProduction(value: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!object(value) || value.schemaVersion !== 1) return { valid: false, errors: ['不支持的制作文档版本，原内容未修改'] };
    if (!text(value.title)) errors.push('制作标题格式无效');
    const script = value.script;
    if (!object(script) || !text(script.original) || !text(script.draft) || !revision(script.revision) || !optional(script.adopted, text) || !optional(script.adoptedRevision, revision)) errors.push('剧本版本格式无效');
    const arrays = ['library', 'shots', 'narration', 'subtitles'] as const;
    if (arrays.some(key => !Array.isArray(value[key]))) return { valid: false, errors: [...errors, '制作文档缺少资料、镜头、旁白或字幕列表'] };
    const library = value.library as unknown[], shots = value.shots as unknown[], narration = value.narration as unknown[], subtitles = value.subtitles as unknown[];
    const unique = (items: unknown[], key: string, label: string) => {
        const seen = new Set<string>();
        for (const item of items) { if (!object(item) || !id(item[key]) || seen.has(item[key] as string)) errors.push(`${label}身份缺失或重复`); else seen.add(item[key] as string); }
        return seen;
    };
    const assetIds = unique(library, 'id', '资料'), shotIds = unique(shots, 'shotId', '镜头'), narrationIds = unique(narration, 'id', '旁白');
    unique(subtitles, 'id', '字幕');
    for (const item of library) if (!object(item) || !['character', 'scene', 'prop', 'style'].includes(String(item.kind)) || !text(item.name) || !text(item.description) || !revision(item.revision) || !Array.isArray(item.aliases) || !item.aliases.every(text) || !optional(item.media, mediaValid)) errors.push('资料内容格式无效');
    for (const item of shots) {
        if (!object(item) || !['title', 'description', 'action', 'prompt'].every(key => text(item[key])) || !optional(item.revision, revision) || !optional(item.mediaRevision, revision) || !optional(item.nodeId, id) || !optional(item.adoptedMedia, v => mediaValid(v) && (v as ProductionMedia).kind !== 'audio') || !Array.isArray(item.references)) { errors.push('镜头内容格式无效'); continue; }
        for (const ref of item.references) if (!object(ref) || !assetIds.has(String(ref.assetId)) || !revision(ref.revision)) errors.push('镜头引用的资料或版本无效');
    }
    for (const item of narration) if (!object(item) || !text(item.text) || !revision(item.revision) || !optional(item.mediaRevision, revision) || !Array.isArray(item.shotIds) || !item.shotIds.every(v => id(v)) || new Set(item.shotIds).size !== item.shotIds.length || !optional(item.model, text) || !optional(item.voice, text) || !optional(item.speed, positive) || !optional(item.media, v => mediaValid(v) && (v as ProductionMedia).kind === 'audio')) errors.push('旁白内容格式无效');
    for (const item of subtitles) if (!object(item) || !narrationIds.has(String(item.narrationId)) || !text(item.text) || !nonnegative(item.startMs) || !nonnegative(item.endMs) || !['model', 'estimated', 'manual'].includes(String(item.source)) || typeof item.reviewed !== 'boolean') errors.push('字幕内容格式无效');
    const composition = value.composition;
    if (!object(composition) || !object(composition.shots) || !object(composition.narration) || !object(composition.subtitles)) return { valid: false, errors: [...errors, '编排配置缺失'] };
    for (const [key, item] of Object.entries(composition.shots)) if (!shotIds.has(key) || !object(item) || typeof item.included !== 'boolean' || !['contain', 'cover'].includes(String(item.fit)) || !['none', 'zoom-in', 'zoom-out'].includes(String(item.motion)) || !nonnegative(item.transitionMs) || !nonnegative(item.originalAudioVolume) || !['durationMs', 'inMs', 'outMs'].every(k => optional(item[k], nonnegative)) || !['focusX', 'focusY'].every(k => optional(item[k], v => finite(v) && v >= 0 && v <= 1))) errors.push('镜头编排配置无效');
    for (const [key, item] of Object.entries(composition.narration)) if (!narrationIds.has(key) || !object(item) || !id(item.anchorShotId) || !nonnegative(item.offsetMs) || !nonnegative(item.volume) || typeof item.enabled !== 'boolean') errors.push('旁白放置配置无效');
    if (!optional(composition.output, v => object(v) && Number.isSafeInteger(v.width) && positive(v.width) && Number.isSafeInteger(v.height) && positive(v.height) && positive(v.fps))) errors.push('输出尺寸或帧率无效');
    if (typeof composition.subtitles.burnIn !== 'boolean' || !optional(composition.subtitles.fontSize, positive) || !optional(composition.subtitles.fontFamily, text)) errors.push('字幕样式无效');
    if (!optional(composition.bgm, v => object(v) && mediaValid(v.media) && (v.media as ProductionMedia).kind === 'audio' && nonnegative(v.inMs) && optional(v.outMs, nonnegative) && nonnegative(v.volume) && typeof v.loop === 'boolean')) errors.push('背景音乐配置无效');
    return { valid: !errors.length, errors: [...new Set(errors)] };
}
export function parseProduction(value: unknown): ProductionDocument {
    const result = validateProduction(value);
    if (!result.valid) throw new Error(result.errors.join('；'));
    return value as ProductionDocument;
}
export function collectProductionMediaKeys(production: ProductionDocument): string[] {
    const keys = new Set<string>();
    const add = (media?: ProductionMedia) => { if (media?.storageKey) keys.add(media.storageKey); if (media?.url) keys.add(media.url); };
    production.library.forEach(item => add(item.media)); production.shots.forEach(item => add(item.adoptedMedia)); production.narration.forEach(item => add(item.media)); add(production.composition.bgm?.media);
    return [...keys];
}
const upsert = <T>(items: T[], next: T, key: (item: T) => string) => items.some(item => key(item) === key(next)) ? items.map(item => key(item) === key(next) ? next : item) : [...items, next];
export function applyProductionOperation(source: ProductionDocument, operation: ProductionOperation): ProductionDocument {
    const p = structuredClone(source);
    switch (operation.type) {
        case 'replace': return parseProduction(structuredClone(operation.production));
        case 'script.edit': p.script = { ...p.script, draft: operation.text, original: operation.original ?? p.script.original, revision: p.script.revision + 1 }; break;
        case 'script.adopt': p.script.adopted = p.script.draft; p.script.adoptedRevision = p.script.revision; break;
        case 'asset.upsert': p.library = upsert(p.library, operation.asset, item => item.id); break;
        case 'asset.remove': if (p.shots.some(shot => shot.references.some(ref => ref.assetId === operation.id))) throw new Error('仍有镜头引用该资料，请先调整引用'); p.library = p.library.filter(item => item.id !== operation.id); break;
        case 'shot.upsert': { const previous = p.shots.find(item => item.shotId === operation.shot.shotId); const changed = previous && ['description', 'action', 'prompt', 'references'].some(key => JSON.stringify(previous[key as keyof ProductionShot]) !== JSON.stringify(operation.shot[key as keyof ProductionShot])); const next = { ...operation.shot, revision: previous ? (previous.revision || 1) + (changed ? 1 : 0) : operation.shot.revision || 1 }; p.shots = upsert(p.shots, next, item => item.shotId); break; }
        case 'shot.remove': p.shots = p.shots.filter(item => item.shotId !== operation.shotId); delete p.composition.shots[operation.shotId]; break;
        case 'shot.reorder': { const byId = new Map(p.shots.map(item => [item.shotId, item])); if (operation.shotIds.length !== p.shots.length || new Set(operation.shotIds).size !== p.shots.length || operation.shotIds.some(key => !byId.has(key))) throw new Error('镜头顺序必须完整且不能重复'); p.shots = operation.shotIds.map(key => byId.get(key)!); break; }
        case 'shot.adopt': { const shot = p.shots.find(item => item.shotId === operation.shotId); if (!shot) throw new Error('镜头已删除，结果仅保留在生产记录'); shot.adoptedMedia = operation.media; shot.mediaRevision = shot.revision || 1; break; }
        case 'narration.upsert': { const previous = p.narration.find(item => item.id === operation.narration.id); const changed = previous && (['text', 'model', 'voice', 'speed'] as const).some(key => previous[key] !== operation.narration[key]); const next = { ...operation.narration, revision: previous ? previous.revision + (changed ? 1 : 0) : operation.narration.revision }; p.narration = upsert(p.narration, next, item => item.id); break; }
        case 'narration.remove': p.narration = p.narration.filter(item => item.id !== operation.id); p.subtitles = p.subtitles.filter(item => item.narrationId !== operation.id); delete p.composition.narration[operation.id]; break;
        case 'subtitles.replace': if (operation.subtitles.some(item => item.narrationId !== operation.narrationId)) throw new Error('字幕旁白归属不一致'); p.subtitles = [...p.subtitles.filter(item => item.narrationId !== operation.narrationId), ...operation.subtitles]; break;
        case 'composition.replace': p.composition = operation.composition; break;
        default: throw new Error('未知制作操作');
    }
    return parseProduction(p);
}

export type TimelineShot = { shotId: string; media: ProductionMedia; startMs: number; endMs: number; durationMs: number; settings: ShotComposition };
export type TimelineNarration = { narrationId: string; media: ProductionMedia; startMs: number; endMs: number; volume: number };
export type ProductionTimeline = { valid: boolean; errors: string[]; durationMs: number; shots: TimelineShot[]; narration: TimelineNarration[]; subtitles: Array<ProductionSubtitle & { timelineStartMs: number; timelineEndMs: number }> };
/** Pure timing compiler shared by subtitle export, preview and server rendering. No implicit retiming. */
export function compileProductionTimeline(value: ProductionDocument): ProductionTimeline {
    const validation = validateProduction(value);
    const plan: ProductionTimeline = { valid: false, errors: [...validation.errors], durationMs: 0, shots: [], narration: [], subtitles: [] };
    if (!validation.valid) return plan;
    const p = value;
    const included = p.shots.filter(shot => p.composition.shots[shot.shotId]?.included !== false);
    for (let index = 0; index < included.length; index++) {
        const shot = included[index], settings = p.composition.shots[shot.shotId] ?? defaultShotComposition();
        const media = shot.adoptedMedia;
        if (!media) { plan.errors.push(`「${shot.title}」尚未采用画面`); continue; }
        if (shot.mediaRevision !== undefined && shot.mediaRevision !== (shot.revision || 1)) plan.errors.push(`「${shot.title}」采用画面对应旧输入，请重新生成或明确保留原画面`);
        const duration = media.kind === 'video' ? (settings.outMs ?? media.durationMs ?? 0) - (settings.inMs ?? 0) : settings.durationMs ?? 0;
        if (!(duration > 0)) { plan.errors.push(`「${shot.title}」需要有效的画面时长`); continue; }
        if (media.kind === 'video' && (!media.durationMs || (settings.outMs ?? media.durationMs) > media.durationMs)) plan.errors.push(`「${shot.title}」需探测视频时长或修正裁剪区间`);
        const previous = plan.shots.at(-1), overlap = previous ? settings.transitionMs : 0;
        if (overlap >= duration || (previous && overlap >= previous.durationMs)) plan.errors.push(`「${shot.title}」转场必须短于相邻镜头`);
        if (previous && (previous.settings.transitionMs + overlap >= previous.durationMs) && plan.shots.length > 1) plan.errors.push(`「${previous.shotId}」前后转场占满镜头，请缩短转场`);
        const startMs = plan.durationMs - overlap, endMs = startMs + duration;
        plan.shots.push({ shotId: shot.shotId, media, startMs, endMs, durationMs: duration, settings }); plan.durationMs = endMs;
    }
    if (!included.length) plan.errors.push('请至少加入一个镜头');
    const positions = new Map(included.map((shot, index) => [shot.shotId, index]));
    for (const line of p.narration) {
        const placement = p.composition.narration[line.id];
        if (placement?.enabled === false) continue;
        if (!line.media || !line.media.durationMs) { plan.errors.push(`旁白「${line.text.slice(0, 16)}」缺少采用音频或真实时长`); continue; }
        if (line.mediaRevision !== undefined && line.mediaRevision !== line.revision) plan.errors.push(`旁白「${line.text.slice(0, 16)}」音频对应旧文本或音色，请重新配音或明确采用原音频`);
        if (!placement) { plan.errors.push(`旁白「${line.text.slice(0, 16)}」尚未安排位置`); continue; }
        const indices = line.shotIds.map(key => positions.get(key));
        if (!indices.length || indices.some((v, i) => v === undefined || (i > 0 && v !== indices[i - 1]! + 1)) || placement.anchorShotId !== line.shotIds[0]) { plan.errors.push(`旁白「${line.text.slice(0, 16)}」关联镜头不再连续或锚点已改变，请重新安排`); continue; }
        const first = plan.shots.find(shot => shot.shotId === placement.anchorShotId), last = plan.shots.find(shot => shot.shotId === line.shotIds.at(-1));
        if (!first || !last) continue;
        const startMs = first.startMs + placement.offsetMs, endMs = startMs + line.media.durationMs;
        if (endMs > last.endMs || startMs < first.startMs) plan.errors.push(`旁白「${line.text.slice(0, 16)}」超出关联画面，请调整时长或位置`);
        plan.narration.push({ narrationId: line.id, media: line.media, startMs, endMs, volume: placement.volume });
        let previousEnd = 0;
        for (const cue of p.subtitles.filter(item => item.narrationId === line.id).sort((a, b) => a.startMs - b.startMs)) {
            if (cue.endMs <= cue.startMs || cue.endMs > line.media.durationMs || cue.startMs < previousEnd) plan.errors.push(`旁白「${line.text.slice(0, 16)}」的字幕存在重叠或越界`);
            previousEnd = cue.endMs;
            plan.subtitles.push({ ...cue, timelineStartMs: startMs + cue.startMs, timelineEndMs: startMs + cue.endMs });
        }
    }
    const narrations = [...plan.narration].sort((a, b) => a.startMs - b.startMs);
    for (let i = 1; i < narrations.length; i++) if (narrations[i].startMs < narrations[i - 1].endMs) plan.errors.push('旁白段在成片中重叠，请重新安排');
    const bgm = p.composition.bgm;
    if (bgm) { const length = (bgm.outMs ?? bgm.media.durationMs ?? 0) - bgm.inMs; if (!bgm.media.durationMs || length <= 0 || (bgm.outMs ?? 0) > bgm.media.durationMs) plan.errors.push('背景音乐区间无效或缺少真实时长'); }
    plan.errors = [...new Set(plan.errors)]; plan.valid = plan.errors.length === 0;
    return plan;
}

export function productionSrt(plan: ProductionTimeline): string {
    if (!plan.valid) throw new Error(plan.errors.join('；'));
    const stamp = (ms: number) => { const time = Math.round(ms); return `${Math.floor(time / 3600000).toString().padStart(2, '0')}:${Math.floor(time / 60000 % 60).toString().padStart(2, '0')}:${Math.floor(time / 1000 % 60).toString().padStart(2, '0')},${(time % 1000).toString().padStart(3, '0')}`; };
    return [...plan.subtitles].sort((a, b) => a.timelineStartMs - b.timelineStartMs).map((cue, i) => `${i + 1}\n${stamp(cue.timelineStartMs)} --> ${stamp(cue.timelineEndMs)}\n${cue.text.replace(/\r/g, '')}\n`).join('\n');
}
