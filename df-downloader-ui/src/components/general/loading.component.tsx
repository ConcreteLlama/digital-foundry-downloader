import { Fade, Stack, Typography } from "@mui/material";
import { RichIcon } from "../../icons/rich-icon.component.tsx";
import { SpinnyDiv } from "./spinny.component.tsx";

export type LoadingProps = {
  message?: string;
};

export const Loading = ({ message = "Loading..." }: LoadingProps) => {
  return (
    <Stack gap={"1rem"} alignItems={"center"} justifyContent={"center"}>
      <Fade in={true} timeout={4000}>
        <SpinnyDiv>
          <RichIcon />
        </SpinnyDiv>
      </Fade>
      <Typography color={"primary.main"}>{message}</Typography>
    </Stack>
  );
};
