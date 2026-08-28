import { Box, BoxProps, styled, Typography, TypographyProps } from "@mui/material";

// A scrollable grid container
export const GridContainer = styled(Box)(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(2),
  padding: theme.spacing(2),
  overflow: 'auto',
  maxHeight: '100%',
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
  // Was down('xs'). xs is 0 in MUI v5, so that compiled to
  // `max-width: -0.05px` and could never match - the single-column fallback
  // had never once applied. sm is the narrowest breakpoint that means
  // anything, and a phone is where the Reorganize Files columns actually
  // stop fitting.
  [theme.breakpoints.down('sm')]: {
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