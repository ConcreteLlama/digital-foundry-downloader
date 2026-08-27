import _ from "lodash";

/**
 * A token identifying this run of the process, mixed into every generated
 * task and pipeline id.
 *
 * The counters behind those ids live in memory and restart at 1, while
 * completed pipelines are persisted and outlive the process. Without
 * something run-specific, the first pipeline started after a restart takes
 * an id that a pipeline in the history already holds, and everything keyed
 * by id then treats two unrelated runs as one thing.
 *
 * That was not theoretical: a newly queued subtitles job displayed the title
 * of an unrelated one that had failed before the restart, because the tasks
 * endpoint filters persisted history against the ids currently live - so the
 * older run's record was dropped as a duplicate of a job that had nothing to
 * do with it.
 *
 * Timestamp-derived rather than purely random, so ids from a later run sort
 * after an earlier one - which is what makes logs across a restart readable.
 */
const RUN_TOKEN = `${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 4)}`;

/**
 * An id unique within this run that also won't collide with ids from
 * previous ones.
 *
 * The sequential part is kept deliberately: "subtitles-pipeline-5-m8x2ab" is
 * still scannable in a log, which a UUID would not be.
 */
export const makeRunUniqueId = (prefix: string) => `${prefix}${_.uniqueId()}-${RUN_TOKEN}`;
