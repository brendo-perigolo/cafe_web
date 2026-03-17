export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      colheitas: {
        Row: {
          codigo: string
          created_at: string
          data_colheita: string
          id: string
          empresa_id: string
          pagamento_lote: string | null
          pago_em: string | null
          pago_por: string | null
          numero_bag: string | null
          panhador_id: string
          peso_kg: number
          preco_por_kg: number | null
          preco_por_balaio: number | null
          preco_por_saco: number | null
          kg_por_balaio_utilizado: number | null
          quantidade_balaios: number | null
          quantidade_sacos: number | null
          mostrar_balaio_no_ticket: boolean
          sincronizado: boolean
          updated_at: string
          user_id: string
          valor_total: number | null
        }
        Insert: {
          codigo?: string
          created_at?: string
          data_colheita?: string
          id?: string
          empresa_id: string
          pagamento_lote?: string | null
          pago_em?: string | null
          pago_por?: string | null
          numero_bag?: string | null
          panhador_id: string
          peso_kg: number
          preco_por_kg?: number | null
          preco_por_balaio?: number | null
          preco_por_saco?: number | null
          kg_por_balaio_utilizado?: number | null
          quantidade_balaios?: number | null
          quantidade_sacos?: number | null
          mostrar_balaio_no_ticket?: boolean
          sincronizado?: boolean
          updated_at?: string
          user_id: string
          valor_total?: number | null
        }
        Update: {
          codigo?: string
          created_at?: string
          data_colheita?: string
          id?: string
          empresa_id?: string
          pagamento_lote?: string | null
          pago_em?: string | null
          pago_por?: string | null
          numero_bag?: string | null
          panhador_id?: string
          peso_kg?: number
          preco_por_kg?: number | null
          preco_por_balaio?: number | null
          preco_por_saco?: number | null
          kg_por_balaio_utilizado?: number | null
          quantidade_balaios?: number | null
          quantidade_sacos?: number | null
          mostrar_balaio_no_ticket?: boolean
          sincronizado?: boolean
          updated_at?: string
          user_id?: string
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "colheitas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colheitas_panhador_id_fkey"
            columns: ["panhador_id"]
            isOneToOne: false
            referencedRelation: "panhadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colheitas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      colheitas_historico: {
        Row: {
          id: string
          colheita_id: string
          empresa_id: string
          user_id: string | null
          dados: Json
          created_at: string
        }
        Insert: {
          id?: string
          colheita_id: string
          empresa_id: string
          user_id?: string | null
          dados: Json
          created_at?: string
        }
        Update: {
          id?: string
          colheita_id?: string
          empresa_id?: string
          user_id?: string | null
          dados?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "colheitas_historico_colheita_id_fkey"
            columns: ["colheita_id"]
            isOneToOne: false
            referencedRelation: "colheitas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colheitas_historico_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colheitas_historico_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          ativa: boolean
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          metadata: Json
          nome: string
          plano: string
          responsavel: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json
          nome: string
          plano?: string
          responsavel?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json
          nome?: string
          plano?: string
          responsavel?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      empresas_config: {
        Row: {
          empresa_id: string
          kg_por_balaio: number
          kg_por_saco: number
          preco_padrao_por_saco: number
          usar_kg_por_balaio_padrao: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          empresa_id: string
          kg_por_balaio?: number
          kg_por_saco?: number
          preco_padrao_por_saco?: number
          usar_kg_por_balaio_padrao?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          empresa_id?: string
          kg_por_balaio?: number
          kg_por_saco?: number
          preco_padrao_por_saco?: number
          usar_kg_por_balaio_padrao?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresas_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas_usuarios: {
        Row: {
          ativo: boolean
          cargo: string | null
          created_at: string
          empresa_id: string
          id: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          cargo?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          cargo?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresas_usuarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresas_usuarios_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      panhadores: {
        Row: {
          apelido: string | null
          ativo: boolean
          bag_atualizado_em: string | null
          bag_numero: string | null
          bag_semana: string | null
          cpf: string | null
          created_at: string
          empresa_id: string
          id: string
          nome: string
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          apelido?: string | null
          ativo?: boolean
          bag_atualizado_em?: string | null
          bag_numero?: string | null
          bag_semana?: string | null
          cpf?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          apelido?: string | null
          ativo?: boolean
          bag_atualizado_em?: string | null
          bag_numero?: string | null
          bag_semana?: string | null
          cpf?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "panhadores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panhadores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      panhadores_bag_historico: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          bag_anterior: string | null
          bag_nova: string | null
          empresa_id: string
          id: string
          observacao: string | null
          panhador_id: string
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          bag_anterior?: string | null
          bag_nova?: string | null
          empresa_id: string
          id?: string
          observacao?: string | null
          panhador_id: string
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          bag_anterior?: string | null
          bag_nova?: string | null
          empresa_id?: string
          id?: string
          observacao?: string | null
          panhador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "panhadores_bag_historico_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panhadores_bag_historico_panhador_id_fkey"
            columns: ["panhador_id"]
            isOneToOne: false
            referencedRelation: "panhadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panhadores_bag_historico_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          email: string
          created_at: string
          full_name: string
          id: string
          updated_at: string
          username: string
        }
        Insert: {
          email: string
          created_at?: string
          full_name: string
          id: string
          updated_at?: string
          username: string
        }
        Update: {
          email?: string
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
