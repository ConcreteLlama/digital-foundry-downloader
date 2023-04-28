import { Box, Button, ButtonProps } from "@mui/material";

export type PageSelectorProps = {
  currentPage: number;
  numPages: number;
  onUpdatePage: (page: number) => void;
  buttonProps?: ButtonProps;
};

export const PageSelector = ({ currentPage, numPages, onUpdatePage, buttonProps }: PageSelectorProps) => {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Button
        disabled={currentPage === 1}
        onClick={() => onUpdatePage(Math.max(currentPage - 1, 1))}
        {...(buttonProps || {})}
      >
        Previous Page
      </Button>
      <span>
        Page {currentPage} of {numPages}
      </span>
      <Button
        disabled={currentPage === numPages}
        onClick={() => onUpdatePage(Math.min(currentPage + 1, numPages))}
        {...(buttonProps || {})}
      >
        Next Page
      </Button>
    </Box>
  );
};
