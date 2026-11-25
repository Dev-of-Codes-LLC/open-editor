# 0001: Start on CodeMirror 6 and Tiptap's open-source packages, before the comparison

Date: 2026-11-25. Status: accepted, open to the comparison.

## Decision

The code profile runs on CodeMirror 6. The manuscript profile runs on
Tiptap's open-source packages and ProseMirror. We use the released packages
and do not fork them.

## Why

The plan recommends these engines and asks for a comparison first: CodeMirror
6 against Monaco, and Tiptap against Lexical, on the hardest fixtures. That
comparison is not done. We built first for one reason: this is a one-person
project, and a small thing that works teaches more than a plan. The manuscript
profile also already existed, in the Tastebuds editor field.

## Cost

The engines are chosen before the evidence. If the comparison goes against
one, that profile is rebuilt behind the same `createEditor` API. The API hides
the engine on purpose, so the cost is one profile, not the hosts.

## Licences

Every package that ships is MIT today. `THIRD-PARTY.md` lists them, and
`node scripts/licenses.mjs --check` fails the build on a licence that is not
on the allowed list. Tiptap also sells features and a hosted service. They are
not in its MIT packages, and nothing here uses them.

## What would change this

The engine comparison, with the same documents and the same machine for both
sides. It is an open issue.
