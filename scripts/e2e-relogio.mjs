/**
 * Relógio do servidor de TESTE de navegador (só e2e): carregado com `--import` por scripts/e2e-servidor.mjs no
 * `next start` do e2e, nunca em produção nem no build. Desloca `Date` (e `Date.now()`) pelo valor gravado em
 * RAION_E2E_RELOGIO_ARQUIVO (e2e/.estado/relogio.json, ignorado pelo git), que só o próprio teste escreve no disco
 * local: nenhum usuário do app, cabeçalho ou parâmetro de requisição altera a data. Sem arquivo, o relógio é o real.
 *
 * Formato: {"deslocamentoMs": <número>}. O tempo continua andando (só soma o deslocamento), para não congelar
 * timeouts nem a expiração de sessões.
 *
 * É uma função (não `class extends Date`) com `now`, `parse` e `UTC` PRÓPRIOS e o mesmo prototype: o sandbox do
 * middleware do Next copia só as propriedades próprias do `Date` global (sem elas, `Date.parse` some e tudo quebra).
 */
import { readFileSync } from "node:fs";

const arquivo = process.env.RAION_E2E_RELOGIO_ARQUIVO;
if (arquivo) {
  const DataReal = Date;
  let lidoEm = 0;
  let deslocamento = 0;
  const deslocamentoAtual = () => {
    const agora = DataReal.now();
    if (agora - lidoEm > 250) {
      lidoEm = agora;
      try {
        const lido = JSON.parse(readFileSync(arquivo, "utf8")).deslocamentoMs;
        deslocamento = Number.isFinite(lido) ? lido : 0;
      } catch {
        deslocamento = 0;
      }
    }
    return deslocamento;
  };
  const agoraDeslocado = () => DataReal.now() + deslocamentoAtual();

  function DataE2E(...args) {
    // `Date()` sem `new` devolve texto, como o original.
    if (!new.target) return new DataReal(agoraDeslocado()).toString();
    return args.length === 0 ? new DataReal(agoraDeslocado()) : new DataReal(...args);
  }
  DataE2E.prototype = DataReal.prototype;
  DataE2E.now = agoraDeslocado;
  DataE2E.parse = DataReal.parse;
  DataE2E.UTC = DataReal.UTC;
  globalThis.Date = DataE2E;
}
