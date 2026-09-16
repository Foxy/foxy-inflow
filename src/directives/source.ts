import { type InflowCore } from "../core";
import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

import { memoize } from "lodash-es";

export type SourceDirectiveConfig = {
  prefix: string;
  inflow: InflowCore;
  getToken?: () => string | null;
  onTokenExpiry?: () => void;
};

export class SourceDirective extends Directive {
  #rawCachedSources = this.inflow.storage.getItem("cachedSources");

  #cachedSources: [string, any][] = this.#rawCachedSources
    ? JSON.parse(this.#rawCachedSources)
    : [];

  #staleSources = new Set<string>(this.#cachedSources.map((v) => v[0]));

  #sources = new Map<string, any>(this.#cachedSources);

  #failedSources = new Set<string>();

  /**
   * Every source is fetched with the customer's bearer token attached, so the
   * URL decides who receives that token. Only the configured API origin is
   * allowed through: markup is free to build a source out of a query string,
   * and without this a crafted link would hand the session to whatever origin
   * it named. Pagination hrefs read back out of a response go through here
   * too, so a compromised API cannot redirect the token either.
   *
   * The source is resolved the way `fetch` resolves it — against the page —
   * so the check covers exactly the request that would go out. With no `base`
   * configured that leaves same-origin sources only.
   */
  #isOnApiOrigin(source: string) {
    try {
      return (
        new URL(source, location.href).origin ===
        new URL(this.inflow.base, location.href).origin
      );
    } catch {
      return false;
    }
  }

  #patchActions = new Map<string, any>();

  // Marks a source stale, drops it from the loader's memo cache, and
  // re-renders — the effect of a successful save, and of an explicit
  // `refresh()` call on a loaded `data-source`. One method so the two call
  // sites (`#getPatch`'s `onSuccess` and the ready branch's `refresh`) can't
  // drift apart the way they did before.
  #refreshSource(source: string) {
    this.#staleSources.add(source);
    this.#loadSource.cache.delete(source);
    this.inflow.requestUpdate();
  }

  // Both source kinds save the same way. Built on `createAction` so a save
  // gets the submit lifecycle the actions already have — a `response.ok`
  // check, `fx:errors` extraction, controls disabled while in flight, and
  // `isSubmitting` / `isFailed` / `errors` for the markup to bind to.
  //
  // Memoized per source: `apply()`/`getState()` run on every render, and a
  // fresh Proxy on every call would drop `errors`/`isFailed` the instant a
  // re-render happened after a failed save.
  //
  // Memoized per *source*, not per binding: two forms bound to the same
  // source (e.g. a profile form and a preferences form both patching
  // `customer`) share one action and its submit state. A submit on the
  // second while the first is in flight is dropped by the `state === "busy"`
  // guard, and after the first fails, the second renders the first's
  // `errors`. That is the accepted cost of persisting `errors` across
  // re-renders — do not "fix" it by keying on something narrower without
  // also solving how a failed save's errors would survive a re-render.
  #createPatch(source: string, onSaved: () => void) {
    let action = this.#patchActions.get(source);

    if (!action) {
      action = this.inflow.createAction({
        url: source,
        method: "PATCH",
        bearerToken: () => this.#getToken?.(),
        onSuccess: onSaved,
      });

      this.#patchActions.set(source, action);
    }

    return action;
  }

  // `patch` is exposed on every context entry, not just the ready one — a
  // still-loading or failed-to-load source can still have a form bound to
  // `<source>.patch`, and markup that reads `<source>.patch.errors` (e.g. a
  // `data-for` over the error list) would otherwise crash rather than see an
  // empty list while nothing has been submitted yet. `#inertPatch` mirrors
  // the shape `#createPatch` returns — callable, with `errors`/`isSubmitting`/
  // `isFailed`/`isIdle` — but never sends a request, for the two cases where
  // a submit must not reach the network.
  #inertPatch(
    source: string,
    log: (...args: unknown[]) => void,
    message: string,
  ) {
    const handler = (evt: SubmitEvent) => {
      evt.preventDefault();
      log(message, source);
    };

    return Object.assign(handler, {
      errors: [] as { code: string; message: string }[],
      isSubmitting: false,
      isFailed: false,
      isIdle: true,
      isDone: false,
      // Never fails, so there is nothing to reset — but the shape has to
      // match `createAction`'s, or `<source>.patch.reset()` throws on a
      // still-loading or refused source.
      reset: () => void 0,
    });
  }

  #refusedPatch(source: string) {
    return this.#inertPatch(
      source,
      console.error,
      "Refusing to patch a source outside the API origin:",
    );
  }

  // A submit that lands before the source has loaded (or after it failed to)
  // would build its FormData from whatever placeholder markup is currently in
  // the DOM — nothing guarantees a `data-if="isReady"` guard around the form —
  // so letting the real action through here risks a PATCH that overwrites the
  // customer's real data with empty or placeholder values. Only the ready
  // branch gets the working `#createPatch` action; this is the stand-in for
  // the other two.
  #loadingPatch(source: string) {
    return this.#inertPatch(
      source,
      console.warn,
      "Ignoring a patch submitted before the source has loaded:",
    );
  }

  // The real action is for the ready branch only — see `#loadingPatch`. Used
  // by both `apply()` and `getState()`, which used to carry identical copies
  // of this closure.
  #getPatch(source: string, ready: boolean) {
    if (!this.#isOnApiOrigin(source)) return this.#refusedPatch(source);
    if (!ready) return this.#loadingPatch(source);

    return this.#createPatch(source, () => this.#refreshSource(source));
  }

  #loadSource = memoize(
    async (
      source: string,
      getToken?: () => string | null,
      onTokenExpiry?: () => void,
    ) => {
      if (!this.#isOnApiOrigin(source)) {
        console.error(
          "Refusing to load a source outside the API origin:",
          source,
        );

        this.#failedSources.add(source);
        return null;
      }

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
          "cachedSources",
          JSON.stringify(Array.from(this.#sources.entries())),
        );

        return this.#sources.get(source);
      } else {
        console.error("Failed to load source:", source, response);

        this.#failedSources.add(source);
      }

      if (response?.status === 401) {
        this.inflow.storage.removeItem("cachedSources");
        this.#staleSources.clear();
        this.#sources.clear();
        onTokenExpiry?.();
      }

      return null;
    },
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
      const getPatch = (ready: boolean) => this.#getPatch(source, ready);

      if (this.#failedSources.has(source)) {
        context[reference] = {
          hasFailedToLoad: true,
          isLoading: false,
          isReady: false,
          patch: getPatch(false),
          refresh: () => {
            this.#failedSources.delete(source);
            update();
          },
        };

        return;
      }

      let refreshStaleBackground = false;

      if (this.#staleSources.has(source)) {
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
          patch: getPatch(true),

          refresh: () => this.#refreshSource(source),
        };
      }

      if (!this.#sources.has(source) || refreshStaleBackground) {
        if (!refreshStaleBackground) {
          context[reference] = {
            hasFailedToLoad: false,
            isLoading: true,
            isReady: false,
            patch: getPatch(false),
            refresh: () => void 0,
          };
        }

        this.#loadSource(
          source,
          this.#getToken ?? void 0,
          this.#onTokenExpiry ?? void 0,
        ).then(update);
      }
    });
  }

  getState(source: string): Record<string, unknown> {
    const getPatch = (ready: boolean) => this.#getPatch(source, ready);

    if (this.#failedSources.has(source)) {
      return {
        hasFailedToLoad: true,
        isLoading: false,
        isReady: false,
        patch: getPatch(false),
        refresh: () => {
          console.error("Refreshing is not supported in implicit sources.");
        },
      };
    }

    let refreshStaleBackground = false;
    let contextEntry: Record<string, unknown>;

    if (this.#staleSources.has(source)) {
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
            "Loading next page is not supported in implicit sources.",
          );
        };

        specialFields.loadLastPage = () => {
          console.error(
            "Loading last page is not supported in implicit sources.",
          );
        };

        specialFields.loadPreviousPage = () => {
          console.error(
            "Loading previous page is not supported in implicit sources.",
          );
        };

        specialFields.loadFirstPage = () => {
          console.error(
            "Loading first page is not supported in implicit sources.",
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
        patch: getPatch(true),

        refresh: () => {
          console.error("Refreshing is not supported in implicit sources.");
        },
      };

      if (refreshStaleBackground) {
        this.#loadSource(
          source,
          this.#getToken ?? void 0,
          this.#onTokenExpiry ?? void 0,
        ).then(() => this.inflow.requestUpdate());
      }
    } else {
      contextEntry = {
        hasFailedToLoad: false,
        isLoading: true,
        isReady: false,
        patch: getPatch(false),
        refresh: () => {
          console.error("Refreshing is not supported in implicit sources.");
        },
      };

      this.#loadSource(
        source,
        this.#getToken ?? void 0,
        this.#onTokenExpiry ?? void 0,
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
      },
    );
  }
}
