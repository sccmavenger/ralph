# Executive Office operations — M1.3 gate checkpoint

Status: **Operator not yet implemented. G1/G2 Owner decisions pending.**
Authorization: [Issue #10](https://github.com/sccmavenger/ralph/issues/10), following
the [approved M1.3 plan](m1-3-bootstrap-plan.md). This checkpoint follows the plan's
first step: exact Charter/role artifacts and Owner hash review. Do not treat these
instructions as an existing executable CLI or as permission to cross an Owner gate.

## Current artifacts and G2 review

- [Canonical Charter candidate](charter/charter-v1.md): all twelve constitutional
  sections, without development notes or technical-package additions.
- [Candidate provenance manifest](charter/charter-v1.manifest.json).
- [Exact descriptive CEO role](../../src/lib/executive/bootstrap-role-v1.json).
- [Verification and review hashes](m1-3-bootstrap-verification.md).

The manifest deliberately has four empty review strings. It is **not importable**
under the approved contract: there is no actual approval URL, approving identity
or approved-hash receipt yet. Do not invent a reviewer, use the decision-request
comment as approval, add an `approved` flag, or weaken validation to accept it.
The transcriptionMethod identifies the selected process; it does not certify
that its outstanding rendered-source/Owner review is complete.

For G2, the Owner must compare the rendered original DOCX, retained privately,
with the canonical Markdown section by section. OOXML paragraph/style/numbering
checks are recorded separately and are not a substitute for that rendered review.
Confirm the title/subtitle, all twelve sections, list order, punctuation/arrows,
quoted principle and presentation-only repeating-footer omission. Review the
exact role JSON as well: tools and permissions are empty and spendingAuthority is
false. The descriptive future mandate does not activate it.

Approval should identify the source hash, canonical Charter content hash and exact
role file/canonical role hashes from the verification report. Review the candidate
manifest's provenance/presentation choices. Its canonical candidate hash is a
review snapshot, **not** an approved release-manifest hash. After an actual approval
comment exists, populate only the four review strings with its URL, approving
public identity and approved source/content hashes; recompute and record the final
manifestHash. That expected metadata change does not rewrite the approved Charter.
Any content, source, role or substantive provenance change requires renewed review.

On Windows, Git's autocrlf setting can transform checkout bytes. The approval
hashes identify committed LF artifact bytes; validate exact local bytes again
before use. A CRLF-converted Charter must be rejected, not silently rehashed as a
new approved document. Hosted Linux checkout avoids that Windows transformation.
No global Git setting or additional attributes file was changed at this checkpoint.

## G1 proposed exact private source transport — not yet approved or configured

The repository is public. Do not attach, commit, cache or upload the original DOCX
as a public artifact. Canonical text/role assets are authorized repository files;
that does not authorize publishing the private original binary or its metadata.

Proposed one-run mechanism, requiring explicit Owner approval before setup/upload:

1. Create the GitHub environment `m1-3-charter-rehearsal` in `sccmavenger/ralph`,
   with the Owner as required reviewer, only branch `executive/m1.3-bootstrap`
   eligible and administrator bypass disabled. Owner reviews the exact run commit
   before releasing it. Do not enable Prevent self-review unless a second authorized
   reviewer is available; the Owner account currently also initiates repository
   work. This creates a GitHub approval/deployment-tracking record, **not** a product
   or Azure deployment. [GitHub environment protection rules](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
2. In the trusted local operator session, encode the verified 40,485-byte original
   as Base64 without printing it. Split its 53,980 characters into 27,000 and 26,980
   characters. Store those as two **environment**, not repository, secrets named
   `M13_CHARTER_SOURCE_B64_01` and `M13_CHARTER_SOURCE_B64_02`, via stdin rather than
   command-line values. Each fits the 48 KB secret limit. Base64 is encoding, not
   encryption. [Secret limits](https://docs.github.com/en/actions/reference/security/secrets),
   [binary secret handling](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
3. Use only the reviewed implementation workflow/commit on `ubuntu-latest`, with
   pinned actions, `contents: read`, synthetic Owner values, no production
   credentials, a 35-minute job timeout, and a separate protected genuine-source
   job. A branch-scoped push job waiting for Owner approval avoids merging a new
   workflow just to register a manual dispatch. No source-bearing job may apply
   before G2 is independently approved. Do not use `pull_request_target`.
4. Inject the two secret values only into the final source-rehearsal step, after
   reviewed dependency installation and disposable DB preparation. Reassemble into
   a newly created 0700 directory under `RUNNER_TEMP`, source file mode 0600 and
   exact expected basename. Check original size/hash before check/apply/replay.
   Secrets are not job-wide environment variables or step outputs. Review of the
   executing code/dependencies remains necessary; secret masking is not a guarantee
   against malicious code or accidental plaintext output.
5. Do not print bytes, Base64, ZIP members, environment dumps, raw exceptions or
   private paths. Never upload source directories, database dumps or broad logs.
   Publish only allowlisted hashes/statuses, test counts and sanitized errors.
6. Delete the exact temporary source directory on success/failure, and remove only
   owned disposable resources. From the trusted local Owner session, delete both
   environment secrets immediately after that one approved run, successful or
   failed, and verify their absence. Delete them if the run is canceled or not
   started within the custody window. Proposed maximum custody window: one hour
   from secret creation, actively monitored; GitHub secrets do **not** auto-expire.
   Do not put a secrets-administration token in the runner. If cleanup cannot be
   confirmed, stop and report it; never describe pending deletion as completed.

No environment/secrets have been created, no source has been encoded/uploaded for
transport, and no workflow has been created/run at this checkpoint. Approval of
this proposal must explicitly include the temporary GitHub environment/protection
settings and one-run secret creation/deletion. If required protections are not
available or cannot be configured exactly, stop instead of downgrading them.

## G3 and remaining implementation

Tests and all M1.3 disposable rehearsals use synthetic Owner display/contact
values. Do not retrieve a customer/admin identity or reuse any email from previous
tasks. No real identity values are needed at this checkpoint. Shared/live access
would require new authorization and explicit real Owner confirmation.

Once the Owner resolves the relevant gate and authorizes continuation, implement
the remaining approved CLI/readiness/hash/transaction/replay/audit/test/workflow
inventory on the same branch/PR. The CLI must use the exact approved pinned local
tsx runner, no dotenv/DATABASE_URL fallback, disposable targets only and the
unchanged M1.2 schema/guards. The check/apply/replay/recovery command reference will
be completed with actual tested behavior, not speculative passing results.

No bootstrap records, Charter acceptance, authentication service, UI, scheduler,
model call, spending, business activity, merge, deployment or later story is
authorized by this artifact review. M1.3 is **not technically implemented or fully
accepted** at this first sub-gate checkpoint.
