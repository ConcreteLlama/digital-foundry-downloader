import { DfTagsResponse } from "df-downloader-common";
import { createQueryActions } from "../utils";

export const queryDfTags = createQueryActions<void, DfTagsResponse>("dfTags", "QUERY_CONTENT_TAGS");
