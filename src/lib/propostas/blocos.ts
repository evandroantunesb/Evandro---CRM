// Biblioteca de blocos do construtor de propostas modular. Cada modelo
// (proposta_modelos) tem uma lista ordenada de blocos (proposta_modelo_blocos)
// escolhidos daqui. A lista cobre todo o catálogo da especificação; `implementado`
// marca quais já têm renderer pronto no MVP (o resto fica cadastrado, pronto pra
// ligar depois, sem precisar mudar o formato de armazenamento).
//
// Os valores de `tipo` têm que bater exatamente com o check constraint de
// proposta_modelo_blocos.tipo (20260927030000_proposta_modelos.sql).

export type CategoriaBloco = "capa" | "institucional" | "educativo" | "diagnostico" | "geracao" | "economia" | "fechamento";

export type TipoBloco =
  | "cover"
  | "proposal_identity"
  | "cover_benefits"
  | "about_company"
  | "company_highlights"
  | "company_numbers"
  | "team_and_certifications"
  | "portfolio"
  | "testimonials"
  | "solar_benefits"
  | "how_it_works"
  | "day_night"
  | "solar_faq"
  | "customer_profile"
  | "current_consumption"
  | "consumption_chart"
  | "system_summary"
  | "equipment_summary"
  | "equipment_table"
  | "installation_layout"
  | "generation_monthly_chart"
  | "generation_vs_consumption"
  | "generation_summary"
  | "simulation_assumptions"
  | "long_term_generation"
  | "before_after_bill"
  | "savings_summary"
  | "cashflow_payback"
  | "investment_main"
  | "payment_options"
  | "included_services"
  | "extra_costs"
  | "validity_timeline"
  | "project_steps"
  | "warranties"
  | "support_maintenance"
  | "scope_inclusions_exclusions"
  | "commercial_conditions"
  | "next_steps"
  | "company_contacts"
  | "custom_content"
  | "pdf_attachment";

export type DefinicaoBloco = {
  tipo: TipoBloco;
  categoria: CategoriaBloco;
  nome: string;
  descricao: string;
  /** Já tem renderer pronto no MVP (modelo "Comercial Premium"). */
  implementado: boolean;
  /** Não pode ser removido do modelo comercial mínimo (só desativado com alternativa válida). */
  obrigatorioNoComercial?: boolean;
};

export const BLOCOS_PROPOSTA: DefinicaoBloco[] = [
  // Capa e identificação
  { tipo: "cover", categoria: "capa", nome: "Capa", descricao: "Capa fotográfica, minimalista ou técnica, com a identidade da empresa.", implementado: true },
  { tipo: "proposal_identity", categoria: "capa", nome: "Dados do documento", descricao: "Número, data, validade, vendedor, cidade e tipo de imóvel.", implementado: false },
  { tipo: "cover_benefits", categoria: "capa", nome: "Benefícios da capa", descricao: "Até quatro itens com ícone e texto.", implementado: false },

  // Institucional
  { tipo: "about_company", categoria: "institucional", nome: "Quem somos", descricao: "Título, texto e foto opcional da empresa.", implementado: false },
  { tipo: "company_highlights", categoria: "institucional", nome: "Diferenciais", descricao: "Até seis destaques com ícones.", implementado: false },
  { tipo: "company_numbers", categoria: "institucional", nome: "Nossos números", descricao: "Indicadores institucionais cadastrados.", implementado: false },
  { tipo: "team_and_certifications", categoria: "institucional", nome: "Equipe e qualificações", descricao: "Texto, foto e registros da equipe.", implementado: false },
  { tipo: "portfolio", categoria: "institucional", nome: "Nossos projetos", descricao: "Projetos e fotos autorizados para uso comercial.", implementado: false },
  { tipo: "testimonials", categoria: "institucional", nome: "Depoimentos", descricao: "Depoimentos de clientes autorizados.", implementado: false },

  // Educação sobre energia solar
  { tipo: "solar_benefits", categoria: "educativo", nome: "Benefícios da energia solar", descricao: "Lista editável de benefícios.", implementado: false },
  { tipo: "how_it_works", categoria: "educativo", nome: "Como funciona", descricao: "Quatro passos numerados com diagrama ilustrativo.", implementado: true },
  { tipo: "day_night", categoria: "educativo", nome: "Geração dia/noite", descricao: "Explicação de acordo com o tipo de sistema.", implementado: false },
  { tipo: "solar_faq", categoria: "educativo", nome: "Perguntas frequentes", descricao: "Perguntas e respostas editáveis.", implementado: false },

  // Diagnóstico e sistema
  { tipo: "customer_profile", categoria: "diagnostico", nome: "Perfil do cliente/projeto", descricao: "Nome, local, tipo e objetivo.", implementado: false },
  { tipo: "current_consumption", categoria: "diagnostico", nome: "Consumo atual", descricao: "kWh, valor da conta, distribuidora e período.", implementado: false },
  { tipo: "consumption_chart", categoria: "diagnostico", nome: "Histórico de consumo", descricao: "12 meses de consumo.", implementado: false },
  { tipo: "system_summary", categoria: "diagnostico", nome: "Seu sistema fotovoltaico", descricao: "Cards com potência, módulos, geração média e economia.", implementado: true },
  { tipo: "equipment_summary", categoria: "diagnostico", nome: "Principais equipamentos", descricao: "Módulos, inversor e estrutura, sem marcas fixas.", implementado: true },
  { tipo: "equipment_table", categoria: "diagnostico", nome: "Relação técnica detalhada", descricao: "Quantidade, tipo, potência e modelo dos equipamentos.", implementado: false },
  { tipo: "installation_layout", categoria: "diagnostico", nome: "Layout da instalação", descricao: "Imagem do projeto enviada pela empresa.", implementado: false },

  // Produção e geração
  { tipo: "generation_monthly_chart", categoria: "geracao", nome: "Geração estimada por mês", descricao: "Gráfico de janeiro a dezembro, mesma fonte do resumo do sistema.", implementado: true },
  { tipo: "generation_vs_consumption", categoria: "geracao", nome: "Consumo × geração", descricao: "Duas séries mensais comparadas.", implementado: false },
  { tipo: "generation_summary", categoria: "geracao", nome: "Resumo energético", descricao: "Média mensal, total anual e cobertura estimada.", implementado: false },
  { tipo: "simulation_assumptions", categoria: "geracao", nome: "Premissas técnicas", descricao: "Coordenadas, orientação, inclinação, perdas e fonte do cálculo.", implementado: false },
  { tipo: "long_term_generation", categoria: "geracao", nome: "Projeção de longo prazo", descricao: "Horizonte e hipóteses de degradação.", implementado: false },

  // Economia e investimento
  { tipo: "before_after_bill", categoria: "economia", nome: "Conta antes × depois", descricao: "Gráfico de duas barras com valores em R$.", implementado: true },
  { tipo: "savings_summary", categoria: "economia", nome: "Economia estimada", descricao: "Economia mensal, anual e retorno, quando válidos.", implementado: false },
  { tipo: "cashflow_payback", categoria: "economia", nome: "Retorno/fluxo de caixa", descricao: "Gráfico de retorno do investimento.", implementado: false },
  { tipo: "investment_main", categoria: "economia", nome: "Valor total da proposta", descricao: "Preço em destaque tipográfico.", implementado: true, obrigatorioNoComercial: true },
  { tipo: "payment_options", categoria: "economia", nome: "Condições de pagamento", descricao: "À vista, parcelado ou financiamento, só quando informado.", implementado: true },
  { tipo: "included_services", categoria: "economia", nome: "O que está incluso", descricao: "Itens realmente contemplados na proposta.", implementado: true },
  { tipo: "extra_costs", categoria: "economia", nome: "Itens e serviços adicionais", descricao: "Opções e valores adicionais, quando aplicável.", implementado: false },
  { tipo: "validity_timeline", categoria: "economia", nome: "Validade e prazo", descricao: "Data limite da proposta e prazo estimado.", implementado: false },

  // Execução, suporte e fechamento
  { tipo: "project_steps", categoria: "fechamento", nome: "Etapas da instalação", descricao: "Cronograma editável do projeto.", implementado: false },
  { tipo: "warranties", categoria: "fechamento", nome: "Garantias", descricao: "Itens, condições e prazos documentados.", implementado: false },
  { tipo: "support_maintenance", categoria: "fechamento", nome: "Suporte e manutenção", descricao: "Serviços efetivamente oferecidos.", implementado: false },
  { tipo: "scope_inclusions_exclusions", categoria: "fechamento", nome: "Inclusões e exclusões", descricao: "Listas configuradas pela empresa.", implementado: false },
  { tipo: "commercial_conditions", categoria: "fechamento", nome: "Condições comerciais", descricao: "Texto aprovado e validade.", implementado: false },
  { tipo: "next_steps", categoria: "fechamento", nome: "Próximos passos", descricao: "Faixa de fechamento com CTA (WhatsApp, link ou texto).", implementado: true },
  { tipo: "company_contacts", categoria: "fechamento", nome: "Contatos finais", descricao: "Dados da empresa e/ou do vendedor.", implementado: false },
  { tipo: "custom_content", categoria: "fechamento", nome: "Texto/imagem livre", descricao: "Editor de texto sanitizado com imagem opcional.", implementado: false },
  { tipo: "pdf_attachment", categoria: "fechamento", nome: "Anexo externo", descricao: "PDFs adicionais anexados à proposta.", implementado: false },
];

export const TIPOS_BLOCO_PROPOSTA = BLOCOS_PROPOSTA.map((b) => b.tipo);

export function definicaoDoBloco(tipo: string): DefinicaoBloco | undefined {
  return BLOCOS_PROPOSTA.find((b) => b.tipo === tipo);
}

export const NOME_CATEGORIA_BLOCO: Record<CategoriaBloco, string> = {
  capa: "Capa e identificação",
  institucional: "Institucional",
  educativo: "Educação sobre energia solar",
  diagnostico: "Diagnóstico e sistema",
  geracao: "Produção e geração",
  economia: "Economia e investimento",
  fechamento: "Execução, suporte e fechamento",
};
