import { logger } from "df-downloader-common";
import fs from "fs";

/**
 * Updating an MP4's text tags without rewriting the file.
 *
 * ffmpeg cannot do this - it refuses in-place output outright ("FFmpeg cannot
 * edit existing files in-place") and always produces a new file, so changing a
 * genre on a 9 GiB download costs a full read and write of 9 GiB.
 *
 * It is avoidable because of where the bytes live. A tag's value sits entirely
 * inside `moov/udta/meta/ilst`, and every file this tool writes has `moov`
 * LAST - which is what ffmpeg produces when not asked for `+faststart`, and
 * every download goes through injectMediaMetadata, so it is an invariant we
 * create ourselves. Chunk offsets (`stco`/`co64`) are absolute file offsets
 * pointing into `mdat`, which sits *before* `moov`, so resizing `moov` cannot
 * invalidate them. Updating tags reduces to writing a new `moov`; nothing else
 * in the file moves.
 *
 * Measured on a 1.62 GiB download, adding a genre: 80ms and ~1 MiB written,
 * against 1,068ms and 1.69 GiB for the equivalent `-c copy` remux - and that
 * remux figure is a best case on a cached NVMe. On the Unraid array this
 * deploys to, parity-protected writes make the full remux minutes for a large
 * file while this stays ~2 MiB of I/O whatever the size.
 *
 * IMPORTANT: this only works while `moov` stays last. Adding
 * `-movflags +faststart` to the injection would move it to the front, make
 * every `stco` offset depend on `moov`'s size, and kill this outright. The
 * guard below would catch it and fall back to remuxing, so the failure mode is
 * a silent performance regression rather than a corrupt file - see the
 * matching note in media-metadata.ts.
 *
 * Deliberately limited to text tags. Chapters and subtitles are tracks whose
 * sample data lives inside `mdat`, so they cannot be touched without moving
 * the bytes every other track's offsets are measured against.
 */

/** The tag fields this can write, as their iTunes-style atom names. */
export type Mp4Tags = {
  title?: string;
  /** Written to `©day` - ffmpeg's `year` metadata maps here. */
  year?: string;
  /** Written to both `desc` and `ldes`, matching what the remux produces. */
  description?: string;
  /** Written to `©gen` - the field AI tags land in. */
  genre?: string;
};

type Box = {
  type: string;
  /** Offset of the box header itself. */
  offset: number;
  /** Total size including the header. */
  size: number;
  headerSize: number;
};

const FREE_HEADER = Buffer.from([0, 0, 0, 0, 0x66, 0x72, 0x65, 0x65]); // "free"

/**
 * Reads the boxes in [start, end), one level deep.
 *
 * Returns null the moment anything does not add up. Every caller treats that
 * as "not a shape I understand" and falls back to the remux, which is the only
 * safe reading of a file this does not fully recognise.
 */
const readBoxes = (fd: number, start: number, end: number): Box[] | null => {
  const boxes: Box[] = [];
  let offset = start;
  const header = Buffer.alloc(16);
  while (offset + 8 <= end) {
    if (fs.readSync(fd, header, 0, 16, offset) < 8) {
      return null;
    }
    let size = header.readUInt32BE(0);
    const type = header.toString("latin1", 4, 8);
    let headerSize = 8;
    if (size === 1) {
      size = Number(header.readBigUInt64BE(8));
      headerSize = 16;
    } else if (size === 0) {
      // "to end of file" - only legal for the last box.
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) {
      return null;
    }
    boxes.push({ type, offset, size, headerSize });
    offset += size;
  }
  return offset === end ? boxes : null;
};

const findBox = (boxes: Box[] | null, type: string): Box | undefined =>
  boxes?.find((box) => box.type === type);

/** A `data` box holding UTF-8 text, as `ilst` entries carry their values. */
const makeDataBox = (value: string): Buffer => {
  const text = Buffer.from(value, "utf8");
  const box = Buffer.alloc(16 + text.length);
  box.writeUInt32BE(box.length, 0);
  box.write("data", 4, "latin1");
  box.writeUInt32BE(1, 8); // well-known type 1: UTF-8
  box.writeUInt32BE(0, 12); // locale
  text.copy(box, 16);
  return box;
};

/** One `ilst` entry: a box named for the tag, wrapping a single `data` box. */
const makeTagBox = (atom: string, value: string): Buffer => {
  const data = makeDataBox(value);
  const box = Buffer.alloc(8 + data.length);
  box.writeUInt32BE(box.length, 0);
  box.write(atom, 4, "latin1");
  data.copy(box, 8);
  return box;
};

/**
 * The atoms each field maps to, matching what the ffmpeg remux writes so the
 * two paths produce the same file.
 */
const tagAtoms = (tags: Mp4Tags): { atom: string; value: string }[] => {
  const out: { atom: string; value: string }[] = [];
  if (tags.title !== undefined) out.push({ atom: "\u00a9nam", value: tags.title });
  if (tags.year !== undefined) out.push({ atom: "\u00a9day", value: tags.year });
  if (tags.genre !== undefined) out.push({ atom: "\u00a9gen", value: tags.genre });
  if (tags.description !== undefined) {
    // Both, because the remux writes both and readers differ on which they use.
    out.push({ atom: "desc", value: tags.description });
    out.push({ atom: "ldes", value: tags.description });
  }
  return out;
};

/**
 * Rebuilds `ilst`, replacing the supplied tags and keeping everything else.
 *
 * Whole-rebuild rather than editing entries where they sit, because a tag can
 * shrink as well as grow - a re-run of a tag backfill with fewer tags than
 * last time is exactly that - and patching in place is where the off-the-shelf
 * library tried and corrupted the file.
 */
const rebuildIlst = (existing: Buffer, entries: Box[], tags: Mp4Tags, ilstStart: number): Buffer => {
  const replacing = new Set(tagAtoms(tags).map((tag) => tag.atom));
  const kept: Buffer[] = [];
  for (const entry of entries) {
    if (replacing.has(entry.type)) {
      continue;
    }
    // Preserved verbatim - `©too` (the encoder string ffmpeg writes) and
    // anything else this does not model still belong to the file.
    const from = entry.offset - ilstStart;
    kept.push(existing.subarray(from, from + entry.size));
  }
  const written = tagAtoms(tags)
    // An empty value means "no such tag" rather than "a tag that is blank".
    .filter((tag) => tag.value.length > 0)
    .map((tag) => makeTagBox(tag.atom, tag.value));
  const body = Buffer.concat([...kept, ...written]);
  const ilst = Buffer.alloc(8 + body.length);
  ilst.writeUInt32BE(ilst.length, 0);
  ilst.write("ilst", 4, "latin1");
  body.copy(ilst, 8);
  return ilst;
};

/** Rewrites a container's size field after its contents changed size. */
const resize = (box: Buffer, size: number): Buffer => {
  box.writeUInt32BE(size, 0);
  return box;
};

export type InPlaceResult = { ok: true; bytesWritten: number } | { ok: false; reason: string };

/**
 * Writes `tags` into an MP4's `moov` without touching `mdat`.
 *
 * Returns `{ ok: false }` rather than throwing for any file whose shape is not
 * understood - the caller falls back to the remux, which handles everything.
 * Failing closed is deliberate: a file this does not fully recognise is one it
 * must not write to.
 */
export const setMp4TagsInPlace = async (filePath: string, tags: Mp4Tags): Promise<InPlaceResult> => {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, "r+");
    const fileSize = fs.fstatSync(fd).size;

    const top = readBoxes(fd, 0, fileSize);
    if (!top?.length) {
      return { ok: false, reason: "not a box-structured file" };
    }
    const moov = top[top.length - 1];
    // The whole optimisation rests on this. Anything else - `moov` first
    // (faststart), a trailing box after it, a fragmented MP4 - and the
    // offsets in `stco` would be tied to `moov`'s size.
    if (moov.type !== "moov" || moov.offset + moov.size !== fileSize) {
      return { ok: false, reason: `moov is not the last box (last is ${moov.type})` };
    }

    const moovBody = readBoxes(fd, moov.offset + moov.headerSize, moov.offset + moov.size);
    const udta = findBox(moovBody, "udta");
    if (!udta) {
      return { ok: false, reason: "no udta" };
    }
    const udtaBody = readBoxes(fd, udta.offset + udta.headerSize, udta.offset + udta.size);
    const meta = findBox(udtaBody, "meta");
    if (!meta) {
      return { ok: false, reason: "no meta" };
    }
    // `meta` is a FullBox - 4 bytes of version/flags sit before its children.
    const metaChildrenStart = meta.offset + meta.headerSize + 4;
    const metaBody = readBoxes(fd, metaChildrenStart, meta.offset + meta.size);
    const ilst = findBox(metaBody, "ilst");
    if (!ilst) {
      return { ok: false, reason: "no ilst" };
    }

    const ilstBuf = Buffer.alloc(ilst.size);
    fs.readSync(fd, ilstBuf, 0, ilst.size, ilst.offset);
    const ilstEntries = readBoxes(fd, ilst.offset + ilst.headerSize, ilst.offset + ilst.size);
    if (!ilstEntries) {
      return { ok: false, reason: "unreadable ilst" };
    }

    const newIlst = rebuildIlst(ilstBuf, ilstEntries, tags, ilst.offset);
    const delta = newIlst.length - ilst.size;

    // The new moov, assembled from the old one with ilst swapped and every
    // enclosing box's size adjusted by the same delta.
    const moovBuf = Buffer.alloc(moov.size);
    fs.readSync(fd, moovBuf, 0, moov.size, moov.offset);
    const rel = (absolute: number) => absolute - moov.offset;
    const newMoov = Buffer.concat([
      moovBuf.subarray(0, rel(ilst.offset)),
      newIlst,
      moovBuf.subarray(rel(ilst.offset) + ilst.size),
    ]);
    resize(newMoov, moov.size + delta);
    resize(newMoov.subarray(rel(udta.offset)), udta.size + delta);
    resize(newMoov.subarray(rel(meta.offset)), meta.size + delta);

    /*
     * Append the new moov, then retire the old one - never the other way
     * round. Truncating first would leave a window, however short, in which
     * the file has no index at all and is unplayable; a crash there would
     * cost the download. This way a crash at any instant leaves either the
     * old file or the new one, never neither.
     */
    fs.writeSync(fd, newMoov, 0, newMoov.length, fileSize);
    fs.fsyncSync(fd);
    // The old moov becomes `free` space of exactly its own size, so the box
    // chain still accounts for every byte and a later edit can reclaim it.
    const freeHeader = Buffer.from(FREE_HEADER);
    freeHeader.writeUInt32BE(moov.size, 0);
    fs.writeSync(fd, freeHeader, 0, freeHeader.length, moov.offset);
    fs.fsyncSync(fd);

    return { ok: true, bytesWritten: newMoov.length };
  } catch (e) {
    // Never fatal: the remux can do anything this cannot.
    logger.log("debug", `In-place tag write not possible for ${filePath}: ${e}`);
    return { ok: false, reason: String(e) };
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
};
