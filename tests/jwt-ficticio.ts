/**
 * JWTs FICTÍCIOS para testes puros dos guards de ambiente. Cabeçalho e payload são JSON
 * inventados; a assinatura é só um marcador de texto (nunca uma assinatura real) usado para
 * conferir que as mensagens de erro não vazam o token.
 */
const segmento = (objeto: unknown) => Buffer.from(JSON.stringify(objeto)).toString("base64url");

export function jwtFicticio(payload: unknown, assinatura = "ASSINATURAFICTICIA", cabecalho: unknown = { alg: "HS256", typ: "JWT" }) {
  return `${segmento(cabecalho)}.${segmento(payload)}.${assinatura}`;
}

/** Chave no formato das que o Supabase local (CLI) emite: emissor supabase-demo, sem `ref`. */
export function jwtDemo(papel: "anon" | "service_role", assinatura?: string) {
  return jwtFicticio({ iss: "supabase-demo", role: papel, exp: 1983812996 }, assinatura);
}

/** Chave no formato de projeto remoto: emissor supabase e claim `ref`. */
export function jwtRemoto(papel: "anon" | "service_role", assinatura?: string) {
  return jwtFicticio({ iss: "supabase", ref: "projetoficticio", role: papel, iat: 1700000000, exp: 2000000000 }, assinatura);
}
