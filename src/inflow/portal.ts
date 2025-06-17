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
};

export class InflowPortal extends InflowCore {
  #storage: "cookie" | "local";

  constructor(config: InflowPortalConfig) {
    super({
      ...config,
      getToken: () => this.#getToken(),
      onTokenExpiry: () => {
        this.#removeToken();
        const redirectTo = new URL(
          config.signInPageUrl,
          location.origin
        ).toString();
        if (location.href !== redirectTo) location.href = config.signInPageUrl;
      },
    });

    this.#storage = config.storage ?? "local";

    this.globalContext.portal = {
      isLoggedIn: () => !!this.#getToken(),

      signOut: () => {
        this.storage.clear();
        this.#removeToken();
        location.href = config.signInPageUrl;
      },

      signIn: this.#createApiAction(
        "authenticate",
        {
          "data.email should NOT be longer than 100 characters":
            "email_too_long",
          'data.email should match format "email"': "email_invalid",
          "data.email should be string": "email_required",
          "data.password should NOT be longer than 50 characters":
            "password_too_long",
          "data.password should be string": "password_required",
        },
        [],
        (data) => {
          this.#setSession(data);
          location.href = config.homePageUrl;
        }
      ),

      resetPassword: this.#createApiAction("forgot_password", {
        "data.email should NOT be longer than 100 characters": "email_too_long",
        'data.email should match format "email"': "email_invalid",
        "data.email should be string": "email_required",
      }),

      createCcToken:
        (resource: { patch: (evt: SubmitEvent) => void }) =>
        (evt: SubmitEvent) => {
          const form = evt.currentTarget as HTMLFormElement;
          const data = new FormData(form);
          const ccToken = data.get("cc_token");

          if (ccToken) {
            resource.patch(evt);
          } else {
            evt.preventDefault();
            type EmbedElement = HTMLElement & {
              tokenize: () => Promise<string>;
            };
            const paymentCardEmbed = form.querySelector<EmbedElement>(
              "foxy-payment-card-embed"
            );

            paymentCardEmbed
              ?.tokenize()
              .then((cardToken) => {
                const ccTokenInput = form.querySelector<HTMLInputElement>(
                  'input[name="cc_token"]'
                );

                if (ccTokenInput) {
                  ccTokenInput.value = cardToken;
                  form.dispatchEvent(
                    new SubmitEvent("submit", { submitter: evt.submitter })
                  );
                } else {
                  console.error("CC Token input not found in the form.");
                }
              })
              .catch(() => {
                console.error("Card tokenization failed.");
              });
          }
        },

      createAccount: (evt: SubmitEvent) => {
        const form = evt.currentTarget as HTMLFormElement;
        const data = new FormData(form);
        const verification = data.get("verification");

        if (!verification) {
          evt.preventDefault();

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
                const verificationInput = form.querySelector<HTMLInputElement>(
                  'input[name="verification"]'
                );
                if (verificationInput) {
                  verificationInput.value = JSON.stringify({
                    type: "hcaptcha",
                    token: (evt1 as Event & { token: string }).token,
                  });

                  form.dispatchEvent(
                    new SubmitEvent("submit", { submitter: evt.submitter })
                  );
                } else {
                  console.error("Verification input not found in the form.");
                }
              },
              { once: true }
            );
            hCaptcha.execute();
          } else {
            console.error("HCaptcha element not found in the form.");
          }
        }

        return this.#createApiAction(
          "sign_up",
          {
            "data.first_name should NOT be longer than 50 characters":
              "first_name_too_long",
            "data.first_name should be string": "first_name_required",
            "data.last_name should NOT be longer than 50 characters":
              "last_name_too_long",
            "data.last_name should be string": "last_name_required",
            "data.email should NOT be longer than 100 characters":
              "email_too_long",
            'data.email should match format "email"': "email_invalid",
            "data.email should be string": "email_required",
            "data.password should NOT be longer than 50 characters":
              "password_too_long",
            "data.password should be string": "password_required",
          },
          ["verification"],
          (data) => {
            this.#setSession(data);
            location.href = config.homePageUrl;
          }
        )(evt);
      },

      v8n: {
        signIn: {
          email: (value: string) => {
            const result = z.string().email().min(1).max(100).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          password: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
        },
        createAccount: {
          first_name: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          last_name: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          email: (value: string) => {
            const result = z.string().email().min(1).max(100).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          password: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          password_old: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
        },
        resetPassword: {
          email: (value: string) => {
            const result = z.string().email().min(1).max(200).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
        },
        customer: {
          first_name: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          last_name: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          tax_id: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          email: (value: string) => {
            const result = z.string().email().min(1).max(100).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          password: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          password_old: (value: string) => {
            const result = z.string().min(1).max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
        },
        defaultPaymentMethod: {
          ccToken: (value: string) => {
            const result = z.string().min(1).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          saveCc: (value: boolean) => {
            const result = z.boolean().safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
        },
        subscription: {
          nextTransactionDate: (value: string) => {
            const result = z.string().datetime().safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          frequency: (value: string) => {
            const result = z
              .string()
              .regex(/^(([0-9]{1,3}[ymwd])|(\.5m))$/)
              .safeParse(value);

            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
        },
        customerAddress: {
          addressName: (value: string) => {
            const result = z.string().max(100).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          firstName: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          lastName: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          company: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          address1: (value: string) => {
            const result = z.string().min(1).max(100).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          address2: (value: string) => {
            const result = z.string().max(100).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          city: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          region: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          postalCode: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          country: (value: string) => {
            const result = z.string().length(2).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
          phone: (value: string) => {
            const result = z.string().max(50).safeParse(value);
            return result.error?.issues.map((issue) => issue.code)[0] ?? "";
          },
        },
      },

      data: {
        defaultPaymentMethod: this.createSource(
          "defaultPaymentMethod",
          `${this.base}default_payment_method`
        ),

        pastDueSubscriptions: this.createSource(
          "pastDueSubscriptions",
          `${this.base}subscriptions?past_due_amount:greaterthan=0`
        ),

        activeSubscriptions: this.createSource(
          "activeSubscriptions",
          `${this.base}subscriptions?is_active=true`
        ),

        subscriptions: this.createSource(
          "subscriptions",
          `${this.base}subscriptions`
        ),

        transactions: this.createSource(
          "transactions",
          `${this.base}transactions?zoom=items`
        ),

        addresses: this.createSource("addresses", `${this.base}addresses`),

        settings: this.createSource(
          "settings",
          `${this.base}customer_portal_settings`
        ),

        customer: this.createSource("customer", this.base),

        customerAttributesByName: (
          name: string,
          contextKey = "customerAttributesByName"
        ) =>
          this.createSource(
            contextKey,
            `${this.base}customer/attributes?name=${name}`
          ),

        activeSubscriptionsBySku: (
          sku: string,
          contextKey = "activeSubscriptionsBySku"
        ) =>
          this.createSource(
            contextKey,
            `${this.base}subscriptions?is_active=true&items:code=${sku}&zoom=items`
          ),

        transactionsBySku: (sku: string, contextKey = "transactionsBySku") =>
          this.createSource(
            contextKey,
            `${this.base}transactions?zoom=items&items:code=${sku}`
          ),
      },
    };

    if (!config.manualRender) this.render();
  }

  #createApiAction(
    path: string,
    messageToCode: Record<string, string>,
    jsonFields?: string[],
    onSuccess?: (response: any) => void
  ) {
    let state: "idle" | "busy" | "fail" | "done" = "idle";
    let errors: { code: string; message: string }[] = [];

    return new Proxy(
      (evt: SubmitEvent) => {
        evt.preventDefault();
        if (state === "busy") return;

        const form = evt.currentTarget as HTMLFormElement;
        if (!form.checkValidity()) return;

        const formData = new FormData(form);

        state = "busy";
        errors = [];
        this.requestUpdate();

        const body = Object.fromEntries(formData);

        jsonFields?.forEach((field) => {
          const value = formData.get(field);
          if (value) {
            try {
              body[field] = JSON.parse(value as string);
            } catch (e) {
              console.error(`Failed to parse JSON for field ${field}:`, e);
            }
          }
        });

        fetch(`${this.base}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "foxy-api-version": "1",
          },
          body: JSON.stringify(body),
        })
          .then((response) =>
            response.ok ? response.json() : Promise.reject(response)
          )
          .then((data) => {
            state = "done";
            this.requestUpdate();
            onSuccess?.(data);
          })
          .catch((err) => {
            state = "fail";
            errors = [{ code: "unknown_error", message: String(err) }];

            if (err instanceof Response) {
              err.json().then((data) => {
                if (data._embedded?.["fx:errors"]) {
                  errors = data._embedded?.["fx:errors"].map(
                    (error: { message: string }) => {
                      const message = error.message;
                      return {
                        code: messageToCode[message] || "unknown_error",
                        message,
                      };
                    }
                  );
                } else {
                }
                this.requestUpdate();
              });
            } else {
              this.requestUpdate();
              console.error(err);
            }
          });
      },
      {
        get: (target, key) => {
          if (key === "isSubmitting") return state === "busy";
          if (key === "isFailed") return state === "fail";
          if (key === "isIdle") return state === "idle";
          if (key === "isDone") return state === "done";
          if (key === "errors") return errors;
          if (key === "reset")
            return () => {
              if (state === "fail") {
                state = "idle";
                errors = [];
                this.requestUpdate();
              }
            };

          return Reflect.get(target, key);
        },
      }
    );
  }

  #removeToken() {
    if (this.#storage === "cookie") {
      document.cookie =
        "fx.customer=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    } else {
      localStorage.removeItem("session");
    }
  }

  #setSession(session: Record<string, string>) {
    if (this.#storage === "cookie") {
      document.cookie = `fx.customer=${encodeURIComponent(
        session.token
      )}; path=/`;
    } else {
      localStorage.setItem("session", JSON.stringify(session));
    }
  }

  #getToken() {
    if (this.#storage === "cookie") {
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
}
