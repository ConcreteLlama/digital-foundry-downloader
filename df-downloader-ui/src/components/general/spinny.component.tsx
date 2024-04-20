import { styled } from "@mui/material";

export const SpinnyDiv = styled("div")`
  animation: spinny 1s linear infinite;
  @keyframes spinny {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;
