# Project Guidelines

## Maintain This File

- Update this file only when you discover stable, repo-specific conventions or development-process details that are not obvious from the codebase or standard tooling.
- Keep it minimal: prefer the smallest useful note, skip obvious/framework-default guidance, and do not add task-specific or temporary findings.

## What This Is

A directive-based, HTML-first reactive engine for building Foxy customer portals. No virtual DOM, no framework — `InflowCore.render()` walks real DOM nodes and applies directives found in `data-*` attributes. Views are authored in markup; TypeScript is glue.

Two public exports (`src/index.ts`): `Core` (`InflowCore`) and `Portal` (`InflowPortal`, which adds auth, actions and Customer API data sources on top).

The library is `src/`; the runnable demo pages are `demo/`, which is also the Vite dev root. `vite.config.ts` sets `root` only for `command === "serve"` — the library builds must run from the repo root or `outDir` lands inside `demo/`.

## Field Notes Live In A Skill

Everything learned by running a portal on a real host — the Customer API's CORS behaviour, hosting the bundle, authoring markup in Webflow, driving a live page from a browser — lives in `.claude/skills/building-foxy-portals/`, not here. This file stays about the repo.

The skill loads automatically for anyone working in a clone, and users install it by copying that directory into their own skills directory. **It is therefore public documentation** — write it for someone who has never seen this repo, and keep repo-internal detail (file paths under `src/`, test names, release state) in this file instead.

There is deliberately no plugin manifest or marketplace. One existed briefly: a marketplace that indexes a plugin in another repo has to pin a commit SHA per entry, which is a second repo and a second commit for every edit here. Revisit when a second Foxy repo ships a skill; until then copying a directory is the whole install.

**Everything in the skill must be Inflow-specific.** A generic Webflow-authoring skill lived here briefly and was removed: documenting another company's API is a maintenance liability this project should not carry, and the one note that was generic had already gone stale. `references/webflow.md` earns its place because it is about `data-as` and `data-text`, not about Webflow.

## Directives

- One file per directive in `src/directives/`, each a `Directive` subclass overriding `apply()`.
- Register new ones in the `InflowCore` constructor's `#directives` array. **Order matters** — `render()` iterates directives in that order, so a directive that stashes or skips children (`if`, `if-not`, `for`) must come before ones that read the node.
- Two matching styles: `prefix: "if"` matches `data-if` exactly, `prefix: "on-"` (trailing hyphen) matches `data-on-*` by prefix.
- Aliases live in `#directiveAliases` — `text` → `prop-textcontent`, `href` → `attr-href`, `disabled` → `battr-disabled`, and so on. Prefer adding an alias over a new directive when the behaviour already exists.

### Repeating a directive on one element

`render()` collects **every** matching attribute per prefix directive and applies them in document order, so an element can carry several `data-attr-*`, `data-prop-*`, `data-battr-*` or `data-on-*` bindings. Exact-match directives are capped at one attribute because the loop hands them stash state it reads only once — a prefix directive must therefore never return `isStashed` or `skipChildren`.

## Testing

- `npm test` runs `vitest run`. Tests are **co-located** (`src/**/*.test.ts`), `environment: "jsdom"`, `globals: true`.
- jsdom is sufficient because nothing here uses MutationObserver, custom elements or IntersectionObserver. If you add one, revisit the environment rather than mocking around it.
- Prefer testing through `InflowCore.render()` on a mounted fixture over calling `directive.apply()` directly — the pipeline (attribute discovery, alias resolution, expression evaluation, stashing) is where the behaviour actually lives.
- Assert on payloads, not on the fact that a request was made. The sign-in helper in `src/portal.test.ts` stubs `fetch` and never reads the request body, so the suite stayed green through a bug that made every action post `{}`.
- `render()` recurses into children, so spying on it counts nodes visited, not update cycles — a large constant that repeats exactly between runs. Zero calls still proves no cycle ran; for a cycle count spy on `requestUpdate`, which is debounced to one call per cycle.
- `src/demo-markup.test.ts` checks that a named field has _a_ validator, not that the validator can run. A form whose only named control is an `input[type=hidden]` passes it while validating nothing — the spec bars hidden inputs from constraint validation, so `setCustomValidity` on one neither blocks submit nor yields a `validationMessage`.

## Expressions Are Evaluated, Not Parsed

Directive values are JavaScript evaluated against a sandboxed context (`#createCachedFunction`, LRU-cached at 1000 entries). `data-text="items.length + ' items'"` works. This means directive values are code — never build one from user or API data.

## Portal Data Flow

- **Sources** are reads: `createSource(name, url)` under `portal.data.*`. All URLs are built from `config.base`, which ends in `/s/customer/`.
- **Writes** go through a generic `.patch(event)` on any source — `data-action="customer.patch"` is how the profile and change-password pages save. There is no per-field update action; don't add one without checking `.patch` doesn't already cover it.
- **Sources are pinned to the `base` origin.** `SourceDirective` attaches the customer's bearer token to every request, so `#isOnApiOrigin` refuses any source URL — including `_links` hrefs from a response — that resolves elsewhere. `demo/address.html` builds its source from a query string, which is exactly the case this stops. Do not add a bypass.
- **Actions** are the non-CRUD operations: `signIn`, `signOut`, `resetPassword`, `createAccount`, `createCcToken`.

Validation messages for actions live in `InflowPortal.defaultTranslations`, keyed `<action>.<field>.<zod_error_code>` (e.g. `sign_in.email.invalid_string`). zod emits three codes here — `too_small`, `too_big` and `invalid_string`; it never emits `too_long` or `invalid`, and keys naming those were unreachable for a year. A field whose code has no matching key falls back to the raw code, so add the key when you add the field.

Two constraints on the validators themselves. **A validator must be pure.** `data-v8n` sets custom validity in `afterUpdate` — after the pass that evaluated the error block's `data-if` — and asks for one more render only when a message actually changed, so a field invalid on arrival settles in two passes. One that returns a different message for the same value (anything carrying a timestamp or a counter) never compares equal and never settles. **A date field carries two formats**: `YYYY-MM-DD` when an `<input type="date">` owns it, an offset datetime like `2026-09-24T00:00:00-07:00` when the value came straight from the Customer API. Match both with `.regex()` — `z.string().datetime()` admits only UTC datetimes ending in `Z` and rejects both — and stay on `invalid_string` so the existing translation key keeps working, since a `z.union` emits `invalid_union`, which has no key.

## Storage Is Scoped Per Store

`InflowCore.storage` is a `ScopedStorage` (`src/ScopedStorage.ts`) over `localStorage`, namespaced by `config.base`, so keys read `inflow:<base>:<key>`. Use `this.storage` rather than `localStorage` directly — `portal.ts` used to write the session token straight to `localStorage`, which put two stores on one domain in the same session slot. `storage.clear()` only removes this store's keys.

Cookie mode (`storage: "cookie"`) is deliberately unscoped: `fx.customer` is a fixed name other Foxy code reads.

## Don't Ship Debug Logging

`console.log` in `src/directives/source.ts` has repeatedly reached `main`, including bare `console.log(data)` on Customer API responses — which prints subscriptions, transactions and addresses to the browser console in production. `console.error` and `console.warn` in this codebase are deliberate; `console.log` is not. Remove it before committing.

## Docs

Documentation lives in `docs/`, one Markdown page per task, indexed by `docs/README.md`. `README.md` is an overview and index only — put substance in `docs/`, not there. Keep snippets runnable, and use a placeholder store domain: a personal dev store has ended up in the copy-paste quickstart before.

The format is settled: Markdown in `docs/`, **no Storybook**. Inflow ships directives, not components, so there is nothing to mount per story; the demo pages in `demo/` remain the runnable examples. Extend those rather than adding a second docs tool.

## Distribution

Two builds from one `vite.config.ts`, switched by mode. `build:npm` writes `dist/npm` with `lodash-es`, `lru-cache` and `zod` left external and declarations under `dist/npm/types`; `build:cdn` writes `dist/cdn` with those three inlined, minified, plus a generated `LICENSE.md` their licences require. Three entry points in both — `index.js` (everything), `portal.js`, `core.js` — declared in `package.json`'s `exports` and mirrored by the CDN paths.

Releases are semantic-release, so **commit messages decide the version**. The workflow publishes to npm and then uploads `dist/cdn` to `cdn-js.foxy.io/inflow@<version>/`. The CDN job reads the version from `package.json` after semantic-release rewrites it, which is also how it knows whether anything shipped — do not reorder those steps.

**Every push to `main` releases.** There is no staging step between a merge and a public npm package, so a `feat:` or `fix:` commit that lands is shipped. `beta` releases as a prerelease. To see what a set of commits would release without releasing it, run the workflow from the Actions tab — that path keeps its `dry_run` input and defaults to true. `verify.yml` runs on every PR and is unaffected.

The release job needs `NPM_TOKEN` and the CDN job needs `CLOUDFRONT_DISTRIBUTION_ID`; the three `AWS_S3_CDN_*` secrets come from the org. A missing `NPM_TOKEN` fails semantic-release in its verify-conditions step, before anything is published. `publishConfig.access` is `public` in `package.json` because npm defaults a scoped package to restricted and would reject the first publish without it.

The CDN URL appears in more than one doc — `grep -rn "cdn-js.foxy.io/inflow"` before changing it, and update every hit.
