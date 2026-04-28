/**
 * Jest configuration for Grid Reaper unit and integration tests.
 * Runs TypeScript tests via ts-jest without requiring a full Cocos Creator build.
 * Implements: docs/architecture/ testing standards (coding-standards.md)
 *
 * Note: Using .js (not .ts) to avoid requiring ts-node as an additional dependency.
 */

/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*_test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
      },
    ],
  },
  moduleNameMapper: {
    "^src/(.*)$": "<rootDir>/src/$1",
    "^cc$": "<rootDir>/tests/helpers/cc-mock.ts",
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  coverageThreshold: {
    global: {
      lines: 70,
    },
  },
  coverageDirectory: "coverage",
  verbose: true,
};

module.exports = config;
