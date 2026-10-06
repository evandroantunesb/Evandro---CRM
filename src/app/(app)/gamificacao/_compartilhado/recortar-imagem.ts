import { calcularDimensoesSaida, extensaoDoTipo, LIMITE_BYTES_IMAGEM, SAIDA_MAXIMA_IMAGEM } from "@/lib/imagem-upload";

/** Área do recorte em pixels da imagem ORIGINAL (o que o `react-easy-crop` devolve). */
export type AreaRecorte = { x: number; y: number; width: number; height: number };

export type ImagemRecortada = { blob: Blob; tipo: string; extensao: "webp" | "jpg" | "png" };

const QUALIDADES = [0.85, 0.7, 0.55];

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível abrir a imagem."));
    img.src = src;
  });
}

function gerarBlob(canvas: HTMLCanvasElement, tipo: string, qualidade: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade));
}

/**
 * Recorta `src` na `area` e devolve WebP (qualidade ~0.85, no máximo 1200x900, sem ampliar).
 * Se o navegador não codifica WebP no canvas, cai para JPEG (fundo branco no lugar da
 * transparência). Se o arquivo passar do limite, repete com qualidade menor.
 */
export async function recortarImagem(
  src: string,
  area: AreaRecorte,
  saidaMaxima: { largura: number; altura: number } = SAIDA_MAXIMA_IMAGEM,
): Promise<ImagemRecortada> {
  const img = await carregarImagem(src);
  const { largura, altura } = calcularDimensoesSaida(area.width, area.height, saidaMaxima);
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu preparar a imagem.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, largura, altura);

  let tipo = "image/webp";
  let blob = await gerarBlob(canvas, tipo, QUALIDADES[0]);
  if (!blob || blob.type !== "image/webp") {
    // Sem suporte a WebP no canvas: o navegador devolve PNG. Refaz em JPEG com fundo branco.
    tipo = "image/jpeg";
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, largura, altura);
    blob = await gerarBlob(canvas, tipo, QUALIDADES[0]);
  }
  for (let i = 1; blob && blob.size > LIMITE_BYTES_IMAGEM && i < QUALIDADES.length; i++) {
    blob = await gerarBlob(canvas, tipo, QUALIDADES[i]);
  }
  if (!blob) throw new Error("Não foi possível gerar a imagem recortada.");
  if (blob.size > LIMITE_BYTES_IMAGEM) throw new Error("A imagem recortada ficou acima de 3 MB. Tente uma imagem menor.");
  const extensao = extensaoDoTipo(blob.type);
  if (!extensao) throw new Error("Não foi possível gerar a imagem recortada.");
  return { blob, tipo: blob.type, extensao };
}
