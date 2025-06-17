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
