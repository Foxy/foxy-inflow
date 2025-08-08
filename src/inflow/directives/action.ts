import { type DirectiveRendererParams, type DirectiveRendererResult, Directive } from "../Directive";

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
    bearerToken,
    v8n: messageToCode,
    jsonFields,
    onSuccess,
    onSubmit,
  }: {
    path: string;
    bearerToken?: string;
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
        if (!form.checkValidity()) return;

        Array.from(form.elements).forEach((element) => {
          if ("disabled" in element) element.toggleAttribute("disabled", true);
        });

        const formData = new FormData(form);
        state = "busy";
        errors = [];
        this.inflow.requestUpdate();

        const onSubmitPromise = onSubmit ? onSubmit(form, formData) : Promise.resolve();

        onSubmitPromise
          .then(() => {
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

            fetch(`${this.inflow.base}${path}`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "foxy-api-version": "1",
                ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
              },
              body: JSON.stringify(body),
            })
              .then((response) => (response.ok ? response.json() : Promise.reject(response)))
              .then((data) => {
                state = "done";
                this.inflow.requestUpdate();
                onSuccess?.(data);
              })
              .catch((err) => {
                state = "fail";
                errors = [{ code: "unknown_error", message: String(err) }];

                if (err instanceof Response) {
                  err.json().then((data) => {
                    if (data._embedded?.["fx:errors"]) {
                      errors = data._embedded?.["fx:errors"]
                        .map((error: { message: string }) => {
                          const message = error.message;
                          return {
                            code: messageToCode?.[message] || "unknown_error",
                            message,
                          };
                        })
                        .filter((error: { code: string; message: string }) => {
                          const [_, fieldName] = error.code.split(".");
                          const field = form.elements.namedItem(fieldName);
                          if (field instanceof HTMLInputElement) {
                            field.setCustomValidity(error.message);
                            return false;
                          } else {
                            return true;
                          }
                        });
                    } else {
                      errors = [{ code: "unknown_error", message: String(err) }];
                    }
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
              if ("disabled" in element) element.toggleAttribute("disabled", false);
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
      }
    );
  }
}
