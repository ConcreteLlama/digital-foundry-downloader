import ArchiveIcon from "@mui/icons-material/Archive";
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Paper, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { API_URL } from "../../config";

/**
 * A part of the report, and what it is worth to whoever reads it.
 *
 * The wording matters more than usual: someone deciding whether to attach
 * this to a public issue needs to know what is in it without unzipping it
 * first, and "config" alone does not tell them their keys are not in there.
 */
const PARTS = [
  {
    id: "system",
    label: "Version and system details",
    description:
      "Which build this is, down to the commit, plus the machine, the tools it found and how much content you have. Counts only - no titles or filenames.",
  },
  {
    id: "config",
    label: "Settings, with credentials removed",
    description:
      "Your configuration with every key, token and cookie replaced. What remains is paths, addresses and options - which do include folder names.",
  },
  {
    id: "logs",
    label: "Log files",
    description: "The service log as written, including the older rotated files. Usually the largest part.",
  },
  {
    id: "databases",
    label: "The stored data itself",
    description:
      "Where every file was saved, the full text of every article found, every analysis, and what you have watched. None of this can be redacted - it is the content, not a password sitting next to it. Only worth sending to someone looking into a problem with the data itself, and never to a public issue.",
    dangerous: true,
  },
] as const;

/**
 * Builds a zip of the things a bug report always needs.
 *
 * Exists because getting help with a self-hosted tool otherwise takes several
 * rounds of "what version", "is it in Docker", "what does the log say" - and
 * the answers arrive as screenshots, or as a paste that has lost its
 * formatting. This is the same questions, answered once, by the thing that
 * actually knows.
 */
export const DiagnosticReport = () => {
  /*
   * Everything except the stored data, which has to be chosen deliberately.
   *
   * "Off by default" is not much of a protection on its own, so it is also
   * the only one labelled for what it actually is and marked in the list -
   * the aim is that nobody ticks it without having read why they would.
   */
  const [selected, setSelected] = useState<Set<string>>(
    new Set(PARTS.filter((part) => !("dangerous" in part && part.dangerous)).map((part) => part.id))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const download = async () => {
    setBusy(true);
    setError(undefined);
    try {
      /*
       * Fetched and turned into a blob rather than pointed at with a link.
       *
       * A plain <a href> would work, but a failure would then replace the page
       * with whatever the server said, and there would be nowhere to report a
       * problem. This keeps the failure on the page.
       */
      const response = await fetch(`${API_URL}/system/report?parts=${[...selected].join(",")}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`The service returned ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ??
        `df-downloader-report-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper sx={{ padding: 2, mt: 2 }}>
      <Typography variant="h6">Diagnostic report</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        One zip with everything needed to look into a problem. Credentials are removed from the settings before they go
        in - but the log is not filtered, so have a look before posting it somewhere public.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={0.5} sx={{ mb: 2 }}>
        {PARTS.map((part) => {
          const dangerous = "dangerous" in part && part.dangerous;
          return (
            <Box key={part.id}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selected.has(part.id)}
                    onChange={() => toggle(part.id)}
                    size="small"
                    color={dangerous ? "warning" : undefined}
                  />
                }
                label={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <span>{part.label}</span>
                    {dangerous && <Chip size="small" label="not redacted" color="warning" variant="outlined" />}
                  </Stack>
                }
              />
              <Typography
                variant="caption"
                color={dangerous && selected.has(part.id) ? "warning.main" : "text.secondary"}
                sx={{ display: "block", ml: 4, mt: -0.5 }}
              >
                {part.description}
              </Typography>
            </Box>
          );
        })}
      </Stack>

      <Button
        variant="contained"
        startIcon={<ArchiveIcon />}
        onClick={() => void download()}
        disabled={busy || !selected.size}
      >
        {busy ? "Building..." : "Download report"}
      </Button>
    </Paper>
  );
};
