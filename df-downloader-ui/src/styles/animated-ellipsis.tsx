import { styled } from "@mui/material";

export const AnimatedEllipsis = styled("span")(({  }) => ({
    display: "inline-block",
    overflow: "hidden",
    verticalAlign: "bottom",
    "&::after": {
        content: "'...'",
        animation: "ellipsis 1.5s infinite",
        width: "0",
        display: "inline-block",
        whiteSpace: "nowrap",
    },
    "@keyframes ellipsis": {
        "0%": {
            width: "0",
        },
        "33%": {
            width: "0.5em",
        },
        "66%": {
            width: "1em",
        },
        "100%": {
            width: "0",
        },
    },
}));