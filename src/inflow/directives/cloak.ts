import type { DirectiveConfig } from "../types";

const config: DirectiveConfig = {
  render: ({ host, attributeName }) => {
    if (host instanceof Element) host.removeAttribute(attributeName);
  },
};

export default config;
