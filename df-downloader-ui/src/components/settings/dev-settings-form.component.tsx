import { DevConfig } from "df-downloader-common/config/dev-config";
import { Suspense, lazy } from "react";
import { useWatch } from "react-hook-form-mui";
import { Fragment } from "react/jsx-runtime";
import { ZodCheckboxField } from "../zod-fields/zod-checkbox-field.component.tsx";
import { ZodTextField } from "../zod-fields/zod-text-field.component.tsx";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

/**
 * Fake task-pipeline state for looking at the Downloads page without running a
 * real download (see src/dev/task-fixtures.ts).
 *
 * Two different "dev" gates are in play and both matter. `devModeEnabled` is a
 * runtime config flag, and it exists in production builds too - it is what
 * decides whether this page is reachable at all. `import.meta.env.DEV` is
 * build-time, and it is what keeps the fixtures out of a shipped bundle: with
 * it folded to false, this ternary collapses to null, the dynamic import goes
 * with it, and rollup drops the chunk. Keep the guard inline like this - hiding
 * it behind a variable or a static import would put the fixtures back in the
 * production bundle.
 */
const FixturePanel = import.meta.env.DEV ? lazy(() => import("../../dev/fixture-panel.component.tsx")) : null;

export const DevSettingsForm = () => {
  return (
    <Fragment>
      <DfSettingsSectionForm sectionName="dev" title="Dev">
        <DevSettings />
      </DfSettingsSectionForm>
      {FixturePanel && (
        <Suspense fallback={null}>
          <FixturePanel />
        </Suspense>
      )}
    </Fragment>
  );
};

const DevSettings = () => {
  const enabled = useWatch<DevConfig>({
    name: "devModeEnabled",
  });
  return (
    <Fragment>
      <ZodCheckboxField
        name="devModeEnabled"
        label="Dev Mode Enabled?"
        zodBoolean={DevConfig._def.in.shape.devModeEnabled}
      />
      {enabled && (
        <ZodTextField
          name="downloadUrlOverride"
          label="Download URL Override"
          zodString={DevConfig._def.in.shape.downloadUrlOverride}
        />
      )}
    </Fragment>
  );
};
