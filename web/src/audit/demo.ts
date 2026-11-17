/** Synthetic presentation fixtures. No real account, generation, billing or storage service. */
export const demoUser={id:'00000000-0000-4000-8000-000000000001',email:'reviewer@example.invalid',displayName:'设计审计',role:'admin',status:'active'};
const wallet={balance:1000,availableCredits:1000,held:0,member:true,memberUntil:null,planName:'演示账户',generationDiscount:1,storage:{usedBytes:0,limitBytes:1073741824}};
const gallery=['adventure','anime','cozy','cyber','ocean','portrait','surreal','wild'];
const prompts=gallery.map((name,i)=>({id:`demo-${name}`,sourceId:'demo',category:i%2?'动画动漫':'影视作品',title:['奇遇之旅','动画世界','温暖时光','未来城市','海洋之梦','人物光影','超现实想象','自然探索'][i],prompt:'用于界面审计的示例提示词，展示构图、光影和叙事风格。',description:'本地演示素材',coverUrl:`/hero-media/hero-${name}.jpg`,previewVideoUrl:`/hero-media/hero-${name}.mp4`,referenceImageUrls:[],tags:['示例','灵感'],preview:'',githubUrl:'',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'}));
const models=['image','video','text','audio'].map((capability,i)=>({id:`00000000-0000-4000-8000-00000000001${i}`,name:['示例图片模型','Seedance 2.0 · 演示','示例视觉对话模型','示例语音模型'][i],capability,description:'仅供交互审计，不连接真实模型',metadata:capability==='text'?{supportsVision:true}:{},health:'healthy',minCredits:0,maxCredits:0,routeCount:1,unit:'request',resolutionMultipliers:{'720':1,'1080':1,'2160':1},routes:[{id:`demo-route-${i}`,channelName:'本地演示',unit:'request',baseCredits:0,health:'healthy',resolutionMultipliers:{'720':1,'1080':1,'2160':1}}]}));
const projects=new Map<string,Record<string,any>>();
let loggedIn=true;
export class DemoOnlyError extends Error {status=400;errorCode='DESIGN_AUDIT_ONLY';}
export async function demoRequest(path:string,init:{method?:string;json?:unknown;body?:unknown;signal?:AbortSignal|null}={}):Promise<any>{
 if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');
 const url=new URL(path,location.origin),route=url.pathname.replace(/\/$/,''),method=(init.method||'GET').toUpperCase();
 const body=(init.json??(typeof init.body==='string'?JSON.parse(init.body||'{}'):{})) as Record<string,any>;
 if(route==='/api/auth/me')return{user:loggedIn?demoUser:null,wallet};
 if(route==='/api/auth/logout'){loggedIn=false;return{};}
 if(route==='/api/auth/login'||route==='/api/auth/register'){loggedIn=true;return{user:demoUser};}
 if(route==='/api/wallet')return wallet;
 if(route==='/api/models')return{models};
 if(route==='/api/site')return{site:{name:'SUNDAS · 设计审计',description:'公开前端交互审计演示'},home:{},creditPriceCents:0,minCredits:0,payTypes:[],providers:[],announcements:[]};
 if(route==='/api/prompts'){const keyword=url.searchParams.get('keyword')||'';const items=prompts.filter(x=>!keyword||(x.title+x.prompt).includes(keyword));return{items,tags:['示例','灵感'],categories:['影视作品','动画动漫'],total:items.length,page:1,pageSize:20,hasMore:false};}
 if(route==='/api/prompts/sources')return{items:[{id:'demo',name:'演示素材',count:8}],sources:[{id:'demo',name:'演示素材',count:8}]};
 if(route.startsWith('/api/pricing/'))return{minCredits:0,maxCredits:0,member:true};
 if(route==='/api/prompts/optimize/estimate')return{credits:0,minCredits:0,maxCredits:0,available:true};
 if(route==='/api/prompts/optimize')return{prompt:String(body.prompt||'')+'，注重构图和光影层次。',skill:{key:'demo',label:'本地示例'},creditsCharged:0};
 if((route==='/api/creation-chat/settings'||route==='/api/creation-chat/config'))return{enabled:true,modelId:models[2].id,supportsVision:true};
 if(route==='/api/canvas/projects'){
  if(method==='POST'){const project={...body,id:body.id||crypto.randomUUID(),version:1,updatedAt:new Date().toISOString()};projects.set(project.id,project);return{project};}
  return{projects:[...projects.values()],items:[...projects.values()],hasMore:false};
 }
 if(route.startsWith('/api/canvas/projects/')){const id=route.split('/')[4];
  if(method==='DELETE'){projects.delete(id);return{};}
  if(method==='PUT'||method==='PATCH'){const project={...projects.get(id),...body,id,version:Number(projects.get(id)?.version||0)+1};projects.set(id,project);return{project,...project};}
  const project=projects.get(id);if(project)return{project,...project};throw new DemoOnlyError('此演示画布尚未建立，请从我的画布新建。');
 }
 if(route==='/api/uploads/config')return{direct:false};
 if(/\/promo(?:\/|$)/.test(route))return{items:[],banners:[],slots:[],total:0};
 if(route.includes('/generations/history'))return{items:[],hiddenTaskIds:[],hasMore:false};
 if(method==='GET')return{items:[],assets:[],projects:[],threads:[],requests:[],plans:[],packages:[],skills:[],total:0,page:1,pageSize:20,hasMore:false,nextCursor:null};
 throw new DemoOnlyError('这是前端设计审计演示，此操作需要真实服务，演示中未执行。');
}
