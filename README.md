# Overview: Foxy Inflow for Portals

Foxy Inflow is a directive-based, HTML-first reactive engine tailored for building customer portals on Foxy. It lets you author dynamic views using simple `data-` attributes bound to a sandboxed context. The `Portal` layer (built on `InflowCore`) provides auth-aware actions, ready-to-use customer data sources, and formatting helpers, so most portal UI can be implemented directly in markup with minimal TypeScript glue. No virtual DOM; Inflow traverses and updates real DOM nodes efficiently with debounced renders and cached expression evaluation.

**Why Use It**
- **HTML-first authoring:** Build views declaratively with `data-` attributes; minimal JS.
- **Portal primitives:** Auth (`isLoggedIn`), actions (`signIn`, `signOut`, etc.), and rich data sources (customer, subscriptions, transactions, addresses, payment method).
- **Deterministic updates:** Debounced `update()` and LRU-cached expressions for performance and predictability.
- **Validation built in:** Zod-backed validators via `data-v8n` wired to form inputs and actions.
- **Composable patterns:** Nested sources, conditional stashing, pagination controls, and event handlers that read naturally.

**Getting Started**
1. Initialize the portal once on your page entry script:

```ts
import { Portal } from "./inflow";

new Portal({
  signInPageUrl: "/sign_in.html",
  homePageUrl: "/index.html",
  base: "https://your-store.foxycart.com/s/customer/",
});
```

2. Prevent flash-of-unstyled-content until the first render by cloaking the root:

```html
<style>
  [data-cloak] { display: none; }
  /* optional: reveal with transitions after render */
</style>
<div data-cloak>...
```

3. Use the default `data-` prefix and shorthand aliases:
- `data-text` → property binding for `textContent`.
- `data-href`/`data-value` → attribute bindings.
- `data-disabled`/`data-hidden`/`data-checked` → boolean attributes.
- `data-on-*` → event handlers; `data-on-click="someHandler"`.

**Directives Quick Reference**
- **`data-source`**: Bind a named source to the local context. Exposes `items`, `isLoading`, `isReady`, `hasFailedToLoad`, pagination (`needsPagination`, `isFirstPage`, `isLastPage`, `offset`, `returnedItems`, `totalItems`), and loaders (`loadFirstPage`, `loadPreviousPage`, `loadNextPage`, `loadLastPage`).
- **`data-if` / `data-if-not`**: Conditionally render; false branches are stashed (not destroyed) and can be restored without losing state.
- **`data-for`**: Clone the host as a template and iterate collections: `data-for="item, i in collection"`.
- **`data-action`**: Bind submit handlers to forms/buttons; exposes `.isSubmitting`, `.isIdle`, `.isFailed`, `.isDone`, `.errors`, and `.reset()`.
- **`data-v8n`**: Attach Zod validators to forms; integrates with actions so `.errors` are populated and displayed.
- **`data-on-*`**: Add event listeners; value is an expression or callable from context.
- **`data-text` / `data-prop-*`**: Set element properties from expressions.
- **`data-attr-*`**: Set string attributes; useful for dynamic `href`, `value`, etc.
- **`data-battr-*`**: Toggle boolean attributes (`disabled`, `hidden`, `checked`, etc.).
- **`data-ref`**: Register the element under a name for later programmatic access.
- **`data-cloak`**: Hide until first render; automatically removed by the cloak directive.

Formatting helpers are available via `format`: `format.currency(valueWithCode)`, `format.date(iso)`, and `format.datetime(iso)`. These default to `navigator.language` and can be used inline in expressions.

**Intermediate Patterns (Portal)**

1) Sign-in workflow with validation, auth guard, and dynamic labels

```html
<div data-cloak>
  <h1>Sign in</h1>

  <!-- Auth guard: skip form if logged in -->
  <p data-if="portal.isLoggedIn()">
    You are already logged in. <a href="/">Please visit your portal here.</a>
  </p>

  <!-- Validated form wired to action; errors rendered below -->
  <form
    data-if-not="portal.isLoggedIn()"
    data-v8n="portal.v8n.signIn"
    data-action="portal.signIn"
  >
    <label>Email:<br /><input name="email" type="email" /></label>
    <label>Password:<br /><input name="password" type="password" /></label>

    <button>
      <span data-if="portal.signIn.isSubmitting">Signing in...</span>
      <span data-if-not="portal.signIn.isSubmitting">Sign in</span>
    </button>
  </form>

  <!-- Accessible error list populated by the action/validator integration -->
  <p data-for="error in portal.signIn.errors" aria-live="polite">
    <span data-text="error.message"></span>
  </p>
  <p><a href="/reset_password">Forgot password?</a> • <a href="/create_account">Create an account</a></p>
</div>
```

Highlights:
- `data-v8n="portal.v8n.signIn"` wires Zod validation for the form fields.
- `data-action="portal.signIn"` handles submission and populates `portal.signIn.errors`.
- Labels toggle with `data-if`/`data-if-not` based on `.isSubmitting`.
- `portal.isLoggedIn()` guards the form and presents a redirect link.

2) Subscriptions with nested source, conditional states, and pagination

```html
<h2>Subscriptions</h2>
<div data-source="portal.data.subscriptions">
  <p data-if="subscriptions.isLoading">Loading...</p>
  <table data-if="subscriptions.isReady">
    <thead>
      <tr>
        <th>Start Date</th>
        <th>Next Payment</th>
        <th>End Date</th>
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
    <span>
      <span data-text="subscriptions.offset + 1"></span>
      <span>&mdash;</span>
      <span data-text="subscriptions.offset + subscriptions.returnedItems"></span>
      <span>out of</span>
      <span data-text="subscriptions.totalItems"></span>
    </span>
    <button data-disabled="subscriptions.isLastPage" data-on-click="subscriptions.loadNextPage">Next</button>
    <button data-disabled="subscriptions.isLastPage" data-on-click="subscriptions.loadLastPage">Last</button>
  </p>
</div>
```

Highlights:
- `data-source` scopes a local `subscriptions` context with status flags and pagination helpers.
- Boolean alias `data-disabled` maps to `battr-disabled` for button states.
- Use `format.date()` inline for ISO date fields.

3) Transactions with nested item loop and formatting

```html
<h2>Transactions</h2>
<div data-source="portal.data.transactions">
  <p data-if="transactions.isLoading">Loading...</p>
  <table data-if="transactions.isReady">
    <thead>
      <tr>
        <th>Amount</th>
        <th>Summary</th>
        <th>Status</th>
        <th>ID</th>
        <th>Date</th>
        <th>Receipt</th>
      </tr>
    </thead>
    <tbody>
      <tr data-for="t in transactions.items">
        <td data-text="format.currency(`${t.total_order}${t.currency_code}`)"></td>
        <td>
          <span data-for="i in t._embedded['fx:items']">
            <span data-text="i.name"></span>
            (x<span data-text="i.quantity"></span>)<br />
          </span>
        </td>
        <td data-text="t.status || 'completed'"></td>
        <td data-text="t.id"></td>
        <td data-text="format.datetime(t.transaction_date)"></td>
        <td><a target="_blank" data-href="t._links['fx:receipt'].href">View receipt</a></td>
      </tr>
    </tbody>
  </table>
  <!-- Optional: mirror pagination pattern as above -->
</div>
```

Highlights:
- Nested `data-for` iterates transaction line items within each transaction.
- Currency formatting uses a convenience helper that parses the amount+code string.
- Attribute binding via `data-href` for dynamic links.

4) Combined readiness gates and error fallbacks

```html
<div
  data-if="portal.data.settings.isReady && portal.data.customer.isReady"
>
  <!-- main dashboard ... -->
</div>

<div
  data-if="portal.data.settings.hasFailedToLoad || portal.data.customer.hasFailedToLoad"
>
  <p>Error loading data</p>
  <button data-on-click="portal.signOut">Sign out</button>
  <!-- Provide recovery action; signOut clears session and returns to sign-in -->
</div>
```

Highlights:
- Compose multiple source flags to control high-level view rendering.
- Provide clear recovery actions on failure (e.g., sign out to reset state).

5) Payment method view with conditional branches

```html
<div data-source="portal.data.defaultPaymentMethod">
  <p data-if="defaultPaymentMethod.isLoading">Loading...</p>
  <div data-if="defaultPaymentMethod.isReady">
    <p data-if="defaultPaymentMethod.save_cc">
      <span data-text="defaultPaymentMethod.cc_type"></span>
      <span data-text="defaultPaymentMethod.cc_number_masked"></span><br />
      <span>Expires: </span>
      <span data-text="defaultPaymentMethod.cc_exp_month"></span>
      <span data-text="defaultPaymentMethod.cc_exp_year"></span>
    </p>
    <p data-if-not="defaultPaymentMethod.save_cc">
      No payment method on file.<br />
      <a href="/add_payment_method">Add payment method</a>
    </p>
  </div>
</div>
```

Highlights:
- Use `data-if`/`data-if-not` for mutually exclusive branches.
- Gate the UI with `.isLoading` and `.isReady` to avoid null dereferences.

**Operational Notes**
- **Evaluation context:** Expressions run in a sandbox exposing `portal`, `format`, and any local variables introduced by `data-source` or `data-for`.
- **Debounced renders:** `Portal` triggers `update()` on state changes; rendering is debounced (~250ms) to batch updates and avoid thrashing.
- **Cached expressions:** Functions compiled from expressions are LRU-cached for speed.
- **Stashing mechanics:** Conditionals replace elements with placeholders rather than removing them; restoring preserves element state.
- **Aliases:** Shorthand aliases simplify common bindings (`text`, `href`, `value`, and booleans like `disabled`).

# Foxy Inflow

## FOXY LOGIC FUNCTIONALITY:

### Directives:

- Customer is logged in
  foxy-logic-authenticated="true"
  data-if="portal.isLoggedIn()"

- Customer is logged out
  foxy-logic-authenticated="false"
  data-if-not="portal.isLoggedIn()"

- Customer has an active subscription
  foxy-logic-subscribed="true"
  data-if="portal.data.activeSubscriptions.hasItems" (using implicit data-source here and below)

- Customer does not have an active subscription
  foxy-logic-subscribed="false"
  data-if-not="portal.data.activeSubscriptions.hasItems"

- Customer has a past due invoice
  foxy-logic-subscriber-past-due="true"
  data-if="portal.data.pastDueSubscriptions.hasItems"

- Customer does not have a past due invoice
  foxy-logic-subscriber-past-due="false"
  data-if-not="portal.data.pastDueSubscriptions.hasItems"

- Customer has an active subscription for a specific plan/membership
  foxy-logic-subscribed-to="SKU"
  data-if="portal.data.activeSubscriptionsBySku("MY-SKU").hasItems" (important: when using multiple SKUs with explicit data-source, remember to specify a unique context key as a second parameter)

- Customer does not have an active subscription for a specific plan/membership
  foxy-logic-not-subscribed-to="SKU"
  data-if-not="portal.data.activeSubscriptionsBySku("MY-SKU").hasItems"

- Customer has purchased a specific product
  foxy-logic-transaction-includes="SKU"
  data-if="portal.data.transactionsBySku("MY-SKU").hasItems"

- Customer has not purchased a specific product
  foxy-logic-transaction-not-includes="SKU"
  data-if-not="portal.data.transactionsBySku("MY-SKU").hasItems"

- Customer has specific attribute
  foxy-logic-customer-attribute-includes="MY-NAME"
  data-if="portal.data.customerAttributesByName("MY-NAME").hasItems"

- Customer does not have specific attribute
  foxy-logic-customer-attribute-not-includes="MY-NAME"
  data-if-not="portal.data.customerAttributesByName("MY-NAME").hasItems"

- Logout action
  foxy-logic-action="logout"
  data-on-click="portal.signOut()"

- Redirect on login:
  https://yoursite.com/login?redirect=/products/product-example-page
  { portalPageUrl: "/products/product-example-page" }

- Render API resource field
  foxy-logic-display="customer-first-name"
  data-text="portal.data.customer.first_name"

### CONFIG:

- protectedPath – use { signInPageUrl } in config + data-source="portal.data.customer" on the page with protected content
- loginOrSignupPath – use { signInPageUrl } in config
- onLogInPath – use { portalPageUrl } in config
- useLatestTransactionOnly – use custom urls in data-source
- ignoreSubscriptionsWithPastDue – use custom urls in data-source
- removeElementsFromPage – use data-if to remove, data-prop-hidden to hide
