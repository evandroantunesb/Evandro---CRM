/**
 * Planilha .xlsx mínima para os testes de navegador (sem dependência): um zip "stored" com uma aba, textos inline e
 * números. Só para gerar entrada de teste; não é usado pelo app.
 */

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(dados: Buffer) {
  let c = 0xffffffff;
  for (const b of dados) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(arquivos: { nome: string; conteudo: string }[]): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;
  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, "utf8");
    const dados = Buffer.from(a.conteudo, "utf8");
    const crc = crc32(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    locais.push(local, nome, dados);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, nome);
    deslocamento += local.length + nome.length + dados.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const coluna = (i: number) => String.fromCharCode(65 + i);

export function xlsxMinimo(linhas: (string | number | null)[][]): Buffer {
  const celulas = linhas
    .map(
      (linha, l) =>
        `<row r="${l + 1}">${linha
          .map((v, c) =>
            v == null
              ? ""
              : typeof v === "number"
                ? `<c r="${coluna(c)}${l + 1}"><v>${v}</v></c>`
                : `<c r="${coluna(c)}${l + 1}" t="inlineStr"><is><t>${escapar(v)}</t></is></c>`,
          )
          .join("")}</row>`,
    )
    .join("");
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zip([
    {
      nome: "[Content_Types].xml",
      conteudo: `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    },
    {
      nome: "_rels/.rels",
      conteudo: `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      nome: "xl/workbook.xml",
      conteudo: `${xml}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tabela" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      conteudo: `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    },
    {
      nome: "xl/worksheets/sheet1.xml",
      conteudo: `${xml}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${celulas}</sheetData></worksheet>`,
    },
  ]);
}
