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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      contract_reviews: {
        Row: {
          content: string
          contract_id: string
          created_at: string
          id: string
          user_id: string
          version_id: string | null
        }
        Insert: {
          content: string
          contract_id: string
          created_at?: string
          id?: string
          user_id: string
          version_id?: string | null
        }
        Update: {
          content?: string
          contract_id?: string
          created_at?: string
          id?: string
          user_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_reviews_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_reviews_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_versions: {
        Row: {
          authored_by: string | null
          change_summary: string | null
          contract_id: string
          created_at: string
          direction: string
          file_name: string
          id: string
          note: string | null
          round_number: number | null
          round_status: string
          sent_by: string | null
          sharepoint_item_id: string | null
          sharepoint_web_url: string | null
          storage_path: string
          user_id: string
          version_label: string
        }
        Insert: {
          authored_by?: string | null
          change_summary?: string | null
          contract_id: string
          created_at?: string
          direction?: string
          file_name: string
          id?: string
          note?: string | null
          round_number?: number | null
          round_status?: string
          sent_by?: string | null
          sharepoint_item_id?: string | null
          sharepoint_web_url?: string | null
          storage_path: string
          user_id: string
          version_label: string
        }
        Update: {
          authored_by?: string | null
          change_summary?: string | null
          contract_id?: string
          created_at?: string
          direction?: string
          file_name?: string
          id?: string
          note?: string | null
          round_number?: number | null
          round_status?: string
          sent_by?: string | null
          sharepoint_item_id?: string | null
          sharepoint_web_url?: string | null
          storage_path?: string
          user_id?: string
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_versions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          accent_color: string | null
          contract_type: string
          counterparty: string | null
          cover_image_url: string | null
          created_at: string
          custom_tag: string | null
          ends_at: string | null
          icon_emoji: string | null
          id: string
          law_firm_id: string | null
          notes: string | null
          object_summary: string | null
          origin: Database["public"]["Enums"]["contract_origin"]
          sharepoint_item_id: string | null
          sharepoint_web_url: string | null
          signed_at: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["contract_status"]
          title: string
          updated_at: string
          user_id: string
          value_cents: number | null
        }
        Insert: {
          accent_color?: string | null
          contract_type: string
          counterparty?: string | null
          cover_image_url?: string | null
          created_at?: string
          custom_tag?: string | null
          ends_at?: string | null
          icon_emoji?: string | null
          id?: string
          law_firm_id?: string | null
          notes?: string | null
          object_summary?: string | null
          origin?: Database["public"]["Enums"]["contract_origin"]
          sharepoint_item_id?: string | null
          sharepoint_web_url?: string | null
          signed_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          title: string
          updated_at?: string
          user_id: string
          value_cents?: number | null
        }
        Update: {
          accent_color?: string | null
          contract_type?: string
          counterparty?: string | null
          cover_image_url?: string | null
          created_at?: string
          custom_tag?: string | null
          ends_at?: string | null
          icon_emoji?: string | null
          id?: string
          law_firm_id?: string | null
          notes?: string | null
          object_summary?: string | null
          origin?: Database["public"]["Enums"]["contract_origin"]
          sharepoint_item_id?: string | null
          sharepoint_web_url?: string | null
          signed_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          title?: string
          updated_at?: string
          user_id?: string
          value_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_attachments: {
        Row: {
          created_at: string
          demand_id: string
          file_name: string
          id: string
          note: string | null
          sharepoint_item_id: string | null
          sharepoint_web_url: string | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          demand_id: string
          file_name: string
          id?: string
          note?: string | null
          sharepoint_item_id?: string | null
          sharepoint_web_url?: string | null
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          demand_id?: string
          file_name?: string
          id?: string
          note?: string | null
          sharepoint_item_id?: string | null
          sharepoint_web_url?: string | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_attachments_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_updates: {
        Row: {
          content: string
          created_at: string
          demand_id: string
          id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          demand_id: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          demand_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_updates_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
        ]
      }
      demands: {
        Row: {
          accent_color: string | null
          clickup_synced_at: string | null
          clickup_task_id: string | null
          completed_at: string | null
          contract_id: string | null
          cover_image_url: string | null
          created_at: string
          custom_tag: string | null
          description: string | null
          due_at: string | null
          icon_emoji: string | null
          id: string
          law_firm_id: string | null
          practice_area: string | null
          priority: Database["public"]["Enums"]["demand_priority"] | null
          sent_at: string | null
          source: string
          source_email: Json | null
          status: Database["public"]["Enums"]["demand_status"]
          subject_group: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          clickup_synced_at?: string | null
          clickup_task_id?: string | null
          completed_at?: string | null
          contract_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          custom_tag?: string | null
          description?: string | null
          due_at?: string | null
          icon_emoji?: string | null
          id?: string
          law_firm_id?: string | null
          practice_area?: string | null
          priority?: Database["public"]["Enums"]["demand_priority"] | null
          sent_at?: string | null
          source?: string
          source_email?: Json | null
          status?: Database["public"]["Enums"]["demand_status"]
          subject_group?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          clickup_synced_at?: string | null
          clickup_task_id?: string | null
          completed_at?: string | null
          contract_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          custom_tag?: string | null
          description?: string | null
          due_at?: string | null
          icon_emoji?: string | null
          id?: string
          law_firm_id?: string | null
          practice_area?: string | null
          priority?: Database["public"]["Enums"]["demand_priority"] | null
          sent_at?: string | null
          source?: string
          source_email?: Json | null
          status?: Database["public"]["Enums"]["demand_status"]
          subject_group?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demands_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demands_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          clickup_list_id: string | null
          clickup_list_name: string | null
          clickup_space_id: string | null
          clickup_status_map: Json
          clickup_team_id: string | null
          clickup_webhook_id: string | null
          sharepoint_drive_id: string | null
          sharepoint_drive_name: string | null
          sharepoint_site_id: string | null
          sharepoint_site_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          clickup_list_id?: string | null
          clickup_list_name?: string | null
          clickup_space_id?: string | null
          clickup_status_map?: Json
          clickup_team_id?: string | null
          clickup_webhook_id?: string | null
          sharepoint_drive_id?: string | null
          sharepoint_drive_name?: string | null
          sharepoint_site_id?: string | null
          sharepoint_site_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          clickup_list_id?: string | null
          clickup_list_name?: string | null
          clickup_space_id?: string | null
          clickup_status_map?: Json
          clickup_team_id?: string | null
          clickup_webhook_id?: string | null
          sharepoint_drive_id?: string | null
          sharepoint_drive_name?: string | null
          sharepoint_site_id?: string | null
          sharepoint_site_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      law_firms: {
        Row: {
          accent_color: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          cover_image_url: string | null
          created_at: string
          custom_tag: string | null
          fee_model: string | null
          icon_emoji: string | null
          id: string
          name: string
          notes: string | null
          practice_areas: string[]
          status: Database["public"]["Enums"]["firm_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          cover_image_url?: string | null
          created_at?: string
          custom_tag?: string | null
          fee_model?: string | null
          icon_emoji?: string | null
          id?: string
          name: string
          notes?: string | null
          practice_areas?: string[]
          status?: Database["public"]["Enums"]["firm_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          cover_image_url?: string | null
          created_at?: string
          custom_tag?: string | null
          fee_model?: string | null
          icon_emoji?: string | null
          id?: string
          name?: string
          notes?: string | null
          practice_areas?: string[]
          status?: Database["public"]["Enums"]["firm_status"]
          updated_at?: string
          user_id?: string
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
      contract_origin: "created_by_me" | "from_law_firm" | "from_counterparty"
      contract_status:
        | "draft"
        | "in_review"
        | "negotiating"
        | "signed"
        | "archived"
      demand_priority: "low" | "medium" | "high" | "urgent"
      demand_status:
        | "open"
        | "in_progress"
        | "waiting"
        | "completed"
        | "cancelled"
      firm_status: "active" | "inactive"
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
    Enums: {
      contract_origin: ["created_by_me", "from_law_firm", "from_counterparty"],
      contract_status: [
        "draft",
        "in_review",
        "negotiating",
        "signed",
        "archived",
      ],
      demand_priority: ["low", "medium", "high", "urgent"],
      demand_status: [
        "open",
        "in_progress",
        "waiting",
        "completed",
        "cancelled",
      ],
      firm_status: ["active", "inactive"],
    },
  },
} as const
