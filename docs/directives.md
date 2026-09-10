# Directives

A directive is a `data-` attribute Inflow understands. Its value is a JavaScript expression evaluated against a sandboxed context.

Twelve directives ship built in. They are listed here in the order Inflow applies them, which matters — see [Order matters](#order-matters).

- [`data-cloak`](#data-cloak) — hide until first render
- [`data-ref`](#data-ref) — name an element for later access
- [`data-source`](#data-source) — bind API data to the local context
- [`data-action`](#data-action) — handle a form submission
- [`data-if`](#data-if--data-if-not) / [`data-if-not`](#data-if--data-if-not) — render conditionally
- [`data-for`](#data-for) — repeat an element per item
- [`data-prop-*`](#data-prop-) — set a DOM property
- [`data-attr-*`](#data-attr-) — set an attribute
- [`data-battr-*`](#data-battr-) — toggle a boolean attribute
- [`data-on-*`](#data-on-) — listen for an event
- [`data-v8n`](#data-v8n) — validate a form's fields

Then: [aliases](#aliases), [order matters](#order-matters), [repeating a directive](#repeating-a-directive-on-one-element), and [values are code](#values-are-code).

## `data-cloak`

Marks a subtree as not yet rendered. Inflow removes the attribute on its first render, so a `[data-cloak] { display: none; }` rule hides the subtree until then.

```html
<style>
  [data-cloak] { display: none; }
</style>

<div data-cloak>...</div>
```

The value is ignored. Because the attribute is removed rather than set to a different value, you can attach a transition to the rendered state.

## `data-ref`

Registers the element under a name, then exposes it to every expression in scope as `refs.<name>`.

```html
<input name="first_name" data-ref="firstName" />
<p data-if="refs.firstName.validationMessage">Please check this field.</p>
```

This gives markup access to live DOM state that is not otherwise in the context — validation messages, checked state, scroll position. The reference is the element itself, so any property on it is readable.

## `data-source`

Binds one or more API resources into the local context. The value is evaluated and treated as a map of context name to URL, so passing a `portal.data` entry binds it under its own name:

```html
<div data-source="portal.data.subscriptions">
  <p data-if="subscriptions.isLoading">Loading…</p>
  <ul data-if="subscriptions.isReady">
    <li data-for="s in subscriptions.items" data-text="s.frequency"></li>
  </ul>
</div>
```

Inside that element, `subscriptions` exposes loading flags, the items, pagination helpers, and a `patch` method for saving. See [Data sources](data-sources.md) for the full state object and for the difference between this and reading a source without the attribute.

## `data-action`

Handles a form submission.

```html
<form data-action="portal.signIn">
  <input name="email" type="email" />
  <input name="password" type="password" />
  <button>Sign in</button>
</form>
```

**It listens for `submit` only.** Putting `data-action` on a button does nothing unless that button submits a form containing the attribute. For click handling use [`data-on-*`](#data-on-).

The bound action also exposes its own state — `isSubmitting`, `isFailed`, `errors` and more. See [Forms and validation](forms-and-validation.md).

## `data-if` / `data-if-not`

Render an element only when an expression is truthy (`data-if`) or falsy (`data-if-not`).

```html
<p data-if="portal.isLoggedIn()">You are signed in.</p>
<a data-if-not="portal.isLoggedIn()" href="/sign_in.html">Sign in</a>
```

A hidden element is **stashed, not destroyed**: it is replaced by a placeholder comment and put back unchanged when the condition flips. Element state — a partly filled input, a scroll position — survives being hidden.

If the expression throws, Inflow logs a warning and treats the result as false rather than failing the render.

Note there is no `else`. Two elements with opposite conditions is the idiom, as above.

## `data-for`

Uses the element as a template and repeats it once per item.

```html
<tr data-for="subscription, i in subscriptions.items">
  <td data-text="i + 1"></td>
  <td data-text="subscription.frequency"></td>
</tr>
```

The syntax is `item in collection` or `item, index in collection`. When you omit the index name it is available as `index`.

Two constraints to know:

**The collection is a path, not an expression.** It is resolved by looking the path up in the context, so `subscriptions.items` works but `subscriptions.items.slice(0, 3)` does not. Filter or slice before it reaches the context — for example in a [custom context value](extending.md).

**The collection must exist.** If the path resolves to `undefined`, the directive throws when it reads the length. Gate the loop on a readiness flag, as the `data-if="subscriptions.isReady"` example above does.

## `data-prop-*`

Sets a DOM property from an expression.

```html
<span data-prop-textcontent="customer.first_name"></span>
<input data-prop-value="customer.email" />
```

The suffix is matched case-insensitively against the element's own properties, which is how `data-prop-textcontent` reaches `textContent`. Attribute names are lowercase in HTML, so this matching is what makes camelCase properties reachable at all.

Use this rather than [`data-attr-*`](#data-attr-) when you need the live property — form field values in particular, where the attribute and the property differ once a user types.

## `data-attr-*`

Sets an attribute from an expression. The result is converted to a string.

```html
<a data-attr-href="transaction._links['fx:receipt'].href">View receipt</a>
<h-captcha data-attr-site-key="portal.data.settings.sign_up.verification.site_key"></h-captcha>
```

## `data-battr-*`

Toggles a boolean attribute on the truthiness of an expression.

```html
<button data-battr-disabled="subscriptions.isFirstPage">Previous</button>
```

Boolean attributes are present or absent rather than true or false, which is what this directive manages. Most have a shorthand — see [aliases](#aliases).

## `data-on-*`

Adds an event listener. The event name is the part after `on-`.

```html
<button data-on-click="subscriptions.loadNextPage">Next</button>
<input data-on-blur="handleBlur" />
```

The value is an expression that evaluates to a function. It receives the event.

**Event names are effectively lowercase.** HTML lowercases attribute names, and the event name is taken from the attribute verbatim, so a custom event named `myEvent` cannot be bound this way. Dispatch such events with an all-lowercase name, or attach the listener via [`data-ref`](#data-ref).

## `data-v8n`

Validates a form's fields.

```html
<form data-v8n="portal.v8n.signIn" data-action="portal.signIn">
  <input name="email" type="email" />
  <input name="password" type="password" />
  <button>Sign in</button>
</form>
```

**It goes on the form, not on an input.** The value is evaluated to a map of field name to validator function, and each input is matched by its `name` attribute. A validator returns an empty string when the value is valid, or a message to show.

On any other host the directive warns to the console once and does nothing — a single validator on a single input is not a supported shape.

Validators run on `input` and `change`, and over every field after each update. See [Forms and validation](forms-and-validation.md) for the bundled validators and for supplying your own messages.

## Aliases

Ten shorthands are built in. Each expands to a longer directive:

| Shorthand | Expands to |
|---|---|
| `data-text` | `data-prop-textcontent` |
| `data-value` | `data-attr-value` |
| `data-href` | `data-attr-href` |
| `data-disabled` | `data-battr-disabled` |
| `data-readonly` | `data-battr-readonly` |
| `data-hidden` | `data-battr-hidden` |
| `data-checked` | `data-battr-checked` |
| `data-selected` | `data-battr-selected` |
| `data-required` | `data-battr-required` |
| `data-open` | `data-battr-open` |

Note that `data-text` expands to a property while `data-value` expands to an attribute.

You can register your own aliases — see [Extending Inflow](extending.md). Overriding one of the built-ins logs a warning.

## Order matters

Inflow applies directives in a fixed order, listed at the top of this page. The order is part of the contract because three directives change what happens to an element's children: `data-if` and `data-if-not` stash the element, and `data-for` replaces it with copies. They run before the directives that read the node, so a hidden element's contents are never evaluated.

This matters when you write your own directive. One that stashes or skips children has to be considered against this ordering — see [Extending Inflow](extending.md).

## Repeating a directive on one element

The prefix directives can repeat. An element may carry as many `data-attr-*`, `data-prop-*`, `data-battr-*` and `data-on-*` attributes as it needs, and every one of them is applied, in the order they appear in the markup.

```html
<!-- both listeners are bound -->
<input data-on-input="handleInput" data-on-blur="handleBlur" />

<!-- both attributes are set -->
<a data-href="url" data-attr-title="label"></a>
```

An alias counts as the directive it expands to, so `data-href` and `data-attr-title` above are two `attr-` bindings, not one of each.

The exact-match directives — `data-if`, `data-for`, `data-v8n` and the rest — cannot repeat, because HTML has no way to put the same attribute on an element twice.

## Values are code

Every directive value is compiled into a function and evaluated against the context. Compiled functions are cached, keyed by the expression text, in an LRU cache holding 1000 entries — so repeating the same expression across many elements costs one compile, while generating a large number of distinct expressions will evict older ones.

This means directive values are executable code. **Never build a directive value out of user input or API data.** Bind data through the context and let the expression read it, rather than interpolating a value into the attribute.
