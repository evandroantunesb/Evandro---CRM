import Image from "next/image";

/** Logo oficial do Raion (arquivo original da marca). Use tom "claro" sobre fundo escuro. */
export function LogoRaion({ tom = "escuro", altura = 28 }: { tom?: "escuro" | "claro"; altura?: number }) {
  return (
    <Image
      src={tom === "claro" ? "/marca/logo-claro.png" : "/marca/logo-escuro.png"}
      alt="Raion"
      width={1110}
      height={240}
      style={{ height: altura, width: "auto", alignSelf: "flex-start" }}
      priority
    />
  );
}
