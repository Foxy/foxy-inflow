# Forms and validation

Forms in Inflow are ordinary HTML forms. Two directives do the work: `data-action` submits, and `data-v8n` validates.

- [Submitting a form](#submitting-a-form)
- [Action state](#action-state)
- [Validating fields](#validating-fields)
- [The built-in validators](#the-built-in-validators)
- [Validation messages](#validation-messages)
- [Server-side errors](#server-side-errors)
- [Creating an account](#creating-an-account)
- [Saving a payment method](#saving-a-payment-method)

## Submitting a form

Bind an action to the form:

```html
<form data-v8n="portal.v8n.signIn" data-action="portal.signIn">
  <label>Email
    <input name="email" type="email" />
  </label>
  <label>Password
    <input name="password" type="password" />
  </label>
  <button>Sign in</button>
</form>
```

`data-action` listens for `submit` only — see [Directives](directives.md#data-action).

On submit the action:

1. prevents the default submission;
2. ignores the event entirely if a submission is already in flight, so a double-click cannot post twice;
3. checks the form's validity and stops if it fails;
4. disables every element in the form while the request runs, and re-enables them afterwards — including on failure;
5. posts the form as JSON to its endpoint.

Field names in the form are the field names sent to the API, so `name="email"` matters.

`Portal` provides these actions: `signIn`, `resetPassword`, `createAccount`, and `createCcToken`. For saving changes to a resource you already loaded, use that source's `patch` instead — see [Data sources](data-sources.md#saving-changes). For your own endpoints, see [Extending Inflow](extending.md).

## Action state

An action exposes its own state, which markup can read directly:

| Member | What it is |
|---|---|
| `isIdle` | nothing has been submitted yet |
| `isSubmitting` | a request is in flight |
| `isDone` | the last submission succeeded |
| `isFailed` | the last submission failed |
| `errors` | array of `{ code, message }` — see [Server-side errors](#server-side-errors) |
| `reset()` | clears a failure and returns to idle |

A typical submit button and error list:

```html
<button>
  <span data-if="portal.signIn.isSubmitting">Signing in…</span>
  <span data-if-not="portal.signIn.isSubmitting">Sign in</span>
</button>

<p data-for="error in portal.signIn.errors" aria-live="polite">
  <span data-text="error.message"></span>
</p>
```

`reset()` only does something when the action has failed. Calling it while idle, submitting or done is a no-op, so it is safe to wire to a "dismiss" button unconditionally.

## Validating fields

`data-v8n` goes on the **form**. Its value is a map of field name to validator function, and inputs are matched by their `name` attribute:

```html
<form data-v8n="portal.v8n.signIn" data-action="portal.signIn">
  <input name="email" type="email" />
  <input name="password" type="password" />
  <button>Sign in</button>
</form>
```

A validator takes the field's value and returns an empty string when it is valid, or a message when it is not. The message is applied as the input's custom validity, so the browser shows it and the form refuses to submit.

Validators run on `input` and `change`, and over every field after each update — so a field prefilled with a bad value is marked immediately rather than only after the customer touches it, and a value that arrives later from the API is checked too.

Because a validator is just a function, you can supply your own:

```html
<form data-v8n="myValidators" data-action="portal.signIn">
```

with `myValidators` on the context — see [Extending Inflow](extending.md). Nothing about the directive requires the bundled validators.

## The built-in validators

`portal.v8n` groups validators by what they validate. Twenty-nine in seven groups:

| Group | Fields |
|---|---|
| `signIn` | `email`, `password` |
| `createAccount` | `first_name`, `last_name`, `email`, `password`, `password_old` |
| `resetPassword` | `email` |
| `customer` | `first_name`, `last_name`, `tax_id`, `email`, `password`, `password_old` |
| `defaultPaymentMethod` | `cc_token`, `save_cc` |
| `subscription` | `next_transaction_date`, `frequency` |
| `customerAddress` | `address_name`, `first_name`, `last_name`, `company`, `address1`, `address2`, `city`, `region`, `postal_code`, `country`, `phone` |

Every key is an input `name`, so you can pass a whole group as the map. To mix groups, or to validate only some of the fields, build the map inline:

```html
<form data-v8n="{
  first_name: portal.v8n.customer.first_name,
  address1: portal.v8n.customerAddress.address1
}" data-action="portal.data.customer.patch">
```

## Validation messages

Inflow ships default messages in English for the sign-in, account-creation and
password-reset forms. Four groups have no defaults — see [Groups without
defaults](#groups-without-defaults) below.

Each validator looks up its message by a key built from the group, the field and the validation code:

```
<group>.<field>.<code>
```

The group segment is snake_case, not the property name: `signIn` looks up `sign_in.*`, `createAccount` looks up `sign_up.*`, `resetPassword` looks up `reset_password.*`.

The codes come from the underlying validation library, and there are three in practice:

| Code | Means |
|---|---|
| `too_small` | required field left empty, or below a minimum |
| `too_big` | longer than the maximum |
| `invalid_string` | wrong format — an email that is not an email, a frequency that does not match the pattern |

Nineteen defaults ship, covering every field of three groups:

| Group | Fields covered | Codes |
|---|---|---|
| `sign_in` | `email` | `too_small`, `too_big`, `invalid_string` |
| `sign_in` | `password` | `too_small`, `too_big` |
| `sign_up` | `email` | `too_small`, `too_big`, `invalid_string` |
| `sign_up` | `first_name`, `last_name`, `password`, `password_old` | `too_small`, `too_big` |
| `reset_password` | `email` | `too_small`, `too_big`, `invalid_string` |

A code with no matching key falls through to the raw code, so the field shows `too_big` instead of a sentence. Supplying the key fixes it.

### Groups without defaults

`customer`, `defaultPaymentMethod`, `subscription` and `customerAddress` ship no messages, so their fields show raw codes until you supply your own.

Watch the key namespace for two of them. `customerAddress` looks its messages up under `customer.*`, not `customer_address.*` — `customerAddress.first_name` reads `customer.first_name.<code>`, the same key `customer.first_name` uses. `defaultPaymentMethod` looks up `default_payment_method.*`.

### Supplying your own messages

Pass `v8nTranslations` when constructing the portal:

```js
new Portal({
  signInPageUrl: "/sign_in.html",
  homePageUrl: "/index.html",
  base: "https://your-store.foxycart.com/s/customer/",

  v8nTranslations: {
    "sign_in.email.invalid_string": "Enter a valid email address.",
    "sign_in.password.too_small": "Enter your password.",

    "customer.first_name.too_small": "Enter your first name.",
    "customer.first_name.too_big": "Keep your first name under 50 characters.",

    "customer.address1.too_small": "Enter a street address.",
    "customer.country.too_big": "Use the two-letter country code.",
  },
});
```

Your entries are merged over the defaults, so you only need the keys you care about — the ones you want reworded, and the ones for groups that have none. Translating the whole portal means supplying every key, including the nineteen that have English defaults.

One consequence worth knowing: because an unmapped code surfaces raw, markup can branch on it. The demo pages do this for address fields, which have no defaults:

```html
<p data-if="refs.firstName.validationMessage === 'too_big'">
  We can't store first names longer than 50 characters.
</p>
```

It is a workaround, not a pattern to build on. It breaks the moment a message exists for that key — including one you add yourself — because `validationMessage` then holds the sentence, not the code. Supply `v8nTranslations` and render `validationMessage` instead.

## Server-side errors

Validation catches what it can locally. The API rejects the rest, and those errors come back through the action.

When a submission fails, Inflow reads the API's error messages and tries to attach each one to the field it belongs to. An error it can attribute to a field is applied as that field's custom validity, so it appears next to the input like a local validation error. Anything it cannot attribute stays in the action's `errors` array.

So `errors` holds only the errors that had nowhere else to go — render it as a general error area, and let field-level errors show themselves:

```html
<p data-for="error in portal.createAccount.errors" aria-live="polite">
  <span data-text="error.message"></span>
</p>
```

Each entry has a `code` and a `message`. A network-level failure — no response at all — produces a single entry with the code `unknown_error`.

## Creating an account

`portal.createAccount` **requires an `<h-captcha>` element inside the form.** This is not optional: without it the action throws and no account is created.

```html
<form
  data-if-not="portal.isLoggedIn()"
  data-v8n="portal.v8n.createAccount"
  data-action="portal.createAccount"
>
  <label>First name<input name="first_name" /></label>
  <label>Last name<input name="last_name" /></label>
  <label>Email<input name="email" type="email" /></label>
  <label>Password<input name="password" type="password" /></label>

  <h-captcha data-attr-site-key="portal.data.settings.sign_up.verification.site_key"></h-captcha>

  <button>Create account</button>
</form>
```

The site key comes from your store's portal settings, which the `settings` source exposes — the `data-attr-site-key` binding above reads it, so you do not hard-code it.

What happens on submit: the action clears the captcha widget, asks it to run, and waits for it to verify. The resulting token is added to the submission as a `verification` field and posted with the rest of the form. If the widget is missing, the submission fails before any request is made.

You are responsible for loading the hCaptcha element itself; Inflow only drives it.

## Saving a payment method

`portal.createCcToken` is a wrapper around a resource's `patch`, for the case where a card has to be tokenised before it can be saved. Pass it the resource:

```html
<form
  data-if="portal.data.defaultPaymentMethod.isReady"
  data-action="portal.createCcToken(portal.data.defaultPaymentMethod)"
>
  <input name="cc_token" type="hidden" />

  <foxy-payment-card-embed url="https://embed.foxy.io/v1.html?demo=default">
  </foxy-payment-card-embed>

  <button>Save card</button>
</form>
```

Two pieces of markup are required: a hidden input named `cc_token`, and a `<foxy-payment-card-embed>` element to collect the card. The `url` above is the shared demo embed, which is what the `add_payment_method.html` demo page uses — point it at your own store's tokenization embed for live cards.

On submit, if `cc_token` already has a value the form is patched straight away. Otherwise the action asks the embed to tokenise the card, writes the returned token into the hidden input, and submits again — this time taking the first path. Tokenisation failures are reported to the browser console.

Load the embed element from the Foxy Elements CDN. See the `add_payment_method.html` demo page in this repository for a complete working example.
