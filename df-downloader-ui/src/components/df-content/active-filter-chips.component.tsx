import { Box, Button, Chip, Typography } from "@mui/material";
import { useSelector } from "react-redux";
import { resetDfContentQuery, updateDfContentQuery } from "../../store/df-content/df-content.action";
import { selectCurrentQuery } from "../../store/df-content/df-content.selector";
import { store } from "../../store/store";

type ActiveFilter = {
  /** "include" | "exclude" - which array the clause lives in. */
  mode: "include" | "exclude";
  index: number;
  label: string;
};

const describeValue = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : undefined;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // TagFilter / StringFilter both carry their payload under a known key.
    if (Array.isArray(obj.tags)) {
      return obj.tags.length ? (obj.tags as string[]).join(", ") : undefined;
    }
    if (typeof obj.value === "string") {
      return obj.value || undefined;
    }
    const inner = Object.entries(obj)
      .map(([k, v]) => {
        const described = describeValue(v);
        return described ? `${k} ${described}` : undefined;
      })
      .filter(Boolean);
    return inner.length ? inner.join(", ") : undefined;
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value);
};

const FIELD_LABELS: Record<string, string> = {
  tags: "tag",
  title: "title",
  name: "name",
  status: "status",
  availability: "availability",
  publishedAfter: "published after",
  publishedBefore: "published before",
  mediaType: "media type",
  downloaded: "downloaded",
};

/**
 * Turns one filter clause into the shortest honest description of it. The
 * filter schema is open-ended, so unknown fields fall back to "field value"
 * rather than being dropped - a chip that reads oddly is still better than a
 * filter with no visible trace at all, which is what this replaces.
 */
const describeClause = (clause: Record<string, unknown>): string | undefined => {
  const parts = Object.entries(clause)
    .map(([field, value]) => {
      const described = describeValue(value);
      if (!described) {
        return undefined;
      }
      return `${FIELD_LABELS[field] ?? field}: ${described}`;
    })
    .filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : undefined;
};

const collectFilters = (query: ReturnType<typeof selectCurrentQuery>): ActiveFilter[] => {
  const out: ActiveFilter[] = [];
  (["include", "exclude"] as const).forEach((mode) => {
    const clauses = query?.filter?.[mode];
    if (!Array.isArray(clauses)) {
      return;
    }
    clauses.forEach((clause, index) => {
      const label = describeClause(clause as Record<string, unknown>);
      if (label) {
        out.push({ mode, index, label: mode === "exclude" ? `not ${label}` : label });
      }
    });
  });
  return out;
};

/**
 * Running an advanced search used to close the dialog and leave no visible
 * trace that anything was filtered - the only tell was that the Clear button
 * had stopped being disabled. These chips are that trace, and each one can be
 * lifted individually rather than forcing an all-or-nothing clear.
 */
export const ActiveFilterChips = () => {
  const query = useSelector(selectCurrentQuery);
  const filters = collectFilters(query);
  if (filters.length === 0) {
    return null;
  }

  const removeFilter = (target: ActiveFilter) => {
    const filter = query?.filter ?? {};
    const clauses = Array.isArray(filter[target.mode]) ? [...(filter[target.mode] as unknown[])] : [];
    clauses.splice(target.index, 1);
    store.dispatch(
      updateDfContentQuery({
        filter: { ...filter, [target.mode]: clauses },
        page: 1,
      } as never)
    );
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", paddingX: { xs: 1, md: 2 } }}>
      <Typography variant="overline" sx={{ marginRight: 0.5 }}>
        Filters
      </Typography>
      {filters.map((filter) => (
        <Chip
          key={`${filter.mode}-${filter.index}-${filter.label}`}
          label={filter.label}
          size="small"
          variant="outlined"
          onDelete={() => removeFilter(filter)}
        />
      ))}
      <Button size="small" onClick={() => store.dispatch(resetDfContentQuery())} sx={{ minWidth: 0 }}>
        Clear all
      </Button>
    </Box>
  );
};
