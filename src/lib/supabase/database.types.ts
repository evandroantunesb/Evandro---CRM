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
      contatos: {
        Row: {
          cidade: string | null
          created_at: string
          criado_por: string | null
          documento: string | null
          email: string | null
          empresa_id: string
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
      negocios: {
        Row: {
          contato_id: string
          created_at: string
          criado_por: string | null
          descricao: string | null
          empresa_id: string
          etapa_desde: string
          etapa_id: string
          fechado_em: string | null
          funil_id: string
          id: string
          numero: number
          origem_id: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["status_negocio"]
          titulo: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          contato_id: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          empresa_id: string
          etapa_desde?: string
          etapa_id: string
          fechado_em?: string | null
          funil_id: string
          id?: string
          numero?: number
          origem_id?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_negocio"]
          titulo: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          contato_id?: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          empresa_id?: string
          etapa_desde?: string
          etapa_id?: string
          fechado_em?: string | null
          funil_id?: string
          id?: string
          numero?: number
          origem_id?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_negocio"]
          titulo?: string
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
      papel_membro: "admin" | "gestor" | "vendedor"
      situacao_empresa: "ativa" | "suspensa" | "cancelada"
      status_negocio: "aberto" | "ganho" | "perdido"
      tipo_pessoa: "pf" | "pj"
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
      papel_membro: ["admin", "gestor", "vendedor"],
      situacao_empresa: ["ativa", "suspensa", "cancelada"],
      status_negocio: ["aberto", "ganho", "perdido"],
      tipo_pessoa: ["pf", "pj"],
      tipo_vendedor: ["interno", "representante"],
    },
  },
} as const

