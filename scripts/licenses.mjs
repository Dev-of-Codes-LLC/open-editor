// List every package that ships inside the editor, with its version and
// licence, and write the list to THIRD-PARTY.md.
//
//   node scripts/licenses.mjs           write THIRD-PARTY.md
//   node scripts/licenses.mjs --check   fail if the file is out of date, or
//                                       if a licence is not on the allowed list
//
// "Ships inside" means the dependencies of packages/editor and everything
// they depend on. Build and test tools are not in the list: they are not
// part of what a user of the editor receives.

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const ALLOWED = new Set(["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD"]);

// One package at a time, allowed by the owner under a licence that is not on the list above.
// Each names the package, the licence it was allowed under, the date, and why.
// A new version under another licence fails the check again.
const EXCEPTIONS = [
  {
    name: "argparse",
    licence: "PSF-2.0",
    allowed: "2026-11-25",
    why: "markdown-it installs it for its own command-line tool. Nothing here imports it, and it is not in any built file.",
  },
];
const excepted = (row) => EXCEPTIONS.find((e) => e.name === row.name && e.licence === row.licence);

// The folder of a package, as seen from the package that depends on it.
function folderOf(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name, "package.json");
    if (existsSync(candidate)) return dirname(realpathSync(candidate));
    if (dirname(dir) === dir) return null;
  }
}

const found = new Map();
function walk(folder) {
  const pkg = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
    const dep = folderOf(name, folder);
    if (!dep) {
      if (pkg.peerDependenciesMeta?.[name]?.optional || !pkg.dependencies?.[name]) continue;
      throw new Error(`Cannot find ${name}, needed by ${pkg.name}. Run pnpm install.`);
    }
    const depPkg = JSON.parse(readFileSync(join(dep, "package.json"), "utf8"));
    const key = `${depPkg.name}@${depPkg.version}`;
    if (found.has(key)) continue;
    const licenceFile = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "license", "license.md"].find((file) =>
      existsSync(join(dep, file)),
    );
    const notice = licenceFile
      ? (readFileSync(join(dep, licenceFile), "utf8").match(/^.*copyright (\(c\)|©|\d{4}).*$/im)?.[0].trim() ?? "")
      : "";
    found.set(key, {
      name: depPkg.name,
      version: depPkg.version,
      licence: typeof depPkg.license === "string" ? depPkg.license : "unknown",
      notice: notice.replace(/\s*<[^>]*>/g, "").replace(/\s+/g, " "),
    });
    walk(dep);
  }
}
walk(here("../packages/editor"));

const rows = [...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const text = `# Third-party packages

These packages are installed with the editor: its dependencies, and theirs.
Each stays under its own licence, and its licence file comes with it when the
package is installed. The standalone files in
\`packages/editor/dist/standalone/\` hold copies of the ones the editor uses.

Our own code is under Apache-2.0 (see \`LICENSE\`).

This file is written by \`node scripts/licenses.mjs\`. Do not edit it by hand.

| Package | Version | Licence | Copyright line in its licence file |
| --- | --- | --- | --- |
${rows.map((r) => `| \`${r.name}\` | ${r.version} | ${r.licence} | ${r.notice || "(none found)"} |`).join("\n")}

Tiptap also sells features and a hosted service that are not in these
packages. Nothing in this repository uses them. Only the packages in the
table are dependencies.

## Allowed one at a time

The licence of every package above is on the allowed list in
\`scripts/licenses.mjs\`, except these, which the owner allowed by name.

| Package | Licence | Allowed | Why |
| --- | --- | --- | --- |
${EXCEPTIONS.map((e) => `| \`${e.name}\` | ${e.licence} | ${e.allowed} | ${e.why} |`).join("\n")}
`;

const refused = rows.filter((r) => !ALLOWED.has(r.licence) && !excepted(r));
for (const r of refused) console.error(`Not on the allowed list: ${r.name}@${r.version} is ${r.licence}`);

const target = here("../THIRD-PARTY.md");
if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== text) {
    console.error("THIRD-PARTY.md is out of date. Run: node scripts/licenses.mjs");
    process.exit(1);
  }
  if (refused.length > 0) process.exit(1);
  console.log(`THIRD-PARTY.md is current: ${rows.length} packages. ${rows.length - EXCEPTIONS.length} are on the allowed list, and ${EXCEPTIONS.length} allowed by name (${EXCEPTIONS.map((e) => `${e.name}, ${e.licence}`).join("; ")}).`);
} else {
  writeFileSync(target, text);
  console.log(`Wrote THIRD-PARTY.md: ${rows.length} packages.`);
  if (refused.length > 0) process.exit(1);
}
