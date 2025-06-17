import { type InflowCore } from "../core";
import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

import memoize from "lodash-es/memoize";

export type SourceDirectiveConfig = {
  prefix: string;
  inflow: InflowCore;
  getToken?: () => string | null;
  onTokenExpiry?: () => void;
};

export class SourceDirective extends Directive {
  #rawCachedSources = this.inflow.storage.getItem("inflow:cachedSources");

  #cachedSources: [string, any][] = this.#rawCachedSources
    ? JSON.parse(this.#rawCachedSources)
    : [];

  #staleSources = new Set<string>(this.#cachedSources.map((v) => v[0]));

  #sources = new Map<string, any>(this.#cachedSources);

  #failedSources = new Set<string>();

  #loadSource = memoize(
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
        this.#sources.set(source, await response.json());

        this.inflow.storage.setItem(
          "inflow:cachedSources",
          JSON.stringify(Array.from(this.#sources.entries()))
        );

        return this.#sources.get(source);
      } else {
        console.error("Failed to load source:", source, response);

        this.#failedSources.add(source);
      }

      if (response?.status === 401) {
        this.inflow.storage.removeItem("inflow:cachedSources");
        this.#staleSources.clear();
        this.#sources.clear();
        onTokenExpiry?.();
      }

      return null;
    }
  );

  #onTokenExpiry: (() => void) | null;

  #getToken: (() => string | null) | null;

  constructor(config: SourceDirectiveConfig) {
    super(config);
    this.#onTokenExpiry = config.onTokenExpiry ?? null;
    this.#getToken = config.getToken ?? null;
  }

  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const { context, value, update, attributeName, host, run } = params;

    if (host instanceof Element === false) return;

    const sourceMap = { ...run<Record<string, string>>(value) };

    Object.entries(sourceMap).forEach(([reference, source]) => {
      if (this.#failedSources.has(source)) {
        context[reference] = {
          hasFailedToLoad: true,
          isLoading: false,
          isReady: false,
          refresh: () => {
            this.#failedSources.delete(source);
            update();
          },
        };

        return;
      }

      let refreshStaleBackground = false;

      if (this.#staleSources.has(source)) {
        console.log("using stale source", source, reference);
        refreshStaleBackground = true;
        this.#staleSources.delete(source);
      }

      if (this.#sources.has(source)) {
        const sourceData = this.#sources.get(source);
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
                authorization: `Bearer ${this.#getToken?.()}`,
              },
              body: JSON.stringify(Object.fromEntries(formData)),
            })
              .then((response) => response.json())
              .then((data) => {
                console.log(data);
                console.log("refreshing after patch", source, reference);
                this.#staleSources.add(source);
                this.#loadSource.cache.delete(source);
                update();
              });
          },

          refresh: () => {
            console.log("refreshing", source, reference);
            this.#staleSources.add(source);
            this.#loadSource.cache.delete(source);
            update();
          },
        };
      }

      if (!this.#sources.has(source) || refreshStaleBackground) {
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

        this.#loadSource(
          source,
          this.#getToken ?? void 0,
          this.#onTokenExpiry ?? void 0
        ).then(update);
      }
    });
  }

  getState(source: string) {
    if (this.#failedSources.has(source)) {
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

    if (this.#staleSources.has(source)) {
      console.log("using stale source (implicit)", source);
      refreshStaleBackground = true;
      this.#staleSources.delete(source);
    }

    if (this.#sources.has(source)) {
      const sourceData = this.#sources.get(source);
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
              authorization: `Bearer ${this.#getToken?.()}`,
            },
            body: JSON.stringify(Object.fromEntries(formData)),
          })
            .then((response) => response.json())
            .then((data) => {
              console.log(data);
              console.log("refreshing after patch (implicit)", source);
              this.#staleSources.add(source);
              this.#loadSource.cache.delete(source);
              this.inflow.requestUpdate();
            });
        },

        refresh: () => {
          console.error("Refreshing is not suppored in implicit sources.");
        },
      };

      if (refreshStaleBackground) {
        console.log("refreshing stale source (implicit)", source);
        this.#loadSource(
          source,
          this.#getToken ?? void 0,
          this.#onTokenExpiry ?? void 0
        ).then(() => this.inflow.requestUpdate());
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

      this.#loadSource(
        source,
        this.#getToken ?? void 0,
        this.#onTokenExpiry ?? void 0
      ).then(() => this.inflow.requestUpdate());
    }

    return contextEntry;
  }

  createSource(name: string, url: string) {
    return new Proxy<Record<string, string>>(
      { [name]: url },
      {
        get: (target, key) => {
          if (key in target) return Reflect.get(target, key);
          return this.getState(url)[key as string];
        },
      }
    );
  }
}
