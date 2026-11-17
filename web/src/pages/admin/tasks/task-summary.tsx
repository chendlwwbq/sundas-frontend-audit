import { Descriptions } from "antd";
import type { AdminTask } from "@/services/api/admin/tasks";
const keys:Record<string,string>={imageDiagnostic:"图片任务诊断",videoSubmission:"上游提交诊断",prompt:"提示词",n:"生成数量",size:"尺寸",seconds:"时长（秒）",resolution:"分辨率",mode:"模式",chars:"输入字符数",channelName:"渠道",modelName:"模型",unit:"计费单位",baseCredits:"单位基础积分",base:"折扣前积分",member:"会员计费",discount:"会员折扣倍率",promo:"活动倍率",quotedCredits:"预扣积分",url:"结果地址",mimeType:"媒体类型",textLength:"文本长度",imageCount:"图片数量",usage:"用量"};
function fields(value:Record<string,unknown>|null|undefined) {
    if (!value) return [];
    return Object.entries(value).filter(([key,item]) => key in keys && item !== null && item !== undefined).map(([key,item])=>({key,label:keys[key],children:typeof item === "boolean" ? (item ? "是" : "否") : typeof item === "object" ? JSON.stringify(item) : String(item)}));
}
export function TaskSummary({task}:{task:AdminTask}) {
    const params=fields(task.params), snapshot=fields(task.executionSnapshot), result=fields(task.resultSummary);
    return <div className="space-y-3"><h3>生成参数</h3>{params.length?<Descriptions bordered size="small" column={1} items={params}/>:<p>无参数摘要</p>}<h3>执行信息</h3>{snapshot.length?<Descriptions bordered size="small" column={1} items={snapshot}/>:<p>没有执行快照</p>}<h3>结果摘要</h3>{result.length?<Descriptions bordered size="small" column={1} items={result}/>:<p>暂无结果摘要</p>}</div>;
}
