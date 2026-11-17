type PrepareEditor = () => void | Promise<void>;

/**
 * 桌面更新前的编辑器准备钩子（sundas 精简版）。
 *
 * BeefTV 桌面端在更新前要等编辑器落盘；sundas 是纯 Web，没有原生宿主，
 * 但导演台的保存协调器仍然注册这个钩子来表达「我还有未落盘的内容」。
 * 这里保留注册/注销与会话级查询，让调用方代码零改动、语义不丢。
 */
const editors = new Set<{ prepare: PrepareEditor; isSaving: () => boolean; mounted: boolean }>();

export function registerDesktopUpdatePreparation(prepare: PrepareEditor, isSaving: () => boolean = () => false) {
    const editor = { prepare, isSaving, mounted: true };
    editors.add(editor);
    return () => {
        editor.mounted = false;
        if (!isSaving()) editors.delete(editor);
    };
}

export async function prepareDesktopEditorsForUpdate() {
    for (const editor of [...editors]) if (editor.mounted) await editor.prepare();
}

export function hasActiveDesktopEditorSaves() {
    let saving = false;
    for (const editor of editors) {
        if (editor.isSaving()) saving = true;
        else if (!editor.mounted) editors.delete(editor);
    }
    return saving;
}
