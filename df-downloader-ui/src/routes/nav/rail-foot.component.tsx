import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { dfDownloaderVersion } from "df-downloader-common";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { AuthUserInfo } from "../../components/auth/auth-user-info.component";
import { selectDfUserInfo, selectDfUserInfoInitialized } from "../../store/df-user/df-user.selector";
import { selectIsLoading } from "../../store/general.selector";
import { monoFontFamily } from "../../themes/build-theme";

export type DfConnectionState = "connected" | "checking" | "signed-out";

/**
 * The backend serves HTTP before its startup Digital Foundry auth re-check has
 * finished, so there is a real window where "signed out" is not yet known to
 be true. That window used to be invisible - the UI just silently re-polled.
 */
export const useDfConnectionState = (): DfConnectionState => {
  const userInfo = useSelector(selectDfUserInfo);
  const initialized = useSelector(selectDfUserInfoInitialized);
  const loading = useSelector(selectIsLoading("dfUserInfo"));
  if (userInfo) {
    return "connected";
  }
  return !initialized || loading ? "checking" : "signed-out";
};

const connectionLabel: Record<DfConnectionState, string> = {
  connected: "connected",
  checking: "checking…",
  "signed-out": "signed out",
};

/** Accent when live, warn when it needs you, hollow while it doesn't know yet. */
export const connectionColour = (state: DfConnectionState) =>
  state === "connected" ? "primary.main" : state === "signed-out" ? "warning.main" : "text.disabled";

export type RailFootProps = {
  collapsed: boolean;
  onOpenChangelog: () => void;
};

/**
 * Two rows: who you are, then what the app is. Both halves of the lower strip
 * are live values that are otherwise expressed nowhere - the version is the
 * only way back into the changelog dialog, and the connection state is the one
 * thing worth interrupting for, since nothing can download while it is out.
 */
export const RailFoot = ({ collapsed, onOpenChangelog }: RailFootProps) => {
  const navigate = useNavigate();
  const connection = useDfConnectionState();
  const dfUserInfo = useSelector(selectDfUserInfo);

  const connectionTooltip = dfUserInfo
    ? `Signed in to Digital Foundry as ${dfUserInfo.username}${dfUserInfo.tier ? ` (${dfUserInfo.tier})` : ""}`
    : connection === "checking"
    ? "Checking the Digital Foundry session…"
    : "Not signed in to Digital Foundry - nothing can download. Click to fix.";

  return (
    <Box sx={{ borderTop: "1px solid", borderColor: "divider", padding: collapsed ? 1 : 1.5 }}>
      <Box sx={{ display: "flex", justifyContent: collapsed ? "center" : "flex-start" }}>
        <AuthUserInfo
          mode={collapsed ? "minimal" : "full"}
          statusColour={connectionColour(connection)}
          statusTooltip={connectionTooltip}
          menuHeader={
            collapsed ? (
              // At 54px the strip below is gone, so the version has to live
              // somewhere reachable.
              <Typography variant="caption" sx={{ fontFamily: monoFontFamily }}>
                v{dfDownloaderVersion} · {connectionLabel[connection]}
              </Typography>
            ) : undefined
          }
        />
      </Box>
      {!collapsed && (
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 1,
            fontFamily: monoFontFamily,
            fontSize: "0.6875rem",
          }}
        >
          <Tooltip title="What's new in this version">
            <Typography
              component="button"
              onClick={onOpenChangelog}
              sx={{
                fontFamily: "inherit",
                fontSize: "inherit",
                color: "text.secondary",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                "&:hover": { color: "text.primary" },
              }}
            >
              v{dfDownloaderVersion}
            </Typography>
          </Tooltip>
          <Tooltip title={connectionTooltip}>
            <Stack
              component="button"
              direction="row"
              onClick={() => navigate("/settings/df")}
              sx={{
                alignItems: "center",
                gap: 0.75,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "text.secondary",
                "&:hover": { color: "text.primary" },
              }}
            >
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: connection === "checking" ? "transparent" : connectionColour(connection),
                  border: connection === "checking" ? "1px solid" : "none",
                  borderColor: "text.disabled",
                }}
              />
              <Typography component="span" sx={{ fontFamily: "inherit", fontSize: "inherit" }}>
                {connectionLabel[connection]}
              </Typography>
            </Stack>
          </Tooltip>
        </Stack>
      )}
    </Box>
  );
};
