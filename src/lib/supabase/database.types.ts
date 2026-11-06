/**
 * Hand-written to match supabase/migrations. After linking your project,
 * regenerate with `npm run db:types` (output format is identical).
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Rel = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type ItemType = "word" | "phrase" | "sentence";
export type Direction = "en_uz" | "uz_en";
export type CardStatus = "new" | "learning" | "review" | "mastered" | "suspended";
export type ReviewResult = "again" | "hard" | "good" | "easy";
export type ReviewMethod =
  | "encounter"
  | "recognition"
  | "recall"
  | "spelling"
  | "listening"
  | "cloze"
  | "word_order"
  | "writing"
  | "speaking"
  | "shadowing"
  | "drill";
export type DirectionMode = "random" | "en_uz" | "uz_en" | "both";
export type SrsMode = "ladder" | "fsrs";

type CardRow = {
  id: string;
  user_id: string;
  item_id: string;
  direction: Direction;
  stage: number;
  ladder_step: number;
  due_date: string;
  last_reviewed_at: string | null;
  lapses: number;
  reps: number;
  status: CardStatus;
  fsrs_state: Json | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      packs: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          cefr_level: CefrLevel | null;
          description: string | null;
          item_count: number;
          imported_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          cefr_level?: CefrLevel | null;
          description?: string | null;
          item_count?: number;
          imported_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["packs"]["Insert"]>;
        Relationships: Rel[];
      };
      items: {
        Row: {
          id: string;
          user_id: string;
          type: ItemType;
          english: string;
          uzbek: string;
          cefr_level: CefrLevel | null;
          part_of_speech: string | null;
          example_en: string | null;
          example_uz: string | null;
          notes: string | null;
          tags: string[];
          source: "manual" | "import";
          pack_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          type: ItemType;
          english: string;
          uzbek: string;
          cefr_level?: CefrLevel | null;
          part_of_speech?: string | null;
          example_en?: string | null;
          example_uz?: string | null;
          notes?: string | null;
          tags?: string[];
          source?: "manual" | "import";
          pack_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["items"]["Insert"]>;
        Relationships: Rel[];
      };
      cards: {
        Row: CardRow;
        Insert: {
          id?: string;
          user_id?: string;
          item_id: string;
          direction: Direction;
          stage?: number;
          ladder_step?: number;
          due_date?: string;
          last_reviewed_at?: string | null;
          lapses?: number;
          reps?: number;
          status?: CardStatus;
          fsrs_state?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cards"]["Insert"]>;
        Relationships: Rel[];
      };
      review_logs: {
        Row: {
          id: string;
          user_id: string;
          card_id: string;
          client_id: string;
          reviewed_at: string;
          method: ReviewMethod;
          result: ReviewResult | null;
          response_text: string | null;
          response_ms: number | null;
          was_overdue: boolean;
          overdue_days: number;
          ladder_step_before: number | null;
          ladder_step_after: number | null;
          interval_days: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          card_id: string;
          client_id?: string;
          reviewed_at?: string;
          method: ReviewMethod;
          result?: ReviewResult | null;
          response_text?: string | null;
          response_ms?: number | null;
          was_overdue?: boolean;
          overdue_days?: number;
          ladder_step_before?: number | null;
          ladder_step_after?: number | null;
          interval_days?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["review_logs"]["Insert"]>;
        Relationships: Rel[];
      };
      productions: {
        Row: {
          id: string;
          user_id: string;
          item_id: string;
          card_id: string | null;
          client_id: string;
          mode: "written" | "spoken";
          exercise: "sentence" | "situation" | "shadowing" | "drill";
          drill_id: string | null;
          context: string | null;
          prompt: string | null;
          text: string;
          passed: boolean;
          duration_ms: number | null;
          ai_feedback: Json | null;
          corrected_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          item_id: string;
          card_id?: string | null;
          client_id?: string;
          mode: "written" | "spoken";
          exercise?: "sentence" | "situation" | "shadowing" | "drill";
          drill_id?: string | null;
          context?: string | null;
          prompt?: string | null;
          text: string;
          passed?: boolean;
          duration_ms?: number | null;
          ai_feedback?: Json | null;
          corrected_text?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["productions"]["Insert"]>;
        Relationships: Rel[];
      };
      settings: {
        Row: {
          user_id: string;
          daily_new_limit: number;
          daily_review_limit: number;
          ladder: number[];
          srs_mode: SrsMode;
          reminder_times: string[];
          direction_mode: DirectionMode;
          tts_voice: string | null;
          tts_rate: number;
          timezone: string;
          overdue_penalty: boolean;
          production_gate_steps: number;
          maintenance_days: number;
          theme: "system" | "light" | "dark";
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["settings"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["settings"]["Row"]>;
        Relationships: Rel[];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          keys: Json;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          endpoint: string;
          keys: Json;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["push_subscriptions"]["Insert"]>;
        Relationships: Rel[];
      };
      daily_snapshots: {
        Row: {
          user_id: string;
          day: string;
          due_count: number;
          done_count: number;
          missed_count: number;
          reviews_count: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["daily_snapshots"]["Row"]> & {
          user_id: string;
          day: string;
        };
        Update: Partial<Database["public"]["Tables"]["daily_snapshots"]["Row"]>;
        Relationships: Rel[];
      };
    };
    Views: {
      cards_view: {
        Row: CardRow & { overdue_days: number };
        Relationships: Rel[];
      };
    };
    Functions: {
      schedule_items: { Args: { p_item_ids: string[] }; Returns: number };
      today_tz: { Args: { tz?: string }; Returns: string };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
