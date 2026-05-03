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
      balance_history: {
        Row: {
          changed_by: string | null
          created_at: string
          delta: number
          id: string
          new_balance: number
          old_balance: number
          reason: string | null
          user_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          delta: number
          id?: string
          new_balance: number
          old_balance: number
          reason?: string | null
          user_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          delta?: number
          id?: string
          new_balance?: number
          old_balance?: number
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      completed_tasks: {
        Row: {
          accepted_at: string | null
          completed_at: string | null
          created_at: string
          held_at: string | null
          id: string
          order_number: string
          reject_reason: string | null
          status: string
          task_id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          completed_at?: string | null
          created_at?: string
          held_at?: string | null
          id?: string
          order_number: string
          reject_reason?: string | null
          status?: string
          task_id: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          completed_at?: string | null
          created_at?: string
          held_at?: string | null
          id?: string
          order_number?: string
          reject_reason?: string | null
          status?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "completed_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_completed_tasks_log: {
        Row: {
          accepted_at: string | null
          completed_at: string | null
          deleted_at: string
          deleted_by: string | null
          id: string
          order_number: string
          original_created_at: string
          original_id: string
          reject_reason: string | null
          restored: boolean
          restored_at: string | null
          status: string
          task_id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          completed_at?: string | null
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          order_number: string
          original_created_at: string
          original_id: string
          reject_reason?: string | null
          restored?: boolean
          restored_at?: string | null
          status: string
          task_id: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          completed_at?: string | null
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          order_number?: string
          original_created_at?: string
          original_id?: string
          reject_reason?: string | null
          restored?: boolean
          restored_at?: string | null
          status?: string
          task_id?: string
          user_id?: string
        }
        Relationships: []
      }
      order_issue_reports: {
        Row: {
          created_at: string
          id: string
          problem_type: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          problem_type: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          problem_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_issue_reports_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          amount: number
          comment: string | null
          created_at: string
          details: Json
          id: string
          method: string
          processed_at: string | null
          processed_by: string | null
          reject_reason: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          comment?: string | null
          created_at?: string
          details?: Json
          id?: string
          method: string
          processed_at?: string | null
          processed_by?: string | null
          reject_reason?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          comment?: string | null
          created_at?: string
          details?: Json
          id?: string
          method?: string
          processed_at?: string | null
          processed_by?: string | null
          reject_reason?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          balance: number
          created_at: string
          display_name: string | null
          email: string | null
          first_payout_at: string | null
          id: string
          payout_hold: boolean
          payout_hold_amount: number
          payout_hold_at: string | null
          payout_hold_no_image: number
          payout_hold_with_image: number
          referral_code: string | null
          referred_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_payout_at?: string | null
          id?: string
          payout_hold?: boolean
          payout_hold_amount?: number
          payout_hold_at?: string | null
          payout_hold_no_image?: number
          payout_hold_with_image?: number
          referral_code?: string | null
          referred_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_payout_at?: string | null
          id?: string
          payout_hold?: boolean
          payout_hold_amount?: number
          payout_hold_at?: string | null
          payout_hold_no_image?: number
          payout_hold_with_image?: number
          referral_code?: string | null
          referred_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          amount: number
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          addr1: string | null
          addr2: string
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          image_url: string | null
          link: string | null
          name: string | null
          reference_link: string | null
          restaurant_tag: string | null
          status: string
          task_id: string
          task_type: string
        }
        Insert: {
          addr1?: string | null
          addr2: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          name?: string | null
          reference_link?: string | null
          restaurant_tag?: string | null
          status?: string
          task_id: string
          task_type?: string
        }
        Update: {
          addr1?: string | null
          addr2?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          name?: string | null
          reference_link?: string | null
          restaurant_tag?: string | null
          status?: string
          task_id?: string
          task_type?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_balance: {
        Args: { _delta: number; _reason: string; _user_id: string }
        Returns: Json
      }
      admin_award_reels_bonus: {
        Args: { _completed_id: string }
        Returns: Json
      }
      admin_complete_task: { Args: { _completed_id: string }; Returns: Json }
      approve_payout_request: { Args: { _request_id: string }; Returns: Json }
      create_payout_request: {
        Args: {
          _amount: number
          _comment: string
          _details: Json
          _method: string
        }
        Returns: Json
      }
      freeze_unpaid_batch: { Args: never; Returns: Json }
      generate_referral_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_referrer: { Args: { _code: string }; Returns: Json }
      mark_user_batch_paid: { Args: { _user_id: string }; Returns: Json }
      process_referral_payout: { Args: { _user_id: string }; Returns: Json }
      reject_payout_request: {
        Args: { _reason: string; _request_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
