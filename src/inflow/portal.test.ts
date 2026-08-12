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

describe("InflowPortal session storage", () => {
  afterEach(() => {
    localStorage.clear();
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
});
