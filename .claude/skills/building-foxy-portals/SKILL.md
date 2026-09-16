---
name: building-foxy-portals
description: Use when taking a Foxy customer portal built with Inflow off localhost — deploying it to a real store or site, hosting the bundle, or driving a live page in a browser. Covers silent CORS failures with no access-control-allow-origin header, "Failed to fetch dynamically imported module", and a store rejecting what Inflow accepted.
---

# Building Foxy portals on a real host

## Overview

Inflow is a directive-based, HTML-first engine for Foxy customer portals: you author views in `data-*` attributes and it updates real DOM nodes. Its own documentation covers what the directives do. This covers what the **host** does — the store, the CDN, the browser — which is where portals actually break.

Everything here was measured against a live store, not inferred from source.

## When to use

- Deploying a portal anywhere other than a local dev server
- A page that works locally fails on a hosted origin with nothing useful in the console
- Driving a live page from a browser to check whether something works
- The API rejects a value the form accepted
- Authoring the portal's markup in Webflow

## Load-bearing rules

**Every origin needs to be on the store's allow-list.** An origin that is not gets `200` with no `access-control-allow-origin` header, so the browser rejects the response and the page fails silently. A local dev origin is often already allowed, which makes local work deceptively smooth. See `references/hosting-and-cors.md`.

**In Webflow, never author a real `<form>`.** Webflow rewrites anything form-shaped at publish time, and its form runtime holds the submit button disabled from page load, so `data-action` never fires. Use `<div data-as="form">`, which publishes untouched and becomes a real form at render. See `references/webflow.md`.

**Assert on payloads, never on the fact that a call happened.** A test that stubs `fetch` and only checks that a request was made will stay green while the request body is empty. Inflow's own suite did exactly that through a bug where every action posted `{}`, because the form's controls were disabled before the `FormData` was built and disabled controls are barred from the form data set.

**Synthetic `.value =` does not revalidate.** `data-v8n` re-runs on `input` and `change`. Set a value from a script without dispatching those and the field keeps stale validity, so the form refuses to submit. See `references/live-testing.md`.

**A form posts strings.** A field whose API type is a boolean or a number arrives wrong and the Customer API rejects it — `{"save_cc":"false"}` answers `400 data.save_cc should be boolean`. Mark the field `data-json` and it is parsed before sending. The marker follows the configured attribute prefix, so a portal built with `prefix: "fx-"` writes `fx-json`.

## Reference

| File                             | Covers                                                                 |
| -------------------------------- | ---------------------------------------------------------------------- |
| `references/hosting-and-cors.md` | Customer API CORS and how to probe it; hosting the bundle; tunnels     |
| `references/webflow.md`          | `data-as` vs Webflow's form runtime; authoring for the Designer canvas |
| `references/live-testing.md`     | Driving a live page; what the store refuses that Inflow does not       |

## Common mistakes

- **Debugging portal markup when the console says `Failed to fetch dynamically imported module`.** That is the bundle URL, not the page.
- **Writing copy for `unknown_error`.** Any API message the action's validator map does not name collapses to that code — wrong credentials, rate limiting, a locked account. Render `error.message` instead, unless you are certain of the cause.
- **Reaching for `checkValidity()` in an expression.** It fires an `invalid` event rather than just reading state, and `data-v8n` listens for those, so the page re-renders forever. Read `validationMessage` instead.
