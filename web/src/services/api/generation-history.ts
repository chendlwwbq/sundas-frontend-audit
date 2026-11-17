import { apiRequest } from './client';

type HistoryMedia = { id:string;kind:string;url:string;mime:string;bytes:number };
type HistoryTask = { id:string;type:string;modelId:string|null;modelName:string;routeId?:string|null;params:Record<string,unknown>;status:string;error:string|null;createdAt:string;finishedAt:string|null;creditsCharged?:number;reconciliationRequired?:boolean;media:HistoryMedia[] };
export type RestoredLog = {
    id:string;serverTaskIds:string[];createdAt:number;title:string;prompt:string;time:string;model:string;
    config:Record<string,string>;references:[];durationMs:number;size:string;resolution:string;seconds:string;
    status:'success'|'failed'|'pending'|'unavailable';error?:string;
    task?:{id:string;provider:'openai';model:string};
    images:{id:string;dataUrl:string;storageKey?:string;width:number;height:number;bytes:number;mimeType:string;durationMs:number}[];
    video?:{id:string;url:string;storageKey:string;width:number;height:number;bytes:number;mimeType:string;durationMs:number};
    successCount:number;failCount:number;imageCount:number;
    creditsCharged?:number;reconciliationRequired?:boolean;referenceCount?:number;referenceHistoryUnknown?:boolean;
};
export async function fetchRecentGenerationHistory(owner:string,type:'image'|'video') {
    const data=await apiRequest<{items:HistoryTask[]}>(`/api/generations/history?type=${type}&page=1`,{headers:{'X-Sundas-User':owner}});
    return data.items.map(row=>({id:row.id,title:String(row.params.prompt??'').replace(/^参考图片编号：[^\n]*\n+/, '').replace(/^Reference image labels:[^\n]*\n+/i, '').trim().slice(0,80)||row.modelName,createdAt:new Date(row.createdAt).getTime(),mode:type}));
}
export async function fetchGenerationHistory(owner:string,type:'image'|'video',page=1, filter: { id?: string; active?: boolean } = {}) {
    const params = new URLSearchParams({ type, page: String(page), ...(filter.id ? { id: filter.id } : {}), ...(filter.active ? { active: 'true' } : {}) });
    const data=await apiRequest<{items:HistoryTask[];hasMore:boolean;hiddenTaskIds:string[]}>(`/api/generations/history?${params}`,{headers:{'X-Sundas-User':owner}});
    const logs:RestoredLog[]=data.items.map(row=>{
        const modelId=row.modelId??'';
        const createdAt=new Date(row.createdAt).getTime();
        const durationMs=row.finishedAt?Math.max(0,new Date(row.finishedAt).getTime()-createdAt):0;
        const prompt=String(row.params.prompt??'').replace(/^参考图片编号：[^\n]*\n+/, '').replace(/^Reference image labels:[^\n]*\n+/i, '').trim();
        const images=row.media.filter(m=>m.kind==='image').map(m=>({id:m.id,dataUrl:m.url,width:0,height:0,bytes:Number(m.bytes),mimeType:m.mime,durationMs}));
        const media=row.media.find(m=>m.kind==='video');
        const status=row.status==='succeeded'?(row.media.length?'success':'unavailable'):row.status==='failed'?'failed':'pending';
        return {id:row.id,serverTaskIds:[row.id],createdAt,title:prompt.slice(0,80)||row.modelName,prompt,time:new Date(createdAt).toLocaleString(),model:row.modelName,
            config:{model:modelId,imageModel:modelId,videoModel:modelId,videoRouteId:row.routeId??'',size:String(row.params.size??''),vquality:String(row.params.resolution??''),videoSeconds:String(row.params.seconds??''),videoMode:String(row.params.mode??''),videoGenerateAudio:String(row.params.generateAudio??row.params.generate_audio??''),videoWatermark:String(row.params.watermark??''),count:String(images.length||1),quality:String(row.params.quality??''),background:String(row.params.background??'')},
            references:[],durationMs,size:String(row.params.size??''),resolution:String(row.params.resolution??''),seconds:String(row.params.seconds??''),status,
            error:row.error??(status==='unavailable'?'生成结果文件暂不可用':undefined),task:type==='video'?{id:row.id,provider:'openai',model:modelId}:undefined,
            images,video:media?{id:media.id,url:media.url,storageKey:'',width:0,height:0,bytes:Number(media.bytes),mimeType:media.mime,durationMs}:undefined,
            successCount:images.length,failCount:status==='failed'?1:0,imageCount:images.length,
            creditsCharged:!row.reconciliationRequired && ['succeeded','failed'].includes(row.status) && row.creditsCharged != null ? Number(row.creditsCharged) : undefined,
            reconciliationRequired:row.reconciliationRequired,referenceCount:Array.isArray(row.params.referenceInputs)?row.params.referenceInputs.length:undefined,
            referenceHistoryUnknown:type==='image' && (!Array.isArray(row.params.referenceInputs) || row.params.referenceInputs.length>0)};
    });
    return {logs,hiddenTaskIds:data.hiddenTaskIds,hasMore:data.hasMore};
}

// Keep previously opened pages while refreshing the newest page after a task
// update. Requests are serialized so a refresh and an older-page load cannot
// overwrite one another.
export class GenerationHistoryPager {
    private records = new Map<string, RestoredLog>();
    private activeIds = new Set<string>();
    private hidden: string[] = [];
    private nextPage = 1;
    private more = true;
    private queue: Promise<unknown> = Promise.resolve();

    constructor(private owner: string, private type: 'image' | 'video') {}

    private enqueue<T>(run: () => Promise<T>): Promise<T> {
        const result = this.queue.then(run, run);
        this.queue = result.catch(() => undefined);
        return result;
    }

    private async fetch(page: number) {
        const data = await fetchGenerationHistory(this.owner, this.type, page);
        this.hidden = data.hiddenTaskIds;
        for (const id of this.hidden) this.records.delete(id);
        for (const log of data.logs) this.records.set(log.id, log);
        if (page >= this.nextPage) {
            this.nextPage = page + 1;
            this.more = data.hasMore;
        }
        return this.snapshot();
    }

    refresh() { return this.enqueue(async () => {
        await this.fetch(1);
        const active = new Set<string>();
        for (let page = 1; ; page++) {
            const result = await fetchGenerationHistory(this.owner, this.type, page, { active: true });
            for (const log of result.logs) { active.add(log.id); this.records.set(log.id, log); }
            if (!result.hasMore) break;
        }
        for (const id of this.activeIds) {
            if (!active.has(id)) await this.readRecord(id);
        }
        this.activeIds = active;
        return this.snapshot();
    }); }
    private async readRecord(id: string) {
        const result = await fetchGenerationHistory(this.owner, this.type, 1, { id });
        this.hidden = result.hiddenTaskIds;
        for (const hidden of this.hidden) this.records.delete(hidden);
        if (!result.logs.length) this.records.delete(id);
        for (const log of result.logs) this.records.set(log.id, log);
        return this.snapshot();
    }
    loadRecord(id: string) { return this.enqueue(() => this.readRecord(id)); }
    loadMore() { return this.enqueue(() => this.more ? this.fetch(this.nextPage) : Promise.resolve(this.snapshot())); }
    snapshot() { return { logs: [...this.records.values()], hiddenTaskIds: this.hidden, hasMore: this.more }; }
}
type MergeLog = {id:string;createdAt:number;serverTaskIds?:string[];task?:{id:string};images?:{dataUrl:string}[];video?:unknown;references?:unknown[];config?:unknown;prompt?:string;model?:string;status?:string;creditsCharged?:number;reconciliationRequired?:boolean;referenceHistoryUnknown?:boolean};
function plainPrompt(log: MergeLog) {
    return (log.prompt ?? '').replace(/^参考图片编号：[^\n]*\n+/, '').replace(/^Reference image labels:[^\n]*\n+/i, '').trim();
}
function mergeVideoConfig(local: unknown, remote: unknown) {
    if (!local || typeof local !== 'object') return remote;
    if (!remote || typeof remote !== 'object') return local;
    const remoteConfig = remote as Record<string, unknown>;
    const localValues = Object.fromEntries(Object.entries(local).filter(([, value]) => value !== '' && value != null));
    return { ...remoteConfig, ...localValues, ...(remoteConfig.videoRouteId ? { videoRouteId: remoteConfig.videoRouteId } : {}) };
}
export function generationTaskIds(log:MergeLog) { return log.serverTaskIds??(log.task?[log.task.id]:[]); }
export function mergeGenerationHistory<T extends MergeLog>(local:T[],remote:T[],hidden:string[]) {
    const remaining=new Map(remote.map(log=>[log.id,log]));
    const merged:T[]=[];
    for(const log of local) {
        const ids=generationTaskIds(log);
        if(ids.some(id=>hidden.includes(id)))continue;
        const matches=remote.filter(item=>ids.includes(item.id)||log.images?.some(image=>item.images?.some(remoteImage=>image.dataUrl===remoteImage.dataUrl))||(!ids.length&&!log.images?.length&&item.status==='failed'&&log.status==='failed'&&log.model===item.model&&plainPrompt(log)&&plainPrompt(log)===plainPrompt(item)&&Math.abs(item.createdAt-log.createdAt)<=15_000));
        const match=matches[0];
        if(match) {
            matches.forEach(item=>remaining.delete(item.id));
            const value=log.task?{...log,...match,id:log.id,references:log.references??match.references,config:mergeVideoConfig(log.config,match.config),video:match.video??log.video,status:match.status==='pending' && log.status && log.status!=='pending'?log.status:match.status}:{...match,...log};
            const completeMatch=ids.length ? ids.every(id=>matches.some(item=>item.id===id)) : (log.images?.length??0)<=1 && matches.length===1;
            merged.push({...value,...(!log.task && Array.isArray(log.references)?{referenceHistoryUnknown:false}:{}),serverTaskIds:[...new Set([...ids,...matches.map(item=>item.id)])],reconciliationRequired:matches.some(item=>item.reconciliationRequired),creditsCharged:completeMatch && matches.every(item=>item.creditsCharged != null)?matches.reduce((sum,item)=>sum+(item.creditsCharged??0),0):undefined});
        } else merged.push(log);
    }
    return [...merged,...remaining.values()].sort((a,b)=>b.createdAt-a.createdAt);
}
export async function hideGenerationHistory(owner:string,ids:string[]) {
    await Promise.all([...new Set(ids)].map(id=>apiRequest(`/api/generations/history/${encodeURIComponent(id)}`,{method:'DELETE',headers:{'X-Sundas-User':owner}})));
}
