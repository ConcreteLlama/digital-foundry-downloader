import { FormLabel, FormLabelProps } from "@mui/material";

export const FormLabelInline = (props: FormLabelProps) => {
  return (
    <FormLabel
      {...props}
      sx={{
        marginTop: "-1.5em",
        paddingLeft: "0.44em",
        paddingRight: "0.44em",
        zIndex: 2,
        backgroundColor: (theme) => theme.palette.background.default,
        position: "absolute",
        fontSize: "0.75em",
        width: "auto",
      }}
    />
  );
};
