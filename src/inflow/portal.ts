import inflow from ".";

import sourceDirective from "./directives/source";
import cloakDirective from "./directives/cloak";
import battrDirective from "./directives/battr";
import propDirective from "./directives/prop";
import attrDirective from "./directives/attr";
import v8nDirective from "./directives/v8n";
import refDirective from "./directives/ref";
import forDirective from "./directives/for";
import ifDirective from "./directives/if";
import onDirective from "./directives/on";

import formatPlugin from "./plugins/format";
import portalPlugin from "./plugins/portal";

type InflowPortalOptions = {
  base: string;
  storage: "cookie" | "local";
  homePageUrl: string;
  signInPageUrl: string;
  directivePrefix?: string;
};

export function inflowPortal({
  base,
  storage,
  homePageUrl: portalPageUrl,
  signInPageUrl,
  directivePrefix,
}: InflowPortalOptions) {
  function getToken() {
    if (storage === "cookie") {
      const match = document.cookie.match(/fx\.customer=([^;]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    }

    try {
      const session = localStorage.getItem("session") as string;
      return JSON.parse(session)?.session_token ?? null;
    } catch {
      return null;
    }
  }

  function setSession(session: Record<string, string>) {
    if (storage === "cookie") {
      document.cookie = `fx.customer=${encodeURIComponent(
        session.token
      )}; path=/`;
    } else {
      localStorage.setItem("session", JSON.stringify(session));
    }
  }

  function removeToken() {
    if (storage === "cookie") {
      document.cookie =
        "fx.customer=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    } else {
      localStorage.removeItem("session");
    }
  }

  const project = inflow(base, directivePrefix);

  // Order of directives is important for correct rendering

  project.directive("cloak", cloakDirective);

  project.directive("ref", refDirective);

  project.directive("source", sourceDirective, {
    getToken,
    onTokenExpiry: () => {
      removeToken();
      const redirectTo = new URL(signInPageUrl, location.origin).toString();
      if (location.href !== redirectTo) location.href = signInPageUrl;
    },
  });

  project.directive("if", ifDirective);
  project.directive("if-not", {
    render: (ctx) => {
      return ifDirective.render?.({
        ...ctx,
        value: `!(${ctx.value})`,
        name: "if",
      });
    },
  });

  project.directive("for", forDirective);

  project.directive(/^prop\-.+$/, propDirective);

  for (const [alias, name] of Object.entries({
    text: "prop-textcontent",
  })) {
    project.directive(alias, {
      render: (ctx) => propDirective.render?.({ ...ctx, name }),
    });
  }

  project.directive(/^attr\-.+$/, attrDirective);

  for (const [alias, name] of Object.entries({
    value: "attr-value",
    href: "attr-href",
  })) {
    project.directive(alias, {
      render: (ctx) => attrDirective.render?.({ ...ctx, name }),
    });
  }

  project.directive(/^battr\-.+$/, battrDirective);

  for (const [alias, name] of Object.entries({
    disabled: "battr-disabled",
    readonly: "battr-readonly",
    hidden: "battr-hidden",
    checked: "battr-checked",
    selected: "battr-selected",
    required: "battr-required",
    open: "battr-open",
  })) {
    project.directive(alias, {
      render: (ctx) => battrDirective.render?.({ ...ctx, name }),
    });
  }

  project.directive(/^on\-.+$/, onDirective);

  project.directive("v8n", v8nDirective);

  project.plugin("format", formatPlugin);
  project.plugin("portal", portalPlugin, {
    portalPageUrl,
    signInPageUrl,
    storage,
    getToken,
    setSession,
    removeToken,
  });

  return project;
}
