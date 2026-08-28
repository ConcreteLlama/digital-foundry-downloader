/**
 * Asserts the state-encoding rule from content-row-state.ts:
 *
 *   every state must differ from every other on at least TWO of
 *   icon shape, spine pattern, dot fill, or >=20 greyscale levels.
 *
 * Colour is measured, not assumed. Run with:  node scripts/check-state-channels.mjs
 * Exits non-zero if any pair fails, so it can gate a build if wanted.
 */
import { uiPalettes } from "../df-downloader-common/dist/config/ui-config.js";

// Mirrors contentRowStateSpecs. Kept as data here rather than imported because
// the spec module is TSX-adjacent and pulls in MUI icons.
const STATES = {
  downloading: { icon: "Downloading", spine: "pulse", dot: "filled", token: "accent" },
  working: { icon: "AutoFixHigh", spine: "dashed", dot: "filled", token: "accent" },
  downloaded: { icon: "CheckCircle", spine: "solid", dot: "filled", token: "ok" },
  available: { icon: "SaveAlt", spine: "none", dot: "hollow", token: "ink2" },
  "needs-refresh": { icon: "SyncProblem", spine: "sparse", dot: "hollow", token: "warn" },
  paywalled: { icon: "Lock", spine: "hatch", dot: "hollow", token: "ink3" },
  unknown: { icon: "HelpOutline", spine: "dotted", dot: "hollow", token: "ink3" },
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
const lin = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const relLum = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** sRGB-encoded luminance, i.e. what a greyscale filter actually shows. */
const grey = (h) => {
  const Y = relLum(h);
  const s = Y <= 0.0031308 ? Y * 12.92 : 1.055 * Math.pow(Y, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
};
const contrast = (a, b) => {
  const [l1, l2] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const names = Object.keys(STATES);
let failures = 0;

for (const [paletteName, p] of Object.entries(uiPalettes)) {
  console.log(`\n== ${paletteName}   (surface ${p.surface})`);
  console.log("   state           colour    grey  contrast");
  for (const n of names) {
    const c = p[STATES[n].token];
    const ratio = contrast(c, p.surface);
    const flag = ratio < 3 ? "  <3:1 FAIL" : "";
    if (ratio < 3) failures++;
    console.log(
      `   ${n.padEnd(15)} ${c}  ${String(grey(c)).padStart(4)}  ${ratio.toFixed(2)}${flag}`
    );
  }
  const idleRatio = contrast(p.idle, p.surface);
  console.log(
    `   ${"idle (token)".padEnd(15)} ${p.idle}  ${String(grey(p.idle)).padStart(4)}  ${idleRatio.toFixed(2)}${
      idleRatio < 3 ? "  <3:1 FAIL" : ""
    }`
  );
  if (idleRatio < 3) failures++;

  let worstGrey = Infinity;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = STATES[names[i]];
      const b = STATES[names[j]];
      const dGrey = Math.abs(grey(p[a.token]) - grey(p[b.token]));
      worstGrey = Math.min(worstGrey, dGrey);
      const channels =
        (a.icon !== b.icon ? 1 : 0) +
        (a.spine !== b.spine ? 1 : 0) +
        (a.dot !== b.dot ? 1 : 0) +
        (dGrey >= 20 ? 1 : 0);
      if (channels < 2) {
        console.log(`   FAIL ${names[i]} vs ${names[j]} - only ${channels} channel(s)`);
        failures++;
      }
    }
  }
  console.log(`   closest pair by greyscale: ${worstGrey} levels (colour alone is not relied on)`);
}

console.log(
  failures === 0
    ? "\nPASS - every state pair differs on >=2 channels, and every colour clears 3:1."
    : `\nFAIL - ${failures} problem(s).`
);
process.exit(failures === 0 ? 0 : 1);
