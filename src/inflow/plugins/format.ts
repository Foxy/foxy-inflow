import type { PluginConfig } from "../types";

const config: PluginConfig = {
  create: () => ({
    currency: (value: string, lang = navigator.language) => {
      return parseFloat(value.substring(0, value.length - 3)).toLocaleString(
        lang,
        {
          currency: value.substring(value.length - 3).toLowerCase(),
          style: "currency",
        }
      );
    },
    datetime: (value: string, lang = navigator.language) => {
      return new Date(value).toLocaleString(lang);
    },
    date: (value: string, lang = navigator.language) => {
      return new Date(value).toLocaleDateString(lang);
    },
  }),
};

export default config;
