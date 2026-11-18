import type { ApiRequestInit } from "../client";
type Request=<T=unknown>(path:string,init?:ApiRequestInit)=>Promise<T>;
export const adminDashboardApi=(request:Request)=>({todos:()=>request<{items:{key:string;label:string;count:number;tab:string}[]}>("/api/admin/dashboard/todos")});
