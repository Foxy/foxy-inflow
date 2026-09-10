# Building a portal

A working portal, one page at a time. Each step below corresponds to a demo page in this repository, so you always have a finished version to compare against.

Start from [Getting started](getting-started.md) if you have not configured `Portal` yet.

| Step | Demo page |
|---|---|
| [1. A sign-in page](#1-a-sign-in-page) | `sign_in.html` |
| [2. Guarding a page](#2-guarding-a-page) | `index.html` |
| [3. Listing subscriptions](#3-listing-subscriptions) | `index.html` |
| [4. A profile page](#4-a-profile-page) | `profile.html` |
| [5. Saving changes](#5-saving-changes) | `profile.html`, `address.html` |

Every page shares the same setup: a `[data-cloak] { display: none; }` rule, a `data-cloak` wrapper, and one script constructing `Portal`. Only the markup between them differs.

## 1. A sign-in page

```html
<div data-cloak>
  <h1>Sign in</h1>

  <p data-if="portal.isLoggedIn()">
    You are already signed in. <a href="/">Go to your portal.</a>
  </p>

  <form
    data-if-not="portal.isLoggedIn()"
    data-v8n="portal.v8n.signIn"
    data-action="portal.signIn"
  >
    <label>Email:<br /><input name="email" type="email" /></label>
    <label>Password:<br /><input name="password" type="password" /></label>

    <button>
      <span data-if="portal.signIn.isSubmitting">Signing in…</span>
      <span data-if-not="portal.signIn.isSubmitting">Sign in</span>
    </button>
  </form>

  <p data-for="error in portal.signIn.errors" aria-live="polite">
    <span data-text="error.message"></span>
  </p>
</div>
```

Four things are happening.

`data-if` and `data-if-not` on `portal.isLoggedIn()` give the page two mutually exclusive states. There is no `else`, so the idiom is a pair of elements with opposite conditions.

`data-v8n="portal.v8n.signIn"` validates the fields as the customer types. It matches validators to inputs by `name`, which is why the inputs are named `email` and `password`.

`data-action="portal.signIn"` submits. On success Inflow stores the session and redirects to your `homePageUrl` — you do not write that redirect.

The button label reads `portal.signIn.isSubmitting`, and the error list loops over `portal.signIn.errors`. Both come from the action itself.

Before going live, supply your own validation messages — the bundled defaults mostly surface raw codes. See [Validation messages](forms-and-validation.md#validation-messages).

## 2. Guarding a page

A page that requires a session gates on readiness rather than checking permissions itself:

```html
<div data-cloak>
  <div data-if="portal.data.settings.isLoading || portal.data.customer.isLoading">
    Loading…
  </div>

  <div data-if="portal.data.settings.isReady && portal.data.customer.isReady">
    <h1>
      Welcome back,
      <span data-text="portal.data.customer.first_name"></span>!
    </h1>

    <p>
      <a href="/profile.html">Edit profile</a>
      <button data-on-click="portal.signOut">Sign out</button>
    </p>
  </div>
</div>
```

Reading `portal.data.customer` starts the request. If the visitor has no valid session the API rejects it, and Inflow clears the cache and redirects to your `signInPageUrl`. **Loading the source is the guard.**

`portal.isLoggedIn()` is for rendering decisions only — it reports that a token exists, not that it is still valid. Do not treat it as a security boundary.

Combine flags from several sources, as above, so the page appears in one piece rather than filling in progressively.

## 3. Listing subscriptions

```html
<h2>Subscriptions</h2>

<div data-source="portal.data.subscriptions">
  <p data-if="subscriptions.isLoading">Loading…</p>

  <table data-if="subscriptions.isReady">
    <thead>
      <tr>
        <th>Start date</th>
        <th>Next payment</th>
        <th>End date</th>
        <th>Frequency</th>
      </tr>
    </thead>
    <tbody>
      <tr data-for="s, i in subscriptions.items">
        <td data-text="format.date(s.start_date)"></td>
        <td data-text="format.date(s.next_transaction_date)"></td>
        <td>
          <span data-if="s.end_date === null">N/A</span>
          <span data-if="s.end_date !== null" data-text="format.date(s.end_date)"></span>
        </td>
        <td data-text="s.frequency"></td>
      </tr>
    </tbody>
  </table>

  <p data-if="subscriptions.isReady && subscriptions.needsPagination">
    <button data-disabled="subscriptions.isFirstPage" data-on-click="subscriptions.loadFirstPage">First</button>
    <button data-disabled="subscriptions.isFirstPage" data-on-click="subscriptions.loadPreviousPage">Previous</button>
    <span data-text="subscriptions.offset + 1"></span>
    <span>—</span>
    <span data-text="subscriptions.offset + subscriptions.returnedItems"></span>
    <span>of</span>
    <span data-text="subscriptions.totalItems"></span>
    <button data-disabled="subscriptions.isLastPage" data-on-click="subscriptions.loadNextPage">Next</button>
    <button data-disabled="subscriptions.isLastPage" data-on-click="subscriptions.loadLastPage">Last</button>
  </p>
</div>
```

This is the first step that needs `data-source` rather than an implicit read, because pagination only works on an explicitly bound source.

`data-for="s, i in subscriptions.items"` repeats the row per subscription, with `s` the item and `i` the index. Note the loop **must** be gated on `isReady`: before the data arrives `items` does not exist, and the loop throws if it reads a missing collection.

`format.date` renders ISO dates in the visitor's locale. Set `lang` on an ancestor to override it — see [Formatting values](configuration.md#formatting-values).

The pagination row is wrapped in `needsPagination` so it disappears when everything fits on one page.

## 4. A profile page

Nest sources when one gates another:

```html
<div data-source="portal.data.settings" data-cloak>
  <div data-if="settings.isLoading">Loading…</div>

  <div data-if="settings.isReady">
    <div data-if="portal.isLoggedIn()">
      <div data-source="portal.data.customer">
        <h1>Profile</h1>
        <p data-if="customer.isLoading">Loading…</p>

        <!-- the form goes here, see step 5 -->
      </div>
    </div>

    <div data-if-not="portal.isLoggedIn()">
      You are signed out. <a href="/sign_in.html">Sign in.</a>
    </div>
  </div>
</div>
```

Each `data-source` binds its resource under a local name available to that element and its descendants, so the inner markup says `customer.first_name` rather than `portal.data.customer.first_name`.

Binding explicitly here is what makes the save in step 5 possible — the form needs a name to call `patch` on.

## 5. Saving changes

```html
<form data-if="customer.isReady" data-action="customer.patch" novalidate>
  <div>
    <label for="first_name">First name:</label>
    <input id="first_name" name="first_name" data-value="customer.first_name" required />
  </div>

  <div>
    <label for="last_name">Last name:</label>
    <input id="last_name" name="last_name" data-value="customer.last_name" required />
  </div>

  <div>
    <label for="email">Email:</label>
    <input id="email" type="email" name="email" data-value="customer.email" required />
  </div>

  <button type="submit">Save</button>
</form>
```

`data-action="customer.patch"` saves. Every field in the form is sent, so a value you do not want written should not be in this form, and a value you want cleared should be present and empty.

`data-value` prefills each input from the loaded resource. `name` decides what the API receives.

The `novalidate` attribute turns off the browser's own bubbles while leaving `required` in force — `patch` still checks validity before sending, so an invalid form does not reach the API.

On success the source refetches itself, so the page shows what the API stored rather than what was typed.

`address.html` applies the same pattern to a longer form, with one form-level `data-v8n="portal.v8n.customerAddress"` covering all ten fields.

## What to read next

- [Directives](directives.md) — every attribute, with its gotchas.
- [Data sources](data-sources.md) — the full state object, and how caching affects first paint.
- [Forms and validation](forms-and-validation.md) — your own messages, server errors, account creation, saving cards.
- [Configuration](configuration.md) — session storage, the auth lifecycle, localization.
- [Extending Inflow](extending.md) — your own sources, actions and directives.
