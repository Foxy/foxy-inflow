import type { DirectiveConfig } from "../types";

import get from "lodash-es/get";
import set from "lodash-es/set";

const config: DirectiveConfig = {
  render: ({ host, value, name, run }) => {
    const lowercasePropertyName = name.replace("prop-", "");
    let resolvedPropertyName = lowercasePropertyName;

    for (const propertyName in host) {
      if (propertyName.toLowerCase() === lowercasePropertyName) {
        resolvedPropertyName = propertyName;
        break;
      }
    }

    const oldValue = get(host, resolvedPropertyName);
    const newValue = run(value);
    if (newValue !== oldValue) set(host, resolvedPropertyName, run(value));
  },
};

export default config;
