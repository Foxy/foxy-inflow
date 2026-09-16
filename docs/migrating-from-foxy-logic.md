# Migrating from Foxy Logic

How each `foxy-logic-*` attribute maps onto Inflow.

The shapes differ. Foxy Logic gives you a fixed set of named conditions; Inflow gives you expressions over loaded data. So most attributes become a `data-if` on a source, and anything Foxy Logic did not cover is now expressible without a new attribute.

- [Conditions](#conditions)
- [Actions and display](#actions-and-display)
- [Configuration](#configuration)
- [What is not supported](#what-is-not-supported)

## Conditions

Every row below reads a data source. Where the equivalent is a plain expression, no `data-source` attribute is needed — reading the source starts the request. See [Two ways to read a source](data-sources.md#two-ways-to-read-a-source).

| Foxy Logic                                          | Inflow                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `foxy-logic-authenticated="true"`                   | `data-if="portal.isLoggedIn()"`                                       |
| `foxy-logic-authenticated="false"`                  | `data-if-not="portal.isLoggedIn()"`                                   |
| `foxy-logic-subscribed="true"`                      | `data-if="portal.data.activeSubscriptions.hasItems"`                  |
| `foxy-logic-subscribed="false"`                     | `data-if-not="portal.data.activeSubscriptions.hasItems"`              |
| `foxy-logic-subscriber-past-due="true"`             | `data-if="portal.data.pastDueSubscriptions.hasItems"`                 |
| `foxy-logic-subscriber-past-due="false"`            | `data-if-not="portal.data.pastDueSubscriptions.hasItems"`             |
| `foxy-logic-subscribed-to="SKU"`                    | `data-if="portal.data.activeSubscriptionsBySku('SKU').hasItems"`      |
| `foxy-logic-not-subscribed-to="SKU"`                | `data-if-not="portal.data.activeSubscriptionsBySku('SKU').hasItems"`  |
| `foxy-logic-transaction-includes="SKU"`             | `data-if="portal.data.transactionsBySku('SKU').hasItems"`             |
| `foxy-logic-transaction-not-includes="SKU"`         | `data-if-not="portal.data.transactionsBySku('SKU').hasItems"`         |
| `foxy-logic-customer-attribute-includes="NAME"`     | `data-if="portal.data.customerAttributesByName('NAME').hasItems"`     |
| `foxy-logic-customer-attribute-not-includes="NAME"` | `data-if-not="portal.data.customerAttributesByName('NAME').hasItems"` |

### Using more than one SKU on a page

The three function-style sources take an optional second argument: the name their result binds to. It defaults to the function's own name, so two calls without it collide — the second overwrites the first.

Give each one its own key:

```html
<div data-source="portal.data.activeSubscriptionsBySku('PLAN-BASIC', 'basic')">
  <p data-if="basic.hasItems">You are on the basic plan.</p>
</div>

<div data-source="portal.data.activeSubscriptionsBySku('PLAN-PRO', 'pro')">
  <p data-if="pro.hasItems">You are on the pro plan.</p>
</div>
```

This applies to `activeSubscriptionsBySku`, `transactionsBySku` and `customerAttributesByName`.

## Actions and display

| Foxy Logic                                 | Inflow                                        |
| ------------------------------------------ | --------------------------------------------- |
| `foxy-logic-action="logout"`               | `data-on-click="portal.signOut"`              |
| `foxy-logic-display="customer-first-name"` | `data-text="portal.data.customer.first_name"` |

`foxy-logic-display` had one name per field. `data-text` takes any expression, so any API field works — and so does anything you can compute from one:

```html
<span data-text="portal.data.customer.first_name"></span>
<span
  data-text="portal.data.customer.first_name + ' ' + portal.data.customer.last_name"
></span>
```

## Configuration

| Foxy Logic                       | Inflow                                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protectedPath`                  | `signInPageUrl`, plus reading a source on the protected page — loading it is the guard. See [Guarding a page](building-a-portal.md#2-guarding-a-page)                              |
| `loginOrSignupPath`              | `signInPageUrl`                                                                                                                                                                    |
| `onLogInPath`                    | `homePageUrl`, as the fallback — a customer sent to the sign-in page by the guard returns to the page they wanted instead. See [Returning after sign-in](#returning-after-sign-in) |
| `useLatestTransactionOnly`       | a custom source with your own query — see [Your own data sources](extending.md#your-own-data-sources)                                                                              |
| `ignoreSubscriptionsWithPastDue` | a custom source with your own query                                                                                                                                                |
| `removeElementsFromPage`         | `data-if` to remove the element, or `data-hidden` to keep it in the DOM but hidden                                                                                                 |

`removeElementsFromPage` splits into two options because the distinction matters in Inflow: `data-if` takes the element out of the document, while `data-hidden` leaves it there with the `hidden` attribute set. Removed elements are stashed rather than destroyed, so their state survives — see [`data-if`](directives.md#data-if--data-if-not).

## Returning after sign-in

Foxy Logic could send a customer back where they came from, and Inflow does the
same. When the guard sends a visitor to your `signInPageUrl`, it adds the page
they were trying to reach as a `redirect` parameter, and signing in — or
creating an account — returns them there. `homePageUrl` is the fallback for
when there is nothing to return to.

There is nothing to configure and no markup to write. Inflow only follows a
`redirect` that resolves to the page's own origin; anything else falls back to
`homePageUrl`. See [Returning after sign-in](configuration.md#returning-after-sign-in)
for what that check covers and why it is there.

If you have seen a `portalPageUrl` option mentioned, it never existed — an old
README documented a key that was never implemented. There is no key to set:
return-after-login is the default behaviour.
