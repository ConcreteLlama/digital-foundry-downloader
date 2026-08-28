import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Typography, useMediaQuery,
  useTheme } from "@mui/material";
import { Changelog, changelogToMarkdown, ChangelogToMarkdownOpts, dfDownloaderBranch, dfDownloaderVersion, isDowngradeFrom, logger, parseChangelog, UpdateUserInfoRequest } from "df-downloader-common";
import { useState } from "react";
import Markdown from 'react-markdown';
import { useSelector } from "react-redux";
import { API_URL } from "../../config.ts";
import { useQuery } from "../../hooks/use-query.ts";
import { updateUserInfo } from "../../store/auth-user/auth-user.actions.ts";
import { selectAuthUser } from "../../store/auth-user/auth-user.selector.ts";
import { store } from "../../store/store.ts";
import { Loading } from "./loading.component.tsx";

const GITHUB_URL = 'https://raw.githubusercontent.com/ConcreteLlama/digital-foundry-downloader/refs/heads';
const githubChangelogUrl = `${GITHUB_URL}/${dfDownloaderBranch}/df-downloader-service/changelog.yaml`;
const serviceChangelogUrl = `${API_URL}/service-info/changelog`;


const fetchChangelog = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch changelog: ${response.statusText}`);
    }
    const changelogText = await response.text();
    const parsed = parseChangelog(changelogText);
    return parsed;
}

type UseChangelogProps = {
    changelogOverride?: Changelog;
    backupChangeLog?: Changelog;
}
const useChangelog = ({changelogOverride, backupChangeLog}: UseChangelogProps = {}) => useQuery({
    fetch: async() => {
        if (changelogOverride) {
            return changelogOverride;
        }
        try {
            return await fetchChangelog(githubChangelogUrl);
        } catch (e) {
            logger.log('warn', `Failed to fetch changelog from github: ${e}`);
            try {
                return await fetchChangelog(serviceChangelogUrl);
            } catch (e) {
                logger.log('error', `Failed to fetch changelog from service: ${e}`);
                return backupChangeLog;
            }
        }
    }
}); 

export type ChangelogDisplayProps = {
    changelog?: Changelog;
    markdownOpts?: ChangelogToMarkdownOpts;
}
export const ChangelogDisplay = ({markdownOpts, changelog: propsChangelog}: ChangelogDisplayProps) => {
    const { data: changelog, error, loading } = useChangelog({ changelogOverride: propsChangelog });
    return (
        <Paper sx={{ padding: 2 }}>
            {loading && <Loading />}
            {error && <Typography variant="h6" color="error">Failed to load changelog: {error}</Typography>}
            {changelog && <Markdown>{changelogToMarkdown(changelog, {
                currentVersion: dfDownloaderVersion,
                branch: dfDownloaderBranch,
                ...markdownOpts
            })}</Markdown>}
        </Paper>
    )
}

export type ChangelogDialogProps = {
    /**
     * Forces the dialog open. Without it the dialog still opens itself once
     * after an upgrade, as it always has - this is what lets the version in the
     * nav rail re-open it afterwards, from any page.
     */
    open?: boolean;
    onClose?: () => void;
};

export const ChangelogDialog = ({ open: openProp, onClose }: ChangelogDialogProps = {}) => {
    const authUser = useSelector(selectAuthUser);
    const lastVersionAcknowledged = authUser?.userInfo?.lastVersionAcknowledged;
    // Moving to an older version - e.g. switching from the experimental
    // DockerHub tag back to latest. Filtering to "newer than acknowledged"
    // would then match nothing and show an empty changelog, so show this
    // version's own notes instead.
    const isDowngrade = Boolean(
        lastVersionAcknowledged && isDowngradeFrom(lastVersionAcknowledged, dfDownloaderVersion)
    );
    const shouldPopup = Boolean(authUser?.userInfo) && lastVersionAcknowledged !== dfDownloaderVersion;
    const [ selfOpened, setSelfOpened ] = useState(shouldPopup);
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down('md'));
    // Hooks first - this used to return early on a missing user, which made the
    // hook order depend on whether the user had loaded yet.
    if (!authUser) {
        return null;
    }
    const userId = authUser.id;
    const open = openProp ?? selfOpened;
    const closeDialog = async() => {
        setSelfOpened(false);
        onClose?.();
        const updateUserInfoRequest: UpdateUserInfoRequest = {
            userId,
            userInfo: {
                lastVersionAcknowledged: dfDownloaderVersion
            }
        }
        store.dispatch(updateUserInfo.start(updateUserInfoRequest));
    }
    return (
        <Dialog open={open} onClose={closeDialog} maxWidth="md" fullWidth fullScreen={fullScreen}>
            <DialogTitle>DF Downloader Updated</DialogTitle>
            <DialogContent>
                <ChangelogDisplay markdownOpts={{
                    title: `What's New?`,
                    headerNotes: isDowngrade
                        ? `You've moved back to \`${dfDownloaderVersion}\` from \`${lastVersionAcknowledged}\`. Here's what's in this version:`
                        : lastVersionAcknowledged
                            ? `Here's what's changed since \`${lastVersionAcknowledged}\`:`
                            : undefined,
                    onlyAfterVersion: isDowngrade ? undefined : lastVersionAcknowledged
                }}/>
            </DialogContent>
            <DialogActions sx={{
                display: 'flex',
                justifyContent: 'center'
            }}>
                <Button variant="contained" onClick={closeDialog}>OK</Button>
            </DialogActions>
        </Dialog>
    )
}