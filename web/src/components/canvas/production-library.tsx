import { useState } from 'react';
import { Button, Input, Popconfirm, Select, Tag, theme } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import { useProduction, useProductionModels, nodeProductionMedia } from './production-context';
import { ProductionMediaPreview, ProductionMediaUpload } from './production-media';
import type { ProductionAsset } from '../../../../shared/production';

const kinds = [{ value: 'character', label: '角色' }, { value: 'scene', label: '场景' }, { value: 'prop', label: '道具' }, { value: 'style', label: '风格锚点' }];
export function ProductionLibrary() {
    const { production, nodes, edit, request, busy } = useProduction(), { token } = theme.useToken();
    const models = useProductionModels('image'), [model, setModel] = useState('');
    const update = (asset: ProductionAsset, changes: Partial<ProductionAsset>) => edit({ type: 'asset.upsert', asset: { ...asset, ...changes, revision: asset.revision + 1 } });
    return <div className="space-y-4">
        <div className="flex gap-2"><Select className="min-w-0 flex-1" aria-label="资料图模型" placeholder="选择设定图模型" value={model || undefined} options={models.map(item => ({ value: item.id, label: item.name }))} onChange={setModel} /><Button type="text" icon={<Plus size={16} />} onClick={() => edit({ type: 'asset.upsert', asset: { id: crypto.randomUUID(), kind: 'character', name: '新角色', aliases: [], description: '', revision: 1 } })}>新增资料</Button></div>
        <p className="text-xs" style={{ color: token.colorTextSecondary }}>修改资料会产生新版本。已提交任务保留原参考；重新生成镜头前需明确更新引用版本。</p>
        {production.library.map(asset => <section key={asset.id} className="space-y-2 border-b pb-4" style={{ borderColor: token.colorBorderSecondary }}>
            <div className="flex gap-2"><Select aria-label="资料类型" className="w-28" value={asset.kind} options={kinds} onChange={kind => update(asset, { kind })} /><Input aria-label="资料名称" value={asset.name} onChange={event => update(asset, { name: event.target.value })} /><Tag>v{asset.revision}</Tag></div>
            <Input key={asset.aliases.join('，')} aria-label="资料别名" placeholder="别名，用逗号分隔，离开输入框后保存" defaultValue={asset.aliases.join('，')} onBlur={event => { const aliases = event.target.value.split(/[,，]/).map(value => value.trim()).filter(Boolean); if (JSON.stringify(aliases) !== JSON.stringify(asset.aliases)) update(asset, { aliases }); }} />
            <Input.TextArea aria-label="资料设定" placeholder="人物外貌、服装、场景或画风设定" value={asset.description} autoSize={{ minRows: 2, maxRows: 8 }} onChange={event => update(asset, { description: event.target.value })} />
            <Select className="w-full" aria-label="绑定资料图片" placeholder="从画布绑定图片" value={undefined} options={nodes.filter(node => nodeProductionMedia(node)?.kind === 'image').map(node => ({ value: node.id, label: node.title }))} onChange={nodeId => update(asset, { media: nodeProductionMedia(nodes.find(node => node.id === nodeId)) })} />
            <ProductionMediaPreview media={asset.media} />
            <p className="text-xs" style={{ color: token.colorTextSecondary }}>使用镜头：{production.shots.filter(shot => shot.references.some(ref => ref.assetId === asset.id)).map(shot => shot.title).join('、') || '暂未引用'}</p>
            <div className="flex flex-wrap gap-1"><ProductionMediaUpload kind="image" onMedia={media => update(asset, { media })} /><Button type="text" size="small" disabled={busy || !model || !asset.description.trim()} onClick={() => void request({ kind: 'images', modelId: model, assetIds: [asset.id] })}>预检生成设定图</Button><Popconfirm title="删除这份资料？" description="仍被镜头使用时需先调整引用。" onConfirm={() => edit({ type: 'asset.remove', id: asset.id })}><Button type="text" size="small" icon={<Trash2 size={14} />} aria-label={`删除${asset.name}`} /></Popconfirm></div>
        </section>)}
        {!production.library.length && <p className="text-sm">添加角色、场景或风格资料，再在分镜中复用。</p>}
    </div>;
}
