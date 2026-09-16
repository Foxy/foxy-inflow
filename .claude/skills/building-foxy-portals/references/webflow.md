# Authoring Inflow markup in Webflow

Webflow rewrites markup at publish time, which collides with Inflow in one specific place and changes how you should author the rest.

## Never author a real `<form>`

Webflow rewrites anything form-shaped at publish time, whichever API you use:

| What you build                            | What publishes                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `<form>` via the WHTML builder            | a Webflow `FormForm`; a `<button>` inside it becomes `<a href="#" class="w-button">` — no submit control at all     |
| `BY_CUSTOM_TAG` with `custom_tag: "form"` | a full `FormWrapper` with default Name/Email fields and success/error blocks                                        |
| `type: "DOM"` + `dom_tag: "form"`         | reports `tag: form` at design time, publishes as `<div class="w-form">` with Webflow's own `<form>` injected inside |

Its form runtime then breaks Inflow two ways. Spam protection holds the submit button `disabled` from page load — measured over 10 seconds with trusted input, it never clears — so `data-action` never fires. And a `cf-turnstile-response` field lands in `form.elements`, so the action posts it to the Customer API along with your fields.

**Use `data-as`.** `<div data-as="form">` publishes as a plain div, because Webflow has nothing to own in a div, and Inflow turns it into a real `<form>` at render. Same for `data-as="input"` and `data-as="button"`. Verified on a published page: zero `w-form`, `turnstile`, `w-input` or `w-button`, and the POST body is exactly the fields you declared.

An HTML Embed also publishes markup verbatim and works on the free Starter plan, but it gives up visual editing, which defeats the point of using a builder.

## Author for the canvas as well as for render

A merchant picked Webflow to _see_ the page. Markup that only makes sense after Inflow runs defeats that.

- **Static copy belongs in the element, not in `data-text`.** `data-text="'Start date'"` renders nothing on the canvas and cannot be edited by the person whose job that is. Reserve `data-text` for values that come from data.
- **A bound element still needs placeholder text.** Put something shaped like the real value in the element — `$20.00`, `6/24/2024`, `Visa •••• 4242` — and keep the binding in settings. Inflow overwrites it at render, and until then the canvas shows a page worth styling.
- **Any element a human should edit must be a Text Block.** A Div Block cannot hold text at all, so a `data-as="th"` on one leaves an empty cell with its words hidden in an attribute. There is no way to add text to a Div Block afterwards — you recreate the element.
- **`data-as` leaves the canvas showing the untransformed markup**, so a table built from divs stacks into one column in the Designer. Fix it with CSS rather than markup: `display: table` on the wrapper, `table-row-group` on the thead/tbody divs, `table-row` on the rows, `table-cell` on the cells. Those are the values real table elements use natively, so nothing shifts when `data-as` swaps the tags.

To see the canvas's view without opening the Designer, fetch the published page, strip every `<script>`, and render the result. No script means no `data-as`.

## A `data-as` custom element hides its placeholder for free

`as.ts` moves the host's children into the replacement element. For a custom element that renders into a shadow root with no `<slot>` — `foxy-payment-card-embed` is one — those light-DOM children stay in the DOM but lay out at 0x0. A placeholder inside `<div data-as="foxy-payment-card-embed">` is therefore visible to whoever designs the page and invisible to the customer, with no extra CSS. Measure it with `getBoundingClientRect()` before relying on it: an element that does slot its children shows both.

## When a publish looks like it did nothing

Published pages are CDN-cached for minutes. A plain fetch can return the previous version, which reads exactly like a publish that silently failed. Add a cache-busting query string before concluding anything is broken.
