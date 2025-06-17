import type { DirectiveConfig } from "../types";

const config: DirectiveConfig = {
  render: ({ host, value, name, run }) => {
    if (host instanceof Element === false) return;

    const attributeName = name.replace("battr-", "");
    const oldValue = host.hasAttribute(attributeName);
    const newValue = Boolean(run(value));
    if (newValue !== oldValue) host.toggleAttribute(attributeName);
  },
};

export default config;
