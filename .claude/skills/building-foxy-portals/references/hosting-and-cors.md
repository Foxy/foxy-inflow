# Hosting the bundle, and the Customer API's CORS

## The store has to know your origin

Foxy's Customer API answers CORS per origin. An origin that is not on the store's allow-list gets **200 with no `access-control-allow-origin` header**, so the browser rejects the response and the page shows a silent failure with no useful console message. Add every origin you will test from — staging, preview URLs, tunnels — in the Foxy admin under Customer Portal settings before anything else.

Probe it without a browser:

```
curl -s -D - -o /dev/null -X OPTIONS https://<store>.foxycart.com/s/customer/authenticate \
  -H "Origin: <origin>" -H "Access-Control-Request-Method: POST"
```

A 204 echoing your origin back means allowed. A 200 with no ACAO header means blocked.

Local dev origins are often already allowed without being configured, which makes local work deceptively smooth and the first deploy a surprise.

## Getting the bundle onto a hosted page

Use the published CDN build: `https://cdn-js.foxy.io/inflow@1/index.js`, with `portal.js` and `core.js` beside it. `@1` tracks the latest 1.x, so a page pinned to it never needs re-hosting. Only serve `dist/cdn` yourself when you are testing a change that is not released yet, and then two things matter:

- `index.js` is **not** self-contained. It does `from "./core.js"`. Both files must sit at the same URL path — copying one file somewhere fails at runtime.
- Serve with `access-control-allow-origin: *` and a `text/javascript` content type, or the module import is rejected cross-origin.

## A tunnel URL is a single point of failure

A quick tunnel's URL dies with the tunnel, and the whole portal dies with it. A bootstrap script hardcodes that URL, so every page on the site breaks with `Failed to fetch dynamically imported module` the next day. Check the console for that error before debugging anything else. The fix is to point the bootstrap at the CDN build instead. A tunnel is only worth it for a bundle that is not published yet, and then only until you publish one.

A Cloudflare quick tunnel over a local static server works well. Two traps:

- Some DNS resolvers blocklist `*.trycloudflare.com`. One resolver NXDOMAIN'd every subdomain while resolving the apex fine.
- Chrome blocks a public https page from fetching `http://localhost`, so "just point it at localhost" is not an option.
