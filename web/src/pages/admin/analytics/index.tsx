import { useEffect, useState } from "react";
import { App, Button, DatePicker, Drawer, Input, Select, Table } from "antd";
import type { TableColumnsType } from "antd";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import { analyticsApi, type Summary, type StatsRow } from "@/services/api/admin/analytics";
import { useAdminRequest } from "../use-admin-request";
import { AdminField, AdminPanel } from "../components/ui";
import { useAdminPermissions } from "../permissions";
import { Overview } from "./overview";

const errorLabels:Record<string,string>={review:"待核对",unknown:"未知",timeout:"超时",network:"网络或连接",upstream:"上游服务",invalid:"参数或格式",other:"其他"};
export function AnalyticsTab() {
    const request=useAdminRequest(),api=analyticsApi(request),navigate=useNavigate(),{message}=App.useApp();
    const permissions=useAdminPermissions();
    const [urlParams]=useSearchParams();
    const [channelId,setChannel]=useState(urlParams.get("channelId")??""),[modelId,setModel]=useState(urlParams.get("modelId")??""),[type,setType]=useState(urlParams.get("type")??""),[from,setFrom]=useState(""),[to,setTo]=useState("");
    const [summary,setSummary]=useState<Summary|null>(null),[rows,setRows]=useState<StatsRow[]>([]),[errors,setErrors]=useState<{category:string;count:number}[]>([]),[loading,setLoading]=useState(false);
    const [appliedQuery,setAppliedQuery]=useState("");
    const [detail,setDetail]=useState<{title:string;data:Record<string,unknown>}|null>(null);
    const report=(e:unknown)=>message.error(e instanceof Error?e.message:String(e));
    const params=()=>{const q=new URLSearchParams();if(channelId.trim())q.set("channelId",channelId.trim());if(modelId.trim())q.set("modelId",modelId.trim());if(type)q.set("type",type);if(from)q.set("from",new Date(`${from}T00:00:00`).toISOString());if(to){const d=new Date(`${to}T00:00:00`);d.setDate(d.getDate()+1);q.set("to",d.toISOString());}return q;};
    async function load(){setLoading(true);try{const q=params();const [data,failures]=await Promise.all([api.tasks(q),api.errors(q)]);setSummary(data.summary);setRows(data.items);setErrors(failures.items);setAppliedQuery(q.toString());}catch(e){report(e);}finally{setLoading(false);}}
    useEffect(()=>{void load();},[request]);
    function viewTasks(row:StatsRow,failed=false){const q=new URLSearchParams(appliedQuery);q.set("tab","tasks");if(row.channelId)q.set("channelId",row.channelId);if(row.modelId)q.set("modelId",row.modelId);if(row.type)q.set("type",row.type);if(failed)q.set("status","failed");navigate(`/admin?${q}`);}
    function viewErrors(category:string){const q=new URLSearchParams(appliedQuery);q.set("tab","tasks");q.set("status","failed");q.set("errorCategory",category);navigate(`/admin?${q}`);}
    async function show(kind:"channel"|"model",id:string){try{setDetail({title:kind==="channel"?"渠道详情":"模型详情",data:kind==="channel"?await api.channel(id):await api.model(id)});}catch(e){report(e);}}
    const columns:TableColumnsType<StatsRow>=[{title:"渠道",render:(_,r)=>r.channelId && permissions.includes("channels.read")?<Button type="link" onClick={()=>void show("channel",r.channelId!)}>{r.channelName??r.channelId}</Button>:(r.channelName??"未知")},{title:"模型",render:(_,r)=>r.modelId && permissions.includes("models.read")?<Button type="link" onClick={()=>void show("model",r.modelId!)}>{r.modelName}</Button>:r.modelName},{title:"类型",dataIndex:"type",render:(value:string)=>({image:"图片",video:"视频",text:"文本",audio:"音频"} as Record<string,string>)[value]??value},{title:"任务",dataIndex:"total"},{title:"成功",dataIndex:"succeeded"},{title:"失败",dataIndex:"failed"},{title:"排队",dataIndex:"queued"},{title:"运行",dataIndex:"running"},{title:"进行中",dataIndex:"pending"},{title:"结算积分",dataIndex:"creditsCharged"},{title:"当前冻结",dataIndex:"creditsHeld"},{title:"操作",render:(_,r)=><div className="flex gap-2"><Button size="small" onClick={()=>viewTasks(r)}>任务</Button><Button size="small" onClick={()=>viewTasks(r,true)}>失败</Button></div>}];
    const metrics = summary ? [
        { label: "任务总数", value: summary.total.toLocaleString("zh-CN") },
        { label: "成功", value: summary.succeeded.toLocaleString("zh-CN") },
        { label: "失败", value: summary.failed.toLocaleString("zh-CN") },
        { label: "进行中", value: summary.pending.toLocaleString("zh-CN"), note: `排队 ${summary.queued} · 运行 ${summary.running}` },
        { label: "成功率", value: summary.successRate === null ? "暂无" : `${(summary.successRate * 100).toFixed(1)}%`, note: "已结束任务" },
        { label: "结算积分", value: summary.creditsCharged.toLocaleString("zh-CN") },
        { label: "当前冻结", value: summary.creditsHeld.toLocaleString("zh-CN") },
    ] : [];
    return (
        <div className="space-y-5">
            <AdminPanel
                title="渠道与模型统计"
                description="按任务创建时间统计；成功率以已结束任务为分母；成本未接入供应商账单；失败分类根据错误信息归类。"
                actions={<Button loading={loading} onClick={() => void load()}>查询</Button>}
                flush
            >
                <div className="grid gap-3 border-b border-[var(--admin-line)] px-5 py-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_150px_150px]">
                    <AdminField label="渠道 ID"><Input allowClear placeholder="输入渠道 ID" value={channelId} onChange={e => setChannel(e.target.value)} /></AdminField>
                    <AdminField label="模型 ID"><Input allowClear placeholder="输入模型 ID" value={modelId} onChange={e => setModel(e.target.value)} /></AdminField>
                    <AdminField label="类型"><Select className="w-full" value={type} onChange={setType} options={[{ value: "", label: "全部类型" }, ...["image", "video", "text", "audio"].map(value => ({ value, label: value === "image" ? "图片" : value === "video" ? "视频" : value === "text" ? "文本" : "音频" }))]} /></AdminField>
                    <AdminField label="开始日期"><DatePicker className="w-full" allowClear placeholder="开始日期" value={from ? dayjs(from) : null} onChange={value => setFrom(value ? value.format("YYYY-MM-DD") : "")} /></AdminField>
                    <AdminField label="结束日期"><DatePicker className="w-full" allowClear placeholder="结束日期" value={to ? dayjs(to) : null} onChange={value => setTo(value ? value.format("YYYY-MM-DD") : "")} /></AdminField>
                </div>
                {summary && <div className="grid grid-cols-2 gap-2 border-b border-[var(--admin-line)] px-5 py-4 sm:grid-cols-4 xl:grid-cols-7">
                    {metrics.map(item => <div key={item.label} className="rounded-[10px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-3 py-2.5">
                        <p className="text-[11px] font-medium text-[var(--admin-muted)]">{item.label}</p>
                        <p className="mt-1 text-lg font-semibold leading-none tabular-nums text-[var(--admin-ink)]">{item.value}</p>
                        {item.note ? <p className="mt-1.5 text-[10px] leading-4 text-[var(--admin-muted)]">{item.note}</p> : null}
                    </div>)}
                </div>}
                <div className="flex flex-wrap items-center gap-2 px-5 py-4">
                    <span className="text-xs font-medium text-[var(--admin-muted)]">失败分类</span>
                    {errors.length ? errors.map(e => <Button key={e.category} size="small" onClick={() => viewErrors(e.category)}>{errorLabels[e.category] ?? e.category} {e.count}</Button>) : <span className="text-xs text-[var(--admin-muted)]">暂无</span>}
                </div>
            </AdminPanel>
            <AdminPanel title="统计明细" flush>
                <Table rowKey={(row, index) => `${row.channelId}-${row.modelId}-${row.type}-${index}`} columns={columns} dataSource={rows} loading={loading} pagination={false} scroll={{ x: 1000 }} />
            </AdminPanel>
            <Drawer title={detail?.title} open={Boolean(detail)} onClose={() => setDetail(null)} width={700}>
                {detail && <Overview data={detail.data} />}
            </Drawer>
        </div>
    );
}
