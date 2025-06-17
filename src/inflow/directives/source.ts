import type { MemoizedFunction } from "lodash";
import type { DirectiveConfig } from "../types";

import memoize from "lodash-es/memoize";

export type DataSourceDirectiveGlobalContext = {
  sources: Map<string, any>;
  staleSources: Set<string>;
  failedSources: Set<string>;
  getState: (source: string) => Record<string, unknown>;
  loadSource: ((
    source: string,
    getToken?: () => string | null,
    onTokenExpiry?: () => void
  ) => Promise<any | null>) &
    MemoizedFunction;
};

export function createSource(
  globalContext: Record<string, unknown>,
  name: string,
  url: string,
  extra?: any
) {
  const { getState } =
    globalContext.__dataSourceDirective as DataSourceDirectiveGlobalContext;

  return new Proxy<Record<string, string>>(
    { [name]: url },
    {
      get: (target, key) => {
        if (key in target) return Reflect.get(target, key);
        return getState(url)[key as string];
      },
    }
  );
}

const config: DirectiveConfig = {
  create: (context, storage, update, options) => {
    const rawCachedSources = storage.getItem("inflow:cachedSources");
    const cachedSources: [string, any][] = rawCachedSources
      ? JSON.parse(rawCachedSources)
      : [];

    const staleSources = new Set<string>(cachedSources.map((v) => v[0]));
    const sources = new Map<string, any>(cachedSources);
    const failedSources = new Set<string>();

    const loadSource = memoize(
      async (
        source: string,
        getToken?: () => string | null,
        onTokenExpiry?: () => void
      ) => {
        const headers = new Headers();
        headers.append("foxy-api-version", "1");

        const token = getToken?.();
        if (token) headers.append("authorization", `Bearer ${token}`);

        let response: Response | null = null;

        try {
          response = await fetch(source, { headers });
        } catch (err) {
          console.error("Failed to fetch source:", source, err);
        }

        if (response?.ok) {
          sources.set(source, await response.json());

          storage.setItem(
            "inflow:cachedSources",
            JSON.stringify(Array.from(sources.entries()))
          );

          return sources.get(source);
        } else {
          console.error("Failed to load source:", source, response);

          failedSources.add(source);
        }

        if (response?.status === 401) {
          storage.removeItem("inflow:cachedSources");
          staleSources.clear();
          sources.clear();
          onTokenExpiry?.();
        }

        return null;
      }
    );

    const { getToken, onTokenExpiry } =
      (options as
        | { getToken: () => string | null; onTokenExpiry: () => void }
        | undefined) ?? {};

    const getState = (source: string) => {
      if (failedSources.has(source)) {
        return {
          hasFailedToLoad: true,
          isLoading: false,
          isReady: false,
          refresh: () => {
            console.error("Refreshing is not suppored in implicit sources.");
          },
        };
      }

      let refreshStaleBackground = false;
      let contextEntry: Record<string, unknown>;

      if (staleSources.has(source)) {
        console.log("using stale source (implicit)", source);
        refreshStaleBackground = true;
        staleSources.delete(source);
      }

      if (sources.has(source)) {
        const sourceData = sources.get(source);
        const specialFields: Record<string, unknown> = {};

        if (sourceData._links.next) {
          specialFields.limit = sourceData.limit;
          specialFields.offset = sourceData.offset;
          specialFields.totalItems = sourceData.total_items;
          specialFields.hasItems = sourceData.total_items > 0;
          specialFields.returnedItems = sourceData.returned_items;
          specialFields.items = Object.values(sourceData._embedded)[0];
          specialFields.isFirstPage = sourceData.offset === 0;
          specialFields.isLastPage =
            sourceData.offset + sourceData.limit >= sourceData.total_items;
          specialFields.needsPagination =
            !specialFields.isFirstPage || !specialFields.isLastPage;

          specialFields.loadNextPage = () => {
            console.error(
              "Loading next page is not supported in implicit sources."
            );
          };

          specialFields.loadLastPage = () => {
            console.error(
              "Loading last page is not supported in implicit sources."
            );
          };

          specialFields.loadPreviousPage = () => {
            console.error(
              "Loading previous page is not supported in implicit sources."
            );
          };

          specialFields.loadFirstPage = () => {
            console.error(
              "Loading first page is not supported in implicit sources."
            );
          };
        } else {
          const { _links, _embedded, ...fields } = sourceData;
          Object.assign(specialFields, fields);
        }

        contextEntry = {
          ...specialFields,
          hasFailedToLoad: false,
          isLoading: false,
          isReady: true,
          raw: sourceData,

          patch: (evt: SubmitEvent) => {
            evt.preventDefault();

            const form = evt.currentTarget as HTMLFormElement;
            if (!form.reportValidity()) return;

            const formData = new FormData(form);
            console.log("patching");

            fetch(source, {
              method: "PATCH",
              headers: {
                "content-type": "application/json",
                "foxy-api-version": "1",
                authorization: `Bearer ${getToken?.()}`,
              },
              body: JSON.stringify(Object.fromEntries(formData)),
            })
              .then((response) => response.json())
              .then((data) => {
                console.log(data);
                console.log("refreshing after patch (implicit)", source);
                staleSources.add(source);
                loadSource.cache.delete(source);
                update();
              });
          },

          refresh: () => {
            console.error("Refreshing is not suppored in implicit sources.");
          },
        };

        if (refreshStaleBackground) {
          console.log("refreshing stale source (implicit)", source);
          loadSource(source, getToken, onTokenExpiry).then(update);
        }
      } else {
        console.log("loading source (implicit)", source);
        contextEntry = {
          hasFailedToLoad: false,
          isLoading: true,
          isReady: false,
          refresh: () => {
            console.error("Refreshing is not suppored in implicit sources.");
          },
        };

        loadSource(source, getToken, onTokenExpiry).then(update);
      }

      return contextEntry;
    };

    context.__dataSourceDirective = {
      sources,
      staleSources,
      failedSources,
      loadSource,
      getState,
    } as DataSourceDirectiveGlobalContext;
  },
  render: ({ context, options, value, update, attributeName, host, run }) => {
    if (host instanceof Element === false) return;

    const { getToken, onTokenExpiry } =
      (options as
        | { getToken: () => string | null; onTokenExpiry: () => void }
        | undefined) ?? {};

    const sourceMap = { ...run<Record<string, string>>(value) };
    const { sources, staleSources, failedSources, loadSource } =
      context.__dataSourceDirective as DataSourceDirectiveGlobalContext;

    Object.entries(sourceMap).forEach(([reference, source]) => {
      if (failedSources.has(source)) {
        context[reference] = {
          hasFailedToLoad: true,
          isLoading: false,
          isReady: false,
          refresh: () => {
            failedSources.delete(source);
            update();
          },
        };

        return;
      }

      let refreshStaleBackground = false;

      if (staleSources.has(source)) {
        console.log("using stale source", source, reference);
        refreshStaleBackground = true;
        staleSources.delete(source);
      }

      if (sources.has(source)) {
        const sourceData = sources.get(source);
        const specialFields: Record<string, unknown> = {};

        if (sourceData._links.next) {
          specialFields.limit = sourceData.limit;
          specialFields.offset = sourceData.offset;
          specialFields.totalItems = sourceData.total_items;
          specialFields.hasItems = sourceData.total_items > 0;
          specialFields.returnedItems = sourceData.returned_items;
          specialFields.items = Object.values(sourceData._embedded)[0];
          specialFields.isFirstPage = sourceData.offset === 0;
          specialFields.isLastPage =
            sourceData.offset + sourceData.limit >= sourceData.total_items;
          specialFields.needsPagination =
            !specialFields.isFirstPage || !specialFields.isLastPage;

          specialFields.loadNextPage = () => {
            sourceMap[reference] = sourceData._links.next.href;
            host.setAttribute(attributeName, JSON.stringify(sourceMap));
            update();
          };

          specialFields.loadLastPage = () => {
            sourceMap[reference] = sourceData._links.last.href;
            host.setAttribute(attributeName, JSON.stringify(sourceMap));
            update();
          };

          specialFields.loadPreviousPage = () => {
            sourceMap[reference] = sourceData._links.prev.href;
            host.setAttribute(attributeName, JSON.stringify(sourceMap));
            update();
          };

          specialFields.loadFirstPage = () => {
            sourceMap[reference] = sourceData._links.first.href;
            host.setAttribute(attributeName, JSON.stringify(sourceMap));
            update();
          };
        } else {
          const { _links, _embedded, ...fields } = sourceData;
          Object.assign(specialFields, fields);
        }

        context[reference] = {
          ...specialFields,
          hasFailedToLoad: false,
          isLoading: false,
          isReady: true,
          raw: sourceData,

          patch: (evt: SubmitEvent) => {
            evt.preventDefault();

            const form = evt.currentTarget as HTMLFormElement;
            if (!form.reportValidity()) return;

            const formData = new FormData(form);
            console.log("patching");

            fetch(source, {
              method: "PATCH",
              headers: {
                "content-type": "application/json",
                "foxy-api-version": "1",
                authorization: `Bearer ${getToken?.()}`,
              },
              body: JSON.stringify(Object.fromEntries(formData)),
            })
              .then((response) => response.json())
              .then((data) => {
                console.log(data);
                console.log("refreshing after patch", source, reference);
                staleSources.add(source);
                loadSource.cache.delete(source);
                update();
              });
          },

          refresh: () => {
            console.log("refreshing", source, reference);
            staleSources.add(source);
            loadSource.cache.delete(source);
            update();
          },
        };
      }

      if (!sources.has(source) || refreshStaleBackground) {
        if (refreshStaleBackground) {
          console.log("refreshing stale source", source, reference);
        } else {
          console.log("loading source", source, reference);
          context[reference] = {
            hasFailedToLoad: false,
            isLoading: true,
            isReady: false,
            refresh: () => void 0,
          };
        }

        loadSource(source, getToken, onTokenExpiry).then(update);
      }
    });
  },
};

export default config;
