import type { DirectiveConfig } from "../types";

const initializedInputs = new WeakSet<HTMLInputElement>();

const config: DirectiveConfig = {
  render: ({ update, host, value, run }) => {
    const validator = run<(value: string) => string>(value);
    const validate = (input: HTMLInputElement) => {
      input.setCustomValidity(validator(input.value));
    };

    ["input", "change"].forEach((eventType) => {
      host.addEventListener(eventType, (event) => {
        validate(event.currentTarget as HTMLInputElement);
        update();
      });
    });

    validate(host as HTMLInputElement);
    if (!initializedInputs.has(host as HTMLInputElement)) {
      initializedInputs.add(host as HTMLInputElement);
      update();
    }
  },
};

export default config;
