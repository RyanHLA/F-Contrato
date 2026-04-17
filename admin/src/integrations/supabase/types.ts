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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      albums: {
        Row: {
          category: string
          client_enabled: boolean
          client_pin: string | null
          client_submitted_at: string | null
          contract_template: string | null
          cover_image_url: string | null
          created_at: string
          event_date: string | null
          id: string
          photographer_id: string | null
          selection_limit: number | null
          share_token: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          client_enabled?: boolean
          client_pin?: string | null
          client_submitted_at?: string | null
          contract_template?: string | null
          cover_image_url?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          photographer_id?: string | null
          selection_limit?: number | null
          share_token?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          client_enabled?: boolean
          client_pin?: string | null
          client_submitted_at?: string | null
          contract_template?: string | null
          cover_image_url?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          photographer_id?: string | null
          selection_limit?: number | null
          share_token?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "albums_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          photographer_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          photographer_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          photographer_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_selections: {
        Row: {
          album_id: string | null
          created_at: string
          id: string
          image_id: string
          job_id: string | null
        }
        Insert: {
          album_id?: string | null
          created_at?: string
          id?: string
          image_id: string
          job_id?: string | null
        }
        Update: {
          album_id?: string | null
          created_at?: string
          id?: string
          image_id?: string
          job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_selections_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_selections_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "site_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_selections_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_sessions: {
        Row: {
          album_id: string
          created_at: string
          expires_at: string
          token: string
        }
        Insert: {
          album_id: string
          created_at?: string
          expires_at?: string
          token?: string
        }
        Update: {
          album_id?: string
          created_at?: string
          expires_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_sessions_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          photographer_id: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          photographer_id: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          photographer_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          album_id: string
          body_html: string
          client_ip: string | null
          client_name: string | null
          created_at: string
          id: string
          job_id: string | null
          photographer_id: string
          signed_at: string | null
        }
        Insert: {
          album_id: string
          body_html: string
          client_ip?: string | null
          client_name?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          photographer_id: string
          signed_at?: string | null
        }
        Update: {
          album_id?: string
          body_html?: string
          client_ip?: string | null
          client_name?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          photographer_id?: string
          signed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: true
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          email_type: string
          id: string
          photographer_id: string
          sent_at: string
        }
        Insert: {
          email_type: string
          id?: string
          photographer_id: string
          sent_at?: string
        }
        Update: {
          email_type?: string
          id?: string
          photographer_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      extra_photo_purchases: {
        Row: {
          amount_paid: number
          client_token: string
          created_at: string
          id: string
          job_id: string
          mp_payment_id: string | null
          mp_preference_id: string | null
          notified_at: string | null
          photographer_id: string
          platform_fee: number
          quantity: number
          status: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          amount_paid: number
          client_token: string
          created_at?: string
          id?: string
          job_id: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notified_at?: string | null
          photographer_id: string
          platform_fee: number
          quantity: number
          status?: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          client_token?: string
          created_at?: string
          id?: string
          job_id?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notified_at?: string | null
          photographer_id?: string
          platform_fee?: number
          quantity?: number
          status?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extra_photo_purchases_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_photo_purchases_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      job_client_selections: {
        Row: {
          id: string
          job_id: string
          image_id: string
          created_at: string
        }
        Insert: {
          id?: string
          job_id: string
          image_id: string
          created_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          image_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_client_selections_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_client_selections_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "site_images"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photo_sets: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          job_id: string
          name: string
          photographer_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          job_id: string
          name: string
          photographer_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          job_id?: string
          name?: string
          photographer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_photo_sets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photo_sets_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          album_id: string | null
          client_id: string
          created_at: string
          download_enabled: boolean
          download_high_res: string | null
          download_resolution: string
          download_web_size: string | null
          event_date: string | null
          event_type: string | null
          extra_photo_enabled: boolean
          extra_photo_price: number | null
          gallery_cover_image_url: string | null
          gallery_cover_r2_key: string | null
          gallery_deadline: string | null
          gallery_enabled: boolean
          gallery_pin: string | null
          gallery_selection_limit: number | null
          gallery_share_token: string | null
          gallery_submitted_at: string | null
          id: string
          notes: string | null
          photographer_id: string
          status: string
          title: string
          updated_at: string
          watermark_id: string | null
          watermark_position: string
          watermark_size: number
        }
        Insert: {
          album_id?: string | null
          client_id: string
          created_at?: string
          download_enabled?: boolean
          download_high_res?: string | null
          download_resolution?: string
          download_web_size?: string | null
          event_date?: string | null
          event_type?: string | null
          extra_photo_enabled?: boolean
          extra_photo_price?: number | null
          gallery_cover_image_url?: string | null
          gallery_cover_r2_key?: string | null
          gallery_deadline?: string | null
          gallery_enabled?: boolean
          gallery_pin?: string | null
          gallery_selection_limit?: number | null
          gallery_share_token?: string | null
          gallery_submitted_at?: string | null
          id?: string
          notes?: string | null
          photographer_id: string
          status?: string
          title: string
          updated_at?: string
          watermark_id?: string | null
          watermark_position?: string
          watermark_size?: number
        }
        Update: {
          album_id?: string | null
          client_id?: string
          created_at?: string
          download_enabled?: boolean
          download_high_res?: string | null
          download_resolution?: string
          download_web_size?: string | null
          event_date?: string | null
          event_type?: string | null
          extra_photo_enabled?: boolean
          extra_photo_price?: number | null
          gallery_cover_image_url?: string | null
          gallery_cover_r2_key?: string | null
          gallery_deadline?: string | null
          gallery_enabled?: boolean
          gallery_pin?: string | null
          gallery_selection_limit?: number | null
          gallery_share_token?: string | null
          gallery_submitted_at?: string | null
          id?: string
          notes?: string | null
          photographer_id?: string
          status?: string
          title?: string
          updated_at?: string
          watermark_id?: string | null
          watermark_position?: string
          watermark_size?: number
        }
        Relationships: [
          {
            foreignKeyName: "jobs_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_watermark_id_fkey"
            columns: ["watermark_id"]
            isOneToOne: false
            referencedRelation: "watermarks"
            referencedColumns: ["id"]
          },
        ]
      }
      photographers: {
        Row: {
          abacatepay_customer_id: string | null
          abacatepay_product_id: string | null
          abacatepay_subscription_id: string | null
          account_status: string
          brand_color: string | null
          created_at: string
          data_deletion_scheduled_at: string | null
          email: string
          id: string
          logo_url: string | null
          mp_access_token: string | null
          mp_connected_at: string | null
          mp_refresh_token: string | null
          mp_user_id: string | null
          name: string
          slug: string
          storage_used_bytes: number
          suspended_at: string | null
          trial_ends_at: string
          trial_used: boolean
          user_id: string
        }
        Insert: {
          abacatepay_customer_id?: string | null
          abacatepay_product_id?: string | null
          abacatepay_subscription_id?: string | null
          account_status?: string
          brand_color?: string | null
          created_at?: string
          data_deletion_scheduled_at?: string | null
          email: string
          id?: string
          logo_url?: string | null
          mp_access_token?: string | null
          mp_connected_at?: string | null
          mp_refresh_token?: string | null
          mp_user_id?: string | null
          name: string
          slug: string
          storage_used_bytes?: number
          suspended_at?: string | null
          trial_ends_at?: string
          trial_used?: boolean
          user_id: string
        }
        Update: {
          abacatepay_customer_id?: string | null
          abacatepay_product_id?: string | null
          abacatepay_subscription_id?: string | null
          account_status?: string
          brand_color?: string | null
          created_at?: string
          data_deletion_scheduled_at?: string | null
          email?: string
          id?: string
          logo_url?: string | null
          mp_access_token?: string | null
          mp_connected_at?: string | null
          mp_refresh_token?: string | null
          mp_user_id?: string | null
          name?: string
          slug?: string
          storage_used_bytes?: number
          suspended_at?: string | null
          trial_ends_at?: string
          trial_used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          abacatepay_product_id: string | null
          id: string
          max_albums: number
          max_photos_per_album: number
          max_storage_gb: number
          name: string
          price_brl: number
        }
        Insert: {
          abacatepay_product_id?: string | null
          id: string
          max_albums: number
          max_photos_per_album: number
          max_storage_gb: number
          name: string
          price_brl?: number
        }
        Update: {
          abacatepay_product_id?: string | null
          id?: string
          max_albums?: number
          max_photos_per_album?: number
          max_storage_gb?: number
          name?: string
          price_brl?: number
        }
        Relationships: []
      }
      site_images: {
        Row: {
          album_id: string | null
          category: string | null
          created_at: string
          description: string | null
          display_order: number | null
          file_size_bytes: number
          id: string
          image_url: string
          job_id: string | null
          photo_set_id: string | null
          photographer_id: string | null
          r2_key: string | null
          section: string
          size_bytes: number | null
          title: string | null
          updated_at: string
          upload_mode: string
          variant_1024_key: string | null
          variant_1024_url: string | null
          variant_2048_key: string | null
          variant_2048_url: string | null
          variants_status: string
        }
        Insert: {
          album_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          file_size_bytes?: number
          id?: string
          image_url: string
          job_id?: string | null
          photo_set_id?: string | null
          photographer_id?: string | null
          r2_key?: string | null
          section: string
          size_bytes?: number | null
          title?: string | null
          updated_at?: string
          upload_mode?: string
          variant_1024_key?: string | null
          variant_1024_url?: string | null
          variant_2048_key?: string | null
          variant_2048_url?: string | null
          variants_status?: string
        }
        Update: {
          album_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          file_size_bytes?: number
          id?: string
          image_url?: string
          job_id?: string | null
          photo_set_id?: string | null
          photographer_id?: string | null
          r2_key?: string | null
          section?: string
          size_bytes?: number | null
          title?: string | null
          updated_at?: string
          upload_mode?: string
          variant_1024_key?: string | null
          variant_1024_url?: string | null
          variant_2048_key?: string | null
          variant_2048_url?: string | null
          variants_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_images_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_images_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_images_photo_set_id_fkey"
            columns: ["photo_set_id"]
            isOneToOne: false
            referencedRelation: "job_photo_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_images_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watermarks: {
        Row: {
          created_at: string
          id: string
          image_url: string
          name: string
          photographer_id: string
          r2_key: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          name?: string
          photographer_id: string
          r2_key?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          name?: string
          photographer_id?: string
          r2_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watermarks_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_storage_quota: {
        Args: { p_file_size_bytes: number; p_photographer_id: string }
        Returns: undefined
      }
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      create_tenant_with_admin: {
        Args: {
          _admin_user_id?: string
          _email: string
          _name: string
          _subdomain: string
        }
        Returns: string
      }
      current_photographer_id: { Args: never; Returns: string }
      expire_trials: { Args: never; Returns: number }
      get_current_tenant_id: { Args: never; Returns: string }
      get_retention_email_targets: {
        Args: { p_email_type: string }
        Returns: {
          days_remaining: number
          email: string
          name: string
          photographer_id: string
        }[]
      }
      get_storage_usage: { Args: never; Returns: number }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_pin: { Args: { plain_pin: string }; Returns: string }
      is_super_admin: { Args: never; Returns: boolean }
      is_valid_client_session: {
        Args: { p_album_id: string; p_token: string }
        Returns: boolean
      }
      log_audit: {
        Args: {
          p_action: string
          p_entity_id?: string
          p_entity_type?: string
          p_metadata?: Json
        }
        Returns: undefined
      }
      resolve_photographer_plan: {
        Args: { p_photographer_id: string }
        Returns: {
          abacatepay_product_id: string | null
          id: string
          max_albums: number
          max_photos_per_album: number
          max_storage_gb: number
          name: string
          price_brl: number
        }
        SetofOptions: {
          from: "*"
          to: "plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_client_token: { Args: { p_token: string }; Returns: undefined }
      set_tenant_context: { Args: { tenant_id: string }; Returns: undefined }
      sign_contract: {
        Args: { p_album_id: string; p_client_ip: string; p_client_name: string }
        Returns: boolean
      }
      submit_client_selections: {
        Args: { p_album_id: string; p_token: string }
        Returns: boolean
      }
      verify_album_pin: {
        Args: { album_uuid: string; pin_attempt: string }
        Returns: string
      }
      verify_share_token: {
        Args: { p_album_id: string; p_share_token: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
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
      app_role: ["admin", "user", "super_admin"],
    },
  },
} as const
