import { ApiError,apiRequest } from './client';

export const MEDIA_PREVIEW_POLL_MS=3000;
function waitForPreview(signal:AbortSignal) {
    return new Promise<void>((resolve,reject)=>{
        if (signal.aborted) {reject(new DOMException('Aborted','AbortError'));return;}
        const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
        const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},MEDIA_PREVIEW_POLL_MS);
        signal.addEventListener('abort',abort,{once:true});
    });
}
export async function fetchMediaPreview(key:string,userId:string,signal:AbortSignal,manual=false) {
    const path=`/api/media/preview?${new URLSearchParams({key})}`;
    const headers={'X-Sundas-User':userId};
    let requested=false;
    while (!signal.aborted) {
        const response=await fetch(path,{credentials:'include',signal,headers});
        if (response.status===202) {
            const status=await response.json();
            if (!requested && (status.state==='missing' || manual && status.state==='failed')) {
                await apiRequest('/api/media/preview',{method:'POST',json:{key},headers,signal});
                requested=true;
            } else if (status.state==='failed') {
                throw new ApiError(status.error||'预览生成未完成，请重试',409);
            }
            await waitForPreview(signal);continue;
        }
        if (!response.ok) {
            const payload=await response.json().catch(()=>null);
            throw new ApiError(payload?.message||'预览加载失败',response.status);
        }
        return response.blob();
    }
    throw new DOMException('Aborted','AbortError');
}
