import { ScopedStorage } from "./ScopedStorage";

const BASE_A = "https://store-a.example.com/s/customer/";
const BASE_B = "https://store-b.example.com/s/customer/";

describe("ScopedStorage", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("writes and reads keys under its namespace", () => {
    const storage = new ScopedStorage(BASE_A);
    storage.setItem("session", "token-a");

    expect(localStorage.getItem(`inflow:${BASE_A}:session`)).toBe("token-a");
    expect(storage.getItem("session")).toBe("token-a");
    expect(storage.getItem("nothing")).toBeNull();
  });

  it("keeps two namespaces invisible to each other", () => {
    const a = new ScopedStorage(BASE_A);
    const b = new ScopedStorage(BASE_B);

    a.setItem("session", "token-a");
    b.setItem("session", "token-b");

    expect(a.getItem("session")).toBe("token-a");
    expect(b.getItem("session")).toBe("token-b");

    b.clear();
    expect(a.getItem("session")).toBe("token-a");
  });

  // The defect this class exists to fix: `localStorage.clear()` deleted every
  // key on the origin, including keys owned by unrelated apps.
  it("clears only its own keys, sparing foreign ones", () => {
    const storage = new ScopedStorage(BASE_A);
    localStorage.setItem("unrelated-app", "keep me");
    storage.setItem("cachedSources", "[]");

    storage.clear();

    expect(storage.getItem("cachedSources")).toBeNull();
    expect(localStorage.getItem("unrelated-app")).toBe("keep me");
  });

  it("counts and enumerates only its own keys, and round-trips them", () => {
    const storage = new ScopedStorage(BASE_A);
    localStorage.setItem("unrelated-app", "ignored");
    storage.setItem("a", "1");
    storage.setItem("b", "2");

    expect(storage.length).toBe(2);
    expect([storage.key(0), storage.key(1)].sort()).toEqual(["a", "b"]);
    expect(storage.getItem(storage.key(0) as string)).not.toBeNull();
    expect(storage.key(2)).toBeNull();
  });

  it("removes a single key without touching the rest", () => {
    const storage = new ScopedStorage(BASE_A);
    storage.setItem("a", "1");
    storage.setItem("b", "2");

    storage.removeItem("a");

    expect(storage.getItem("a")).toBeNull();
    expect(storage.getItem("b")).toBe("2");
  });

  it("wraps a backing store other than localStorage when given one", () => {
    const storage = new ScopedStorage(BASE_A, sessionStorage);
    storage.setItem("session", "token-a");

    expect(sessionStorage.getItem(`inflow:${BASE_A}:session`)).toBe("token-a");
    expect(localStorage.getItem(`inflow:${BASE_A}:session`)).toBeNull();
  });
});
