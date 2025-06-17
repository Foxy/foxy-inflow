import type { DirectiveConfig } from "../types";

const config: DirectiveConfig = {
  render: ({ host, value, name, run }) => {
    console.debug("attr directive", { host, value, name });
    if (host instanceof Element === false) return;

    const attributeName = name.replace("attr-", "");
    const oldValue = host.getAttribute(attributeName);
    const newValue = String(run(value));
    if (newValue !== oldValue) host.setAttribute(attributeName, newValue);
  },
};

export default config;
