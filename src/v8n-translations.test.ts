import { InflowPortal } from "./portal";

/**
 * Every validator falls back to the raw zod code when no translation exists
 * for it — `translations[key] || error`. That fallback is a debugging aid, not
 * copy: a customer who empties their first name on the profile page was shown
 * the literal string "too_small".
 *
 * Rather than list the codes each schema can emit and go stale the moment a
 * schema changes, probe every validator with values chosen to break it and
 * assert that nothing it returns is a bare code.
 */
// Strings only, because that is all a validator ever receives: `data-v8n`
// reads `input.value`. Probing with other types reports `invalid_type` for
// every field on the portal and would tempt whoever fixes it into adding keys
// no customer can reach — the mistake this codebase already made once with
// `too_long` and `invalid`.
const PROBES = [
  "",
  " ",
  "x",
  "x".repeat(200),
  "not-an-email",
  `${"a".repeat(95)}@example.com`,
  "2020-13-45",
  "zz",
];

// A real message is a sentence. A zod code is a bare lower_snake token.
const looksLikeACode = (value: string) => /^[a-z][a-z0-9_]*$/.test(value);

function validators() {
  const portal = new InflowPortal({
    base: "https://store.example.com/s/customer/",
    signInPageUrl: "/sign_in.html",
    homePageUrl: "/index.html",
    manualRender: true,
  });

  return (
    portal.globalContext.portal as {
      v8n: Record<string, Record<string, (value: never) => string>>;
    }
  ).v8n;
}

describe("bundled validator messages", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("never surfaces a raw zod code to the customer", () => {
    const leaked: string[] = [];

    Object.entries(validators()).forEach(([group, fields]) => {
      Object.entries(fields).forEach(([field, validate]) => {
        PROBES.forEach((probe) => {
          const message = validate(probe as never);
          if (message && looksLikeACode(message)) {
            leaked.push(
              `${group}.${field} returned "${message}" for ${JSON.stringify(probe)}`,
            );
          }
        });
      });
    });

    expect(leaked).toEqual([]);
  });
});
