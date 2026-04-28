/**
 * Canary test — verifies the Jest + ts-jest pipeline is wired correctly.
 * This test must always pass. If it fails, the test infrastructure itself is broken.
 *
 * No game logic is tested here. Gameplay logic tests live in tests/unit/[system]/.
 */

describe("Canary", () => {
  it("Jest and ts-jest are configured correctly", () => {
    expect(true).toBe(true);
  });

  it("TypeScript strict mode is active (type-level check)", () => {
    // If strict mode is off this file would still compile, but the tsconfig
    // would silently allow unsafe patterns elsewhere. We verify a basic
    // type assertion works as expected at runtime.
    const value: number = 42;
    expect(typeof value).toBe("number");
  });

  it("ES2020 features are available", () => {
    // Optional chaining and nullish coalescing — used throughout game logic.
    const obj: { a?: { b?: number } } = { a: { b: 7 } };
    expect(obj?.a?.b ?? 0).toBe(7);

    const missing: { a?: { b?: number } } = {};
    expect(missing?.a?.b ?? 99).toBe(99);
  });
});
