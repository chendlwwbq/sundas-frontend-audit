import { useState } from "react";
import { App, Button, Input, Modal, Select } from "antd";
import dayjs from "dayjs";
import { creditReviewApi, type IssueReview } from "@/services/api/admin/credit-review";
import { accessApi } from "@/services/api/admin/access";
import { useAdminRequest } from "../use-admin-request";
import { AdminField } from "../components/ui";
const labels:Record<string,string>={pending:"待核对",follow_up:"继续跟进",resolved:"已核对"};
export function CreditReview({type,id,onUpdated}:{type:"wallet"|"lot"|"reservation";id:string;onUpdated?:()=>void}) {
 const request=useAdminRequest(),api=creditReviewApi(request),{message}=App.useApp();
 const [open,setOpen]=useState(false),[canEdit,setCanEdit]=useState(false),[items,setItems]=useState<IssueReview[]>([]),[state,setState]=useState("pending"),[note,setNote]=useState(""),[saving,setSaving]=useState(false);
 const report=(e:unknown)=>message.error(e instanceof Error?e.message:String(e));
 async function show(){try{const [history,access]=await Promise.all([api.list(type,id),accessApi(request).me()]);setItems(history.items);setCanEdit(access.permissions.includes("tasks.review"));setOpen(true);}catch(e){report(e);}}
 async function save(){setSaving(true);try{await api.add(type,id,state,note);setItems((await api.list(type,id)).items);setNote("");onUpdated?.();message.success("已记录核对说明");}catch(e){report(e);}finally{setSaving(false);}}
 return <><Button size="small" onClick={()=>void show()}>核对记录</Button><Modal title="积分异常核对" open={open} onCancel={()=>setOpen(false)} footer={<Button onClick={()=>setOpen(false)}>关闭</Button>}>
 <p>对象：{id}。记录核对状态不会修改积分账目。</p>{items.map(item=><p key={item.id}>{dayjs(item.createdAt).format("YYYY-MM-DD HH:mm")} · {item.operator} · {labels[item.state]}：{item.note}</p>)}
 {canEdit&&<div className="space-y-3"><AdminField label="状态"><Select value={state} onChange={setState} options={Object.entries(labels).map(([value,label])=>({value,label}))}/></AdminField><AdminField label="说明"><Input.TextArea value={note} onChange={e=>setNote(e.target.value)}/></AdminField><Button type="primary" loading={saving} onClick={()=>void save()}>保存</Button></div>}
 </Modal></>;
}
