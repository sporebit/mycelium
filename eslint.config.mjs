import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const SERVICE_CLIENT_MESSAGE =
  "The service-role client bypasses RLS and may only be imported under lib/system/**. " +
  "Use createUserClient() from @/lib/supabase/user, or a helper in lib/system.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // P12 Global Rule 5: the service-role client is fenced to lib/system/**.
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    ignores: ["lib/system/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/lib/system/serviceClient", message: SERVICE_CLIENT_MESSAGE },
          ],
          patterns: [
            {
              group: ["**/lib/system/serviceClient", "**/system/serviceClient"],
              message: SERVICE_CLIENT_MESSAGE,
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
