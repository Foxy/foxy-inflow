# Foxy Inflow

A directive-based, HTML-first reactive engine for building customer portals on Foxy.

You author views with `data-` attributes bound to a sandboxed expression context. The `Portal` layer adds auth-aware actions, ready-made Customer API data sources, and formatting helpers, so most portal UI is markup with minimal TypeScript glue. There is no virtual DOM — Inflow traverses and updates real DOM nodes, with debounced renders and cached expression evaluation.

**Why use it**

- **HTML-first authoring.** Build views declaratively with `data-` attributes; minimal JS.
- **Portal primitives.** Auth (`isLoggedIn`), actions (`signIn`, `signOut`, and more), and data sources for the customer, subscriptions, transactions, addresses and payment method.
- **Deterministic updates.** Debounced renders and cached expressions.
- **Validation built in.** Validators wired to form inputs and actions via `data-v8n`.
- **Composable patterns.** Nested sources, conditional stashing, pagination controls, and event handlers that read naturally.

## Quickstart

```html
<script type="module">
  import { Portal } from "https://cdn-js.foxy.io/inflow@1/inflow.js";

  new Portal({
    signInPageUrl: "/sign_in.html",
    homePageUrl: "/index.html",
    base: "https://your-store.foxycart.com/s/customer/",
  });
</script>
```

That bundle is not published yet — see [Getting started](docs/getting-started.md) for the current situation and the rest of the setup.

## Documentation

Full documentation lives in [`docs/`](docs/README.md):

- **[Getting started](docs/getting-started.md)** — install, configure a portal, render your first page.
- **[Building a portal](docs/building-a-portal.md)** — end-to-end tutorial: sign-in, an auth guard, a paginated list, saving changes.
- **[Directives](docs/directives.md)** — all twelve directives and the shorthand aliases.
- **[Data sources](docs/data-sources.md)** — reading customer data, pagination, saving with `patch`, caching.
- **[Forms and validation](docs/forms-and-validation.md)** — submitting, validating, server errors, account creation.
- **[Configuration](docs/configuration.md)** — every option, session storage, the auth lifecycle, localization.
- **[Extending Inflow](docs/extending.md)** — your own sources, actions, context values and directives.
- **[Migrating from Foxy Logic](docs/migrating-from-foxy-logic.md)** — how each `foxy-logic-*` attribute maps over.

## Demo pages

The HTML files in the repository root are runnable examples — sign-in, account creation, password reset, the portal home page, profile, address, and adding a payment method. Run them with:

```
npm run dev
```

Point `src/demo.ts` at your own store first.

## Development

```
npm run build     # type-check and build
npm test          # run the test suite
```
