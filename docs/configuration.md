# Configuration

Everything `Portal` accepts, plus how sessions, authentication and localization work.

- [Options](#options)
- [Where the session is stored](#where-the-session-is-stored)
- [The authentication lifecycle](#the-authentication-lifecycle)
- [Rendering and updates](#rendering-and-updates)
- [Localization](#localization)
- [Formatting values](#formatting-values)

## Options

```js
new Portal({
  signInPageUrl: "/sign_in.html",
  homePageUrl: "/index.html",
  base: "https://your-store.foxycart.com/s/customer/",
});
```

Three options are required. The other five have defaults.

| Option | Type | Default | What it does |
|---|---|---|---|
| `base` | string | — **required** | Your store's Customer API root, ending in `/s/customer/`. Every source builds its URL from this, and it namespaces the session in browser storage |
| `signInPageUrl` | string | — **required** | Where to send a visitor with no valid session |
| `homePageUrl` | string | — **required** | Where to land after a successful sign-in or account creation |
| `storage` | `"local"` \| `"cookie"` | `"local"` | Where the session token is kept — see [below](#where-the-session-is-stored) |
| `prefix` | string | `"data-"` | The attribute prefix for every directive. Change it and `data-if` becomes `<your-prefix>if` |
| `root` | `ChildNode` | `document.body` | The subtree Inflow renders. Scope it to mount a portal inside part of a page |
| `manualRender` | boolean | `false` | When `true`, skips the initial render — see [Rendering and updates](#rendering-and-updates) |
| `v8nTranslations` | object | `{}` | Validation messages, merged over the defaults — see [Localization](#localization) |

## Where the session is stored

Two modes, and the choice matters if anything else on your domain needs the session.

**`"local"`** — the default. The token is kept in the browser's local storage under a key derived from your `base`, so it is namespaced per store. Two portals for two different stores on the same domain cannot see or clobber each other's sessions, and signing out of one leaves the other alone.

**`"cookie"`** — the token is written to the `fx.customer` cookie. That is a fixed name other Foxy scripts read, so this mode is deliberately **not** namespaced: sharing the session across the domain is the point of it.

Choose `"cookie"` when other Foxy code on the same domain has to see the customer as signed in. Choose `"local"` otherwise.

```js
new Portal({
  signInPageUrl: "/sign_in.html",
  homePageUrl: "/index.html",
  base: "https://your-store.foxycart.com/s/customer/",
  storage: "cookie",
});
```

Signing out clears only this store's own keys, never the whole origin — so unrelated data your site keeps in local storage survives it.

## The authentication lifecycle

You do not write session handling. The sequence:

1. **Reading.** Every API request attaches the stored token as a bearer credential. No token means no header, and the API answers accordingly.
2. **Rejection.** When the API returns 401, Inflow drops the entire response cache, forgets the token, and redirects to your `signInPageUrl`. It checks it is not already on that page first, so there is no redirect loop.
3. **Signing in.** A successful `portal.signIn` stores the session and sends the visitor to `homePageUrl`. Creating an account does the same.
4. **Signing out.** `portal.signOut` clears this store's keys, removes the token, and returns to `signInPageUrl`.

`portal.isLoggedIn()` reports whether a token exists. It does **not** validate it — an expired token still reads as logged in until a request fails. So use it for rendering decisions, not as a security boundary:

```html
<p data-if="portal.isLoggedIn()">You are signed in.</p>
<a data-if-not="portal.isLoggedIn()" href="/sign_in.html">Sign in</a>
```

The real protection is that the API rejects the token and Inflow redirects. A page whose content comes from a source is therefore protected by loading that source.

## Rendering and updates

Inflow renders once when constructed, then again whenever something changes — a source arriving, an action changing state, a validator running.

Re-renders are **debounced**, batching everything that happens in quick succession into one pass. So several sources resolving together cost one render, not one each.

`requestUpdate` is available inside every expression, which is what you call after changing your own context values:

```html
<button data-on-click="requestUpdate">Re-render</button>
```

`manualRender: true` suppresses only the *initial* render. Use it when the markup is not in the document yet — when you are injecting the portal's HTML and want to render after that, rather than racing it:

```js
const portal = new Portal({
  signInPageUrl: "/sign_in.html",
  homePageUrl: "/index.html",
  base: "https://your-store.foxycart.com/s/customer/",
  manualRender: true,
});

document.querySelector("#portal").innerHTML = await loadTemplate();
portal.requestUpdate();
```

## Localization

Two separate mechanisms. Do not confuse them: one is validation messages, the other is number and date formatting.

**Validation messages** come from `v8nTranslations`, merged over the built-in defaults. Keys are `<group>.<field>.<code>`.

Nineteen defaults ship, in English, covering the sign-in, account-creation and password-reset forms. The `customer`, `defaultPaymentMethod`, `subscription` and `customerAddress` groups have none, so their fields show raw codes such as `too_big` until you supply your own. See [Forms and validation](forms-and-validation.md#validation-messages) for the key list, the codes and a complete example.

**A page's language** is resolved per element from the nearest ancestor carrying a `lang` attribute, falling back to the browser's language. It is exposed to expressions as `lang`, so markup can branch on it:

```html
<div lang="fr">
  <span data-text="lang"></span>
</div>
```

Setting `lang` on a subtree therefore changes what formatting helpers inside it produce, without any configuration.

## Formatting values

Three helpers are available in every expression, under `format`. Each takes an optional language and defaults to the browser's.

| Helper | Takes | Example |
|---|---|---|
| `format.currency(value)` | amount and 3-letter code concatenated | `format.currency("12.50USD")` |
| `format.date(value)` | an ISO date | `format.date(s.start_date)` |
| `format.datetime(value)` | an ISO date and time | `format.datetime(t.transaction_date)` |

`format.currency` expects the amount and the currency code as a single string, which is why API fields get combined with a template literal:

```html
<td data-text="format.currency(`${t.total_order}${t.currency_code}`)"></td>
```

To force a language rather than following the browser, pass it:

```html
<td data-text="format.date(s.start_date, 'de-DE')"></td>
```
