import { InflowCore } from "./core";
import { z } from "zod";

export type InflowPortalConfig = {
  prefix?: string;
  signInPageUrl: string;
  homePageUrl: string;
  storage?: "cookie" | "local";
  base: string;
  root?: ChildNode;
  manualRender?: boolean;
  v8nTranslations?: Record<string, string>;
};

export class InflowPortal extends InflowCore {
  static defaultTranslations = {
    "sign_in.password.too_long": "Password must not be longer than 50 characters.",
    "sign_in.password.too_small": "Password is required.",
    "sign_in.email.too_long": "Email must not be longer than 100 characters.",
    "sign_in.email.invalid": "Email is invalid.",
    "sign_in.email.too_small": "Email is required.",
    "reset_password.email.too_long": "Email must not be longer than 100 characters.",
    "reset_password.email.invalid": "Email is invalid.",
    "reset_password.email.too_small": "Email is required.",
    "sign_up.first_name.too_long": "First name must not be longer than 50 characters.",
    "sign_up.first_name.too_small": "First name is required.",
    "sign_up.last_name.too_long": "Last name must not be longer than 50 characters.",
    "sign_up.last_name.too_small": "Last name is required.",
    "sign_up.email.too_long": "Email must not be longer than 100 characters.",
    "sign_up.email.invalid": "Email is invalid.",
    "sign_up.email.too_small": "Email is required.",
    "sign_up.password.too_long": "Password must not be longer than 50 characters.",
    "sign_up.password.too_small": "Password is required.",
  };

  #storage: "cookie" | "local";

  constructor(config: InflowPortalConfig) {
    super({
      ...config,
      getToken: () => this.#getToken(),
      onTokenExpiry: () => {
        this.#removeToken();
        const redirectTo = new URL(config.signInPageUrl, location.origin).toString();
        if (location.href !== redirectTo) location.href = config.signInPageUrl;
      },
    });

    this.#storage = config.storage ?? "local";

    const translations: Record<string, string> = {
      ...InflowPortal.defaultTranslations,
      ...config.v8nTranslations,
    };

    this.globalContext.portal = {
      isLoggedIn: () => !!this.#getToken(),

      signOut: () => {
        this.storage.clear();
        this.#removeToken();
        location.href = config.signInPageUrl;
      },

      signIn: this.createAction({
        path: "authenticate",
        v8n: {
          "data.password should NOT be longer than 50 characters": "sign_in.password.too_long",
          "data.password should be string": "sign_in.password.too_small",
          "data.email should NOT be longer than 100 characters": "sign_in.email.too_long",
          'data.email should match format "email"': "sign_in.email.invalid",
          "data.email should be string": "sign_in.email.too_small",
        },
        onSuccess: (data) => {
          this.#setSession(data);
          location.href = config.homePageUrl;
        },
      }),

      resetPassword: this.createAction({
        path: "forgot_password",
        v8n: {
          "data.email should NOT be longer than 100 characters": "reset_password_email.too_long",
          'data.email should match format "email"': "reset_password_invalid",
          "data.email should be string": "reset_password_too_small",
        },
      }),

      createCcToken: (resource: { patch: (evt: SubmitEvent) => void }) => (evt: SubmitEvent) => {
        const form = evt.currentTarget as HTMLFormElement;
        const data = new FormData(form);
        const ccToken = data.get("cc_token");

        if (ccToken) {
          resource.patch(evt);
        } else {
          evt.preventDefault();

          type EmbedElement = HTMLElement & { tokenize: () => Promise<string> };
          const paymentCardEmbed = form.querySelector<EmbedElement>("foxy-payment-card-embed");

          paymentCardEmbed
            ?.tokenize()
            .then((cardToken) => {
              const ccTokenInput = form.querySelector<HTMLInputElement>('input[name="cc_token"]');

              if (ccTokenInput) {
                ccTokenInput.value = cardToken;
                form.dispatchEvent(new SubmitEvent("submit", { submitter: evt.submitter }));
              } else {
                console.error("CC Token input not found in the form.");
              }
            })
            .catch(() => {
              console.error("Card tokenization failed.");
            });
        }
      },

      createAccount: this.createAction({
        path: "sign_up",
        v8n: {
          "data.first_name should NOT be longer than 50 characters": "sign_up.first_name.too_long",
          "data.first_name should be string": "sign_up.first_name.too_small",
          "data.last_name should NOT be longer than 50 characters": "sign_up.last_name.too_long",
          "data.last_name should be string": "sign_up.last_name.too_small",
          "data.email should NOT be longer than 100 characters": "sign_up.email.too_long",
          'data.email should match format "email"': "sign_up.email.invalid",
          "data.email should be string": "sign_up.email.too_small",
          "data.password should NOT be longer than 50 characters": "sign_up.password_too_long",
          "data.password should be string": "sign_up.password_too_small",
        },
        jsonFields: ["verification"],
        onSuccess: (data) => {
          this.#setSession(data);
          location.href = config.homePageUrl;
        },
        onSubmit: async (form, data) => {
          type HCaptchaElement = HTMLElement & {
            clear: () => void;
            execute: () => void;
          };

          const hCaptcha = form.querySelector<HCaptchaElement>("h-captcha");

          if (hCaptcha) {
            hCaptcha.clear();
            hCaptcha.addEventListener(
              "verified",
              (evt1) => {
                data.set(
                  "verification",
                  JSON.stringify({
                    type: "hcaptcha",
                    token: (evt1 as Event & { token: string }).token,
                  })
                );
              },
              { once: true }
            );
            hCaptcha.execute();
          } else {
            throw new Error("HCaptcha element not found in the form.");
          }
        },
      }),

      v8n: {
        signIn: {
          email: (value: string) => {
            const result = z.string().email().min(1).max(100).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`sign_in.email.${error}`] || error : "";
          },
          password: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`sign_in.password.${error}`] || error : "";
          },
        },
        createAccount: {
          first_name: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`sign_up.first_name.${error}`] || error : "";
          },
          last_name: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`sign_up.last_name.${error}`] || error : "";
          },
          email: (value: string) => {
            const result = z.string().email().min(1).max(100).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`sign_up.email.${error}`] || error : "";
          },
          password: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`sign_up.password.${error}`] || error : "";
          },
          password_old: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`sign_up.password_old.${error}`] || error : "";
          },
        },
        resetPassword: {
          email: (value: string) => {
            const result = z.string().email().min(1).max(200).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`reset_password.${error}`] || error : "";
          },
        },
        customer: {
          first_name: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.first_name.${error}`] || error : "";
          },
          last_name: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.last_name.${error}`] || error : "";
          },
          tax_id: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.tax_id.${error}`] || error : "";
          },
          email: (value: string) => {
            const result = z.string().email().min(1).max(100).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.email.${error}`] || error : "";
          },
          password: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.password.${error}`] || error : "";
          },
          password_old: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.password_old.${error}`] || error : "";
          },
        },
        defaultPaymentMethod: {
          cc_token: (value: string) => {
            const result = z.string().min(1).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`default_payment_method.cc_token.${error}`] || error : "";
          },
          save_cc: (value: boolean) => {
            const result = z.boolean().safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`default_payment_method.save_cc.${error}`] || error : "";
          },
        },
        subscription: {
          next_transaction_date: (value: string) => {
            const result = z.string().datetime().safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`subscription.next_transaction_date.${error}`] || error : "";
          },
          frequency: (value: string) => {
            const result = z
              .string()
              .regex(/^(([0-9]{1,3}[ymwd])|(\.5m))$/)
              .safeParse(value);

            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`subscription.frequency.${error}`] || error : "";
          },
        },
        customerAddress: {
          address_name: (value: string) => {
            const result = z.string().max(100).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.address_name.${error}`] || error : "";
          },
          first_name: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.first_name.${error}`] || error : "";
          },
          last_name: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.last_name.${error}`] || error : "";
          },
          company: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.company.${error}`] || error : "";
          },
          address1: (value: string) => {
            const result = z.string().min(1).max(100).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.address1.${error}`] || error : "";
          },
          address2: (value: string) => {
            const result = z.string().max(100).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.address2.${error}`] || error : "";
          },
          city: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.city.${error}`] || error : "";
          },
          region: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.region.${error}`] || error : "";
          },
          postal_code: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.postal_code.${error}`] || error : "";
          },
          country: (value: string) => {
            const result = z.string().length(2).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.country.${error}`] || error : "";
          },
          phone: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            const error = result.error?.issues.map((issue) => issue.code)[0] ?? "";
            return error ? translations[`customer.phone.${error}`] || error : "";
          },
        },
      },

      data: {
        // payment method
        defaultPaymentMethod: this.createSource("defaultPaymentMethod", `${this.base}default_payment_method`),

        // subscriptions
        activeSubscriptions: this.createSource("activeSubscriptions", `${this.base}subscriptions?is_active=true`),
        subscriptions: this.createSource("subscriptions", `${this.base}subscriptions`),
        pastDueSubscriptions: this.createSource(
          "pastDueSubscriptions",
          `${this.base}subscriptions?past_due_amount:greaterthan=0`
        ),
        activeSubscriptionsBySku: (sku: string, contextKey = "activeSubscriptionsBySku") =>
          this.createSource(contextKey, `${this.base}subscriptions?is_active=true&items:code=${sku}&zoom=items`),

        // transactions
        transactions: this.createSource("transactions", `${this.base}transactions?zoom=items`),
        transactionsBySku: (sku: string, contextKey = "transactionsBySku") =>
          this.createSource(contextKey, `${this.base}transactions?zoom=items&items:code=${sku}`),

        // addresses
        addresses: this.createSource("addresses", `${this.base}addresses`),

        // settings
        settings: this.createSource("settings", `${this.base}customer_portal_settings`),

        // customer
        customer: this.createSource("customer", this.base),

        // customer attributes
        customerAttributesByName: (name: string, contextKey = "customerAttributesByName") =>
          this.createSource(contextKey, `${this.base}customer/attributes?name=${name}`),
      },
    };

    if (!config.manualRender) this.requestUpdate();
  }

  #removeToken() {
    if (this.#storage === "cookie") {
      document.cookie = "fx.customer=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    } else {
      this.storage.removeItem("session");
    }
  }

  #setSession(session: Record<string, string>) {
    const token = session?.session_token;

    // The authenticate response identifies the session with `session_token`.
    // Cookie mode used to write `session.token`, which does not exist on that
    // response, so the cookie held the string "undefined" — truthy, and sent as
    // a bearer credential on every request. Refuse to store a session we cannot
    // authenticate with rather than leaving a value that reads as signed in.
    if (typeof token !== "string" || !token) {
      console.error("Sign-in response did not include a session token.");
      this.#removeToken();
      return;
    }

    if (this.#storage === "cookie") {
      // `fx.customer` is a fixed name other Foxy code reads, so cookie mode is
      // deliberately not namespaced — sharing it across the domain is the point
      // of this mode.
      document.cookie = `fx.customer=${encodeURIComponent(token)}; path=/`;
    } else {
      this.storage.setItem("session", JSON.stringify(session));
    }
  }

  #getToken() {
    if (this.#storage === "cookie") {
      const match = document.cookie.match(/fx\.customer=([^;]+)/);
      if (!match) return null;

      // Sessions written before the `session_token` fix left the string
      // "undefined" in this cookie. It is non-empty, so it would otherwise read
      // as a valid session for anyone still carrying one.
      const token = decodeURIComponent(match[1]);
      return token && token !== "undefined" ? token : null;
    }

    try {
      const session = this.storage.getItem("session") as string;
      return JSON.parse(session)?.session_token ?? null;
    } catch {
      return null;
    }
  }
}
