import WarningIcon from "@mui/icons-material/Warning";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Typography } from "@mui/material";
import { dfDownloaderBranch } from "df-downloader-common";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { queryConfigSection } from "../../store/config/config.action.ts";
import { selectConfigSectionState } from "../../store/config/config.selector.ts";
import { selectServiceInfo } from "../../store/service-info/service-info.selector.ts";
import { store } from "../../store/store.ts";

export const BranchCheckDialog = () => {
    useEffect(() => {
        store.dispatch(queryConfigSection.start("dev"));
    }, []);
    const devConfigState = useSelector(selectConfigSectionState("dev"));
    const serviceInfo = useSelector(selectServiceInfo);
    const isContainer = serviceInfo ? serviceInfo.isContainer : true;
    const branch = dfDownloaderBranch;
    const [open, setOpen] = useState(false);
    const [hasOpened, setHasOpened] = useState(false); // Only open once - don't keep opening if the user closes it (but it's ok to reopen on refresh hence not using local storage)
    useEffect(() => {
        if (!devConfigState.initialised || devConfigState.loading) {
            return;
        }
        if (!devConfigState.value?.disableBranchWarning && branch !== "main" && !hasOpened) {
            setOpen(true);
            setHasOpened(true);
        }
    }, [devConfigState]);
    const close = () => {
        setOpen(false);
    }

    return (
        <Dialog open={open} onClose={close}>
            <DialogTitle>
                Development Branch Warning
                <IconButton
                    sx={{ position: "absolute", right: 8, top: 8, color: (theme) => theme.palette.warning.main }}
                    aria-label="warning"
                >
                    <WarningIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mb: 3 }}>
                    <Typography>
                        You are currently on the <strong>{branch}</strong> branch. This branch is intended for development purposes; it may contain bugs or patch your instance's data in unexpected ways. If you are not a developer or are not
                        comfortable debugging code, it is highly recommended to switch to the <strong>main</strong> branch. You can disable this warning in the config.yaml file.
                    </Typography>
                </Box>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h5" sx={{ mb: 2 }}>Switching Branches</Typography>
                    {isContainer ? <>
                        <Typography>
                            As you're running this in a container, switch over to the latest tag:
                        </Typography>
                        <Typography component="div" sx={{ padding: 1, borderRadius: 1, mt: 1 }}>
                            <code>concretellama/digital-foundry-downloader:latest</code>
                        </Typography>
                    </> : <>
                        <Typography>
                            Switch to the main branch and pull the latest changes by running the following:
                        </Typography>
                        <Stack sx={{
                            padding: 2
                        }}>
                            <code>git checkout main</code>
                            <code>git pull</code>
                        </Stack>
                        <Typography>
                            You will then need to rebuild the application.
                        </Typography>
                    </>}
                </Box>

            </DialogContent>
            <DialogActions>
                <Button onClick={close}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};