"use client";

import { useTransition, type FormEvent } from "react";

/**
 * Envia o formulário para a ação do `useActionState` sem o reset automático do React 19
 * (`<form action={...}>` limpa os campos ao terminar, mesmo quando a ação recusa os dados —
 * o usuário perdia o que tinha digitado). Use como `onSubmit`; a validação nativa do
 * navegador (`required` etc.) continua valendo antes do envio.
 */
export function useEnvioSemReset(acao: (dados: FormData) => void) {
  const [, iniciar] = useTransition();
  return (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    iniciar(() => acao(dados));
  };
}
