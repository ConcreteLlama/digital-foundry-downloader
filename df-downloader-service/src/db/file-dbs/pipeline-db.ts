import { logger, zodParse } from "df-downloader-common";
import path from "path";
import { ensureDirectory } from "../../utils/file-utils.js";
import {
  ActivePipelineDbSchema,
  CompletedPipeline,
  CompletedPipelineDbSchema,
  PersistedPipeline, summariseForArchive } from "../pipeline-db-model.js";
import { FileDb } from "../file-db.js";

const CURRENT_DB_VERSION = "2.8.0";

/**
 * How many finished pipelines to keep. Enough to answer "why did that fail
 * last week" without the file growing without bound - FileDb rewrites the
 * whole file on every save, so size has an ongoing cost, not just a
 * storage one.
 */
const COMPLETED_RETENTION = 500;

/**
 * Strips `connections` arrays out of a persisted step result.
 *
 * A bug in DownloadConnectionProgressInfo (fixed alongside this DB patch) let
 * per-chunk progress samples grow without bound for the life of a download
 * connection, and the whole live connection state was captured into
 * `finalStatus.connections` the moment a download step completed - a handful
 * of pipelines recorded before the fix could each carry tens of megabytes of
 * it. The aggregate stats anything actually reads (bytesDownloaded,
 * percentComplete, etc.) live directly on the parent object, not inside
 * `connections`, so it's safe to drop wherever it turns up rather than trying
 * to enumerate every place a download result can be nested.
 */
const stripConnections = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripConnections);
  }
  if (value && typeof value === "object") {
    const toReturn: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "connections" && Array.isArray(entry)) {
        continue;
      }
      toReturn[key] = stripConnections(entry);
    }
    return toReturn;
  }
  return value;
};

const stripConnectionsFromPipeline = (pipeline: any) => {
  if (!pipeline?.stepResults) {
    return pipeline;
  }
  const stepResults: Record<string, any> = {};
  for (const [stepId, stepResult] of Object.entries<any>(pipeline.stepResults)) {
    stepResults[stepId] =
      stepResult && typeof stepResult === "object"
        ? { ...stepResult, result: stripConnections(stepResult.result) }
        : stepResult;
  }
  return { ...pipeline, stepResults };
};

const stripConnectionsFromPipelines = (pipelines: any): any => {
  if (Array.isArray(pipelines)) {
    return pipelines.map(stripConnectionsFromPipeline);
  }
  return mapPipelines(pipelines, stripConnectionsFromPipeline);
};

/**
 * Applies a transform to every pipeline, keeping the collection's shape.
 *
 * The two DBs disagree about that shape - the active one is a record keyed by
 * id, the completed one is an array - and the patch routine is shared. It
 * previously rebuilt a record either way, which was wrong for the completed DB
 * and had simply never run: the version had not moved since that DB existed,
 * so the routine always returned early. The first bump after that would have
 * failed validation on startup for everyone, which is exactly what happened
 * here the moment this version changed.
 */
const mapPipelines = (pipelines: any, transform: (pipeline: any) => any) =>
  Array.isArray(pipelines)
    ? pipelines.map(transform)
    : Object.fromEntries(Object.entries<any>(pipelines || {}).map(([id, pipeline]) => [id, transform(pipeline)]));

/**
 * @param summariseResults trim step results down on the way in - for the
 *   completed archive only. The active DB keeps them in full, because a
 *   download resumes by replaying the results of the steps that already
 *   finished, and summarising those would break the resume it exists for.
 */
const makePatchRoutine =
  (
    schema: typeof ActivePipelineDbSchema | typeof CompletedPipelineDbSchema,
    { summariseResults = false }: { summariseResults?: boolean } = {}
  ) =>
  async (data: any) => {
    if (data?.version === CURRENT_DB_VERSION) {
      return { data: zodParse(schema as any, data), patched: false };
    }
    logger.log("info", `Pipeline DB at version ${data?.version || "NO_VERSION"} - patching to ${CURRENT_DB_VERSION}`);
    let patchedPipelines = stripConnectionsFromPipelines(data?.pipelines);
    if (summariseResults) {
      // Reclaims what earlier versions archived in full - transcripts, mostly,
      // which is why this file reached five megabytes on 48 records.
      patchedPipelines = mapPipelines(patchedPipelines, (pipeline) => ({
        ...pipeline,
        stepResults: summariseForArchive(pipeline?.stepResults),
      }));
    }
    return {
      data: zodParse(schema as any, { ...data, pipelines: patchedPipelines, version: CURRENT_DB_VERSION }),
      patched: true,
    };
  };

const makeBackupDestination = (dbDir: string, name: string) => async (data: any) => {
  const version = data?.version || "NO_VERSION";
  const backupDir = path.join(dbDir, "backups");
  ensureDirectory(backupDir);
  return path.join(backupDir, `${name}-${version}-${Date.now()}.json`);
};

/**
 * Pipelines that haven't finished, so they can be picked back up after a
 * restart.
 *
 * Kept separate from the completed history deliberately. This file is small
 * and written constantly - every step transition - while the completed one
 * grows without bound and is written once per pipeline. FileDb rewrites the
 * entire file on every save, so combining them would mean rewriting
 * megabytes of history on each step of every running pipeline.
 */
export class ActivePipelineDb {
  private constructor(private readonly fileDb: FileDb<ActivePipelineDbSchema>) {}

  static async create(dbDir: string) {
    ensureDirectory(dbDir);
    const fileDb = await FileDb.create<ActivePipelineDbSchema>({
      schema: ActivePipelineDbSchema,
      filename: path.join(dbDir, "active-pipelines.json"),
      initialData: { version: CURRENT_DB_VERSION, lastUpdated: new Date(), pipelines: {} },
      backupDestination: makeBackupDestination(dbDir, "active-pipelines"),
      patchRoutine: makePatchRoutine(ActivePipelineDbSchema),
    });
    return new ActivePipelineDb(fileDb);
  }

  getAll(): PersistedPipeline[] {
    return Object.values(this.fileDb.getData().pipelines);
  }

  get(id: string): PersistedPipeline | undefined {
    return this.fileDb.getData().pipelines[id];
  }

  async upsert(pipeline: PersistedPipeline) {
    const data = this.fileDb.getData();
    data.pipelines[pipeline.id] = pipeline;
    data.lastUpdated = new Date();
    await this.fileDb.updateDb(data);
  }

  async remove(id: string) {
    const data = this.fileDb.getData();
    if (!data.pipelines[id]) {
      return;
    }
    delete data.pipelines[id];
    data.lastUpdated = new Date();
    await this.fileDb.updateDb(data);
  }

  /** Wipes everything - used once the in-flight set has been re-queued on startup. */
  async clear() {
    const data = this.fileDb.getData();
    data.pipelines = {};
    data.lastUpdated = new Date();
    await this.fileDb.updateDb(data);
  }
}

/**
 * Finished pipelines, kept for history.
 *
 * A successful download is already largely recorded against the content
 * itself (date, location, size, subtitles). The value here is mostly in the
 * failures, which are currently recorded nowhere at all and vanish on
 * restart - so "why did that download fail on Tuesday" is unanswerable
 * today.
 */
export class CompletedPipelineDb {
  private constructor(private readonly fileDb: FileDb<CompletedPipelineDbSchema>) {}

  static async create(dbDir: string) {
    ensureDirectory(dbDir);
    const fileDb = await FileDb.create<CompletedPipelineDbSchema>({
      schema: CompletedPipelineDbSchema,
      filename: path.join(dbDir, "completed-pipelines.json"),
      initialData: { version: CURRENT_DB_VERSION, lastUpdated: new Date(), pipelines: [] },
      backupDestination: makeBackupDestination(dbDir, "completed-pipelines"),
      patchRoutine: makePatchRoutine(CompletedPipelineDbSchema, { summariseResults: true }),
    });
    return new CompletedPipelineDb(fileDb);
  }

  getAll(): CompletedPipeline[] {
    return this.fileDb.getData().pipelines;
  }

  /** Drops one record - the "clear" action on a single finished pipeline. */
  async remove(id: string) {
    const data = this.fileDb.getData();
    const remaining = data.pipelines.filter((pipeline) => pipeline.id !== id);
    if (remaining.length === data.pipelines.length) {
      return;
    }
    data.pipelines = remaining;
    data.lastUpdated = new Date();
    await this.fileDb.updateDb(data);
  }

  /** Drops the lot - "clear completed". */
  async clear() {
    const data = this.fileDb.getData();
    if (!data.pipelines.length) {
      return;
    }
    data.pipelines = [];
    data.lastUpdated = new Date();
    await this.fileDb.updateDb(data);
  }

  async add(pipeline: CompletedPipeline) {
    const data = this.fileDb.getData();
    // Newest first, so trimming drops the oldest and reading the recent
    // history doesn't mean walking the whole array.
    data.pipelines = [pipeline, ...data.pipelines].slice(0, COMPLETED_RETENTION);
    data.lastUpdated = new Date();
    await this.fileDb.updateDb(data);
  }
}
