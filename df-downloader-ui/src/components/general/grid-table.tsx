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
  // Deliberately NOT collapsing to a single column on narrow screens. The rows
  // are display:contents, so their cells are grid items of THIS element -
  // one column would interleave every row's cells with the headers into one
  // undifferentiated stack. The original rule was down('xs') (i.e. -0.05px,
  // never matched); changing it to sm would have shipped that broken layout
  // instead of a dead rule. The table keeps its columns and scrolls inside
  // GridContainer instead, which is the honest fit for a low-priority tool.
  minWidth: 'max-content',
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

/**
 * display:contents dissolves this element so its cells become grid items of
 * GridTableContent - that is what keeps columns aligned across rows.
 *
 * It also means alignItems, padding, borderBottom and gridTemplateColumns are
 * all inert on it; they were being set here and had never rendered. They are
 * gone rather than left to imply row separators that do not exist.
 */
export const GridRow = styled(Box)({
  display: 'contents',
});

export const GridCell = styled(Box)(({  }) => ({
  alignItems: 'center',
  display: 'flex',
}));

export const GridTextCell = (props: TypographyProps) => (
  <GridCell>
    <Typography {...props} />
  </GridCell>
);