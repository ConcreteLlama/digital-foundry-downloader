/**
 * Fails a commit that adds a credential-shaped config field without saying
 * whether it is one.
 *
 * The diagnostic bundle redacts a field because the schema says it is secret.
 * That only holds while every credential is actually marked, and the failure
 * mode of forgetting is the worst one available - a key in a file somebody
 * attaches to a public issue. This closes the gap at the point it is created
 * rather than at the point it is read.
 *
 * There is no test framework here, and adding one for a single assertion
 * would be out of proportion, so this follows the existing convention:
 * validate-changelog is a plain node script run by the pre-commit hook, and
 * so is this.
 *
 * Marking a field `.meta({ secret: false })` is an accepted answer. The point
 * is that somebody decided, not that everything matching a pattern is hidden.
 */
import { DfDownloaderConfig } from "../dist/config/df-downloader-config.js";
import { findUnmarkedSecrets } from "../dist/config/secrets.js";

const unmarked = findUnmarkedSecrets(DfDownloaderConfig);

if (unmarked.length) {
  console.error("These config fields have credential-shaped names but are not marked either way:\n");
  for (const field of unmarked) {
    console.error(`  ${field}`);
  }
  console.error(
    [
      "",
      "Add .meta({ secret: true }) if it holds a credential - it will then be",
      "masked in the settings form and redacted from diagnostic bundles.",
      "",
      "Add .meta({ secret: false }) if it does not - a path to a key file, say,",
      "rather than the key itself.",
      "",
    ].join("\n")
  );
  process.exit(1);
}

console.log(`Every credential-shaped config field is accounted for (${DfDownloaderConfig ? "schema loaded" : ""})`);
