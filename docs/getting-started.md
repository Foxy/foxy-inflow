# Getting started

This page gets one page of a portal rendering. For a full portal, follow [Building a portal](building-a-portal.md) next.

## Install

```html
<script type="module">
  import { Portal } from "https://cdn-js.foxy.io/inflow@1/index.js";

  new Portal({
    signInPageUrl: "/sign_in.html",
    homePageUrl: "/index.html",
    base: "https://your-store.foxycart.com/s/customer/",
  });
</script>
```

Construct `Portal` once per page. It reads the document, applies every directive it finds, and re-renders when data or state changes.

The bundle has three entry points. `index.js` is the one to reach for:

| URL | Exports |
|---|---|
| `inflow@1/index.js` | `Portal`, `Core`, `Directive` |
| `inflow@1/portal.js` | `Portal` |
| `inflow@1/core.js` | `Core`, `Directive` |

`core.js` is a smaller download when you do not need `Portal`. `portal.js` loads the same code as `index.js` and only narrows what it exports.

`@1` tracks the latest 1.x release. Pin harder with `@1.2` or `@1.2.3` if you would rather choose when to move.

With a bundler, install from npm instead. The same three entry points are `@foxy.io/inflow`, `@foxy.io/inflow/portal` and `@foxy.io/inflow/core`, and the package ships TypeScript declarations:

```sh
npm install @foxy.io/inflow
```

```js
import { Portal } from "@foxy.io/inflow";
```

## The three required options

`Portal` requires exactly three options. Everything else has a default — see [Configuration](configuration.md) for the other five.

| Option | What it is |
|---|---|
| `base` | Your store's Customer API root. It always ends in `/s/customer/`. Every data source builds its URL from this, and it also namespaces the session in browser storage. |
| `signInPageUrl` | The page to send a visitor to when they have no valid session. Inflow redirects here by itself when the API rejects a token. |
| `homePageUrl` | Where to land after a successful sign-in or account creation, when there is no page to return to. A visitor sent to the sign-in page by Inflow returns to the page they wanted instead. |

Replace `your-store` with your own store's subdomain.

## Prevent a flash of unstyled content

Inflow renders after the page loads, so unrendered markup is briefly visible. Hide the subtree with `data-cloak`, which Inflow removes on its first render:

```html
<style>
  [data-cloak] { display: none; }
</style>

<div data-cloak>
  <!-- your portal markup -->
</div>
```

You can add a transition once the attribute is gone, since `[data-cloak]` stops matching after the first render.

## Your first page

This is a complete page. It greets the signed-in customer by name:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My account</title>
    <style>
      [data-cloak] { display: none; }
    </style>
  </head>
  <body>
    <div data-cloak>
      <h1>
        <span>Hello, </span>
        <span data-text="portal.data.customer.first_name"></span>
      </h1>
    </div>

    <script type="module">
      import { Portal } from "https://cdn-js.foxy.io/inflow@1/index.js";

      new Portal({
        signInPageUrl: "/sign_in.html",
        homePageUrl: "/index.html",
        base: "https://your-store.foxycart.com/s/customer/",
      });
    </script>
  </body>
</html>
```

Two things are worth noticing.

`data-text` is shorthand for setting the element's `textContent` from an expression. The [directive reference](directives.md) lists every directive and its shorthand.

`portal.data.customer.first_name` fetched the customer without any `data-source` attribute. Reading a field off a source is enough to trigger the request — this is called an implicit source. It is convenient for single values, but it cannot paginate or refresh; for those you need `data-source`. [Data sources](data-sources.md) explains the difference.

If the visitor has no valid session, the API rejects the request and Inflow redirects to your `signInPageUrl`. You do not need to write that check yourself.

## Next steps

- [Building a portal](building-a-portal.md) — the full tutorial, including a sign-in form and saving changes.
- [Directives](directives.md) — everything you can put in markup.
- [Configuration](configuration.md) — session storage, localization, and the remaining options.
