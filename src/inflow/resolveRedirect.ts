/**
 * Picks where to send a customer after they sign in.
 *
 * The `redirect` value arrives in the query string of the sign-in page, so it
 * is attacker-controlled: anyone can hand a customer a sign-in link carrying
 * any destination. Without an origin check that turns the sign-in page into an
 * open redirect, which is the standard way this feature goes wrong.
 *
 * Anything that does not resolve to the current origin — another host, a
 * protocol-relative `//host` reference, a `javascript:` URL, an unparseable
 * string — falls back to `fallbackUrl`, and so does the sign-in page itself,
 * which would otherwise loop the customer back to the form they just
 * completed.
 *
 * The return value is an absolute URL rather than the candidate that came in,
 * so the string that was validated is the string the caller navigates to.
 * Validating one form and assigning another is the second way this feature
 * goes wrong.
 */
export function resolveRedirect(options: {
  candidate: string | null;
  fallbackUrl: string;
  signInPageUrl: string;
}): string {
  const { candidate, fallbackUrl, signInPageUrl } = options;

  if (!candidate) return fallbackUrl;

  let target: URL;

  try {
    target = new URL(candidate, location.href);
  } catch {
    return fallbackUrl;
  }

  if (target.origin !== location.origin) return fallbackUrl;

  const signInPage = new URL(signInPageUrl, location.href);
  if (target.pathname === signInPage.pathname) return fallbackUrl;

  return target.toString();
}
