# Project Guidelines

## Maintain This File

- Update this file only when you discover stable, repo-specific conventions or development-process details that are not obvious from the codebase or standard tooling.
- Keep it minimal: prefer the smallest useful note, skip obvious/framework-default guidance, and do not add task-specific or temporary findings.

## What This Is

A directive-based, HTML-first reactive engine for building Foxy customer portals. No virtual DOM, no framework — `InflowCore.render()` walks real DOM nodes and applies directives found in `data-*` attributes. Views are authored in markup; TypeScript is glue.

Two public exports (`src/inflow/index.ts`): `Core` (`InflowCore`) and `Portal` (`InflowPortal`, which adds auth, actions and Customer API data sources on top).

## Directives

- One file per directive in `src/inflow/directives/`, each a `Directive` subclass overriding `apply()`.
- Register new ones in the `InflowCore` constructor's `#directives` array. **Order matters** — `render()` iterates directives and the first matching attribute wins per directive, so a directive that stashes or skips children (`if`, `if-not`, `for`) must come before ones that read the node.
- Two matching styles: `prefix: "if"` matches `data-if` exactly, `prefix: "on-"` (trailing hyphen) matches `data-on-*` by prefix.
- Aliases live in `#directiveAliases` — `text` → `prop-textcontent`, `href` → `attr-href`, `disabled` → `battr-disabled`, and so on. Prefer adding an alias over a new directive when the behaviour already exists.

### Known limitation: one attribute per directive per element

`render()` selects each directive's attribute with `Array.from(node.attributes).find(...)`, which stops at the first match. So an element can carry at most one `data-attr-*`, one `data-prop-*`, one `data-battr-*` and one `data-on-*` — a second is **silently ignored**. `data-on-click` alongside `data-on-blur` half-works with no diagnostic. Pinned by a test in `directives.test.ts`; don't be surprised by it and don't work around it silently.

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

Validation messages for actions live in `InflowPortal.defaultTranslations`, keyed `<action>.<field>.<zod_error_code>` (e.g. `sign_in.email.invalid`). A `data-v8n` field with no matching key renders nothing, so add the key when you add the field.

## Storage Is Scoped Per Store

`InflowCore.storage` is a `ScopedStorage` (`src/inflow/ScopedStorage.ts`) over `localStorage`, namespaced by `config.base`, so keys read `inflow:<base>:<key>`. Use `this.storage` rather than `localStorage` directly — `portal.ts` used to write the session token straight to `localStorage`, which put two stores on one domain in the same session slot. `storage.clear()` only removes this store's keys.

Cookie mode (`storage: "cookie"`) is deliberately unscoped: `fx.customer` is a fixed name other Foxy code reads.

## Don't Ship Debug Logging

`console.log` in `directives/source.ts` has repeatedly reached `main`, including bare `console.log(data)` on Customer API responses — which prints subscriptions, transactions and addresses to the browser console in production. `console.error` and `console.warn` in this codebase are deliberate; `console.log` is not. Remove it before committing.

## Docs

`README.md` (316 lines) is the documentation. Keep its snippets runnable, and use a placeholder store domain — a personal dev store has ended up in the copy-paste quickstart before.
