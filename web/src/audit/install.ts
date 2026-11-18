import axios from 'axios';
import {demoRequest} from './demo';
const localFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const raw=input instanceof Request?input.url:String(input),url=new URL(raw,location.href);
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/v1/')){
  try{return Response.json(await demoRequest(url.href,{method:init?.method||(input instanceof Request?input.method:'GET'),body:init?.body,signal:init?.signal}));}
  catch(error){return Response.json({message:error instanceof Error?error.message:'演示功能未连接'},{status:400});}
 }
 if(url.origin!==location.origin&&!['blob:','data:'].includes(url.protocol))throw new Error('公开审计演示只使用本地资源');
 return localFetch(input,init);
};
axios.defaults.adapter=async config=>({data:await demoRequest(String(config.url||''),{method:config.method,body:config.data,signal:config.signal as AbortSignal}),status:200,statusText:'Demo',headers:{},config});
window.__RUNTIME_CONFIG__={};
const badge=document.createElement('div');badge.textContent='设计审计演示 · 所有数据为示例';badge.style.cssText='position:fixed;bottom:6px;left:10px;z-index:99999;font:11px system-ui;color:#aaa;pointer-events:none';
if(document.body)document.body.append(badge);else document.addEventListener('DOMContentLoaded',()=>document.body.append(badge));
