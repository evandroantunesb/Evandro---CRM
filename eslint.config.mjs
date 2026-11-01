import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import quality from "./eslint-rules/index.cjs";

// Funções que criam cliente Supabase a partir da biblioteca crua (só `src/lib/supabase/*` deve chamá-las).
const CRIAR_CLIENTE_CRU = ["createClient", "createServerClient", "createBrowserClient"];
const SUPABASE_CRU = ["@supabase/supabase-js", "@supabase/ssr"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Regras de qualidade copiadas do vibe-coding-toolkit (eslint-rules/, MIT): CommonJS de propósito.
  {
    files: ["eslint-rules/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Tamanho de arquivo e console direto, só no código do app. Tudo em aviso: o CI não usa --max-warnings.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/supabase/database.types.ts"],
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: 350 }],
      "quality/no-direct-console": ["warn", { logger: "um helper de log do projeto (ainda não existe)" }],
    },
  },
  // Acesso a dados. Cada arquivo recebe uma só configuração da regra: a do último bloco que o casa, então os blocos
  // vão do mais geral ao mais específico. `import type` não conta (a regra compara o nome importado).
  // 1. Fora de src/lib/supabase, ninguém cria cliente direto da biblioteca.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/supabase/**"],
    plugins: { quality },
    rules: {
      "quality/no-direct-data-access": ["warn", { modules: SUPABASE_CRU, bindings: CRIAR_CLIENTE_CRU, layers: ["/src/"] }],
    },
  },
  // 2. Em src/app, o cliente admin (service_role, fura a RLS) só nas rotas públicas por token, na API e no perfil.
  {
    files: ["src/app/**/*.{ts,tsx}"],
    ignores: ["src/app/proposta/**", "src/app/contrato/**", "src/app/captura/**", "src/app/api/**", "src/app/**/perfil/page.tsx"],
    plugins: { quality },
    rules: {
      "quality/no-direct-data-access": [
        "warn",
        {
          modules: ["@/lib/supabase/admin", ...SUPABASE_CRU],
          bindings: ["criarClienteAdmin", ...CRIAR_CLIENTE_CRU],
          layers: ["/src/app/"],
        },
      ],
    },
  },
  // 3. Componentes compartilhados não usam cliente de servidor nem admin; o do navegador continua liberado.
  {
    files: ["src/components/**/*.{ts,tsx}"],
    plugins: { quality },
    rules: {
      "quality/no-direct-data-access": [
        "warn",
        {
          modules: ["@/lib/supabase/server", "@/lib/supabase/admin", ...SUPABASE_CRU],
          bindings: ["criarClienteServidor", "criarClienteAdmin", ...CRIAR_CLIENTE_CRU],
          layers: ["/src/components/"],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
