/**
 * Layout constants shared between the navigation and the pages that have
 * to keep clear of it.
 *
 * Deliberately a module with no imports of its own. These used to live on
 * the tab bar component, which meant anything needing the measurement
 * pulled in a component - and a settings form doing that closed a cycle
 * (settings form -> tab bar -> nav routes -> settings form) that blanked
 * the whole app with "cannot access before initialization".
 */

/** Height of the fixed bottom tab bar shown below the md breakpoint. */
export const MOBILE_TAB_BAR_HEIGHT = 56;
