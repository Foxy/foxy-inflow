# Driving a live page, and what the store refuses

## Measuring a live page from a browser

- **Synthetic `.value =` does not revalidate.** `data-v8n` re-runs on `input` and `change`, so set values by dispatching those events or the field keeps stale validity and the form refuses to submit. This cost an hour of chasing a bug that was not there.
- **Dispatching `submit` navigates** and kills the JS context mid-script. Store findings in `sessionStorage` and read them after the reload, or measure without submitting.
- **Native interactive validation blocks the submit event entirely.** If a form has invalid fields, clicking submit fires `invalid` and never fires `submit`, so handler-level code never runs. Measure which events actually fire before concluding a handler is broken.
- **Console readers can return stale entries** from a previously loaded page. Trust network requests and DOM state over console output.

## A hidden input cannot be validated

The HTML spec bars `input[type=hidden]` from constraint validation. `setCustomValidity` on one does not block submit and its `validationMessage` reads `""`. A form whose only named control is hidden — a payment form carrying just `cc_token`, for instance — gets nothing from `data-v8n` at all. The real guard is the code that checks the token before sending.

## Changing a subscription date is gated by the store

Foxy's own `foxy-subscription-form` never lets the customer type a date: it renders a calendar whose selectable days come from `getNextTransactionDateConstraints()` in `@foxy.io/sdk/customer`, computed from `customer_portal_settings.subscriptions.allow_next_date_modification` (`min`, `max`, `allowed_days`, `disallowed_dates`, matched by `jsonata_query`). Inflow has no equivalent, so a plain date input offers dates the API then refuses with:

> `<date> can't be set as next transaction date. Please refer to customer portal settings for more info.`

That message is the store talking, not a bug. A rule of `{"jsonata_query": "*", "min": ""}` refused every date tried across three months.

## A date field carries two formats

`YYYY-MM-DD` when an `<input type="date">` owns it; an offset datetime like `2026-09-24T00:00:00-07:00` when the value came straight from the Customer API. Any validator on such a field sees both, so match them with a regex. `z.string().datetime()` admits only UTC datetimes ending in `Z` and rejects both, which makes the form unsubmittable from first paint while it holds the value the API just sent.

## The shared card embed cannot save a card to a real store

`https://embed.foxy.io/v1.html?demo=default` is the demo tokenizer. It renders, accepts a test card and returns a token, and the PATCH is well-formed:

```
PATCH /s/customer/default_payment_method
{"cc_token":"<token>"}
→ 400 {"_embedded":{"fx:errors":[{"logref":"unavailable","message":"Bad Request"}]}}
```

The message is the bare string `Bad Request`, which names nothing. Point the embed at the store's own tokenization URL before concluding anything is broken — `customer_portal_settings` does not carry it, so it has to come from the store's configuration.
