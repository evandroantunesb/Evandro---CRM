// Exporta os bytes do Supabase Storage para um pacote local temporário.
// Somente leitura no Supabase: o inventário vem de storage.buckets/objects via psql.
// Nenhum nome de objeto, URL assinada ou credencial aparece nos logs.
// Node 22+, sem dependências externas.
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";

const PROJETO = "wswpxdmgfdamvqhyztrm";
const URL_ESPERADA = `https://${PROJETO}.supabase.co`;
const MAX_OBJETOS = 100_000;
const MAX_TENTATIVAS = 3;
const LIMITE_TEMPO_MS = 300_000;

function falhar(mensagem) {
  throw new Error(mensagem);
}

function validarAmbiente() {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== URL_ESPERADA || process.env.SUPABASE_PROJECT_ID !== PROJETO) {
    falhar("URL ou referência de origem Supabase divergente do projeto aprovado");
  }
  if (!chave) falhar("SUPABASE_SERVICE_ROLE_KEY ausente");
  if (process.argv.length !== 4) falhar("Uso: node exportar-storage-producao.mjs <inventario.jsonl> <diretorio-temporario>");
  return { url, chave, inventario: process.argv[2], pasta: process.argv[3] };
}

function caminhoCodificado(path) {
  if (typeof path !== "string" || path.length === 0 || path.length > 2048 || path.includes("\0")) {
    falhar("Inventário contém caminho de objeto inválido");
  }
  const partes = path.split("/");
  if (partes.some((parte) => parte === "" || parte === "." || parte === "..")) {
    falhar("Inventário contém caminho não canônico");
  }
  return partes.map((parte) => encodeURIComponent(parte)).join("/");
}

function validarLinha(linha, buckets, vistos) {
  let registro;
  try { registro = JSON.parse(linha); } catch { falhar("Inventário PostgreSQL com JSON inválido"); }
  const { bucket, public: publico, path, metadata_size: tamanho, mime_type: mime } = registro;
  if (typeof bucket !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(bucket)) {
    falhar("Inventário contém identificador de bucket inválido");
  }
  if (typeof publico !== "boolean") falhar("Inventário contém visibilidade de bucket inválida");
  if (buckets.has(bucket) && buckets.get(bucket) !== publico) falhar("Inventário tem metadados contraditórios");
  buckets.set(bucket, publico);
  if (path === null) return null; // bucket vazio: ainda será documentado no manifesto
  const encoded = caminhoCodificado(path);
  const key = `${bucket}\0${path}`;
  if (vistos.has(key)) falhar("Objeto duplicado no inventário");
  vistos.add(key);
  const tamanhoEsperado = tamanho === null ? null : Number(tamanho);
  if (tamanho !== null && (!/^\d+$/.test(String(tamanho)) || !Number.isSafeInteger(tamanhoEsperado))) {
    falhar("Tamanho inválido nos metadados do objeto");
  }
  return {
    bucket,
    path,
    encoded,
    expected_bytes: tamanhoEsperado,
    mime_type: typeof mime === "string" ? mime : null,
  };
}

async function baixarObjeto({ url, chave }, item, destino) {
  const caminho = `${url}/storage/v1/object/authenticated/${encodeURIComponent(item.bucket)}/${item.encoded}`;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const resposta = await fetch(caminho, {
        method: "GET",
        headers: { apikey: chave, Authorization: `Bearer ${chave}` },
        redirect: "error",
        signal: AbortSignal.timeout(LIMITE_TEMPO_MS),
      });
      if (!resposta.ok || !resposta.body) {
        const erro = new Error(`HTTP ${resposta.status}`);
        erro.status = resposta.status;
        throw erro;
      }
      const hash = createHash("sha256");
      let bytes = 0;
      const medir = new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(resposta.body), medir, createWriteStream(destino, { flags: "wx", mode: 0o600 }));
      if (item.expected_bytes !== null && bytes !== item.expected_bytes) {
        falhar("Tamanho baixado difere do inventário de produção (pode haver edição concorrente)");
      }
      return { bytes, sha256: hash.digest("hex") };
    } catch (erro) {
      await rm(destino, { force: true });
      if (erro.status === 401 || erro.status === 403 || erro.message?.includes("Tamanho baixado") || tentativa === MAX_TENTATIVAS) {
        falhar(`Falha ao baixar objeto do Storage (tentativa ${tentativa}; ${erro.status ? "HTTP " + erro.status : "falha de transmissão/integridade"})`);
      }
      await new Promise((resolver) => setTimeout(resolver, tentativa * 1250));
    }
  }
  falhar("Download não concluído");
}

async function executar() {
  const cfg = validarAmbiente();
  await mkdir(join(cfg.pasta, "objetos"), { mode: 0o700 });
  const manifesto = await open(join(cfg.pasta, "manifest.json"), "wx", 0o600);
  const buckets = new Map();
  const vistos = new Set();
  let quantidade = 0;
  let bytesTotais = 0;
  let separador = "";
  try {
    await manifesto.write(`{"format":"raion-storage-backup-v1","project_ref":"${PROJETO}","captured_at":"${new Date().toISOString()}","objects":[`);
    const leitor = createInterface({ input: createReadStream(cfg.inventario, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const linha of leitor) {
      if (!linha.trim()) continue;
      const item = validarLinha(linha, buckets, vistos);
      if (item === null) continue;
      quantidade++;
      if (quantidade > MAX_OBJETOS) falhar("Limite de segurança de objetos excedido");
      const nomeLocal = `objetos/${String(quantidade).padStart(8, "0")}.bin`;
      const resultado = await baixarObjeto(cfg, item, join(cfg.pasta, nomeLocal));
      bytesTotais += resultado.bytes;
      await manifesto.write(separador + JSON.stringify({
        bucket: item.bucket,
        path: item.path,
        archive_path: nomeLocal,
        bytes: resultado.bytes,
        sha256: resultado.sha256,
        mime_type: item.mime_type,
      }));
      separador = ",";
    }
    if (!buckets.size || !quantidade) falhar("Inventário de buckets/objetos vazio: falha fechada");
    const listaBuckets = [...buckets].map(([id, publico]) => ({ id, public: publico }));
    await manifesto.write(`],"buckets":${JSON.stringify(listaBuckets)},"object_count":${quantidade},"total_bytes":${bytesTotais}}\n`);
  } finally {
    await manifesto.close();
  }
  await writeFile(join(cfg.pasta, "info.json"), JSON.stringify({
    format: "raion-storage-backup-v1", project_ref: PROJETO,
    source: "production storage.objects snapshot-like inventory; read-only downloads",
    object_count: quantidade, total_bytes: bytesTotais,
    note: "Metadata/bytes are exported separately from PostgreSQL. Restore requires controlled bucket and object upload; this is NOT a Supabase Storage server-side snapshot.",
  }, null, 2) + "\n", { mode: 0o600 });
  await writeFile(join(cfg.pasta, "resumo.txt"), `${quantidade} ${bytesTotais}\n`, { mode: 0o600 });
  console.log(`Exportação Storage concluída: ${quantidade} objetos, ${bytesTotais} bytes (caminhos omitidos)`);
}

executar().catch((erro) => {
  // Mensagens controladas: não imprimir stack traces com URL, nomes ou credenciais.
  const seguras = [
    "URL ou referência de origem Supabase divergente do projeto aprovado",
    "SUPABASE_SERVICE_ROLE_KEY ausente",
    "Uso:",
    "Inventário",
    "Objeto duplicado",
    "Tamanho inválido",
    "Tamanho baixado",
    "Limite de segurança",
    "Falha ao baixar",
  ];
  const mensagem = seguras.some((prefixo) => String(erro.message).startsWith(prefixo))
    ? erro.message
    : "Erro ao exportar objetos do Supabase Storage (detalhes sensíveis omitidos)";
  console.error(`::error::${mensagem}`);
  process.exitCode = 1;
});
