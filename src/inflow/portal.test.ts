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
