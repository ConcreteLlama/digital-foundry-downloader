import { IconButton, IconButtonProps, Tooltip, TooltipProps } from "@mui/material";

export type TooltipButtonProps = IconButtonProps & {
    tooltipTitle: string;
    tooltipProps?: TooltipProps;
    children: React.ReactNode;
};
export const TooltipIconButton = (props: TooltipButtonProps) => {
    // Note: Span is necessary to allow us to have tooltips over disabled buttons
    const { tooltipTitle, tooltipProps, children, ...buttonProps } = props;
    return <Tooltip title={tooltipTitle}>
        <span>
            <IconButton {...buttonProps}>
                {children}
            </IconButton>
        </span>
    </Tooltip>
}
