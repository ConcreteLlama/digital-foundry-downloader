import { Tooltip, TooltipProps } from "@mui/material";
import { useState, useEffect } from "react";

const useTooltipPlacement = () => {
  const [placement, setPlacement] = useState<TooltipProps["placement"]>("bottom");

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const { clientX, clientY } = event;
      const { innerWidth, innerHeight } = window;
      const middleX = innerWidth * 0.5;
      const middleY = innerHeight * 0.5;

      const isCursorNearRightEdge = clientX > middleX;
      const isCursorNearBottomEdge = clientY > middleY;

      if (isCursorNearRightEdge && isCursorNearBottomEdge) {
        setPlacement("top-start");
      } else if (!isCursorNearRightEdge && isCursorNearBottomEdge) {
        setPlacement("top-end");
      } else if (isCursorNearRightEdge && !isCursorNearBottomEdge) {
        setPlacement("bottom-start");
      } else {
        setPlacement("bottom-end");
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);
  return placement;
};

export const AutoPositionTooltip = (props: TooltipProps) => {
  const placement = useTooltipPlacement();

  return <Tooltip {...props} placement={placement} />;
};
