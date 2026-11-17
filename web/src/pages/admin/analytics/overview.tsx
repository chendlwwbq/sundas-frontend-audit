import { Descriptions, Table } from "antd";
import type { Summary } from "@/services/api/admin/analytics";
const labels:Record<string,string>={id:"ID",name:"名称",displayName:"名称",upstreamName:"上游模型",protocol:"协议",baseUrl:"地址",enabled:"启用",healthStatus:"健康状态",latencyMs:"最近延迟（毫秒）",checkedAt:"检测时间",message:"检测信息",capability:"能力",unit:"计费单位",baseCredits:"基础积分"};
const yesNo=(value:unknown)=>typeof value === "boolean" ? (value ? "是" : "否") : value == null ? "—" : String(value);
export function Overview({ data }:{data:Record<string,unknown>}) {
    const entity=(data.channel??data.model??{}) as Record<string,unknown>;
    const summary=data.summary as Summary | undefined;
    const models=(data.models??[]) as Record<string,unknown>[];
    const fields=Object.entries(entity).filter(([key])=>key in labels).map(([key,value])=>({key,label:labels[key],children:yesNo(value)}));
    return <div className="space-y-4"><Descriptions bordered size="small" column={1} items={fields}/>{summary && <p>全部时间任务：{summary.total}，成功 {summary.succeeded}，失败 {summary.failed}，进行中 {summary.pending}（排队 {summary.queued}、运行 {summary.running}），结算 {summary.creditsCharged} 积分，当前冻结 {summary.creditsHeld} 积分；成本未知。</p>}{'models' in data && <><h3>关联模型</h3><Table size="small" rowKey={row=>String(row.id)} dataSource={models} pagination={false} columns={[{title:"模型",dataIndex:"displayName"},{title:"能力",dataIndex:"capability"},{title:"计费单位",dataIndex:"unit"},{title:"基础积分",dataIndex:"baseCredits"},{title:"状态",dataIndex:"enabled",render:yesNo}]}/></>}</div>;
}
