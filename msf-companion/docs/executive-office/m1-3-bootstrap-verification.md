# M1.3 implementation — G1/G2 artifact review checkpoint

Status: **Partial implementation; stop for Owner decisions. Not ready for final
M1.3 acceptance or merge.**

Authorization: [Issue #10](https://github.com/sccmavenger/ralph/issues/10).
Base: `15795cfd9cad5b54bf37a9d945d184841053574d` (approved planning PR #8).
Branch: `executive/m1.3-bootstrap`.
Owner's recorded [D1/D2/D3 approval](https://github.com/sccmavenger/ralph/pull/8#issuecomment-5806414132)
approved the process and bounded implementation, not the exact source transport or
yet-unseen Charter/hash/role artifacts. This first checkpoint follows section 12's
transcription → Owner hash review sequence and the user's stop-at-any-gate instruction.

## What is and is not implemented

Prepared the candidate canonical Charter, closed-schema candidate manifest, exact
descriptive role JSON and operational review instructions. No executable operator,
readiness/transaction/audit service, test suite or workflow has been created yet.
No package/dependency/runtime version changed; tsx 4.23.15 is approved but **not
installed** at this checkpoint. No database was contacted or bootstrap performed.

The manifest is deliberately non-importable: its four review fields are empty
until an actual Owner approval supplies the receipt. No approved/final manifest
hash is claimed. The original source was inspected locally and remains private.

## Every file changed at this checkpoint

| File | Purpose |
|---|---|
| `msf-companion/docs/executive-office/charter/charter-v1.md` | Exact-text canonical Markdown candidate |
| `msf-companion/docs/executive-office/charter/charter-v1.manifest.json` | Provenance/presentation candidate; explicitly missing approval |
| `msf-companion/src/lib/executive/bootstrap-role-v1.json` | Exact role object from approved plan section 6; no consumer or execution |
| `msf-companion/docs/executive-office/operations.md` | G1 exact proposal, G2 review procedure, custody and unresolved gates |
| `msf-companion/docs/executive-office/m1-3-bootstrap-verification.md` | This evidence and limitation record |
| `msf-companion/AGENTS.md` | Issue #10 authorization/sub-gates and pending-manifest safety |

All six paths are in the approved future inventory. No schema, migration, existing
application code, routes/layouts, package/lockfile, Dockerfile, workflow, captured
session, environment file or infrastructure was modified.

## Exact G2 review material

- [Canonical Markdown](charter/charter-v1.md).
- [Candidate manifest](charter/charter-v1.manifest.json).
- [Descriptive CEO role](../../src/lib/executive/bootstrap-role-v1.json).

| Item | Size / SHA-256 |
|---|---|
| Source basename | `MSF_Toolkit_AI_CEO_Charter_and_Governance_Framework.docx` |
| Original DOCX bytes | 40,485 / `654a4baa4e86743af373f620a8dc156519dada487f3288811b39ae42e5413660` |
| Canonical Charter UTF-8/LF bytes | 6,557 / `673560486fa44a687dcddc6395bd4439848225c40f0f42831dc3a21daee3b3e5` |
| Exact role JSON file bytes | 1,026 / `c59c691f058d17a6ce937855562ca11fce12c4e789430d04ccf01a47148ce73b` |
| Canonical role JSON, section-4 algorithm | `3165fa4f4cf09096952ad6ecfb964bf1ba8f2e5783f8bd11d40358bafdc65827` |
| Candidate manifest formatted file bytes | 2,047 / `304e46a03b89a7297949ad4cc64cc7b07db08e299e55f4b897396db80a0f6f59` |
| Candidate manifest canonical review hash | `ad4dcb7d39d011902b2faf053b543b34de5205ed45fee5f26a335864cbe647db` |

The candidate manifest hash above includes the four intentionally empty review
strings and must not be presented as an approved release digest. Canonical JSON
means recursively sorted ASCII keys, retained array
order, JSON.stringify string escaping, UTF-8/no BOM and no final newline. This is
distinct from hashing a formatted JSON file or the raw DOCX ZIP bytes.

## Fidelity evidence and its limits

The source has 89 body paragraphs, one empty; 88 nonempty paragraphs comprise
the exact title/subtitle/body text, twelve numbered Heading1 sections and fifty
ListBullet items. ListBullet inherits numId 1, referencing abstractNumId 8's bullet
format. The Markdown retains literal section numbers, list order and each
nonempty paragraph's text/code points, including the decision-loop double spaces,
arrows, bullet in the subtitle and curly quotation marks.

Reviewed source document XML, used paragraph styles, numbering and document
relationships; repeating footer reads `MSF Toolkit • AI CEO Charter & Governance
Framework`. Footer omission and non-semantic layout changes are explicitly listed
in the manifest, including direct bold subtitle/arrow-sequence/principle emphasis,
the italic tagline and centering/font/color treatment. These presentation choices
remain subject to Owner review, not an assertion of pixel-identical rendering.
No technical-package prose or development commentary was added
to the Charter itself. This is a transcription candidate, not a new constitution.

**Rendered-source fidelity review remains open.** This workstation's inspected
command/installation/Word-registration locations did not provide a Word or
LibreOffice renderer. No document was uploaded to an online converter, no new
renderer was installed and no screenshot/rendering fidelity is falsely claimed.
Owner G2 must compare the actual rendered original and candidate section by
section; if another authorized renderer/reviewer is desired, obtain that direction.
OOXML/text equality is evidence, not a substitute for this human review.

| Source section | Body paragraph range, including heading |
|---|---|
| Title/subtitle | 1–4 |
| 1. Mission | 5–6 |
| 2. CEO Mandate | 7–9 |
| 3. Definition of Success | 10–18 |
| 4. Responsibilities | 19–27 |
| 5. Decision Philosophy | 28–34 |
| 6. Autonomy | 35–45 |
| 7. Owner Approval Boundaries | 46–60 |
| 8. Relationship With the Owner | 61–69 |
| 9. Operating Principle | 70–72 |
| 10. First Assignment | 73–85 |
| 11. Foundational System Principle | 86–87 |
| 12. Implementation Note | 88–89 |

## Actual checks and remaining evidence

Initial checks: source raw SHA-256/size matched the approved plan; candidate
Markdown validated as UTF-8/no BOM/LF/exactly one final LF; role JSON parsed and
deep-equaled the approved section-6 object. Final paragraph/structure/scope/hash
checks and independent review are recorded below before handoff.

Independent read-only review confirmed all 88 nonempty paragraphs by ordinal
code-point equality, all 12 headings and 50 bullets, UTF-8/LF rules, and exact
approved role fields/values/array/key ordering. Source inspection found no body
tables, drawings, hyperlinks, tracked changes, fields, hidden text, tabs/breaks,
note/comment references, content controls or alternate-content nodes. Custom XML
contains only an empty bibliography container. The reviewer identified omitted
direct emphasis/centering, now specifically disclosed in the candidate manifest.
This is an OOXML review, not a rendered-source sign-off or Owner approval.

No BOOT-01–BOOT-16 runtime/integration claim is made. These cases, M1.2 regression
preservation, dependency/lockfile review, typecheck/targeted lint/build and Linux
container startup/smoke remain **not run** at this pre-operator gate. A JSON/text
review is not a passing database or application test.

Historical baseline only: [M1.2 evidence](m1-2-foundation-verification.md) recorded
364/364 dedicated tests; selected web tests 676 passed / 9 failed; lint 123 errors /
36 warnings; typecheck, targeted lint, build/container smoke passed. The nine
Tower failures (history 1, events 3, rooms 5), TowerResult migration-history gap
and prior 26 dependency findings are not fixed, waived or rerun here.

## Owner gates and stop

G1: approve or amend the exact protected-environment/two-secret/one-run transport
in [operations](operations.md). No environment, secrets, source upload or CI run
exists for this task yet. The proposal includes explicit monitored cleanup, not
an assertion of automatic secret expiry.

G2: review the precise artifacts/hashes above, presentation changes and exact
inert role, then record approval or requested corrections. Until then all review
strings remain empty and any genuine-source apply is forbidden. Final manifest
hash changes when the real approval reference/identity/hashes are inserted.

G3: not reached; no real Owner identity is needed. Do not request or infer private
identity values for this synthetic/disposable checkpoint.

Stop after the Draft PR is updated and the required decision comments are posted.
The implementation remains incomplete, not technically complete pending acceptance.
No merge, shared/live DB access, deployment, M1.4 or later work is authorized.
