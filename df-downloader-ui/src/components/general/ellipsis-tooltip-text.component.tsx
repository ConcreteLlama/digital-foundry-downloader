import { Tooltip, Typography, TypographyProps } from "@mui/material";
import { useRef, useState, useEffect } from "react";

export type EllipsisTooltipTextProps = {
  text: string;
} & TypographyProps;
export const EllipsisTooltipText = ({ text, ...props }: EllipsisTooltipTextProps) => {
  const textElementRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      const element = textElementRef.current;
      if (element) {
        setIsOverflowing(element.offsetWidth < element.scrollWidth);
      }
    };
    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => {
      window.removeEventListener("resize", checkOverflow);
    };
  }, [text]);

  return (
    <Tooltip title={text} disableHoverListener={!isOverflowing}>
      <Typography
        ref={textElementRef}
        {...props}
        sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...props.sx }}
      >
        {text}
      </Typography>
    </Tooltip>
  );
};
