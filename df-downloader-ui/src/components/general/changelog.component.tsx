import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Typography } from "@mui/material";
import { Changelog, changelogToMarkdown, ChangelogToMarkdownOpts, dfDownloaderBranch, dfDownloaderVersion, logger, parseChangelog, UpdateUserInfoRequest } from "df-downloader-common";
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

export const ChangelogDialog = () => {
    const authUser = useSelector(selectAuthUser);
    if (!authUser) {
        return null;
    }
    const { userInfo, id: userId } = authUser;
    const lastVersionAcknowledged = userInfo?.lastVersionAcknowledged;
    const shouldPopup = userInfo ? lastVersionAcknowledged !== dfDownloaderVersion : false;
    const [ open, setOpen ] = useState(shouldPopup);
    const closeDialog = async() => {
        setOpen(false);
        const updateUserInfoRequest: UpdateUserInfoRequest = {
            userId,
            userInfo: {
                lastVersionAcknowledged: dfDownloaderVersion
            }
        }
        store.dispatch(updateUserInfo.start(updateUserInfoRequest));
    }
    return (
        <Dialog open={open} onClose={closeDialog} maxWidth="md" fullWidth>
            <DialogTitle>DF Downloader Updated</DialogTitle>
            <DialogContent>
                <ChangelogDisplay markdownOpts={{
                    title: `What's New?`,
                    headerNotes: lastVersionAcknowledged ? `Here's what's changed since \`${lastVersionAcknowledged}\`:` : undefined,
                    onlyAfterVersion: lastVersionAcknowledged
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