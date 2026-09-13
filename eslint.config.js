// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const { allExtensions } = require("eslint-config-expo/flat/utils/extensions");

module.exports = defineConfig([
  expoConfig,
  {
    // Workspaces lint themselves — `expo lint` is the Expo app's linter and its
    // React Native rules do not apply to apps/web or packages/*.
    ignores: ["dist/*", "apps/**", "packages/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    settings: {
      // The default `node` resolver understands Expo's platform-suffixed
      // extensions (e.g. index.native.ts) but not the `@/*` tsconfig path
      // alias; the `typescript` resolver understands the alias but not
      // platform suffixes on its own, so give it the same extensions list.
      "import/resolver": {
        typescript: {
          extensions: allExtensions,
        },
      },
    },
  },
]);
