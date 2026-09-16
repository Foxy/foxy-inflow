import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

export class ActionDirective extends Directive {
  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const { host, value, run } = params;
    const handler = run<(event: Event) => void>(value);
    const listener = (event: Event) => handler(event);

    host.addEventListener("submit", listener);
    return {
      beforeUpdate: () => host.removeEventListener("submit", listener),
    };
  }

  createAction({
    path,
    url,
    method = "POST",
    bearerToken,
    v8n: messageToCode,
    jsonFields,
    onSuccess,
    onSubmit,
  }: {
    path?: string;
    url?: string;
    method?: string;
    bearerToken?: string | (() => string | null | undefined);
    v8n?: Record<string, string>;
    jsonFields?: string[];
    onSuccess?: (response: any) => void;
    onSubmit?: (form: HTMLFormElement, data: FormData) => Promise<void>;
  }) {
    let state: "idle" | "busy" | "fail" | "done" = "idle";
    let errors: { code: string; message: string }[] = [];

    return new Proxy(
      (evt: SubmitEvent) => {
        evt.preventDefault();
        if (state === "busy") return;

        const form = evt.currentTarget as HTMLFormElement;

        // Both calls stop the submit, but only `reportValidity` tells the
        // customer why: returning quietly left the button looking broken —
        // nothing happened and nothing said so. `novalidate` is the documented
        // way to suppress the browser's bubbles and show the messages in your
        // own markup, so that form is still checked, just not reported over.
        if (!(form.noValidate ? form.checkValidity() : form.reportValidity()))
          return;

        // Collect the values before disabling anything: disabled controls are
        // barred from the form data set, so disabling first posts an empty
        // body and the API rejects the request for fields the form did have.
        const formData = new FormData(form);

        Array.from(form.elements).forEach((element) => {
          if ("disabled" in element) element.toggleAttribute("disabled", true);
        });
        state = "busy";
        errors = [];
        this.inflow.requestUpdate();

        const onSubmitPromise = onSubmit
          ? onSubmit(form, formData)
          : Promise.resolve();

        onSubmitPromise
          .then(() => {
            const body = Object.fromEntries(formData);

            // A form data set holds nothing but strings, so a typed field was
            // unreachable from markup: a hidden `save_cc` of "false" posted
            // `{"save_cc":"false"}` and the API answered `data.save_cc should
            // be boolean`. A field marked with the `json` attribute is parsed,
            // which covers booleans, numbers and whole objects alike.
            const markedFields = Array.from(form.elements).flatMap(
              (element) => {
                if (!(element instanceof Element)) return [];
                if (!element.hasAttribute(`${this.inflow.prefix}json`))
                  return [];
                const name = element.getAttribute("name");
                return name ? [name] : [];
              },
            );

            new Set([...(jsonFields ?? []), ...markedFields]).forEach(
              (field) => {
                const value = formData.get(field);
                if (value) {
                  try {
                    body[field] = JSON.parse(value as string);
                  } catch (e) {
                    console.error(
                      `Failed to parse JSON for field ${field}:`,
                      e,
                    );
                  }
                }
              },
            );

            // `url` wins over `path` so a caller with an endpoint that is not
            // `base` plus a segment — a source built from a `_links` href —
            // can say so. The token is resolved here rather than captured
            // above: a session that refreshed mid-page must not send the
            // credential this action was built with.
            const token =
              typeof bearerToken === "function" ? bearerToken() : bearerToken;

            fetch(url ?? `${this.inflow.base}${path}`, {
              method,
              headers: {
                "content-type": "application/json",
                "foxy-api-version": "1",
                ...(token ? { authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify(body),
            })
              .then((response) =>
                response.ok ? response.json() : Promise.reject(response),
              )
              .then((data) => {
                state = "done";
                this.inflow.requestUpdate();
                onSuccess?.(data);
              })
              .catch((err) => {
                state = "fail";
                errors = [{ code: "unknown_error", message: String(err) }];

                if (err instanceof Response) {
                  err
                    .json()
                    .then((data) => {
                      if (data._embedded?.["fx:errors"]) {
                        errors = data._embedded?.["fx:errors"]
                          .map((error: { message: string }) => {
                            const message = error.message;
                            return {
                              code: messageToCode?.[message] || "unknown_error",
                              message,
                            };
                          })
                          .filter(
                            (error: { code: string; message: string }) => {
                              const [_, fieldName] = error.code.split(".");
                              const field = form.elements.namedItem(fieldName);
                              if (field instanceof HTMLInputElement) {
                                field.setCustomValidity(error.message);
                                return false;
                              } else {
                                return true;
                              }
                            },
                          );
                      } else {
                        errors = [
                          { code: "unknown_error", message: String(err) },
                        ];
                      }
                    })
                    .catch(() => {
                      // The error body was not JSON at all — a proxy returning
                      // an HTML error page for a 502, say. There is nothing to
                      // extract, but the placeholder `unknown_error` entry set
                      // above already covers this; without this catch, `.then`
                      // never runs and the customer sees nothing.
                      errors = [
                        {
                          code: "unknown_error",
                          message: `Request failed with status ${err.status}`,
                        },
                      ];
                    })
                    .finally(() => {
                      this.inflow.requestUpdate();
                      form.reportValidity();
                    });
                } else {
                  this.inflow.requestUpdate();
                  form.reportValidity();
                  console.error(err);
                }
              });
          })
          .catch((err: any) => {
            console.error("Error during onSubmit:", err);
            state = "fail";
            errors = [{ code: "unknown_error", message: String(err) }];
            this.inflow.requestUpdate();
          })
          .finally(() => {
            Array.from(form.elements).forEach((element) => {
              if ("disabled" in element)
                element.toggleAttribute("disabled", false);
            });
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
                this.inflow.requestUpdate();
              }
            };

          return Reflect.get(target, key);
        },
      },
    );
  }
}
