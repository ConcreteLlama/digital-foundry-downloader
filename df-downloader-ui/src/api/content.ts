import { DfContentUpdateDownloadMetaRequest, DfContentUpdateDownloadMetaResponse, GetMediaFileMetaRequest, MediaFileMeta, parseResponseBody } from "df-downloader-common";
import { API_URL } from "../config.ts"
import { fetchJson, postJson } from "../utils/fetch.ts"

export const getMediaFileMeta = async (contentName: string, mediaFilename: string) => {
    const params: GetMediaFileMetaRequest = {
        contentName,
        mediaFilename,
        includeSubs: true,
        includeChapters: true,
    };
    const result = await fetchJson(`${API_URL}/content/downloads/get-metadata?${new URLSearchParams(params as any)}`, {
        method: "GET",
    });
    const parsed = parseResponseBody(result, MediaFileMeta);
    return parsed.data;
};

export const updateMediaFileMeta = async (contentName: string, filename: string, meta: MediaFileMeta) => {
    const body: DfContentUpdateDownloadMetaRequest = {
        contentName,
        filename,
        meta,
    };
    const result = await postJson(`${API_URL}/content/downloads/update-metadata`, body);
    return parseResponseBody(result, DfContentUpdateDownloadMetaResponse);
}