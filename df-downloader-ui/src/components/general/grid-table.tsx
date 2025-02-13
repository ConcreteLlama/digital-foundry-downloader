import { Box, BoxProps, styled, Typography, TypographyProps } from "@mui/material";
import { generalScrollbarProps } from "../../utils/webkit-scrollbar-props.ts";

// A scrollable grid container
export const GridContainer = styled(Box)(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(2),
  padding: theme.spacing(2),
  overflow: 'auto',
  maxHeight: '100%',
  ...generalScrollbarProps,
}));

export const GridHeader = styled(Box)(({ theme }) => ({
  display: 'contents',
  fontWeight: 'bold',
  borderBottom: `1px solid ${theme.palette.divider}`,
  paddingBottom: theme.spacing(1),
}));

export const GridTableContent = styled(Box)<{ columnSizes: string[] }>(({ theme, columnSizes }) => ({
  display: 'grid',
  gridTemplateColumns: columnSizes.join(' '),
  gap: theme.spacing(2),
  [theme.breakpoints.down('xs')]: {
    gridTemplateColumns: '1fr',
  },
}));

export type ColumnInfo = {
  name: string;
  size: string;
};
type GridTableProps = {
  columns: (ColumnInfo | string)[];
};
export const GridTable = ({ columns, children }: GridTableProps & BoxProps) => {
  const columnInfos: ColumnInfo[] = columns.map((column) => typeof column === 'string' ? { name: column, size: 'auto' } : column);
  return (
    <GridContainer>
      <GridTableContent columnSizes={columnInfos.map((column) => column.size)}>
        <GridHeader>
          {...columnInfos.map(({name: columnName}) => (
            <Typography key={columnName} variant="body1">
              {columnName}
            </Typography>
          ))}
        </GridHeader>
        {children}
      </GridTableContent>
    </GridContainer>
  );
}

export const GridRow = styled(Box)(({ theme }) => ({
  display: 'contents',
  alignItems: 'center',
  padding: `${theme.spacing(1)} 0`,
  borderBottom: `1px solid ${theme.palette.divider}`,
  [theme.breakpoints.down('xl')]: {
    gridTemplateColumns: '1fr',
    '& > *': {
      marginBottom: theme.spacing(1),
    },
  },
}));

export const GridCell = styled(Box)(({  }) => ({
  alignItems: 'center',
  display: 'flex',
}));

export const GridTextCell = (props: TypographyProps) => (
  <GridCell>
    <Typography {...props} />
  </GridCell>
);