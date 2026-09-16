# Extending Inflow

Four extension points, from the one you will reach for most to the one you will rarely need.

- [Your own context values](#your-own-context-values)
- [Your own data sources](#your-own-data-sources)
- [Your own actions](#your-own-actions)
- [Your own directives](#your-own-directives)
- [Using Core without the Customer API](#using-core-without-the-customer-api)

## Your own context values

`globalContext` holds everything visible to expressions. `portal` and `format` live there, and you can add to it:

```js
const portal = new Portal({
  signInPageUrl: "/sign_in.html",
  homePageUrl: "/index.html",
  base: "https://your-store.foxycart.com/s/customer/",
});

portal.globalContext.showHelp = () => {
  document.querySelector("#help").hidden = false;
};

portal.globalContext.supportEmail = "help@example.com";
```

Both are now usable in markup:

```html
<button data-on-click="showHelp">Need help?</button>
<a data-href="'mailto:' + supportEmail" data-text="supportEmail"></a>
```

This is also the answer to `data-for`'s path-only limitation. Because the loop's collection has to be a path rather than an expression, do the filtering or slicing in JavaScript and expose the result:

```js
portal.globalContext.recentThree = [];

portal.globalContext.loadRecent = async () => {
  const all = await fetchSomething();
  portal.globalContext.recentThree = all.slice(0, 3);
  portal.requestUpdate();
};
```

```html
<li data-for="item in recentThree" data-text="item.name"></li>
```

Changing a context value does not re-render on its own. Call `requestUpdate()` after you change it, as above.

## Your own data sources

`createSource(name, url)` builds a source for any URL **on your configured `base` origin**, with the same state object the built-in ones have — loading flags, pagination, `patch`, `refresh`. Use it for a Customer API resource `portal.data` does not cover, or for a query with filters of your own:

```js
portal.globalContext.recentTransactions = portal.createSource(
  "recentTransactions",
  `${portal.base}transactions?zoom=items&limit=5`,
);
```

```html
<div data-source="recentTransactions">
  <p data-if="recentTransactions.isLoading">Loading…</p>
  <ul data-if="recentTransactions.isReady">
    <li data-for="t in recentTransactions.items" data-text="t.id"></li>
  </ul>
</div>
```

`portal.base` is your configured `base`, so building URLs from it keeps them pointed at the right store. The session token is attached for you.

See [Data sources](data-sources.md#the-state-object) for everything the result exposes.

## Your own actions

`createAction` builds a form handler that posts to an endpoint, with the same submit lifecycle and state members as the built-in actions:

```js
portal.globalContext.submitSurvey = portal.createAction({
  path: "survey",
  onSuccess: () => {
    document.querySelector("#thanks").hidden = false;
  },
});
```

```html
<form data-action="submitSurvey">
  <input name="answer" />
  <button>
    <span data-if="submitSurvey.isSubmitting">Sending…</span>
    <span data-if-not="submitSurvey.isSubmitting">Send</span>
  </button>
</form>
```

The options:

| Option        | Type               | What it does                                                                                                                              |
| ------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `path`        | string             | Appended to your `base` to form the endpoint. Required unless `url` is given                                                              |
| `url`         | string             | The endpoint in full, for a target that is not `base` plus a segment. Takes precedence over `path`                                        |
| `method`      | string             | HTTP method. Defaults to `POST`                                                                                                           |
| `bearerToken` | string or function | Sends this as the credential instead of relying on the session. A function is called at submit time, so a refreshed session is not missed |
| `v8n`         | object             | Maps an API error message to an error code, so the error can be attached to the field it belongs to                                       |
| `jsonFields`  | array of strings   | Field names whose values are parsed as JSON before posting, rather than sent as strings                                                   |
| `onSuccess`   | function           | Called with the parsed response                                                                                                           |
| `onSubmit`    | function           | Called with the form and its data _before_ the request; return a promise and the request waits for it                                     |

`onSubmit` receives the `FormData` and may modify it, which is how a value that has to be fetched asynchronously gets into the submission. The built-in account creation uses exactly this to wait for a captcha token and add it as a field.

See [Forms and validation](forms-and-validation.md#action-state) for the state members, and [#server-side-errors](forms-and-validation.md#server-side-errors) for how `v8n` error mapping behaves.

## Your own directives

When markup needs behaviour no built-in directive provides, write one. Subclass `Directive` and override `apply`:

```js
class TitleDirective extends Directive {
  apply({ host, value, run }) {
    host.setAttribute("title", String(run(value)));
  }
}
```

`Directive` is exported alongside `Portal` and `Core`, so import it from wherever you imported those:

```js
import { Directive, Portal } from "https://cdn-js.foxy.io/inflow@1/index.js";
```

The `core.js` entry point exports it too, for a page that uses `Core` rather than `Portal`.

Register it with the `directives` option, which takes already-constructed instances:

```js
const titleDirective = new TitleDirective({ prefix: "title" });

const portal = new Portal({
  signInPageUrl: "/sign_in.html",
  homePageUrl: "/index.html",
  base: "https://your-store.foxycart.com/s/customer/",
  directives: [titleDirective],
});
```

```html
<span data-title="customer.email">Contact</span>
```

**A directive that needs the engine has to be given it afterwards.** A `Directive` normally receives an `inflow` reference, but the instance does not exist yet at the point you construct the directive — so if your `apply` uses `this.inflow` (to call `requestUpdate`, or to reach `storage`), assign it once the portal exists:

```js
const titleDirective = new TitleDirective({ prefix: "title" });

const portal = new Portal({
  signInPageUrl: "/sign_in.html",
  homePageUrl: "/index.html",
  base: "https://your-store.foxycart.com/s/customer/",
  directives: [titleDirective],
});

titleDirective.inflow = portal;
```

A directive that only uses the `apply` arguments — as `TitleDirective` above does — needs no reference at all and works without this step. In TypeScript, `inflow` is typed as required and readonly, so both patterns need a cast.

Note that the option is read once, when the portal is constructed. Pushing onto the array afterwards has no effect — the directive will simply never run.

**Matching:** a `prefix` without a trailing hyphen matches that attribute exactly, so `prefix: "title"` matches `data-title` only. A prefix ending in a hyphen matches by prefix, so `prefix: "title-"` would match `data-title-anything`.

**`apply` receives** one object:

| Field             | What it is                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `host`            | the element carrying the attribute                                                                      |
| `value`           | the attribute's raw string value                                                                        |
| `run`             | evaluates an expression string against the context; optionally takes extra context                      |
| `context`         | the current expression context                                                                          |
| `name`            | the directive name after alias resolution                                                               |
| `attributeName`   | the attribute name as written in the markup                                                             |
| `storage`         | the portal's scoped storage                                                                             |
| `update`          | request a re-render                                                                                     |
| `isStashed`       | whether this element is currently stashed by a conditional                                              |
| `placeholderHost` | the placeholder comment standing in for a stashed element, or `null`                                    |
| `adopt`           | render a node with a given context — how `data-for` renders its copies                                  |
| `resolve`         | given a placeholder comment, returns the stashed node it stands in for; returns anything else unchanged |

**`apply` may return** an object to influence the render:

| Field          | Effect                                                               |
| -------------- | -------------------------------------------------------------------- |
| `skipChildren` | when true, descendants are not rendered                              |
| `isStashed`    | when true, the element is replaced by a placeholder and kept aside   |
| `beforeUpdate` | called before the next render — use it to remove listeners you added |
| `afterUpdate`  | called after the next render                                         |

Three rules worth respecting. Register listeners in `apply` and remove them in `beforeUpdate`, or they accumulate on every render. Remember that custom directives are applied **after** all the built-ins, so a directive of yours that stashes children runs after the conditionals — see [order matters](directives.md#order-matters).

And return `isStashed` only when you mean it. The stash records which directive put a node away, and only that directive can take it back, so returning `isStashed: false` out of habit no longer disturbs another directive's placeholder — but it is still a claim about your directive, not about the node. If you recognise nodes by identity, run them through `resolve` first: a node another directive has stashed is a comment in the document, and comparing the comment will not match.

You can also add shorthand aliases rather than a whole directive, when the behaviour already exists:

```js
new Portal({
  signInPageUrl: "/sign_in.html",
  homePageUrl: "/index.html",
  base: "https://your-store.foxycart.com/s/customer/",
  directiveAliases: { tooltip: "attr-title" },
});
```

Overriding a built-in alias logs a warning rather than failing.

## Using Core without the Customer API

`Core` is the second export. It is `Portal` minus authentication, the actions and the Customer API sources — the rendering engine and the directives on their own. Reach for it when you want directive-driven markup against something other than the Foxy Customer API.

```js
import { Core } from "https://cdn-js.foxy.io/inflow@1/core.js";

const core = new Core({
  base: "https://api.example.com/",
  getToken: () => myToken,
  onTokenExpiry: () => location.assign("/login"),
});

core.globalContext.items = [];
core.requestUpdate();
```

Its options:

| Option             | What it does                                  |
| ------------------ | --------------------------------------------- |
| `base`             | prefix for source and action URLs             |
| `getToken`         | returns the credential to send, or `null`     |
| `onTokenExpiry`    | called when a request comes back unauthorized |
| `prefix`           | attribute prefix, default `data-`             |
| `root`             | subtree to render, default `document.body`    |
| `directives`       | extra directives                              |
| `directiveAliases` | extra aliases                                 |

`Core` does not render on construction — call `requestUpdate()` yourself.

## A standing warning

Directive values are compiled into functions and executed. **Never build a directive value from user input or API data**, in your own directives or your own markup. Put the data on the context and let the expression read it.
