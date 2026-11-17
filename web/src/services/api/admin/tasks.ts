import type { ApiRequestInit } from "../client";
type Request = <T = unknown>(path: string, init?: ApiRequestInit) => Promise<T>;
export type AdminTask = { id:string; userId:string; email:string; type:string; modelId:string | null; modelName:string; status:string; channelId:string | null; channelName:string | null; upstreamId:string | null; creditsHeld:number; creditsCharged:number; error:string | null; createdAt:string; finishedAt:string | null; reconciliationRequired:boolean; params?:Record<string,unknown>; executionSnapshot?:Record<string,unknown>|null; resultSummary?:Record<string,unknown>|null };
export type Review = { id:string; state:string; note:string; operator:string; createdAt:string };
export const adminTaskApi = (request: Request) => ({
    upstream: (id:string) => request<{checkedAt:string;status?:string|null;progress?:string|null;message:string}>(`/api/admin/tasks/${encodeURIComponent(id)}/upstream`),
    list: (query: URLSearchParams) => request<{items:AdminTask[]; total:number; pageSize:number}>(`/api/admin/tasks?${query}`),
    detail: (id:string) => request<{ task:AdminTask; reservations:Record<string,unknown>[]; ledger:Record<string,unknown>[]; media:{id:string;kind:string;mime:string;bytes:string;url:string}[]; textResult:string|null }>(`/api/admin/tasks/${encodeURIComponent(id)}`),
    reviews: (id:string) => request<{items:Review[]}>(`/api/admin/tasks/${encodeURIComponent(id)}/reviews`),
    review: (id:string,state:string,note:string) => request(`/api/admin/tasks/${encodeURIComponent(id)}/reviews`,{method:"POST",json:{state,note}}),
});
