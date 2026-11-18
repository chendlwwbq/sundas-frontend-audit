import { demoRequest } from '@/audit/demo';
export type ApiRequestInit = RequestInit & { json?: unknown };
export class ApiError extends Error {
 constructor(message:string,public status:number,public errorCode?:string){super(message);}
}
export async function apiRequest<T=unknown>(path:string,init:ApiRequestInit={}):Promise<T>{return demoRequest(path,init) as Promise<T>;}
