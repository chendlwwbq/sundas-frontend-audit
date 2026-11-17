import { Button, Dropdown } from "antd";
import { MoreHorizontal } from "lucide-react";

export function MobileCreationMenu({ onUpload, onReferences, onPrompts, onAssets }: {
    onUpload: () => void;
    onReferences: () => void;
    onPrompts: () => void;
    onAssets: () => void;
}) {
    return <Dropdown trigger={["click"]} menu={{ items: [
        { key: "upload", label: "上传参考素材", onClick: onUpload },
        { key: "references", label: "参考素材", onClick: onReferences },
        { key: "prompts", label: "提示词库", onClick: onPrompts },
        { key: "assets", label: "素材库", onClick: onAssets },
    ] }}>
        <Button size="small" type="text" className="!inline-flex sm:!hidden" icon={<MoreHorizontal className="size-4" />} aria-label="更多创作工具">更多</Button>
    </Dropdown>;
}
