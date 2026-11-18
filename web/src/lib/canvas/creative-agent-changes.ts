import type { AgentProject, CreativeAgentOperation } from '@/services/api/creative-agent';
import type { DirectorScene } from '@/types/director';
import type { ProductionDocument } from '../../../../shared/production';
import { directorPoseLabel } from './director/director-scene';

const number = (value: number) => Number(value.toFixed(3)).toString();
const vector = (values: number[]) => values.map(number).join('，');

/** Describe the frozen command targets; current document names are labels, not a historical before-state. */
export function describeAgentChanges(operation: CreativeAgentOperation, project?: AgentProject): string[] {
    if (operation.type === 'director_command') {
        const scenes = project?.content.directorScenes as DirectorScene[] | undefined;
        const scene = scenes?.find(scene => scene.id === operation.sceneId);
        const cameras = new Map(scene?.cameras.map(camera => [camera.id, camera.name]));
        const cuts = new Map(scene?.cameraSequence?.cuts.map((cut, index) => [cut.id, `切点 ${index + 1}`]));
        const cutName = (id: string) => cuts.get(id) || `切点「${id}」`;
        const cameraName = (id: string) => `「${cameras.get(id) || id}」`;
        const objectName = (id: string) => `「${scene?.objects.find(object => object.id === id)?.name || id}」`;
        return [`场景：${scene?.title || operation.sceneId}`, ...operation.commands.map(command => {
            switch (command.type) {
                case 'camera.preset': {
                    const names = { orbit: '环绕', half_arc: '半弧', push_in: '推进', pull_out: '拉远', lift: '升降', truck: '横移', spiral: '螺旋' };
                    return `机位 ${cameraName(command.cameraId)}：在全局 ${number(command.startTime)}–${number(command.endTime)} 秒应用「${names[command.preset]}」运镜，使用坐标目标取景；范围内已有关键帧时拒绝覆盖。`;
                }
                case 'actor.path': return `人物 ${objectName(command.objectId)}：在全局 ${number(command.startTime)}–${number(command.endTime)} 秒建立「${({ line: '直线', ring: '圆环', rectangle: '矩形' })[command.kind]}」路径，${command.facePath ? '面向行进方向' : '保留原朝向'}；替换该人物现有变换轨迹，原关键帧保留供移除路径恢复，骨骼动作不变。`;
                case 'camera.clone': {
                    const source = cameraName(command.sourceId);
                    cameras.set(command.id, command.name);
                    return `复制机位 ${source}，新机位名为「${command.name}」。`;
                }
                case 'camera.frame': return `机位 ${cameraName(command.cameraId)}：在 ${number(command.time)} 秒设置关键帧；位置 (${vector(command.position)})，朝向目标 (${vector(command.target)})，视场角 ${number(command.fov)}°。`;
                case 'actor.frame': return `人物 ${objectName(command.objectId)}：在 ${number(command.time)} 秒设置关键帧；位置 (${vector(command.position)})，旋转 (${vector(command.rotation.map(value => value * 180 / Math.PI))})°。`;
                case 'actor.pose': return `人物 ${objectName(command.objectId)}：姿态设为「${directorPoseLabel(command.pose)}」。`;
                case 'sequence.create': {
                    command.sequence.cuts.forEach((cut, index) => cuts.set(cut.id, `切点 ${index + 1}`));
                    return `建立序列「${command.sequence.name}」：${command.sequence.fps}fps，共 ${command.sequence.durationFrames} 帧；${command.sequence.cuts.map(cut => `第 ${cut.startFrame} 帧切换到 ${cameraName(cut.cameraId)}`).join('；')}。`;
                }
                case 'sequence.edit': {
                    const edit = command.command;
                    switch (edit.type) {
                        case 'insert': {
                            cuts.set(edit.cut.id, `新增切点（第 ${edit.cut.startFrame} 帧）`);
                            return `新增切点：第 ${edit.cut.startFrame} 帧切换到 ${cameraName(edit.cut.cameraId)}。`;
                        }
                        case 'update': return `调整${cutName(edit.id)}：${[edit.startFrame !== undefined ? `移至第 ${edit.startFrame} 帧` : '', edit.cameraId !== undefined ? `切换到 ${cameraName(edit.cameraId)}` : ''].filter(Boolean).join('；')}。`;
                        case 'remove': return `删除${cutName(edit.id)}；前一机位将继续出画，直到下一个切点或序列结束。`;
                        case 'duration': return `序列总长度设为 ${edit.durationFrames} 帧；若截断已有切点，将拒绝执行并保留原稿。`;
                        case 'fps': return `帧率设为 ${edit.fps}fps，按原秒数换算切点；若舍入后切点重合，将拒绝执行。`;
                    }
                }
            }
        }), '执行后可在导演台检查和继续编辑；画面尚未渲染或经视觉检查。'];
    }
    if (operation.type !== 'production_edit') return [];
    const production = project?.content.production as ProductionDocument | undefined;
    const shotName = (id: unknown) => `「${production?.shots.find(shot => shot.shotId === id)?.title || String(id)}」`;
    const labels: Record<string, string> = { included: '纳入成片', durationMs: '时长', inMs: '入点', outMs: '出点', fit: '画面适配', motion: '图片运镜', focusX: '水平焦点', focusY: '垂直焦点', transitionMs: '转场时长', originalAudioVolume: '原声音量', anchorShotId: '锚定镜头', offsetMs: '起始偏移', volume: '音量', enabled: '启用', loop: '循环', text: '文字', startMs: '开始时间', endMs: '结束时间', burnIn: '烧录字幕', fontSize: '字号', fontFamily: '字体' };
    const enums: Record<string, string> = { contain: '完整显示', cover: '铺满裁剪', none: '静止', 'zoom-in': '推进', 'zoom-out': '拉远' };
    const format = (key: string, value: unknown) => {
        if (key === 'anchorShotId') return shotName(value);
        if (typeof value === 'boolean') return value ? '是' : '否';
        if (typeof value === 'number') return key.endsWith('Ms') ? `${number(value / 1000)} 秒` : ['volume', 'originalAudioVolume', 'focusX', 'focusY'].includes(key) ? `${number(value * 100)}%` : number(value);
        return ['fit', 'motion'].includes(key) ? enums[String(value)] || String(value) : `「${String(value)}」`;
    };
    return [...operation.commands.map(command => {
        if (command.type === 'reorder') return `镜头顺序设为：${(command.shotIds as string[]).map(shotName).join(' → ')}。`;
        if (command.type === 'output') return `输出规格设为 ${command.width} × ${command.height}，${command.fps}fps。`;
        const target = command.type === 'shot' ? `镜头 ${shotName(command.shotId)}`
            : command.type === 'narration' ? `旁白「${production?.narration.find(line => line.id === command.narrationId)?.text || String(command.narrationId)}」`
            : command.type === 'subtitle' ? `字幕「${production?.subtitles.find(line => line.id === command.subtitleId)?.text || String(command.subtitleId)}」`
            : command.type === 'bgm' ? '背景音乐' : '字幕样式';
        return `${target}：${Object.entries(command.patch as Record<string, unknown>).map(([key, value]) => `${labels[key] || key}设为 ${format(key, value)}`).join('；')}。${command.type === 'subtitle' ? '修改后需重新审核字幕。' : ''}`;
    }), '沿用已采用素材；生成或导出需要另行执行。'];
}
