import { Button } from "@astryxdesign/core/Button";
import { Dropdown } from "antd";
import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";
import { useMediaArchive } from "@/hooks/use-media-archive";

type Action = { key: string; label: string; icon?: ReactNode; run: () => void; disabled?: boolean };
export function RecordActions({ primary, secondary, more, archiveUrl, label = "更多作品操作" }: { primary?: Action; secondary?: Action; more: Action[]; archiveUrl?: string; label?: string }) {
    const archive = useMediaArchive(archiveUrl);
    const actions: Action[] = archive ? [...more, archive] : more;
    return <div className="record-actions flex flex-wrap items-center gap-1.5 py-1" role="group" aria-label="作品操作">
        {primary && <Button size="md" variant="secondary" label={primary.label} icon={primary.icon} isDisabled={primary.disabled} onClick={primary.run} />}
        {secondary && <Button size="md" variant="ghost" label={secondary.label} icon={secondary.icon} isDisabled={secondary.disabled} onClick={secondary.run} />}
        {!!actions.length && <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items: actions.map(action => ({ key: action.key, label: action.label, icon: action.icon, disabled: action.disabled, onClick: action.run })) }}>
            <button type="button" className="creation-icon-button" aria-label={label} title={label}><Ellipsis className="size-4" /></button>
        </Dropdown>}
    </div>;
}
