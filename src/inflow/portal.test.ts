import { InflowPortal } from "./portal";

const BASE_A = "https://store-a.example.com/s/customer/";

function portal(base: string) {
  return new InflowPortal({
    base,
    signInPageUrl: "/sign_in.html",
    homePageUrl: "/index.html",
    manualRender: true,
  });
}

function isLoggedIn(instance: InflowPortal) {
  const api = instance.globalContext.portal as { isLoggedIn: () => boolean };
  return api.isLoggedIn();
}

// Cookie mode keeps the session in `fx.customer` rather than in storage, so
// these tests need a portal configured for it. The page URLs are fragments so
// that the post-sign-in redirect is a hash change: jsdom refuses real
// navigation and would log an error for any other URL.
function cookiePortal() {
  return new InflowPortal({
    base: BASE_A,
    signInPageUrl: "#sign-in",
    homePageUrl: "#home",
    storage: "cookie",
    manualRender: true,
  });
}

function readCookie(name: string) {
  const match = document.cookie.match(new RegExp(`${name.replace(".", "\\.")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Drives a real sign-in through the action directive, with only the network
// stubbed: the form is submitted, so the whole pipeline runs.
async function signIn(instance: InflowPortal, response: Record<string, unknown>) {
  document.body.innerHTML = `
    <form data-action="portal.signIn">
      <input name="email" value="customer@example.com" />
      <input name="password" value="secret" />
    </form>
  `;

  instance.render();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    ({ ok: true, json: async () => response }) as unknown as Response;

  try {
    document.querySelector("form")!.dispatchEvent(new SubmitEvent("submit"));
    await vi.waitFor(() => expect(globalThis.fetch).toBeDefined());
    // The action's fetch chain is not awaited by the submit handler, so let the
    // queued microtasks settle before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("InflowPortal session storage", () => {
  afterEach(() => {
    localStorage.clear();
    document.cookie = "fx.customer=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    document.body.innerHTML = "";
  });

  it("reads the session token from the store's own namespace", () => {
    localStorage.setItem(
      `inflow:${BASE_A}:session`,
      JSON.stringify({ session_token: "token-a" })
    );

    expect(isLoggedIn(portal(BASE_A))).toBe(true);
  });

  // The token used to live under a bare `session` key shared by every portal on
  // the domain, so one store could pick up another's token. Nothing outside the
  // namespace counts as a session any more.
  it("ignores a session token written outside its namespace", () => {
    localStorage.setItem("session", JSON.stringify({ session_token: "token-a" }));

    expect(isLoggedIn(portal(BASE_A))).toBe(false);
  });

  // Cookie mode used to write `session.token`, a field the authenticate
  // response does not have, so the cookie held the string "undefined" and every
  // request went out as `Bearer undefined`.
  it("stores the session token in the fx.customer cookie", async () => {
    const instance = cookiePortal();

    await signIn(instance, { session_token: "token-a", expires_in: 3600, jwt: "jwt-a" });

    expect(readCookie("fx.customer")).toBe("token-a");
  });

  it("does not treat a response without a session token as a session", async () => {
    const onError = vi.spyOn(console, "error").mockImplementation(() => void 0);
    const instance = cookiePortal();

    try {
      await signIn(instance, { expires_in: 3600 });

      expect(readCookie("fx.customer")).toBe(null);
      expect(isLoggedIn(instance)).toBe(false);
      expect(onError).toHaveBeenCalled();
    } finally {
      onError.mockRestore();
    }
  });

  // Anyone who signed in before the fix still carries `fx.customer=undefined`,
  // which is a non-empty string and so read as a valid session: the portal
  // renders as signed in while every request is rejected.
  it("ignores a cookie left over from the broken write", () => {
    document.cookie = "fx.customer=undefined; path=/";

    expect(isLoggedIn(cookiePortal())).toBe(false);
  });
});

// Every default message is looked up as `<group>.<field>.<zod_issue_code>`, and
// a missing key falls through to the raw code — so a key naming a code zod never
// emits is invisible until a customer sees `too_big` in the form. These tests
// walk `defaultTranslations` itself: every key must be reachable by some input,
// which is what stops a rename or a new key from going out unreachable again.
describe("InflowPortal default validation messages", () => {
  // Valid email shape, 101 characters — long enough for `too_big` without
  // tripping the format check first, which would report `invalid_string`.
  const LONG_EMAIL = `${"a".repeat(95)}@b.com`;

  const groups: Record<string, string> = {
    sign_in: "signIn",
    sign_up: "createAccount",
    reset_password: "resetPassword",
  };

  // The input that makes a given field report a given code.
  function input(field: string, code: string) {
    if (code === "too_small") return "";
    if (code === "invalid_string") return "nope";
    return field === "email" ? LONG_EMAIL : "x".repeat(51);
  }

  const keys = Object.keys(InflowPortal.defaultTranslations);

  it.each(keys)("resolves %s to a message rather than the raw code", (key) => {
    const [group, field, code] = key.split(".");
    const { v8n } = portal(BASE_A).globalContext.portal as {
      v8n: Record<string, Record<string, (value: string) => string>>;
    };

    const validate = v8n[groups[group]][field];
    expect(validate).toBeTypeOf("function");
    expect(validate(input(field, code))).toBe(
      InflowPortal.defaultTranslations[key as keyof typeof InflowPortal.defaultTranslations]
    );
  });

  // zod 3 emits `too_small`, `too_big` and `invalid_string`. The defaults used to
  // be keyed `too_long` and `invalid`, which it never emits.
  it("keys every default with a code zod actually emits", () => {
    const codes = keys.map((key) => key.split(".")[2]);
    expect([...new Set(codes)].sort()).toEqual(["invalid_string", "too_big", "too_small"]);
  });
});
