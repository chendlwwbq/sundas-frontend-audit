import type { ApiRequestInit } from "../client";
type Request = <T=unknown>(path:string,init?:ApiRequestInit)=>Promise<T>;
export type Summary={total:number;succeeded:number;failed:number;queued:number;running:number;pending:number;creditsCharged:number;creditsHeld:number;successRate:number|null;estimatedCostCents:number|null;noSnapshot:number};
export type StatsRow={channelId:string|null;channelName:string|null;modelId:string|null;modelName:string;type:string;total:number;succeeded:number;failed:number;queued:number;running:number;pending:number;creditsCharged:string;creditsHeld:string};
export const analyticsApi=(request:Request)=>({
    tasks:(query:URLSearchParams)=>request<{summary:Summary;items:StatsRow[]}>(`/api/admin/analytics/tasks?${query}`),
    errors:(query:URLSearchParams)=>request<{items:{category:string;count:number}[]}>(`/api/admin/analytics/task-errors?${query}`),
    channel:(id:string)=>request<{channel:Record<string,unknown>;models:Record<string,unknown>[];summary:Summary}>(`/api/admin/channels/${encodeURIComponent(id)}/overview`),
    model:(id:string)=>request<{model:Record<string,unknown>;summary:Summary}>(`/api/admin/models/${encodeURIComponent(id)}/overview`),
});
