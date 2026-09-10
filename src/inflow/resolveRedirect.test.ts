import { resolveRedirect } from "./resolveRedirect";

const FALLBACK = "/index.html";
const SIGN_IN = "/sign_in.html";

function resolve(candidate: string | null) {
  return resolveRedirect({
    candidate,
    fallbackUrl: FALLBACK,
    signInPageUrl: SIGN_IN,
  });
}

// The `redirect` parameter is attacker-controlled: it arrives in the URL of the
// sign-in page, so anyone can hand a customer a link carrying any value they
// like. Every value that does not resolve to this origin has to end up on
// `fallbackUrl` instead, or the sign-in page becomes an open redirect.
describe("resolveRedirect", () => {
  it("accepts a same-origin path", () => {
    expect(resolve("/account")).toBe(`${location.origin}/account`);
  });

  it("accepts a same-origin absolute URL", () => {
    expect(resolve(`${location.origin}/account`)).toBe(`${location.origin}/account`);
  });

  // The caller assigns whatever comes back to `location.href`. Returning an
  // absolute URL rather than the candidate is what keeps the string that was
  // validated and the string that is navigated to the same one.
  it("returns an absolute URL rather than the candidate", () => {
    expect(resolve("account.html")).toBe(`${location.origin}/account.html`);
  });

  it("rejects another origin", () => {
    expect(resolve("https://evil.example.com/account")).toBe(FALLBACK);
  });

  // `//evil.example.com` is protocol-relative: it looks like a path but the URL
  // parser resolves it to another host.
  it("rejects a protocol-relative URL", () => {
    expect(resolve("//evil.example.com/account")).toBe(FALLBACK);
  });

  it("rejects a javascript: URL", () => {
    expect(resolve("javascript:alert(1)")).toBe(FALLBACK);
  });

  // A backslash is normalised to a forward slash for http(s) URLs, so this
  // resolves to the host `evil.example.com` despite reading as a path.
  it("rejects a backslash path that resolves off-origin", () => {
    expect(resolve("/\\evil.example.com/account")).toBe(FALLBACK);
  });

  it("falls back when there is no candidate", () => {
    expect(resolve(null)).toBe(FALLBACK);
  });

  it("falls back on an empty candidate", () => {
    expect(resolve("")).toBe(FALLBACK);
  });

  // Sending the customer back to the sign-in page after signing in would loop
  // them straight back to the form they just completed.
  it("rejects the sign-in page as a destination", () => {
    expect(resolve("/sign_in.html")).toBe(FALLBACK);
  });

  it("rejects the sign-in page carrying its own redirect parameter", () => {
    expect(resolve("/sign_in.html?redirect=%2Faccount")).toBe(FALLBACK);
  });
});
