import type { ReactNode } from "react";
import { Tooltip as AntTooltip } from "antd";

export type TooltipPlacement = "top" | "bottom" | "left" | "right" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export type TooltipProps = {
    title?: ReactNode;
    placement?: TooltipPlacement;
    children: ReactNode;
};

/**
 * Tooltip — 气泡提示（sundas 版）。
 *
 * BeefTV 用的是 react-aria-components 自研浮层；sundas 没有这个依赖，
 * 这里落到已有的 antd Tooltip 上，保持同名同 props（title / placement / children），
 * 调用方零改动。title 为空时不渲染浮层，与 BeefTV 行为一致。
 */
export function Tooltip({ title, placement = "top", children }: TooltipProps) {
    if (title === undefined || title === null || title === "") return <>{children}</>;
    return (
        <AntTooltip title={title} placement={placement} mouseEnterDelay={0.2}>
            {children}
        </AntTooltip>
    );
}
