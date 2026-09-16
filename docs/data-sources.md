# Data sources

A source is one Customer API resource, bound into the expression context. Sources handle fetching, loading state, pagination, saving and caching, so markup only has to read them.

- [The built-in sources](#the-built-in-sources)
- [Two ways to read a source](#two-ways-to-read-a-source)
- [The state object](#the-state-object)
- [Pagination](#pagination)
- [Saving changes](#saving-changes)
- [Refreshing](#refreshing)
- [Caching](#caching)
- [Sources are limited to your API origin](#sources-are-limited-to-your-api-origin)

## The built-in sources

`Portal` provides eleven sources under `portal.data`. Each builds its URL from your configured `base`.

| Source                                        | Resource                                                   |
| --------------------------------------------- | ---------------------------------------------------------- |
| `customer`                                    | the customer themselves                                    |
| `settings`                                    | `customer_portal_settings`                                 |
| `defaultPaymentMethod`                        | `default_payment_method`                                   |
| `addresses`                                   | `addresses`                                                |
| `subscriptions`                               | `subscriptions`                                            |
| `activeSubscriptions`                         | `subscriptions?is_active=true`                             |
| `pastDueSubscriptions`                        | `subscriptions?past_due_amount:greaterthan=0`              |
| `transactions`                                | `transactions?zoom=items`                                  |
| `activeSubscriptionsBySku(sku, contextKey?)`  | `subscriptions?is_active=true&items:code=<sku>&zoom=items` |
| `transactionsBySku(sku, contextKey?)`         | `transactions?zoom=items&items:code=<sku>`                 |
| `customerAttributesByName(name, contextKey?)` | `customer/attributes?name=<name>`                          |

The last three are functions because they take a parameter:

```html
<div data-source="portal.data.transactionsBySku('MY-SKU')">
  <p data-if="transactionsBySku.hasItems">You already own this.</p>
</div>
```

**Two calls on one page need different context keys.** The optional second argument is the name the result binds to, and it defaults to the function's own name — so two unnamed calls collide on the same key:

```html
<!-- Wrong: both bind to transactionsBySku, second wins -->
<div data-source="portal.data.transactionsBySku('SKU-A')">…</div>
<div data-source="portal.data.transactionsBySku('SKU-B')">…</div>

<!-- Right -->
<div data-source="portal.data.transactionsBySku('SKU-A', 'ownsA')">
  <p data-if="ownsA.hasItems">…</p>
</div>
<div data-source="portal.data.transactionsBySku('SKU-B', 'ownsB')">
  <p data-if="ownsB.hasItems">…</p>
</div>
```

For a resource that is not in this list, see [Extending Inflow](extending.md).

## Two ways to read a source

**Explicitly**, with `data-source`. The source binds to a name in the local context, available on that element and its descendants:

```html
<div data-source="portal.data.subscriptions">
  <p data-if="subscriptions.isLoading">Loading…</p>
  <ul data-if="subscriptions.isReady">
    <li data-for="s in subscriptions.items" data-text="s.frequency"></li>
  </ul>
</div>
```

**Implicitly**, by reading a field straight off `portal.data`. No attribute needed — the read itself starts the request:

```html
<span data-text="portal.data.customer.first_name"></span>
```

Implicit reads are convenient for one or two values. They come with one real limitation:

> **Implicit sources cannot paginate or refresh.** Calling `refresh`, `loadFirstPage`, `loadPreviousPage`, `loadNextPage` or `loadLastPage` on an implicitly read source does nothing but log an error to the console. Both need `data-source`.

`patch` is unaffected and works either way. So: single values, implicit; anything that pages or refreshes, `data-source`. Forms are usually easier with an explicit source anyway, because the markup gets a short local name to call `patch` on.

## The state object

Whichever way you read it, a source exposes the same shape. Which members are present depends on the response.

**Always present:**

| Member            | Type     | What it is                                                           |
| ----------------- | -------- | -------------------------------------------------------------------- |
| `isLoading`       | boolean  | request in flight, no data yet                                       |
| `isReady`         | boolean  | data available                                                       |
| `hasFailedToLoad` | boolean  | the request failed                                                   |
| `raw`             | object   | the unmodified API response                                          |
| `patch`           | function | save a form to this resource — see [Saving changes](#saving-changes) |
| `refresh`         | function | re-fetch — see [Refreshing](#refreshing)                             |

The three flags are mutually exclusive. A failed source exposes only those three plus `refresh`, so guard on `isReady` before reading fields.

**On collections** — subscriptions, transactions, addresses, attributes:

| Member             | Type     | What it is                           |
| ------------------ | -------- | ------------------------------------ |
| `items`            | array    | the embedded resources for this page |
| `limit`            | number   | page size                            |
| `offset`           | number   | index of the first item on this page |
| `totalItems`       | number   | total across all pages               |
| `returnedItems`    | number   | items on this page                   |
| `hasItems`         | boolean  | `totalItems > 0`                     |
| `isFirstPage`      | boolean  |                                      |
| `isLastPage`       | boolean  |                                      |
| `needsPagination`  | boolean  | more than one page exists            |
| `loadFirstPage`    | function |                                      |
| `loadPreviousPage` | function |                                      |
| `loadNextPage`     | function |                                      |
| `loadLastPage`     | function |                                      |

**On single resources** — the customer, settings, the default payment method: the resource's own fields, directly on the source.

```html
<span data-text="portal.data.customer.first_name"></span>
<span data-text="portal.data.defaultPaymentMethod.cc_number_masked"></span>
```

The split is decided by the response, not configured: a paginated response gets the collection members above, and any other response has its API metadata stripped and its remaining fields exposed directly. That is why `customer.first_name` works while `subscriptions.first_name` does not.

`hasItems` is useful for "does this customer own anything matching X" checks without rendering the list — see the SKU example earlier.

## Pagination

Every helper re-points the source at the corresponding page and re-renders:

```html
<div data-source="portal.data.transactions">
  <table data-if="transactions.isReady">
    <tr data-for="t in transactions.items">
      <td data-text="t.id"></td>
      <td
        data-text="format.currency(`${t.total_order}${t.currency_code}`)"
      ></td>
    </tr>
  </table>

  <p data-if="transactions.isReady && transactions.needsPagination">
    <button
      data-disabled="transactions.isFirstPage"
      data-on-click="transactions.loadFirstPage"
    >
      First
    </button>
    <button
      data-disabled="transactions.isFirstPage"
      data-on-click="transactions.loadPreviousPage"
    >
      Previous
    </button>
    <span data-text="transactions.offset + 1"></span>
    <span>–</span>
    <span data-text="transactions.offset + transactions.returnedItems"></span>
    <span>of</span>
    <span data-text="transactions.totalItems"></span>
    <button
      data-disabled="transactions.isLastPage"
      data-on-click="transactions.loadNextPage"
    >
      Next
    </button>
    <button
      data-disabled="transactions.isLastPage"
      data-on-click="transactions.loadLastPage"
    >
      Last
    </button>
  </p>
</div>
```

Gate the controls on `needsPagination` so they disappear when everything fits on one page. `format.currency` is documented in [Configuration](configuration.md).

## Saving changes

`patch` is how you write to the API. It is the only write path for resources — there is no per-field update method, so check whether `patch` covers your case before reaching for something else.

Bind it as the form's action:

```html
<form
  data-if="portal.data.customer.isReady"
  data-action="portal.data.customer.patch"
>
  <label
    >First name
    <input name="first_name" data-value="portal.data.customer.first_name" />
  </label>
  <label
    >Last name
    <input name="last_name" data-value="portal.data.customer.last_name" />
  </label>
  <button>Save</button>
</form>
```

`patch` carries the same state members an action does, so a failed save can be
shown:

| Member         | Type    | What it is                                     |
| -------------- | ------- | ---------------------------------------------- |
| `isSubmitting` | boolean | the save is in flight                          |
| `isFailed`     | boolean | the last save was rejected                     |
| `isIdle`       | boolean | no save has been attempted                     |
| `errors`       | array   | `{ code, message }` per error the API returned |

```html
<form data-action="portal.data.customer.patch">
  <input name="first_name" data-value="portal.data.customer.first_name" />
  <button data-battr-disabled="portal.data.customer.patch.isSubmitting">
    Save
  </button>
</form>

<p data-for="error in portal.data.customer.patch.errors">
  <span data-text="error.message"></span>
</p>
```

A second submit while one is in flight is ignored — `patch` checks its own
`isSubmitting` state and returns early — so a double-click cannot post twice.
The form's controls are also disabled while the request runs and re-enabled
after, but that is a visual cue, not the guard: it happens too soon to block
a fast second click on its own.

**The source only refetches when the API accepted the save.** A rejected save
leaves what the customer typed on screen, because replacing it with the stored
value would read as success.

What it does on submit: prevents the default submission, checks the form's own validity and stops if it fails, serialises **every** field in the form to JSON, and sends it as a `PATCH` to the resource. On success the source is marked stale and re-fetched, so the page reflects what the API stored.

Two consequences of "every field in the form": a field you do not want sent should not live in that form, and a field you want cleared should be present and empty rather than absent.

For validating before the save, see [Forms and validation](forms-and-validation.md).

## Refreshing

`refresh()` marks the source stale and re-fetches it:

```html
<div data-source="portal.data.subscriptions">
  <button data-on-click="subscriptions.refresh">Reload</button>
</div>
```

It works on a failed source too, which makes it the recovery path after an error:

```html
<div data-source="portal.data.subscriptions">
  <p data-if="subscriptions.hasFailedToLoad">
    <span>Could not load your subscriptions.</span>
    <button data-on-click="subscriptions.refresh">Try again</button>
  </p>
</div>
```

Remember that this requires `data-source`. On an implicitly read source `refresh` only logs an error.

## Caching

Responses are cached in the browser's storage, and the cache survives a reload.

On load, a cached response is shown immediately and marked stale, then re-fetched in the background; the page updates when the fresh copy arrives. **So the first paint after a reload can show data from the previous visit.** That is the intended behaviour, not a bug — it trades a moment of staleness for an instant first render.

Two things clear it: a `patch`, which marks the affected source stale, and a rejected session. When the API returns 401 the whole cache is dropped and Inflow redirects to your sign-in page, so one customer's cached data is never shown to the next.

Requests carry the `foxy-api-version: 1` header. See [Configuration](configuration.md) for where the session token lives and how it is scoped.

## Sources are limited to your API origin

Every source is fetched with the customer's session token in an `Authorization` header, so the URL decides who receives that token. Inflow refuses any source that does not resolve to the same origin as your configured `base`, and reports it as `hasFailedToLoad` with an error in the console. `patch` is refused the same way.

This matters when a page builds a source out of something it did not write itself:

```html
<!-- The href comes from the query string, so the link decides the URL -->
<div
  data-source="{ address: new URL(location.href).searchParams.get('href') }"
></div>
```

Without the origin check, a link like `/address.html?href=https://attacker.example/` would send the customer's token to `attacker.example`. Pagination hrefs read back out of an API response go through the same check.

If you need data from somewhere else, fetch it yourself and put it in the context — do not route it through a source.
