import { useEffect, useState } from 'react';
import { Alert, App, Button, InputNumber, Modal, Select, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import { useAdminRequest, useAdminScope } from '../use-admin-request';
import { useAdminPermissions } from '../permissions';
import { AdminBadge, AdminField, AdminPanel } from './ui';

type Snapshot = {available:number|null;account:number|null;key:number|null;unlimited:boolean;unit:string;scope:string;note:string};
type Balance = {id:string;name:string;enabled:boolean;provider:string;threshold:number;thresholdUnit:string|null;status:string;message:string;snapshot:Snapshot|null;checkedAt:string|null;succeededAt:string|null;stale:boolean;alert:string;supported:boolean};
const formats = [{value:'auto',label:'自动识别已接入渠道'}, {value:'token',label:'New API Key 额度接口'}, {value:'yaohuo',label:'妖火余额接口'}, {value:'aggc',label:'视频线路 B 余额接口'}, {value:'off',label:'暂不查询'}];
const display = (n:number|null|undefined) => n == null ? '未提供' : n.toLocaleString('zh-CN',{maximumFractionDigits:4});
const date = (s:string|null) => s ? new Date(s).toLocaleString('zh-CN') : '尚未查询';

export function ChannelBalances() {
    const api = useAdminRequest(), scope = useAdminScope(), permissions = useAdminPermissions();
    const canManage = permissions.includes('channels.manage');
    const {message} = App.useApp();
    const [items,setItems] = useState<Balance[]>([]), [loading,setLoading] = useState(false), [busy,setBusy] = useState<string|null>(null);
    const [editing,setEditing] = useState<Balance|null>(null), [saving,setSaving] = useState(false);
    async function load() {
        setLoading(true);
        try {const data = await api<{items:Balance[]}>('/api/admin/channels/balances');setItems(data.items);}
        catch(e){if(scope.current())message.error(e instanceof Error?e.message:'读取失败');}
        finally{if(scope.current())setLoading(false);}
    }
    useEffect(()=>{void load();},[api]);
    useEffect(()=>{if(!canManage)setEditing(null);},[canManage]);
    async function refresh(rows:Balance[]) {
        setBusy(rows.length===1?rows[0].id:'all');
        try {
            for(const row of rows) {
                await api(`/api/admin/channels/${row.id}/balance/refresh`,{method:'POST',json:{}});
                await load();
            }
            if(scope.current())message.success('查询完成，请查看各渠道状态');
        }catch(e){if(scope.current())message.error(e instanceof Error?e.message:'查询失败');}
        finally{if(scope.current())setBusy(null);}
    }
    async function save() {
        if(!editing)return;setSaving(true);
        try {await api(`/api/admin/channels/${editing.id}/balance`,{method:'PATCH',json:{provider:editing.provider,threshold:editing.threshold}});setEditing(null);await load();message.success('预警设置已保存');}
        catch(e){if(scope.current())message.error(e instanceof Error?e.message:'保存失败');}
        finally{if(scope.current())setSaving(false);}
    }
    const low = items.filter(i=>i.enabled&&['low','empty'].includes(i.alert));
    const unknown = items.filter(i=>i.enabled&&(i.status!=='ok'||i.snapshot?.available==null||i.stale));
    const columns:TableColumnsType<Balance> = [
        {title:'渠道',dataIndex:'name',width:210,render:(name:string,row)=><div><strong>{name}</strong><div className="mt-1"><AdminBadge tone={row.enabled?'positive':'neutral'}>{row.enabled?'已启用':'已停用（不自动查询）'}</AdminBadge></div></div>},
        {title:'可用额度 / 余额',width:240,render:(_,row)=><div>{row.snapshot?<><strong className="tabular-nums">{display(row.snapshot.available)} {row.snapshot.unit}</strong><div className="text-xs text-[var(--admin-muted)]">{row.snapshot.scope} · {row.status==='ok'?'查询时余额':'上次成功记录，当前不可确认'}</div><div className="mt-1 text-xs">账户：{display(row.snapshot.account)}<br/>Key：{row.snapshot.unlimited?'无限额':display(row.snapshot.key)}</div></>:<span>—</span>}</div>},
        {title:'预警状态',width:285,render:(_,row)=>{
            const label = row.status==='unsupported'?'未接入查询':row.status==='error'?'查询失败':row.status==='unknown'?'待查询':row.stale?'数据待刷新':row.alert==='empty'?'额度已耗尽':row.alert==='low'?'额度不足预警':row.alert==='unit_changed'?'单位变化，请重设阈值':row.snapshot?.available==null?'账户余额未知':row.threshold===0?'仅监测耗尽':'高于预警阈值';
            const tone = ['empty','low'].includes(row.alert)?'danger':row.status!=='ok'||row.stale||row.alert!=='normal'?'warning':'positive';
            return <div><AdminBadge tone={tone}>{label}</AdminBadge><div className="mt-2 text-xs text-[var(--admin-muted)]">{row.message}</div><div className="mt-1 text-xs">阈值：{row.threshold>0?`${display(row.threshold)} ${row.thresholdUnit??''}`:'未设置（余额 ≤ 0 时提醒）'}</div></div>;
        }},
        {title:'查询时间',width:195,render:(_,row)=><div className="text-xs">最近查询：{date(row.checkedAt)}<br/>最近成功：{date(row.succeededAt)}</div>},
        ...(canManage?[{title:'操作',key:'actions',width:165,render:(_:unknown,row:Balance)=><div className="flex flex-wrap gap-2"><Button size="small" disabled={!!busy||!row.supported} loading={busy===row.id} onClick={()=>void refresh([row])}>刷新额度</Button><Button size="small" disabled={!!busy} onClick={()=>setEditing({...row})}>设置预警</Button></div>}]:[]),
    ];
    return <AdminPanel title="上游额度预警" description="每 30 分钟查询已启用渠道；只查询余额，不发起生成、不修改线路。不同上游单位不相加，Key 无限额不等于账户余额充足。" actions={<div className="flex flex-wrap gap-2"><Button onClick={()=>void load()} loading={loading}>刷新列表</Button>{canManage&&<Button disabled={!!busy} loading={busy==='all'} onClick={()=>void refresh(items.filter(i=>i.enabled&&i.supported))}>查询全部额度</Button>}</div>}>
        <div className="mb-4 space-y-2" aria-live="polite">
            {!!low.length&&<Alert showIcon type="warning" title={`${low.length} 个渠道低额度：${low.map(i=>i.name).join('、')}`} />}
            {!!unknown.length&&<Alert showIcon type="info" title={`${unknown.length} 个已启用渠道的当前余额尚不能确认，请查看查询状态。`} />}
            <p className="text-xs text-[var(--admin-muted)]">设置阈值后，余额小于或等于阈值即提示；查询失败保留上次记录及时间，不当作 0。多个渠道共用同一上游账户时，不要重复汇总余额。</p>
        </div>
        <Table rowKey="id" loading={loading} dataSource={items} columns={columns} pagination={false} scroll={{x:1100}} />
        <Modal title={`额度预警 · ${editing?.name??''}`} open={!!editing&&canManage} onCancel={()=>setEditing(null)} onOk={()=>void save()} confirmLoading={saving} destroyOnHidden>
            {editing&&<div className="space-y-4 py-3"><AdminField label="额度查询方式" hint="仅使用渠道已有地址及服务端密钥；未接入的服务需要其官方余额接口。"><Select className="w-full" value={editing.provider} options={formats} onChange={provider=>setEditing({...editing,provider,threshold:0})}/></AdminField>
            <AdminField label={`低额度阈值${editing.snapshot?'（'+editing.snapshot.unit+'）':''}`} hint="先查询成功确认单位，再设置阈值；0 表示只提醒额度耗尽。"><InputNumber className="w-full" min={0} value={editing.threshold} onChange={n=>setEditing({...editing,threshold:n??0})}/></AdminField></div>}
        </Modal>
    </AdminPanel>;
}
