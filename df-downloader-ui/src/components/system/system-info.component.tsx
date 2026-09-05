import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { SystemInfo, parseResponseBody } from "df-downloader-common";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { API_URL } from "../../config";
import { monoFontFamily } from "../../themes/build-theme";
import { fetchJson } from "../../utils/fetch";
import { Loading } from "../general/loading.component";

const fetchSystemInfo = async (): Promise<SystemInfo> => {
  const body = await fetchJson(`${API_URL}/system/info`);
  const { data, error } = parseResponseBody(body, SystemInfo);
  if (error || !data) {
    throw new Error(error?.message || "Malformed response from the system endpoint");
  }
  return data;
};

const formatBytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

/** Files here span a few hundred bytes to several megabytes. */
const formatFileSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 ** 2) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};

const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) {
    return `${days}d ${hours}h`;
  }
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

/** One label/value line. Values are monospaced so paths and shas line up. */
const Row = ({ label, value }: { label: string; value: string | number }) => (
  <Box sx={{ display: "flex", gap: 2, alignItems: "baseline", paddingY: "2px" }}>
    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 150, flexShrink: 0 }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontFamily: monoFontFamily, wordBreak: "break-all" }}>
      {value}
    </Typography>
  </Box>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="subtitle2" sx={{ mb: 1, textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {title}
    </Typography>
    {children}
  </Box>
);

/**
 * What this install is and what it is running on.
 *
 * The point is answering the questions a bug report always needs answered -
 * which build, on what, with which tools present - without anyone having to
 * go and find out. The commit is the load-bearing one: a version number only
 * changes at a release, so between two releases it cannot tell you whether a
 * container has a given fix in it.
 */
export const SystemInfoView = () => {
  const [info, setInfo] = useState<SystemInfo | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInfo(await fetchSystemInfo());
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read system information");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyAll = async () => {
    if (!info) {
      return;
    }
    const text = JSON.stringify(info, null, 2);
    // Same reasoning as the log view: navigator.clipboard needs a secure
    // context, and this is normally reached over plain http on a LAN address,
    // where it is simply absent.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        return;
      }
    } catch {
      // Falls through to the textarea route below.
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      setCopied(document.execCommand("copy"));
    } finally {
      document.body.removeChild(area);
    }
  };

  return (
    <Paper sx={{ padding: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: "wrap" }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          About this install
        </Typography>
        <Button startIcon={<RefreshIcon />} onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
        <Button startIcon={<ContentCopyIcon />} onClick={() => void copyAll()} disabled={!info}>
          {copied ? "Copied" : "Copy all"}
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && !info ? (
        <Loading />
      ) : info ? (
        <>
          <Section title="Build">
            <Row label="Version" value={info.app.version} />
            <Row label="Branch" value={info.app.branch} />
            <Row label="Commit" value={info.app.commit} />
            <Row label="Built" value={new Date(info.app.builtAt).toLocaleString()} />
            <Row label="Running in Docker" value={info.app.isContainer ? "yes" : "no"} />
            <Row label="Node" value={info.app.nodeVersion} />
            <Row label="Up for" value={formatUptime(info.app.uptimeSeconds)} />
          </Section>

          <Section title="Machine">
            <Row label="Processor" value={`${info.host.cpuModel} (${info.host.cpuCount} threads)`} />
            <Row
              label="Memory"
              value={`${formatBytes(info.host.totalMemoryBytes)} total, ${formatBytes(info.host.freeMemoryBytes)} free`}
            />
            <Row label="System" value={`${info.host.platform} ${info.host.arch}, ${info.host.osRelease}`} />
            {info.host.loadAverage && (
              <Row label="Load average" value={info.host.loadAverage.map((n) => n.toFixed(2)).join(", ")} />
            )}
            <Row label="Time zone" value={info.host.timezone} />
          </Section>

          <Section title="Tools">
            {info.tools.map((tool) => (
              <Box key={tool.name} sx={{ display: "flex", gap: 2, alignItems: "baseline", paddingY: "2px" }}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 150, flexShrink: 0 }}>
                  {tool.name}
                </Typography>
                <Chip
                  size="small"
                  label={tool.available ? "found" : "missing"}
                  color={tool.available ? "success" : "error"}
                  variant="outlined"
                />
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontFamily: monoFontFamily, wordBreak: "break-all" }}
                >
                  {tool.version || tool.path}
                </Typography>
              </Box>
            ))}
          </Section>

          <Section title="Paths">
            <Row label="Config" value={info.paths.configDir} />
            <Row label="Working" value={info.paths.workDir} />
            <Row label="Downloads" value={info.paths.destinationDir} />
            {info.paths.logFile && <Row label="Log file" value={info.paths.logFile} />}
          </Section>

          <Section title="Stored data">
            {info.databases.length ? (
              info.databases.map((db) => (
                <Row
                  key={db.name}
                  label={db.name.replace(/\.json$/, "")}
                  value={`${formatFileSize(db.sizeBytes)}${db.version ? ` - version ${db.version}` : ""}`}
                />
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                Nothing found where the databases are kept.
              </Typography>
            )}
          </Section>

          <Section title="Library">
            <Row label="Content" value={`${info.content.entries} items`} />
            <Row label="Downloaded" value={info.content.downloaded} />
            <Row label="Analysed" value={info.content.analysed} />
            <Row label="With an article" value={info.content.withArticle} />
            <Row label="Not yet confirmed" value={info.content.legacy} />
          </Section>

          <Section title="Configured">
            <Row label="Signed in to DF" value={info.features.signedIntoDf ? "yes" : "no"} />
            <Row label="Subtitles" value={info.features.subtitlesService} />
            <Row label="AI analysis" value={info.features.aiProvider} />
            <Row label="Plex" value={info.features.plexEnabled ? "on" : "off"} />
            <Row label="Jellyfin" value={info.features.jellyfinEnabled ? "on" : "off"} />
            <Row label="Scheduled backfill" value={info.features.scheduledBackfillEnabled ? "on" : "off"} />
            <Row label="Automatic downloads" value={info.features.automaticDownloadsEnabled ? "on" : "off"} />
          </Section>
        </>
      ) : null}
    </Paper>
  );
};
