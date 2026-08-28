import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config";
import { useSyncExternalStore } from "react";

type SectionKey = keyof DfDownloaderConfig;

/**
 * Which settings sections have unsaved edits.
 *
 * The dirty flag lives inside react-hook-form, one instance per section form,
 * and the sub-nav that needs to show a marker is a sibling several levels up.
 * Rather than lift the whole form state or push it through Redux - it is
 * transient UI state that should never be persisted or time-travelled - the
 * form publishes a single boolean here and the sub-nav subscribes.
 */
const dirty = new Set<SectionKey>();
const listeners = new Set<() => void>();
let snapshot: readonly SectionKey[] = [];

const emit = () => {
  snapshot = [...dirty];
  listeners.forEach((listener) => listener());
};

export const setSectionDirty = (section: SectionKey, isDirty: boolean) => {
  const had = dirty.has(section);
  if (isDirty === had) {
    return;
  }
  if (isDirty) {
    dirty.add(section);
  } else {
    dirty.delete(section);
  }
  emit();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => snapshot;

export const useDirtySections = () => useSyncExternalStore(subscribe, getSnapshot);

export const useIsSectionDirty = (section?: SectionKey) => {
  const sections = useDirtySections();
  return section ? sections.includes(section) : false;
};
