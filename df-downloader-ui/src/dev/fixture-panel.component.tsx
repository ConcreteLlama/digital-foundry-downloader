/**
 * The Dev settings page's fixture panel. DEV ONLY - see task-fixtures.ts.
 *
 * Reached through an `import.meta.env.DEV` guarded lazy import in
 * dev-settings-form, so no shipping module holds a static reference to it and
 * rollup drops the whole chunk from a production build.
 */
import ScienceIcon from "@mui/icons-material/Science";
import { Alert, Box, Button, Chip, Divider, Paper, Stack, Switch, Typography } from "@mui/material";
import { useSyncExternalStore } from "react";
import { getState, play, scenarios, setTicking, step, stop, subscribe } from "./fixture-runner";

export const FixturePanel = () => {
  const { scenario: playing, ticking } = useSyncExternalStore(subscribe, getState);
  return (
    <Paper variant="outlined" sx={{ padding: 2, marginTop: 4 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <ScienceIcon color="warning" />
        <Typography variant="h6">Task fixtures</Typography>
        <Chip size="small" color="warning" variant="outlined" label="dev build only" />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ marginTop: 1 }}>
        Injects fake pipeline state into the store so the Downloads page&apos;s live states can be looked at without
        running a real download against digitalfoundry.net. A warning banner sits across the top of the app while a
        fixture is playing, and every fixture title is prefixed <code>[FIXTURE]</code>.
      </Typography>
      <Alert severity="info" variant="outlined" sx={{ marginTop: 2 }}>
        Task pushes from the backend are held back while a fixture plays, so nothing overwrites it. Stopping clears the
        list and hands the page back to the real stream - which only pushes when something actually changes, so an empty
        Downloads page right after stopping is expected.
      </Alert>
      <Divider sx={{ marginY: 2 }} />
      <Stack spacing={1}>
        {scenarios.map((scenario) => {
          const isPlaying = playing?.id === scenario.id;
          return (
            <Box
              key={scenario.id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <Box sx={{ flex: "1 1 20rem" }}>
                <Typography variant="subtitle2">
                  {scenario.label}
                  {scenario.animated && (
                    <Chip size="small" label="animated" variant="outlined" sx={{ marginLeft: 1 }} />
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {scenario.description}
                </Typography>
              </Box>
              <Button
                // MUI buttons default to type="submit" inside a form; the Dev
                // page has one, and this panel must never submit it.
                type="button"
                size="small"
                variant={isPlaying ? "contained" : "outlined"}
                color={isPlaying ? "warning" : "primary"}
                onClick={() => (isPlaying ? stop() : play(scenario.id))}
              >
                {isPlaying ? "Stop" : "Play"}
              </Button>
            </Box>
          );
        })}
      </Stack>
      <Divider sx={{ marginY: 2 }} />
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Switch checked={ticking} onChange={(event) => setTicking(event.target.checked)} />
          <Typography variant="body2">Advance progress</Typography>
        </Box>
        <Button type="button" size="small" variant="outlined" disabled={!playing || ticking} onClick={() => step()}>
          Step once
        </Button>
        <Button type="button" size="small" variant="outlined" color="warning" disabled={!playing} onClick={() => stop()}>
          Stop fixture
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", marginTop: 2 }}>
        Also available from the console: <code>__DF_FIXTURES__.play(&quot;failed&quot;)</code>,{" "}
        <code>.stop()</code>, <code>.list()</code>. The store itself is at <code>__DF_STORE__</code>.
      </Typography>
    </Paper>
  );
};

export default FixturePanel;
