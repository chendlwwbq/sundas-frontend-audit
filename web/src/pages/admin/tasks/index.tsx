import { useEffect, useState } from "react";
import { App, Button, Drawer, Input, Select, Table, Tabs, Tag } from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { adminTaskApi, type AdminTask, type Review } from "@/services/api/admin/tasks";
import { useAdminRequest } from "../use-admin-request";
import { AdminField, AdminPanel, AdminToolbar } from "../components/ui";
import { HeldTasksTab } from "../components/held-tasks";
import { TaskSummary } from "./task-summary";
import { Link, useSearchParams } from "react-router-dom";
import { useAdminPermissions } from "../permissions";

const statuses:Record<string,string>={queued:"排队中",running:"进行中",succeeded:"成功",failed:"失败",pending:"待核对",follow_up:"继续跟进",resolved:"已核对"};
export function TasksTab() {
    const request=useAdminRequest(), api=adminTaskApi(request); const {message}=App.useApp();
    const permissions=useAdminPermissions();
    const [urlParams]=useSearchParams();
    const [mode,setMode]=useState(urlParams.get("view") === "held" || !permissions.includes("tasks.read") ? "held" : "all"), [page,setPage]=useState(1), [total,setTotal]=useState(0), [pageSize,setPageSize]=useState(20), [loading,setLoading]=useState(false);
    useEffect(()=>{if(mode === "all" && !permissions.includes("tasks.read")) setMode("held");},[mode,permissions]);
    const [rows,setRows]=useState<AdminTask[]>([]), [userId,setUserId]=useState(urlParams.get("userId")??""), [type,setType]=useState(urlParams.get("type")??""), [status,setStatus]=useState(urlParams.get("status")??""), [errorCategory,setErrorCategory]=useState(urlParams.get("errorCategory")??""), [reviewFilter,setReviewFilter]=useState(urlParams.get("review")??""), [channelId,setChannelId]=useState(urlParams.get("channelId")??""), [modelId,setModelId]=useState(urlParams.get("modelId")??""), [from,setFrom]=useState(urlParams.get("from")??""), [to,setTo]=useState(urlParams.get("to")??""), [query,setQuery]=useState(()=>{const q=new URLSearchParams(urlParams);q.delete("tab");return q.toString();});
    const [detail,setDetail]=useState<{task:AdminTask;reservations:Record<string,unknown>[];ledger:Record<string,unknown>[];media:{id:string;kind:string;mime:string;bytes:string;url:string}[];textResult:string|null} | null>(null), [reviews,setReviews]=useState<Review[]>([]), [reviewState,setReviewState]=useState("pending"), [note,setNote]=useState(""), [saving,setSaving]=useState(false);
    const [upstream,setUpstream]=useState<{checkedAt:string;status?:string|null;progress?:string|null;message:string}|null>(null), [checking,setChecking]=useState(false);
    async function checkUpstream(){if(!detail)return;setChecking(true);setUpstream(null);try{setUpstream(await api.upstream(detail.task.id));}catch(e){report(e);}finally{setChecking(false);}}
    const report=(e:unknown)=>message.error(e instanceof Error?e.message:String(e));
    async function load() { setLoading(true); try {const params=new URLSearchParams(query);params.set("page",String(page)); const result=await api.list(params);setRows(result.items);setTotal(result.total);setPageSize(result.pageSize);} catch(e){report(e);} finally{setLoading(false);} }
    useEffect(()=>{if(mode==="all" && permissions.includes("tasks.read")) void load();},[mode,page,query,request,permissions]);
    async function open(id:string) {setUpstream(null);try { const [data,history]=await Promise.all([api.detail(id),api.reviews(id)]);setDetail(data);setReviews(history.items);setNote(""); }catch(e){report(e);} }
    async function save() {if(!detail)return;setSaving(true);try{await api.review(detail.task.id,reviewState,note);setReviews((await api.reviews(detail.task.id)).items);setNote("");message.success("已记录核对说明");}catch(e){report(e);}finally{setSaving(false);} }
    function search(){const params=new URLSearchParams();if(userId.trim())params.set("userId",userId.trim());if(type)params.set("type",type);if(status)params.set("status",status);if(errorCategory)params.set("errorCategory",errorCategory);if(reviewFilter)params.set("review",reviewFilter);if(channelId.trim())params.set("channelId",channelId.trim());if(modelId.trim())params.set("modelId",modelId.trim());if(from)params.set("from",from);if(to)params.set("to",to);setPage(1);setQuery(params.toString());}
    const columns:TableColumnsType<AdminTask>=[
        {title:"用户",dataIndex:"email"},{title:"类型",dataIndex:"type"},{title:"模型",dataIndex:"modelName"},{title:"渠道",dataIndex:"channelName",render:(v:string|null)=>v??"—"},
        {title:"状态",dataIndex:"status",render:(v:string,row)=><Tag>{row.reconciliationRequired?"待核对":statuses[v]??v}</Tag>},
        {title:"冻结 / 结算",render:(_,row)=>`${row.creditsHeld} / ${row.creditsCharged}`},
        {title:"创建时间",dataIndex:"createdAt",render:(v:string)=>dayjs(v).format("YYYY-MM-DD HH:mm")},
        {title:"操作",render:(_,row)=><Button size="small" onClick={()=>void open(row.id)}>详情</Button>},
    ];
    const objectColumns=(values:Record<string,unknown>[])=>values.length?Object.keys(values[0]).map(key=>({title:key,dataIndex:key,key,render:(v:unknown)=>v==null?"—":String(v)})):[];
    return <div className="space-y-5"><Tabs activeKey={mode} onChange={setMode} items={[...(permissions.includes("tasks.read")?[{key:"all",label:"全部任务"}]:[]),...((permissions.includes("tasks.read") || permissions.includes("credits.read"))?[{key:"held",label:"冻结与异常"}]:[])]} />
        {mode==="held"?<HeldTasksTab />:<AdminPanel title="任务列表" actions={<Button loading={loading} onClick={()=>void load()}>刷新</Button>} flush><AdminToolbar><Input placeholder="用户 ID" value={userId} onChange={e=>setUserId(e.target.value)} className="max-w-60"/><Select value={type} onChange={setType} options={[{value:"",label:"全部类型"},...['image','video','text','audio'].map(value=>({value,label:value}))]} /><Select value={status} onChange={setStatus} options={[{value:"",label:"全部状态"},...['queued','running','succeeded','failed'].map(value=>({value,label:statuses[value]}))]} /><Select value={reviewFilter} onChange={setReviewFilter} options={[{value:"",label:"全部核对状态"},{value:"pending",label:"待核对任务"}]}/><Select value={errorCategory} onChange={setErrorCategory} options={[{value:"",label:"全部失败分类"},{value:"timeout",label:"超时"},{value:"network",label:"网络或连接"},{value:"upstream",label:"上游服务"},{value:"invalid",label:"参数或格式"},{value:"review",label:"待核对"},{value:"unknown",label:"未知"},{value:"other",label:"其他"}]}/><Input placeholder="渠道 ID" value={channelId} onChange={e=>setChannelId(e.target.value)} className="max-w-48"/><Input placeholder="模型 ID" value={modelId} onChange={e=>setModelId(e.target.value)} className="max-w-48"/><Input placeholder="开始时间 ISO" value={from} onChange={e=>setFrom(e.target.value)} className="max-w-48"/><Input placeholder="结束时间 ISO" value={to} onChange={e=>setTo(e.target.value)} className="max-w-48"/><Button onClick={search}>查询</Button></AdminToolbar><Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{x:950}} pagination={{current:page,total,pageSize,showSizeChanger:false,onChange:setPage}} /></AdminPanel>}
        <Drawer open={Boolean(detail)} onClose={()=>setDetail(null)} title="任务详情" width={850}>{detail && <div className="space-y-4"><p>任务 ID：{detail.task.id}</p>{detail.task.type === "video" && <div className="space-y-2"><p>上游任务编号：{detail.task.upstreamId || "未取得，无法确认上游是否运行"}</p><Button loading={checking} onClick={()=>void checkUpstream()}>查询上游状态</Button>{upstream && <p>查询时间：{dayjs(upstream.checkedAt).format("YYYY-MM-DD HH:mm:ss")} · 状态：{upstream.status || "未知"} · 进度：{upstream.progress ?? "上游未提供"}<br/>{upstream.message}</p>}</div>}<p>用户：{permissions.includes("users.read") ? <Link to={`/admin?tab=users&search=${encodeURIComponent(detail.task.email)}`}>{detail.task.email}</Link> : detail.task.email} · {detail.task.userId}</p><p>渠道：{detail.task.channelId ? <Link to={`/admin?${new URLSearchParams({tab:"analytics",channelId:detail.task.channelId})}`}>{detail.task.channelName ?? detail.task.channelId}</Link> : "未知"}　模型：{detail.task.modelId ? <Link to={`/admin?${new URLSearchParams({tab:"analytics",modelId:detail.task.modelId})}`}>{detail.task.modelName}</Link> : detail.task.modelName}</p><p>上游任务 ID：{detail.task.upstreamId??"—"}</p><p>错误：{detail.task.error??"—"}</p><TaskSummary task={detail.task}/>{detail.textResult && <><h3>文本结果</h3><p className="whitespace-pre-wrap break-words">{detail.textResult}</p></>}{detail.media.length > 0 && <><h3>生成文件</h3><ul>{detail.media.map(item=><li key={item.id}><a href={item.url} target="_blank" rel="noreferrer">{item.kind} · {item.mime}</a></li>)}</ul></>}<h3>冻结记录</h3><Table rowKey={(_,i)=>String(i)} size="small" columns={objectColumns(detail.reservations)} dataSource={detail.reservations} pagination={false} scroll={{x:true}}/><h3>积分流水</h3><Table rowKey={(_,i)=>String(i)} size="small" columns={objectColumns(detail.ledger)} dataSource={detail.ledger} pagination={false} scroll={{x:true}}/><h3>核对记录</h3>{reviews.map(item=><p key={item.id}>{dayjs(item.createdAt).format("YYYY-MM-DD HH:mm")} · {item.operator} · {statuses[item.state]}：{item.note}</p>)}{permissions.includes("tasks.review") && <><AdminField label="核对状态"><Select value={reviewState} onChange={setReviewState} options={['pending','follow_up','resolved'].map(value=>({value,label:statuses[value]}))}/></AdminField><AdminField label="核对说明"><Input.TextArea value={note} onChange={e=>setNote(e.target.value)} /></AdminField><Button type="primary" loading={saving} onClick={()=>void save()}>保存核对记录</Button></>}</div>}</Drawer>
    </div>;
}






