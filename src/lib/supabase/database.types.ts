export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      anexos: {
        Row: {
          caminho: string
          categoria: string
          created_at: string
          empresa_id: string
          enviado_por: string | null
          id: string
          negocio_id: string
          nome: string
          tamanho: number
          tipo_mime: string | null
        }
        Insert: {
          caminho: string
          categoria?: string
          created_at?: string
          empresa_id: string
          enviado_por?: string | null
          id?: string
          negocio_id: string
          nome: string
          tamanho: number
          tipo_mime?: string | null
        }
        Update: {
          caminho?: string
          categoria?: string
          created_at?: string
          empresa_id?: string
          enviado_por?: string | null
          id?: string
          negocio_id?: string
          nome?: string
          tamanho?: number
          tipo_mime?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anexos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "empresa_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      atividades: {
        Row: {
          ator_id: string | null
          contato_id: string | null
          created_at: string
          dados: Json
          empresa_id: string
          id: number
          negocio_id: string | null
          tipo: string
        }
        Insert: {
          ator_id?: string | null
          contato_id?: string | null
          created_at?: string
          dados?: Json
          empresa_id: string
          id?: never
          negocio_id?: string | null
          tipo: string
        }
        Update: {
          ator_id?: string | null
          contato_id?: string | null
          created_at?: string
          dados?: Json
          empresa_id?: string
          id?: never
          negocio_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      calculos_solares: {
        Row: {
          atualizado_por: string | null
          consumo_medio_kwh: number
          conta_com_solar: number
          conta_sem_solar: number
          created_at: string
          criado_por: string | null
          custo_fio_b: number
          disponibilidade_kwh: number
          economia_mensal: number
          empresa_id: string
          geracao_estimada_kwh_mes: number
          id: string
          kit_id: string | null
          kit_nome: string
          kit_potencia_kwp: number
          kit_preco: number
          kwh_compensado: number
          kwh_faturado: number
          negocio_id: string
          observacoes: string | null
          payback_meses: number | null
          percentual_fio_b: number
          produtividade_kwh_kwp_mes: number
          tarifa_kwh: number
          tipo_ligacao: Database["public"]["Enums"]["tipo_ligacao"]
          updated_at: string
          valor_fatura_medio: number | null
        }
        Insert: {
          atualizado_por?: string | null
          consumo_medio_kwh: number
          conta_com_solar: number
          conta_sem_solar: number
          created_at?: string
          criado_por?: string | null
          custo_fio_b: number
          disponibilidade_kwh: number
          economia_mensal: number
          empresa_id: string
          geracao_estimada_kwh_mes: number
          id?: string
          kit_id?: string | null
          kit_nome: string
          kit_potencia_kwp: number
          kit_preco: number
          kwh_compensado: number
          kwh_faturado: number
          negocio_id: string
          observacoes?: string | null
          payback_meses?: number | null
          percentual_fio_b: number
          produtividade_kwh_kwp_mes: number
          tarifa_kwh: number
          tipo_ligacao?: Database["public"]["Enums"]["tipo_ligacao"]
          updated_at?: string
          valor_fatura_medio?: number | null
        }
        Update: {
          atualizado_por?: string | null
          consumo_medio_kwh?: number
          conta_com_solar?: number
          conta_sem_solar?: number
          created_at?: string
          criado_por?: string | null
          custo_fio_b?: number
          disponibilidade_kwh?: number
          economia_mensal?: number
          empresa_id?: string
          geracao_estimada_kwh_mes?: number
          id?: string
          kit_id?: string | null
          kit_nome?: string
          kit_potencia_kwp?: number
          kit_preco?: number
          kwh_compensado?: number
          kwh_faturado?: number
          negocio_id?: string
          observacoes?: string | null
          payback_meses?: number | null
          percentual_fio_b?: number
          produtividade_kwh_kwp_mes?: number
          tarifa_kwh?: number
          tipo_ligacao?: Database["public"]["Enums"]["tipo_ligacao"]
          updated_at?: string
          valor_fatura_medio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "calculos_solares_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "empresa_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculos_solares_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "empresa_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculos_solares_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculos_solares_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kits_solares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculos_solares_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: true
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          cidade: string | null
          created_at: string
          criado_por: string | null
          documento: string | null
          email: string | null
          empresa_id: string
          endereco: string | null
          id: string
          nome: string
          telefone: string | null
          telefone_digitos: string | null
          telefone2: string | null
          tipo: Database["public"]["Enums"]["tipo_pessoa"]
          uf: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          criado_por?: string | null
          documento?: string | null
          email?: string | null
          empresa_id: string
          endereco?: string | null
          id?: string
          nome: string
          telefone?: string | null
          telefone_digitos?: string | null
          telefone2?: string | null
          tipo?: Database["public"]["Enums"]["tipo_pessoa"]
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          created_at?: string
          criado_por?: string | null
          documento?: string | null
          email?: string | null
          empresa_id?: string
          endereco?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          telefone_digitos?: string | null
          telefone2?: string | null
          tipo?: Database["public"]["Enums"]["tipo_pessoa"]
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contatos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "empresa_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_membros: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_id: string
          id: string
          papel: Database["public"]["Enums"]["papel_membro"]
          recebe_leads: boolean
          tipo_vendedor: Database["public"]["Enums"]["tipo_vendedor"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          papel?: Database["public"]["Enums"]["papel_membro"]
          recebe_leads?: boolean
          tipo_vendedor?: Database["public"]["Enums"]["tipo_vendedor"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          papel?: Database["public"]["Enums"]["papel_membro"]
          recebe_leads?: boolean
          tipo_vendedor?: Database["public"]["Enums"]["tipo_vendedor"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_membros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresa_membros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          cnpj: string | null
          created_at: string
          created_by: string | null
          id: string
          nome: string
          seq_negocio: number
          situacao: Database["public"]["Enums"]["situacao_empresa"]
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          seq_negocio?: number
          situacao?: Database["public"]["Enums"]["situacao_empresa"]
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          seq_negocio?: number
          situacao?: Database["public"]["Enums"]["situacao_empresa"]
          updated_at?: string
        }
        Relationships: []
      }
      equipe_membros: {
        Row: {
          created_at: string
          e_gestor: boolean
          empresa_id: string
          equipe_id: string
          membro_id: string
        }
        Insert: {
          created_at?: string
          e_gestor?: boolean
          empresa_id: string
          equipe_id: string
          membro_id: string
        }
        Update: {
          created_at?: string
          e_gestor?: boolean
          empresa_id?: string
          equipe_id?: string
          membro_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_membros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_membros_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_membros_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "empresa_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      equipes: {
        Row: {
          ativa: boolean
          created_at: string
          empresa_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      etapas: {
        Row: {
          ativa: boolean
          campos_obrigatorios: string[]
          cor: string | null
          created_at: string
          empresa_id: string
          funil_id: string
          id: string
          inicial: boolean
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          campos_obrigatorios?: string[]
          cor?: string | null
          created_at?: string
          empresa_id: string
          funil_id: string
          id?: string
          inicial?: boolean
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          campos_obrigatorios?: string[]
          cor?: string | null
          created_at?: string
          empresa_id?: string
          funil_id?: string
          id?: string
          inicial?: boolean
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "etapas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etapas_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
        ]
      }
      etiquetas: {
        Row: {
          ativa: boolean
          cor: string | null
          created_at: string
          empresa_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          cor?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          cor?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "etiquetas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          ator_id: string | null
          created_at: string
          empresa_id: string
          entidade: string | null
          entidade_id: string | null
          id: number
          payload: Json
          tipo: string
        }
        Insert: {
          ator_id?: string | null
          created_at?: string
          empresa_id: string
          entidade?: string | null
          entidade_id?: string | null
          id?: never
          payload?: Json
          tipo: string
        }
        Update: {
          ator_id?: string | null
          created_at?: string
          empresa_id?: string
          entidade?: string | null
          entidade_id?: string | null
          id?: never
          payload?: Json
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamentos_mensais: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          pago: boolean
          pago_em: string | null
          referencia: string
          registrado_por: string | null
          usuarios_ativos: number
          valor_fixo: number
          valor_por_usuario: number
          valor_total: number
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          pago?: boolean
          pago_em?: string | null
          referencia: string
          registrado_por?: string | null
          usuarios_ativos?: number
          valor_fixo?: number
          valor_por_usuario?: number
          valor_total?: number
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          pago?: boolean
          pago_em?: string | null
          referencia?: string
          registrado_por?: string | null
          usuarios_ativos?: number
          valor_fixo?: number
          valor_por_usuario?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamentos_mensais_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      funis: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_id: string
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funis_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_etapas: {
        Row: {
          empresa_id: string
          entrou_em: string
          etapa_id: string
          id: number
          movido_por: string | null
          negocio_id: string
          saiu_em: string | null
        }
        Insert: {
          empresa_id: string
          entrou_em?: string
          etapa_id: string
          id?: never
          movido_por?: string | null
          negocio_id: string
          saiu_em?: string | null
        }
        Update: {
          empresa_id?: string
          entrou_em?: string
          etapa_id?: string
          id?: never
          movido_por?: string | null
          negocio_id?: string
          saiu_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_etapas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_etapas_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_etapas_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      kit_componentes: {
        Row: {
          created_at: string
          descricao: string
          empresa_id: string
          id: string
          negocio_id: string
          ordem: number
          potencia_w: number | null
          quantidade: number
          tipo: Database["public"]["Enums"]["tipo_componente_kit"]
        }
        Insert: {
          created_at?: string
          descricao: string
          empresa_id: string
          id?: string
          negocio_id: string
          ordem?: number
          potencia_w?: number | null
          quantidade?: number
          tipo: Database["public"]["Enums"]["tipo_componente_kit"]
        }
        Update: {
          created_at?: string
          descricao?: string
          empresa_id?: string
          id?: string
          negocio_id?: string
          ordem?: number
          potencia_w?: number | null
          quantidade?: number
          tipo?: Database["public"]["Enums"]["tipo_componente_kit"]
        }
        Relationships: [
          {
            foreignKeyName: "kit_componentes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_componentes_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      kits_solares: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          empresa_id: string
          id: string
          nome: string
          potencia_kwp: number
          preco: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          empresa_id: string
          id?: string
          nome: string
          potencia_kwp: number
          preco: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          empresa_id?: string
          id?: string
          nome?: string
          potencia_kwp?: number
          preco?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kits_solares_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      logs_auditoria: {
        Row: {
          acao: string
          created_at: string
          dados_antes: Json | null
          dados_depois: Json | null
          empresa_id: string | null
          entidade: string
          entidade_id: string | null
          id: number
          user_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          empresa_id?: string | null
          entidade: string
          entidade_id?: string | null
          id?: never
          user_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          empresa_id?: string | null
          entidade?: string
          entidade_id?: string | null
          id?: never
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_auditoria_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      motivos_perda: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "motivos_perda_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      negocio_etiquetas: {
        Row: {
          created_at: string
          empresa_id: string
          etiqueta_id: string
          negocio_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          etiqueta_id: string
          negocio_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          etiqueta_id?: string
          negocio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "negocio_etiquetas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocio_etiquetas_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "etiquetas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocio_etiquetas_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      negocios: {
        Row: {
          contato_id: string
          created_at: string
          criado_por: string | null
          descricao: string | null
          empresa_id: string
          estrutura_telhado: string | null
          etapa_desde: string
          etapa_id: string
          fechado_em: string | null
          funil_id: string
          id: string
          motivo_perda_detalhe: string | null
          motivo_perda_id: string | null
          numero: number
          origem_id: string | null
          padrao_cliente: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["status_negocio"]
          tipo_telhado: string | null
          titulo: string
          unidade_consumidora: string | null
          updated_at: string
          valor: number | null
        }
        Insert: {
          contato_id: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          empresa_id: string
          estrutura_telhado?: string | null
          etapa_desde?: string
          etapa_id: string
          fechado_em?: string | null
          funil_id: string
          id?: string
          motivo_perda_detalhe?: string | null
          motivo_perda_id?: string | null
          numero?: number
          origem_id?: string | null
          padrao_cliente?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_negocio"]
          tipo_telhado?: string | null
          titulo: string
          unidade_consumidora?: string | null
          updated_at?: string
          valor?: number | null
        }
        Update: {
          contato_id?: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          empresa_id?: string
          estrutura_telhado?: string | null
          etapa_desde?: string
          etapa_id?: string
          fechado_em?: string | null
          funil_id?: string
          id?: string
          motivo_perda_detalhe?: string | null
          motivo_perda_id?: string | null
          numero?: number
          origem_id?: string | null
          padrao_cliente?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_negocio"]
          tipo_telhado?: string | null
          titulo?: string
          unidade_consumidora?: string | null
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "negocios_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "empresa_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_motivo_perda_id_fkey"
            columns: ["motivo_perda_id"]
            isOneToOne: false
            referencedRelation: "motivos_perda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "origens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "empresa_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      notas: {
        Row: {
          autor_id: string | null
          created_at: string
          empresa_id: string
          id: string
          negocio_id: string
          texto: string
          updated_at: string
        }
        Insert: {
          autor_id?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          negocio_id: string
          texto: string
          updated_at?: string
        }
        Update: {
          autor_id?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          negocio_id?: string
          texto?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "empresa_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      origens: {
        Row: {
          ativa: boolean
          cor: string | null
          created_at: string
          empresa_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          cor?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          cor?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "origens_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros_calculadora: {
        Row: {
          disponibilidade_bi_kwh: number
          disponibilidade_mono_kwh: number
          disponibilidade_tri_kwh: number
          empresa_id: string
          percentual_fio_b: number
          produtividade_kwh_kwp_mes: number
          updated_at: string
        }
        Insert: {
          disponibilidade_bi_kwh?: number
          disponibilidade_mono_kwh?: number
          disponibilidade_tri_kwh?: number
          empresa_id: string
          percentual_fio_b?: number
          produtividade_kwh_kwp_mes?: number
          updated_at?: string
        }
        Update: {
          disponibilidade_bi_kwh?: number
          disponibilidade_mono_kwh?: number
          disponibilidade_tri_kwh?: number
          empresa_id?: string
          percentual_fio_b?: number
          produtividade_kwh_kwp_mes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parametros_calculadora_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      planos_empresa: {
        Row: {
          atualizado_por: string | null
          created_at: string
          dia_vencimento: number | null
          empresa_id: string
          limite_usuarios: number | null
          modelo_cobranca: Database["public"]["Enums"]["modelo_cobranca"] | null
          tipo: Database["public"]["Enums"]["tipo_plano"]
          updated_at: string
          valor_fixo: number | null
          valor_por_usuario: number | null
        }
        Insert: {
          atualizado_por?: string | null
          created_at?: string
          dia_vencimento?: number | null
          empresa_id: string
          limite_usuarios?: number | null
          modelo_cobranca?:
            | Database["public"]["Enums"]["modelo_cobranca"]
            | null
          tipo?: Database["public"]["Enums"]["tipo_plano"]
          updated_at?: string
          valor_fixo?: number | null
          valor_por_usuario?: number | null
        }
        Update: {
          atualizado_por?: string | null
          created_at?: string
          dia_vencimento?: number | null
          empresa_id?: string
          limite_usuarios?: number | null
          modelo_cobranca?:
            | Database["public"]["Enums"]["modelo_cobranca"]
            | null
          tipo?: Database["public"]["Enums"]["tipo_plano"]
          updated_at?: string
          valor_fixo?: number | null
          valor_por_usuario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "planos_empresa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      plataforma_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      propostas: {
        Row: {
          atualizado_por: string | null
          created_at: string
          criado_por: string | null
          empresa_id: string
          id: string
          mensagem: string | null
          modo_preco: Database["public"]["Enums"]["modo_preco_proposta"]
          negocio_id: string
          token: string
          updated_at: string
        }
        Insert: {
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          empresa_id: string
          id?: string
          mensagem?: string | null
          modo_preco?: Database["public"]["Enums"]["modo_preco_proposta"]
          negocio_id: string
          token?: string
          updated_at?: string
        }
        Update: {
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          empresa_id?: string
          id?: string
          mensagem?: string | null
          modo_preco?: Database["public"]["Enums"]["modo_preco_proposta"]
          negocio_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "propostas_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "empresa_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "empresa_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: true
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas_aberturas: {
        Row: {
          aberta_em: string
          id: number
          proposta_id: string
        }
        Insert: {
          aberta_em?: string
          id?: never
          proposta_id: string
        }
        Update: {
          aberta_em?: string
          id?: never
          proposta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "propostas_aberturas_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          concluida_em: string | null
          concluida_por: string | null
          created_at: string
          criado_por: string | null
          empresa_id: string
          id: string
          negocio_id: string | null
          responsavel_id: string | null
          tipo: Database["public"]["Enums"]["tipo_tarefa"]
          titulo: string
          updated_at: string
          vence_em: string
        }
        Insert: {
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          criado_por?: string | null
          empresa_id: string
          id?: string
          negocio_id?: string | null
          responsavel_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_tarefa"]
          titulo: string
          updated_at?: string
          vence_em: string
        }
        Update: {
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          criado_por?: string | null
          empresa_id?: string
          id?: string
          negocio_id?: string | null
          responsavel_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_tarefa"]
          titulo?: string
          updated_at?: string
          vence_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_concluida_por_fkey"
            columns: ["concluida_por"]
            isOneToOne: false
            referencedRelation: "empresa_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "empresa_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "empresa_membros"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      buscar_contato_duplicado: {
        Args: { p_email: string; p_empresa_id: string; p_telefone: string }
        Returns: {
          contato_id: string
          nome: string
          responsavel_nome: string
          visivel: boolean
        }[]
      }
      compartilha_empresa: { Args: { p_user_id: string }; Returns: boolean }
      e_plataforma_admin: { Args: never; Returns: boolean }
      membro_ativo: { Args: { p_empresa_id: string }; Returns: boolean }
      meu_membro_id: { Args: { p_empresa_id: string }; Returns: string }
      pode_ver_contato: { Args: { p_contato_id: string }; Returns: boolean }
      pode_ver_contato_linha: {
        Args: {
          p_contato_id: string
          p_criado_por: string
          p_empresa_id: string
        }
        Returns: boolean
      }
      pode_ver_negocio: { Args: { p_negocio_id: string }; Returns: boolean }
      pode_ver_pasta_anexo: { Args: { p_caminho: string }; Returns: boolean }
      pode_ver_responsavel: {
        Args: { p_empresa_id: string; p_responsavel_id: string }
        Returns: boolean
      }
      tem_papel: {
        Args: {
          p_empresa_id: string
          p_papeis: Database["public"]["Enums"]["papel_membro"][]
        }
        Returns: boolean
      }
    }
    Enums: {
      modelo_cobranca: "por_usuario" | "fixo" | "fixo_mais_usuario"
      modo_preco_proposta: "sem_preco" | "parcelado" | "avista" | "completo"
      papel_membro: "admin" | "gestor" | "vendedor"
      situacao_empresa: "ativa" | "suspensa" | "cancelada"
      status_negocio: "aberto" | "ganho" | "perdido"
      tipo_componente_kit: "modulo" | "inversor" | "bateria" | "outro"
      tipo_ligacao: "monofasico" | "bifasico" | "trifasico"
      tipo_pessoa: "pf" | "pj"
      tipo_plano: "gratuito" | "pago"
      tipo_tarefa:
        | "ligacao"
        | "whatsapp"
        | "visita"
        | "reuniao"
        | "email"
        | "outro"
      tipo_vendedor: "interno" | "representante"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      modelo_cobranca: ["por_usuario", "fixo", "fixo_mais_usuario"],
      modo_preco_proposta: ["sem_preco", "parcelado", "avista", "completo"],
      papel_membro: ["admin", "gestor", "vendedor"],
      situacao_empresa: ["ativa", "suspensa", "cancelada"],
      status_negocio: ["aberto", "ganho", "perdido"],
      tipo_componente_kit: ["modulo", "inversor", "bateria", "outro"],
      tipo_ligacao: ["monofasico", "bifasico", "trifasico"],
      tipo_pessoa: ["pf", "pj"],
      tipo_plano: ["gratuito", "pago"],
      tipo_tarefa: [
        "ligacao",
        "whatsapp",
        "visita",
        "reuniao",
        "email",
        "outro",
      ],
      tipo_vendedor: ["interno", "representante"],
    },
  },
} as const

