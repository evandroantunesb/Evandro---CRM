import Image from "next/image";

/** Símbolo da marca: sol dourado cortado pelo horizonte. Desenhado a partir da identidade visual do Raion. */
export function SimboloRaion({ altura = 32, className = "" }: { altura?: number; className?: string }) {
  return (
    <svg viewBox="0 0 202 126" height={altura} width={(altura * 202) / 126} className={className} role="img" aria-label="Raion">
      <defs>
        <linearGradient id="raion-sol" x1="0.1" y1="0.1" x2="0.75" y2="1">
          <stop offset="0" stopColor="#A36A2A" />
          <stop offset="0.4" stopColor="#D1A24A" />
          <stop offset="0.7" stopColor="#E2BE72" />
          <stop offset="1" stopColor="#F7EEDB" />
        </linearGradient>
        <linearGradient id="raion-linha" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#B57A32" />
          <stop offset="1" stopColor="#D4AF37" />
        </linearGradient>
        <mask id="raion-corte">
          <rect width="202" height="126" fill="white" />
          <rect y="55" width="202" height="16" fill="black" />
        </mask>
      </defs>
      <circle cx="101" cy="63" r="62" fill="url(#raion-sol)" mask="url(#raion-corte)" />
      <rect y="61.5" width="202" height="3" fill="url(#raion-linha)" />
    </svg>
  );
}

/** Logo completo (símbolo + "raion"). Use tom "claro" sobre fundo escuro. */
export function LogoRaion({ tom = "escuro", altura = 28 }: { tom?: "escuro" | "claro"; altura?: number }) {
  return (
    <span className="inline-flex items-center" style={{ gap: altura * 0.14 }}>
      <SimboloRaion altura={altura * 1.02} className="shrink-0" />
      <Image
        src={tom === "claro" ? "/marca/wordmark-claro.png" : "/marca/wordmark-escuro.png"}
        alt="raion"
        width={392}
        height={125}
        style={{ height: altura, width: "auto" }}
        priority
      />
    </span>
  );
}
