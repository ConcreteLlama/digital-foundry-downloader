// Timebase will always be in milliseconds

import { mediaSanitise } from "./string-utils.js";

export type Chapter = {
    title: string;
    start: number;
    end: number;
}

export const makeChapterContent = (chapters?: Chapter[] | null) => {
    if (!chapters?.length) {
        return null;
    }
    return `;FFMETADATA1\n${chapters.map((chapter, index) => {
        return `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${chapter.start}\nEND=${chapter.end}\nTITLE=${mediaSanitise(chapter.title)}`;
    }).join("\n")}`;
}