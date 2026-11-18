export type CanvasShortcut = {
    id: string;
    title: string;
    /** 每项是一组按键组合，多组之间用 " / " 分隔。 */
    keys: string[][];
};

/**
 * 画布快捷键清单。迁移自 BeefTV：快捷键面板与键盘实现共用同一份数据，
 * 避免「面板里写了、实际没生效」的分叉。
 */
export const CANVAS_SHORTCUTS: CanvasShortcut[] = [
    { id: "move-tool", title: "选择工具", keys: [["V"]] },
    { id: "hand-tool", title: "抓手工具", keys: [["H"]] },
    { id: "temp-hand", title: "临时抓手（按住）", keys: [["Space"]] },
    { id: "select-all", title: "全选节点", keys: [["⌘", "A"]] },
    { id: "duplicate", title: "复制选中节点", keys: [["⌘", "D"]] },
    { id: "copy", title: "拷贝", keys: [["⌘", "C"]] },
    { id: "paste", title: "粘贴", keys: [["⌘", "V"]] },
    { id: "group", title: "打组", keys: [["⌘", "G"]] },
    { id: "ungroup", title: "解散组", keys: [["⌘", "Shift", "G"]] },
    { id: "undo", title: "撤销", keys: [["⌘", "Z"]] },
    { id: "redo", title: "重做", keys: [["⌘", "Shift", "Z"], ["⌘", "Y"]] },
    { id: "zoom-in", title: "放大画布", keys: [["⌘", "+"]] },
    { id: "zoom-out", title: "缩小画布", keys: [["⌘", "−"]] },
    { id: "actual-size", title: "恢复 100%", keys: [["⌘", "1"]] },
    { id: "fit-canvas", title: "适应全部节点", keys: [["⌘", "0"]] },
    { id: "fit-selection", title: "适应选中节点", keys: [["⌘", "2"]] },
    { id: "escape", title: "取消选择 / 关闭浮层", keys: [["Esc"]] },
];

export function isMacPlatform() {
    if (typeof navigator === "undefined") return false;
    return /Mac|iPhone|iPad/.test(navigator.platform);
}

export function formatShortcutKeys(keys: string[]) {
    const modifier = isMacPlatform() ? "⌘" : "Ctrl";
    return keys.map((key) => (key === "⌘" ? modifier : key)).join(" + ");
}
