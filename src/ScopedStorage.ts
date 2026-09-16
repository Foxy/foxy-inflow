/**
 * A `Storage`-shaped view over another storage that prefixes every key, so two
 * portals served from one domain cannot read or clear each other's data.
 *
 * `clear()` removes only this namespace's keys. Calling `localStorage.clear()`
 * instead would delete every key on the origin, including keys owned by
 * unrelated apps on the same domain.
 */
export class ScopedStorage implements Storage {
  [key: string]: any;

  #backing: Storage;

  #prefix: string;

  constructor(namespace: string, backing: Storage = localStorage) {
    this.#backing = backing;
    this.#prefix = `inflow:${namespace}:`;
  }

  get length() {
    return this.#scopedKeys().length;
  }

  key(index: number) {
    return this.#scopedKeys()[index] ?? null;
  }

  getItem(key: string) {
    return this.#backing.getItem(this.#prefix + key);
  }

  setItem(key: string, value: string) {
    this.#backing.setItem(this.#prefix + key, value);
  }

  removeItem(key: string) {
    this.#backing.removeItem(this.#prefix + key);
  }

  clear() {
    this.#scopedKeys().forEach((key) => this.removeItem(key));
  }

  // Returns this namespace's keys with the prefix stripped, so they can be
  // passed straight back into getItem/removeItem. Collected up front because
  // clear() removes while iterating.
  #scopedKeys() {
    const keys: string[] = [];

    for (let index = 0; index < this.#backing.length; index++) {
      const key = this.#backing.key(index);
      if (key?.startsWith(this.#prefix))
        keys.push(key.substring(this.#prefix.length));
    }

    return keys;
  }
}
