/**
 * Injeção controlada de falha no cliente do Supabase, para testar caminhos que o banco local não
 * reproduz sob demanda. Todo o resto passa direto para o cliente real (RLS real).
 * - `apagarKit`: as próximas N chamadas de `.from("kit_componentes").delete()` falham sem executar;
 * - `lerCalculo`: as próximas N leituras (`select`) de `calculos_solares` falham sem executar;
 * - `listar`: as próximas N listagens do Storage falham.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseServidor } from "@/lib/supabase/server";

type Contadores = { apagarKit?: number; lerCalculo?: number; listar?: number };

const ERRO = { message: "falha injetada", code: "XX000", details: "", hint: "" };

/** Encadeamento falso que termina em `{ data: null, error }` quando aguardado. */
function cadeiaComErro(): unknown {
  const resultado = { data: null, error: ERRO, count: null, status: 500, statusText: "falha injetada" };
  const cadeia: Record<string, unknown> = {};
  for (const metodo of ["in", "eq", "select", "order", "limit", "maybeSingle", "single"]) cadeia[metodo] = () => cadeia;
  cadeia.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, erro);
  return cadeia;
}

function ligar<T extends object>(alvo: T, prop: string | symbol) {
  const valor = Reflect.get(alvo, prop);
  return typeof valor === "function" ? valor.bind(alvo) : valor;
}

export function comFalha(cliente: SupabaseClient<Database>, contadores: Contadores): SupabaseServidor {
  const c = { ...contadores };
  return new Proxy(cliente, {
    get(alvo, prop) {
      if (prop === "from") {
        return (tabela: string) => {
          const consulta = alvo.from(tabela as never);
          if (tabela === "calculos_solares") {
            return new Proxy(consulta, {
              get(q, p) {
                if (p === "select" && (c.lerCalculo ?? 0) > 0) {
                  c.lerCalculo!--;
                  return () => cadeiaComErro();
                }
                return ligar(q, p);
              },
            });
          }
          if (tabela !== "kit_componentes") return consulta;
          return new Proxy(consulta, {
            get(q, p) {
              if (p === "delete" && (c.apagarKit ?? 0) > 0) {
                c.apagarKit!--;
                return () => cadeiaComErro();
              }
              return ligar(q, p);
            },
          });
        };
      }
      if (prop === "storage") {
        return new Proxy(alvo.storage, {
          get(s, p) {
            if (p !== "from") return ligar(s, p);
            return (bucket: string) => {
              const b = s.from(bucket);
              return new Proxy(b, {
                get(x, q) {
                  if (q === "list" && (c.listar ?? 0) > 0) {
                    c.listar!--;
                    return async () => ({ data: null, error: new Error("falha injetada") });
                  }
                  return ligar(x, q);
                },
              });
            };
          },
        });
      }
      return ligar(alvo, prop);
    },
  }) as unknown as SupabaseServidor;
}
