# Foxy Inflow documentation

Foxy Inflow is a directive-based, HTML-first reactive engine for building Foxy customer portals. You author views in markup using `data-` attributes bound to a sandboxed expression context, and Inflow updates real DOM nodes — there is no virtual DOM and no framework dependency. It speaks the Foxy Customer API.

## Pages

- **[Getting started](getting-started.md)** — install Inflow, configure a portal, and render your first page.
- **[Building a portal](building-a-portal.md)** — an end-to-end tutorial: sign-in, an auth guard, a paginated list, and saving changes.
- **[Directives](directives.md)** — reference for all twelve directives and the shorthand aliases.
- **[Data sources](data-sources.md)** — reading customer data, pagination, saving with `patch`, and how responses are cached.
- **[Forms and validation](forms-and-validation.md)** — submitting forms, validating fields, mapping server errors, and creating accounts.
- **[Configuration](configuration.md)** — every configuration option, session storage, the authentication lifecycle, and localization.
- **[Extending Inflow](extending.md)** — your own data sources, actions, context values, and directives.
- **[Migrating from Foxy Logic](migrating-from-foxy-logic.md)** — how each `foxy-logic-*` attribute maps onto Inflow.
- **[Agent skills](agent-skills.md)** — the two skills Inflow ships for coding agents, and how to install them.
