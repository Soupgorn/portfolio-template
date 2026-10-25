# Dependency security review

Reviewed 2026-10-25. `npm audit` reports five high entries from one dependency chain in this lockfile. This is an unresolved dependency finding, not a zero-vulnerability claim.

| Package | Installed | Dependency path / use |
| --- | --- | --- |
| `@astrojs/vercel` | 11.0.14 | Build/deployment adapter; depends on Vercel functions |
| `@vercel/functions` | 3.9.11 | Adapter and Astro → unstorage; contains OIDC helpers |
| `@vercel/oidc` | 4.0.0 | Vercel functions → OIDC; local development authorization helpers |
| `@vercel/cli-config` | 0.3.1 | OIDC → local CLI configuration reader |
| `zod` | 4.1.11 (nested) | CLI configuration validation; advisory root |

The root advisory is [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): excessive memory allocation when validating attacker-controlled oversized collections. Zod 4.6.6 is the patched version. Astro's separate root Zod is already 4.6.6.

## Exposure assessment

These are production-declared dependencies, not just devDependencies. The adapter uses them during build/deployment, and module tracing can retain their files in a server artifact. A static-only template has no server runtime for these modules.

The affected CLI configuration code reads the developer's local Vercel configuration/auth files. This portfolio does not pass request bodies, query parameters, project content, or Spotify responses into that code. The Spotify endpoint has no visitor-submitted payload; it reads server configuration and makes allowlisted upstream requests. Local code tracing found no attacker-controlled input path to the vulnerable parser in the deployed application. This is therefore retained as a nonblocking tooling/dependency finding for this release, not a demonstrated remote application vulnerability. An untrusted local CLI configuration or future feature using this parser on untrusted input would require reassessment.

## Remediation evaluated

- Existing compatible security updates: fast-uri 3.1.9 and undici 8.12.3; retained in this release.
- Registry review: adapter 11.0.16 still depends on Vercel functions; functions 3.10.3 → OIDC 4.0.3 → CLI config 0.3.3 still pins Zod 4.1.11. These updates do not resolve the advisory.
- The published CLI config 0.3.3 tarball was inspected: Zod is bundled into its distribution JavaScript, with no external Zod import. A dependency override alone would leave that embedded code unchanged and would misleadingly clear npm's tree finding.
- npm recommends downgrading the adapter to 11.0.8 outside the declared range. That downgrade was not applied merely to silence audit results.
- Durable remediation requires an upstream CLI-config release rebuilt with patched Zod (or an explicitly reviewed replacement/patch). No forced update or vendored-code patch is introduced here.

Re-run `npm audit` and this exposure review when upstream packages change. The audit command currently exits nonzero; it was not bypassed or reported as clean. If the affected parser becomes reachable from untrusted application input, treat that as a release blocker.

## Static media guard

`npm run build` also runs `scripts/check-build-assets.mjs`. It fails if copied static output contains local audio, since the portfolio uses read-only Spotify metadata and needs no audio files. Keep originals outside `public/`; the guard never deletes originals or build output. Tests include a real synthetic nested-audio leak that must fail.
