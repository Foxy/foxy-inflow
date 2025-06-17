import type { DirectiveConfig } from "../types";

const config: DirectiveConfig = {
  render: ({ host, value, name, run }) => {
    const eventName = name.substring(3);
    const handler = run<(event: Event) => void>(value);
    const listener = (event: Event) => handler(event);

    host.addEventListener(eventName, listener);
    return {
      beforeUpdate: () => host.removeEventListener(eventName, listener),
    };
  },
};

export default config;
