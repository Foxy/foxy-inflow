# Project Guidelines

## Maintain This File

- Update this file only when you discover stable, repo-specific conventions or development-process details that are not obvious from the codebase or standard tooling.
- Keep it minimal: prefer the smallest useful note, skip obvious/framework-default guidance, and do not add task-specific or temporary findings.

## What This Is

A directive-based, HTML-first reactive engine for building Foxy customer portals. No virtual DOM, no framework — `InflowCore.render()` walks real DOM nodes and applies directives found in `data-*` attributes. Views are authored in markup; TypeScript is glue.

Two public exports (`src/inflow/index.ts`): `Core` (`InflowCore`) and `Portal` (`InflowPortal`, which adds auth, actions and Customer API data sources on top).

## Directives

- One file per directive in `src/inflow/directives/`, each a `Directive` subclass overriding `apply()`.
- Register new ones in the `InflowCore` constructor's `#directives` array. **Order matters** — `render()` iterates directives in that order, so a directive that stashes or skips children (`if`, `if-not`, `for`) must come before ones that read the node.
- Two matching styles: `prefix: "if"` matches `data-if` exactly, `prefix: "on-"` (trailing hyphen) matches `data-on-*` by prefix.
- Aliases live in `#directiveAliases` — `text` → `prop-textcontent`, `href` → `attr-href`, `disabled` → `battr-disabled`, and so on. Prefer adding an alias over a new directive when the behaviour already exists.

### Repeating a directive on one element

`render()` collects **every** matching attribute per directive (`Array.from(node.attributes).filter(...)`) and applies them in document order. So an element can carry several `data-attr-*`, `data-prop-*`, `data-battr-*` or `data-on-*` bindings at once. This is safe because the prefix directives are exactly the ones that only read and write the host; the directives that stash the node or skip its children match exactly (`if`, `for`, `v8n`, ...) and cannot appear twice on one element. Keep that split if you add a directive: a prefix directive must not return `isStashed` or `skipChildren`.

## Testing

- `npm test` runs `vitest run`. Tests are **co-located** (`src/**/*.test.ts`), `environment: "jsdom"`, `globals: true`.
- jsdom is sufficient because nothing here uses MutationObserver, custom elements or IntersectionObserver. If you add one, revisit the environment rather than mocking around it.
- Prefer testing through `InflowCore.render()` on a mounted fixture over calling `directive.apply()` directly — the pipeline (attribute discovery, alias resolution, expression evaluation, stashing) is where the behaviour actually lives.

## Expressions Are Evaluated, Not Parsed

Directive values are JavaScript evaluated against a sandboxed context (`#createCachedFunction`, LRU-cached at 1000 entries). `data-text="items.length + ' items'"` works. This means directive values are code — never build one from user or API data.

## Portal Data Flow

- **Sources** are reads: `createSource(name, url)` under `portal.data.*`. All URLs are built from `config.base`, which ends in `/s/customer/`.
- **Writes** go through a generic `.patch(event)` on any source — `data-action="customer.patch"` is how the profile and change-password pages save. There is no per-field update action; don't add one without checking `.patch` doesn't already cover it.
- **Actions** are the non-CRUD operations: `signIn`, `signOut`, `resetPassword`, `createAccount`, `createCcToken`.

Validation messages for actions live in `InflowPortal.defaultTranslations`, keyed `<action>.<field>.<zod_error_code>` (e.g. `sign_in.email.invalid_string`). zod emits three codes here — `too_small`, `too_big` and `invalid_string`; it never emits `too_long` or `invalid`, and keys naming those were unreachable for a year. A field whose code has no matching key falls back to the raw code, so add the key when you add the field.

## Storage Is Scoped Per Store

`InflowCore.storage` is a `ScopedStorage` (`src/inflow/ScopedStorage.ts`) over `localStorage`, namespaced by `config.base`, so keys read `inflow:<base>:<key>`. Use `this.storage` rather than `localStorage` directly — `portal.ts` used to write the session token straight to `localStorage`, which put two stores on one domain in the same session slot. `storage.clear()` only removes this store's keys.

Cookie mode (`storage: "cookie"`) is deliberately unscoped: `fx.customer` is a fixed name other Foxy code reads.

## Don't Ship Debug Logging

`console.log` in `directives/source.ts` has repeatedly reached `main`, including bare `console.log(data)` on Customer API responses — which prints subscriptions, transactions and addresses to the browser console in production. `console.error` and `console.warn` in this codebase are deliberate; `console.log` is not. Remove it before committing.

## Docs

Documentation lives in `docs/`, one Markdown page per task, indexed by `docs/README.md`. `README.md` is an overview and index only — put substance in `docs/`, not there. Keep snippets runnable, and use a placeholder store domain: a personal dev store has ended up in the copy-paste quickstart before.

The format is settled: Markdown in `docs/`, **no Storybook**. Inflow ships directives, not components, so there is nothing to mount per story; the demo pages in the repo root remain the runnable examples. Extend those rather than adding a second docs tool.

The CDN bundle URL in the docs is **not published yet**, and it appears in more than one file — `grep -rn "cdn-js.foxy.io/inflow"` before changing it, and update every hit. `docs/getting-started.md` is the page that explains its status; the others just use it in a snippet.
