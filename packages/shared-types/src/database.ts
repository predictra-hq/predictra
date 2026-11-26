// Generato da supabase/tests/db-types.ts: non modificare a mano.
// Aggiornamento: pnpm --filter @predictra/database gen:types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      agent_jobs: {
        Row: {
          id: number;
          type: string;
          idempotency_key: string;
          payload: Json;
          status: Database["public"]["Enums"]["agent_job_status"];
          attempts: number;
          max_attempts: number;
          next_run_at: string;
          locked_by: string | null;
          locked_until: string | null;
          last_error: string | null;
          result: Json | null;
          last_run_id: number | null;
          created_at: string;
          updated_at: string;
          started_at: string | null;
          finished_at: string | null;
        };
        Insert: {
          id?: never;
          type: string;
          idempotency_key: string;
          payload?: Json;
          status?: Database["public"]["Enums"]["agent_job_status"];
          attempts?: number;
          max_attempts?: number;
          next_run_at?: string;
          locked_by?: string | null;
          locked_until?: string | null;
          last_error?: string | null;
          result?: Json | null;
          last_run_id?: number | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Update: {
          id?: never;
          type?: string;
          idempotency_key?: string;
          payload?: Json;
          status?: Database["public"]["Enums"]["agent_job_status"];
          attempts?: number;
          max_attempts?: number;
          next_run_at?: string;
          locked_by?: string | null;
          locked_until?: string | null;
          last_error?: string | null;
          result?: Json | null;
          last_run_id?: number | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_jobs_last_run_id_fkey";
            columns: ["last_run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_rate_limits: {
        Row: {
          provider: string;
          window_kind: Database["public"]["Enums"]["agent_quota_window"];
          window_start: string;
          used: number;
          quota: number;
          updated_at: string;
        };
        Insert: {
          provider: string;
          window_kind: Database["public"]["Enums"]["agent_quota_window"];
          window_start: string;
          used?: number;
          quota: number;
          updated_at?: string;
        };
        Update: {
          provider?: string;
          window_kind?: Database["public"]["Enums"]["agent_quota_window"];
          window_start?: string;
          used?: number;
          quota?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_runs: {
        Row: {
          id: number;
          source: Database["public"]["Enums"]["agent_run_source"];
          schedule: string;
          worker_id: string;
          status: Database["public"]["Enums"]["agent_run_status"];
          started_at: string;
          finished_at: string | null;
          jobs_claimed: number;
          jobs_done: number;
          jobs_failed: number;
          error_summary: string | null;
        };
        Insert: {
          id?: never;
          source: Database["public"]["Enums"]["agent_run_source"];
          schedule: string;
          worker_id: string;
          status?: Database["public"]["Enums"]["agent_run_status"];
          started_at?: string;
          finished_at?: string | null;
          jobs_claimed?: number;
          jobs_done?: number;
          jobs_failed?: number;
          error_summary?: string | null;
        };
        Update: {
          id?: never;
          source?: Database["public"]["Enums"]["agent_run_source"];
          schedule?: string;
          worker_id?: string;
          status?: Database["public"]["Enums"]["agent_run_status"];
          started_at?: string;
          finished_at?: string | null;
          jobs_claimed?: number;
          jobs_done?: number;
          jobs_failed?: number;
          error_summary?: string | null;
        };
        Relationships: [];
      };
      ask_usage: {
        Row: {
          user_id: string;
          day: string;
          questions: number;
          tokens: number;
          rejected: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          day: string;
          questions?: number;
          tokens?: number;
          rejected?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          day?: string;
          questions?: number;
          tokens?: number;
          rejected?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ask_usage_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: number;
          occurred_at: string;
          actor_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          metadata: Json;
        };
        Insert: {
          id?: never;
          occurred_at?: string;
          actor_id?: string | null;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json;
        };
        Update: {
          id?: never;
          occurred_at?: string;
          actor_id?: string | null;
          action?: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      backtests: {
        Row: {
          id: number;
          model_version_id: number;
          baseline_model_version_id: number | null;
          method: string;
          market: string;
          window_start: string;
          window_end: string;
          matches: number;
          brier: number;
          log_loss: number;
          ece: number | null;
          baseline_brier: number | null;
          baseline_log_loss: number | null;
          calibration: Json;
          code_commit: string;
          created_at: string;
          reliability: Json;
        };
        Insert: {
          id?: never;
          model_version_id: number;
          baseline_model_version_id?: number | null;
          method?: string;
          market?: string;
          window_start: string;
          window_end: string;
          matches: number;
          brier: number;
          log_loss: number;
          ece?: number | null;
          baseline_brier?: number | null;
          baseline_log_loss?: number | null;
          calibration?: Json;
          code_commit: string;
          created_at?: string;
          reliability?: Json;
        };
        Update: {
          id?: never;
          model_version_id?: number;
          baseline_model_version_id?: number | null;
          method?: string;
          market?: string;
          window_start?: string;
          window_end?: string;
          matches?: number;
          brier?: number;
          log_loss?: number;
          ece?: number | null;
          baseline_brier?: number | null;
          baseline_log_loss?: number | null;
          calibration?: Json;
          code_commit?: string;
          created_at?: string;
          reliability?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "backtests_baseline_model_version_id_fkey";
            columns: ["baseline_model_version_id"];
            isOneToOne: false;
            referencedRelation: "model_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "backtests_model_version_id_fkey";
            columns: ["model_version_id"];
            isOneToOne: false;
            referencedRelation: "model_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      bankroll_movements: {
        Row: {
          id: number;
          bankroll_id: number;
          kind: Database["public"]["Enums"]["bankroll_movement_kind"];
          amount: number;
          occurred_at: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          bankroll_id: number;
          kind: Database["public"]["Enums"]["bankroll_movement_kind"];
          amount: number;
          occurred_at?: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          bankroll_id?: number;
          kind?: Database["public"]["Enums"]["bankroll_movement_kind"];
          amount?: number;
          occurred_at?: string;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bankroll_movements_bankroll_id_fkey";
            columns: ["bankroll_id"];
            isOneToOne: false;
            referencedRelation: "bankrolls";
            referencedColumns: ["id"];
          },
        ];
      };
      bankrolls: {
        Row: {
          id: number;
          user_id: string;
          name: string;
          kind: Database["public"]["Enums"]["bankroll_kind"];
          currency: string;
          flat_stake_pct: number;
          created_at: string;
          updated_at: string;
          bookmaker_code: string | null;
          bookmaker_name: string | null;
        };
        Insert: {
          id?: never;
          user_id?: string;
          name: string;
          kind: Database["public"]["Enums"]["bankroll_kind"];
          currency?: string;
          flat_stake_pct?: number;
          created_at?: string;
          updated_at?: string;
          bookmaker_code?: string | null;
          bookmaker_name?: string | null;
        };
        Update: {
          id?: never;
          user_id?: string;
          name?: string;
          kind?: Database["public"]["Enums"]["bankroll_kind"];
          currency?: string;
          flat_stake_pct?: number;
          created_at?: string;
          updated_at?: string;
          bookmaker_code?: string | null;
          bookmaker_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bankrolls_bookmaker_code_fkey";
            columns: ["bookmaker_code"];
            isOneToOne: false;
            referencedRelation: "bookmakers";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "bankrolls_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bet_builder_runs: {
        Row: {
          id: number;
          model_version_id: number;
          status: Database["public"]["Enums"]["ingestion_run_status"];
          triggered_by: string;
          code_commit: string;
          rules: Json;
          started_at: string;
          finished_at: string | null;
          candidates_evaluated: number;
          proposals_written: number;
          error_summary: string | null;
        };
        Insert: {
          id?: never;
          model_version_id: number;
          status?: Database["public"]["Enums"]["ingestion_run_status"];
          triggered_by?: string;
          code_commit: string;
          rules: Json;
          started_at?: string;
          finished_at?: string | null;
          candidates_evaluated?: number;
          proposals_written?: number;
          error_summary?: string | null;
        };
        Update: {
          id?: never;
          model_version_id?: number;
          status?: Database["public"]["Enums"]["ingestion_run_status"];
          triggered_by?: string;
          code_commit?: string;
          rules?: Json;
          started_at?: string;
          finished_at?: string | null;
          candidates_evaluated?: number;
          proposals_written?: number;
          error_summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bet_builder_runs_model_version_id_fkey";
            columns: ["model_version_id"];
            isOneToOne: false;
            referencedRelation: "model_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      bet_proposal_legs: {
        Row: {
          id: number;
          proposal_id: number;
          leg_no: number;
          match_id: number;
          prediction_id: number;
          odds_snapshot_id: number;
          market: string;
          line: number | null;
          selection: string;
          probability: number;
          confidence_score: number;
          bookmaker: string;
          price: number;
          odds_event_time: string;
          odds_observed_at: string;
          model_probability: number | null;
          market_probability: number | null;
        };
        Insert: {
          id?: never;
          proposal_id: number;
          leg_no: number;
          match_id: number;
          prediction_id: number;
          odds_snapshot_id: number;
          market: string;
          line?: number | null;
          selection: string;
          probability: number;
          confidence_score: number;
          bookmaker: string;
          price: number;
          odds_event_time: string;
          odds_observed_at: string;
          model_probability?: number | null;
          market_probability?: number | null;
        };
        Update: {
          id?: never;
          proposal_id?: number;
          leg_no?: number;
          match_id?: number;
          prediction_id?: number;
          odds_snapshot_id?: number;
          market?: string;
          line?: number | null;
          selection?: string;
          probability?: number;
          confidence_score?: number;
          bookmaker?: string;
          price?: number;
          odds_event_time?: string;
          odds_observed_at?: string;
          model_probability?: number | null;
          market_probability?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "bet_proposal_legs_bookmaker_fkey";
            columns: ["bookmaker"];
            isOneToOne: false;
            referencedRelation: "bookmakers";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "bet_proposal_legs_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bet_proposal_legs_odds_snapshot_id_fkey";
            columns: ["odds_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "odds_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bet_proposal_legs_prediction_id_fkey";
            columns: ["prediction_id"];
            isOneToOne: false;
            referencedRelation: "predictions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bet_proposal_legs_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "bet_proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      bet_proposals: {
        Row: {
          id: number;
          run_id: number;
          model_version_id: number;
          kind: Database["public"]["Enums"]["bet_proposal_kind"];
          category: Database["public"]["Enums"]["bet_proposal_category"];
          slate_date: string;
          rank: number;
          rank_score: number;
          legs_count: number;
          probability: number;
          combined_price: number;
          expected_value: number;
          confidence_score: number;
          score_matrix_id: number | null;
          first_kickoff_at: string;
          last_kickoff_at: string;
          odds_observed_at: string;
          explanation: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          run_id: number;
          model_version_id: number;
          kind: Database["public"]["Enums"]["bet_proposal_kind"];
          category: Database["public"]["Enums"]["bet_proposal_category"];
          slate_date: string;
          rank: number;
          rank_score: number;
          legs_count: number;
          probability: number;
          combined_price: number;
          expected_value: number;
          confidence_score: number;
          score_matrix_id?: number | null;
          first_kickoff_at: string;
          last_kickoff_at: string;
          odds_observed_at: string;
          explanation?: Json;
          created_at?: string;
        };
        Update: {
          id?: never;
          run_id?: number;
          model_version_id?: number;
          kind?: Database["public"]["Enums"]["bet_proposal_kind"];
          category?: Database["public"]["Enums"]["bet_proposal_category"];
          slate_date?: string;
          rank?: number;
          rank_score?: number;
          legs_count?: number;
          probability?: number;
          combined_price?: number;
          expected_value?: number;
          confidence_score?: number;
          score_matrix_id?: number | null;
          first_kickoff_at?: string;
          last_kickoff_at?: string;
          odds_observed_at?: string;
          explanation?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bet_proposals_model_version_id_fkey";
            columns: ["model_version_id"];
            isOneToOne: false;
            referencedRelation: "model_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bet_proposals_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "bet_builder_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bet_proposals_score_matrix_id_fkey";
            columns: ["score_matrix_id"];
            isOneToOne: false;
            referencedRelation: "prediction_score_matrices";
            referencedColumns: ["id"];
          },
        ];
      };
      bets: {
        Row: {
          id: number;
          bankroll_id: number;
          placed_at: string;
          match_id: number | null;
          description: string | null;
          market: string;
          selection: string;
          line: number | null;
          odds: number;
          stake: number;
          bookmaker: string | null;
          status: Database["public"]["Enums"]["bet_status"];
          payout: number | null;
          settled_at: string | null;
          closing_odds: number | null;
          bet_proposal_id: number | null;
          model_version_id: number | null;
          model_probability: number | null;
          note: string | null;
          created_at: string;
          updated_at: string;
          legs: Json | null;
        };
        Insert: {
          id?: never;
          bankroll_id: number;
          placed_at?: string;
          match_id?: number | null;
          description?: string | null;
          market: string;
          selection: string;
          line?: number | null;
          odds: number;
          stake: number;
          bookmaker?: string | null;
          status?: Database["public"]["Enums"]["bet_status"];
          payout?: number | null;
          settled_at?: string | null;
          closing_odds?: number | null;
          bet_proposal_id?: number | null;
          model_version_id?: number | null;
          model_probability?: number | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          legs?: Json | null;
        };
        Update: {
          id?: never;
          bankroll_id?: number;
          placed_at?: string;
          match_id?: number | null;
          description?: string | null;
          market?: string;
          selection?: string;
          line?: number | null;
          odds?: number;
          stake?: number;
          bookmaker?: string | null;
          status?: Database["public"]["Enums"]["bet_status"];
          payout?: number | null;
          settled_at?: string | null;
          closing_odds?: number | null;
          bet_proposal_id?: number | null;
          model_version_id?: number | null;
          model_probability?: number | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          legs?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "bets_bankroll_id_fkey";
            columns: ["bankroll_id"];
            isOneToOne: false;
            referencedRelation: "bankrolls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bets_bet_proposal_id_fkey";
            columns: ["bet_proposal_id"];
            isOneToOne: false;
            referencedRelation: "bet_proposals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bets_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bets_model_version_id_fkey";
            columns: ["model_version_id"];
            isOneToOne: false;
            referencedRelation: "model_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      bookmakers: {
        Row: {
          code: string;
          title: string;
          region: string;
          italian_market: boolean;
          provider: string;
          first_seen_at: string;
          last_seen_at: string;
        };
        Insert: {
          code: string;
          title: string;
          region: string;
          italian_market?: boolean;
          provider: string;
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Update: {
          code?: string;
          title?: string;
          region?: string;
          italian_market?: boolean;
          provider?: string;
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookmakers_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
        ];
      };
      community_posts: {
        Row: {
          id: number;
          user_id: string;
          channel: string;
          body: string;
          slip: Json | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          user_id?: string;
          channel: string;
          body?: string;
          slip?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          user_id?: string;
          channel?: string;
          body?: string;
          slip?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_posts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      community_reactions: {
        Row: {
          post_id: number;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          post_id: number;
          user_id?: string;
          emoji: string;
          created_at?: string;
        };
        Update: {
          post_id?: number;
          user_id?: string;
          emoji?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_reactions_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "community_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_reactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      competitions: {
        Row: {
          id: number;
          name: string;
          code: string | null;
          type: Database["public"]["Enums"]["competition_type"];
          area_name: string | null;
          area_code: string | null;
          provider: string;
          observed_at: string;
          event_time: string | null;
          quality: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          name: string;
          code?: string | null;
          type: Database["public"]["Enums"]["competition_type"];
          area_name?: string | null;
          area_code?: string | null;
          provider: string;
          observed_at: string;
          event_time?: string | null;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          name?: string;
          code?: string | null;
          type?: Database["public"]["Enums"]["competition_type"];
          area_name?: string | null;
          area_code?: string | null;
          provider?: string;
          observed_at?: string;
          event_time?: string | null;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "competitions_ingestion_run_id_fkey";
            columns: ["ingestion_run_id"];
            isOneToOne: false;
            referencedRelation: "ingestion_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competitions_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
        ];
      };
      data_quality_issues: {
        Row: {
          id: number;
          provider: string | null;
          entity_type: Database["public"]["Enums"]["football_entity_type"] | null;
          entity_id: number | null;
          provider_entity_id: string | null;
          check_code: string;
          severity: Database["public"]["Enums"]["issue_severity"];
          status: Database["public"]["Enums"]["issue_status"];
          details: Json;
          first_seen_at: string;
          last_seen_at: string;
          resolved_at: string | null;
          ingestion_run_id: number | null;
        };
        Insert: {
          id?: never;
          provider?: string | null;
          entity_type?: Database["public"]["Enums"]["football_entity_type"] | null;
          entity_id?: number | null;
          provider_entity_id?: string | null;
          check_code: string;
          severity: Database["public"]["Enums"]["issue_severity"];
          status?: Database["public"]["Enums"]["issue_status"];
          details?: Json;
          first_seen_at?: string;
          last_seen_at?: string;
          resolved_at?: string | null;
          ingestion_run_id?: number | null;
        };
        Update: {
          id?: never;
          provider?: string | null;
          entity_type?: Database["public"]["Enums"]["football_entity_type"] | null;
          entity_id?: number | null;
          provider_entity_id?: string | null;
          check_code?: string;
          severity?: Database["public"]["Enums"]["issue_severity"];
          status?: Database["public"]["Enums"]["issue_status"];
          details?: Json;
          first_seen_at?: string;
          last_seen_at?: string;
          resolved_at?: string | null;
          ingestion_run_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "data_quality_issues_ingestion_run_id_fkey";
            columns: ["ingestion_run_id"];
            isOneToOne: false;
            referencedRelation: "ingestion_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "data_quality_issues_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
        ];
      };
      ingestion_runs: {
        Row: {
          id: number;
          provider: string;
          job_type: string;
          window_key: string;
          status: Database["public"]["Enums"]["ingestion_run_status"];
          triggered_by: string;
          started_at: string;
          finished_at: string | null;
          requests_used: number;
          quota_remaining: number | null;
          rows_upserted: number;
          error_count: number;
          error_summary: string | null;
          resume_cursor: Json | null;
        };
        Insert: {
          id?: never;
          provider: string;
          job_type: string;
          window_key: string;
          status?: Database["public"]["Enums"]["ingestion_run_status"];
          triggered_by?: string;
          started_at?: string;
          finished_at?: string | null;
          requests_used?: number;
          quota_remaining?: number | null;
          rows_upserted?: number;
          error_count?: number;
          error_summary?: string | null;
          resume_cursor?: Json | null;
        };
        Update: {
          id?: never;
          provider?: string;
          job_type?: string;
          window_key?: string;
          status?: Database["public"]["Enums"]["ingestion_run_status"];
          triggered_by?: string;
          started_at?: string;
          finished_at?: string | null;
          requests_used?: number;
          quota_remaining?: number | null;
          rows_upserted?: number;
          error_count?: number;
          error_summary?: string | null;
          resume_cursor?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "ingestion_runs_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
        ];
      };
      invitations: {
        Row: {
          id: string;
          email: string;
          role: Database["public"]["Enums"]["app_role"];
          status: Database["public"]["Enums"]["invitation_status"];
          invited_by: string | null;
          auth_user_id: string | null;
          created_at: string;
          expires_at: string;
          sent_at: string | null;
          send_error: string | null;
          accepted_at: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          role: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          invited_by?: string | null;
          auth_user_id?: string | null;
          created_at?: string;
          expires_at?: string;
          sent_at?: string | null;
          send_error?: string | null;
          accepted_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          role?: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          invited_by?: string | null;
          auth_user_id?: string | null;
          created_at?: string;
          expires_at?: string;
          sent_at?: string | null;
          send_error?: string | null;
          accepted_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_role_fkey";
            columns: ["role"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["code"];
          },
        ];
      };
      markets: {
        Row: {
          code: string;
          name: string;
          selections: string[];
          evaluable: boolean;
        };
        Insert: {
          code: string;
          name: string;
          selections: string[];
          evaluable?: boolean;
        };
        Update: {
          code?: string;
          name?: string;
          selections?: string[];
          evaluable?: boolean;
        };
        Relationships: [];
      };
      match_comments: {
        Row: {
          id: number;
          match_id: number;
          user_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          match_id: number;
          user_id?: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: never;
          match_id?: number;
          user_id?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_comments_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      match_lineup_players: {
        Row: {
          match_id: number;
          team_id: number;
          provider: string;
          player_provider_id: string;
          player_name: string;
          shirt_number: number | null;
          position: string | null;
          grid: string | null;
          is_starter: boolean;
        };
        Insert: {
          match_id: number;
          team_id: number;
          provider: string;
          player_provider_id: string;
          player_name: string;
          shirt_number?: number | null;
          position?: string | null;
          grid?: string | null;
          is_starter: boolean;
        };
        Update: {
          match_id?: number;
          team_id?: number;
          provider?: string;
          player_provider_id?: string;
          player_name?: string;
          shirt_number?: number | null;
          position?: string | null;
          grid?: string | null;
          is_starter?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "match_lineup_players_match_id_team_id_provider_fkey";
            columns: ["match_id","team_id","provider"];
            isOneToOne: false;
            referencedRelation: "match_lineups";
            referencedColumns: ["match_id","team_id","provider"];
          },
        ];
      };
      match_lineups: {
        Row: {
          match_id: number;
          team_id: number;
          provider: string;
          provider_match_id: string;
          formation: string | null;
          coach_provider_id: string | null;
          coach_name: string | null;
          observed_at: string;
          event_time: string;
          quality: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id: number | null;
        };
        Insert: {
          match_id: number;
          team_id: number;
          provider: string;
          provider_match_id: string;
          formation?: string | null;
          coach_provider_id?: string | null;
          coach_name?: string | null;
          observed_at: string;
          event_time: string;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
        };
        Update: {
          match_id?: number;
          team_id?: number;
          provider?: string;
          provider_match_id?: string;
          formation?: string | null;
          coach_provider_id?: string | null;
          coach_name?: string | null;
          observed_at?: string;
          event_time?: string;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "match_lineups_ingestion_run_id_fkey";
            columns: ["ingestion_run_id"];
            isOneToOne: false;
            referencedRelation: "ingestion_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_lineups_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_lineups_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "match_lineups_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      match_team_statistics: {
        Row: {
          match_id: number;
          team_id: number;
          provider: string;
          provider_match_id: string;
          stat: string;
          value: number | null;
          observed_at: string;
          event_time: string;
          quality: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id: number | null;
        };
        Insert: {
          match_id: number;
          team_id: number;
          provider: string;
          provider_match_id: string;
          stat: string;
          value?: number | null;
          observed_at: string;
          event_time: string;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
        };
        Update: {
          match_id?: number;
          team_id?: number;
          provider?: string;
          provider_match_id?: string;
          stat?: string;
          value?: number | null;
          observed_at?: string;
          event_time?: string;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "match_team_statistics_ingestion_run_id_fkey";
            columns: ["ingestion_run_id"];
            isOneToOne: false;
            referencedRelation: "ingestion_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_team_statistics_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_team_statistics_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "match_team_statistics_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      matches: {
        Row: {
          id: number;
          competition_id: number;
          season_id: number;
          matchday: number | null;
          stage: string | null;
          group_name: string | null;
          kickoff_at: string;
          status: Database["public"]["Enums"]["match_status"];
          home_team_id: number;
          away_team_id: number;
          home_score: number | null;
          away_score: number | null;
          home_score_ht: number | null;
          away_score_ht: number | null;
          score_duration: Database["public"]["Enums"]["score_duration"] | null;
          provider: string;
          observed_at: string;
          event_time: string;
          quality: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          competition_id: number;
          season_id: number;
          matchday?: number | null;
          stage?: string | null;
          group_name?: string | null;
          kickoff_at: string;
          status: Database["public"]["Enums"]["match_status"];
          home_team_id: number;
          away_team_id: number;
          home_score?: number | null;
          away_score?: number | null;
          home_score_ht?: number | null;
          away_score_ht?: number | null;
          score_duration?: Database["public"]["Enums"]["score_duration"] | null;
          provider: string;
          observed_at: string;
          event_time: string;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          competition_id?: number;
          season_id?: number;
          matchday?: number | null;
          stage?: string | null;
          group_name?: string | null;
          kickoff_at?: string;
          status?: Database["public"]["Enums"]["match_status"];
          home_team_id?: number;
          away_team_id?: number;
          home_score?: number | null;
          away_score?: number | null;
          home_score_ht?: number | null;
          away_score_ht?: number | null;
          score_duration?: Database["public"]["Enums"]["score_duration"] | null;
          provider?: string;
          observed_at?: string;
          event_time?: string;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey";
            columns: ["away_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_home_team_id_fkey";
            columns: ["home_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_ingestion_run_id_fkey";
            columns: ["ingestion_run_id"];
            isOneToOne: false;
            referencedRelation: "ingestion_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "matches_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      model_versions: {
        Row: {
          id: number;
          model_key: string;
          version: string;
          code_commit: string;
          parameters: Json;
          training_window_start: string;
          training_window_end: string;
          training_data_hash: string;
          training_matches: number;
          status: Database["public"]["Enums"]["model_status"];
          notes: string | null;
          created_at: string;
          activated_at: string | null;
          activated_by: string | null;
          retired_at: string | null;
        };
        Insert: {
          id?: never;
          model_key: string;
          version: string;
          code_commit: string;
          parameters: Json;
          training_window_start: string;
          training_window_end: string;
          training_data_hash: string;
          training_matches: number;
          status?: Database["public"]["Enums"]["model_status"];
          notes?: string | null;
          created_at?: string;
          activated_at?: string | null;
          activated_by?: string | null;
          retired_at?: string | null;
        };
        Update: {
          id?: never;
          model_key?: string;
          version?: string;
          code_commit?: string;
          parameters?: Json;
          training_window_start?: string;
          training_window_end?: string;
          training_data_hash?: string;
          training_matches?: number;
          status?: Database["public"]["Enums"]["model_status"];
          notes?: string | null;
          created_at?: string;
          activated_at?: string | null;
          activated_by?: string | null;
          retired_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "model_versions_activated_by_fkey";
            columns: ["activated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: number;
          user_id: string;
          kind: string;
          severity: Database["public"]["Enums"]["notification_severity"];
          title: string;
          body: string | null;
          link: string | null;
          dedupe_key: string | null;
          source_job_id: number | null;
          created_at: string;
          read_at: string | null;
        };
        Insert: {
          id?: never;
          user_id: string;
          kind: string;
          severity?: Database["public"]["Enums"]["notification_severity"];
          title: string;
          body?: string | null;
          link?: string | null;
          dedupe_key?: string | null;
          source_job_id?: number | null;
          created_at?: string;
          read_at?: string | null;
        };
        Update: {
          id?: never;
          user_id?: string;
          kind?: string;
          severity?: Database["public"]["Enums"]["notification_severity"];
          title?: string;
          body?: string | null;
          link?: string | null;
          dedupe_key?: string | null;
          source_job_id?: number | null;
          created_at?: string;
          read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_source_job_id_fkey";
            columns: ["source_job_id"];
            isOneToOne: false;
            referencedRelation: "agent_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      odds_events: {
        Row: {
          id: number;
          provider: string;
          provider_event_id: string;
          sport_key: string;
          competition_id: number | null;
          match_id: number | null;
          commence_time: string;
          home_team_name: string;
          away_team_name: string;
          observed_at: string;
          quality: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          provider: string;
          provider_event_id: string;
          sport_key: string;
          competition_id?: number | null;
          match_id?: number | null;
          commence_time: string;
          home_team_name: string;
          away_team_name: string;
          observed_at: string;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          provider?: string;
          provider_event_id?: string;
          sport_key?: string;
          competition_id?: number | null;
          match_id?: number | null;
          commence_time?: string;
          home_team_name?: string;
          away_team_name?: string;
          observed_at?: string;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "odds_events_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "odds_events_ingestion_run_id_fkey";
            columns: ["ingestion_run_id"];
            isOneToOne: false;
            referencedRelation: "ingestion_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "odds_events_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "odds_events_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
        ];
      };
      odds_snapshots: {
        Row: {
          id: number;
          event_id: number;
          bookmaker: string;
          market: string;
          selection: string;
          price: number;
          provider: string;
          event_time: string;
          first_observed_at: string;
          observed_at: string;
          quality: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id: number | null;
        };
        Insert: {
          id?: never;
          event_id: number;
          bookmaker: string;
          market: string;
          selection: string;
          price: number;
          provider: string;
          event_time: string;
          first_observed_at: string;
          observed_at: string;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
        };
        Update: {
          id?: never;
          event_id?: number;
          bookmaker?: string;
          market?: string;
          selection?: string;
          price?: number;
          provider?: string;
          event_time?: string;
          first_observed_at?: string;
          observed_at?: string;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "odds_snapshots_bookmaker_fkey";
            columns: ["bookmaker"];
            isOneToOne: false;
            referencedRelation: "bookmakers";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "odds_snapshots_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "odds_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "odds_snapshots_ingestion_run_id_fkey";
            columns: ["ingestion_run_id"];
            isOneToOne: false;
            referencedRelation: "ingestion_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "odds_snapshots_market_fkey";
            columns: ["market"];
            isOneToOne: false;
            referencedRelation: "markets";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "odds_snapshots_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
        ];
      };
      personal_limits: {
        Row: {
          bankroll_id: number;
          max_stake: number | null;
          max_open_bets: number | null;
          max_daily_loss: number | null;
          max_weekly_loss: number | null;
          updated_at: string;
        };
        Insert: {
          bankroll_id: number;
          max_stake?: number | null;
          max_open_bets?: number | null;
          max_daily_loss?: number | null;
          max_weekly_loss?: number | null;
          updated_at?: string;
        };
        Update: {
          bankroll_id?: number;
          max_stake?: number | null;
          max_open_bets?: number | null;
          max_daily_loss?: number | null;
          max_weekly_loss?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "personal_limits_bankroll_id_fkey";
            columns: ["bankroll_id"];
            isOneToOne: true;
            referencedRelation: "bankrolls";
            referencedColumns: ["id"];
          },
        ];
      };
      prediction_runs: {
        Row: {
          id: number;
          model_version_id: number;
          status: Database["public"]["Enums"]["ingestion_run_status"];
          triggered_by: string;
          code_commit: string;
          started_at: string;
          finished_at: string | null;
          matches_scored: number;
          predictions_written: number;
          error_summary: string | null;
        };
        Insert: {
          id?: never;
          model_version_id: number;
          status?: Database["public"]["Enums"]["ingestion_run_status"];
          triggered_by?: string;
          code_commit: string;
          started_at?: string;
          finished_at?: string | null;
          matches_scored?: number;
          predictions_written?: number;
          error_summary?: string | null;
        };
        Update: {
          id?: never;
          model_version_id?: number;
          status?: Database["public"]["Enums"]["ingestion_run_status"];
          triggered_by?: string;
          code_commit?: string;
          started_at?: string;
          finished_at?: string | null;
          matches_scored?: number;
          predictions_written?: number;
          error_summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "prediction_runs_model_version_id_fkey";
            columns: ["model_version_id"];
            isOneToOne: false;
            referencedRelation: "model_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      prediction_score_matrices: {
        Row: {
          id: number;
          match_id: number;
          model_version_id: number;
          prediction_run_id: number;
          as_of: string;
          lambda_home: number;
          lambda_away: number;
          rho: number | null;
          max_goals: number;
          matrix: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          match_id: number;
          model_version_id: number;
          prediction_run_id: number;
          as_of: string;
          lambda_home: number;
          lambda_away: number;
          rho?: number | null;
          max_goals: number;
          matrix: Json;
          created_at?: string;
        };
        Update: {
          id?: never;
          match_id?: number;
          model_version_id?: number;
          prediction_run_id?: number;
          as_of?: string;
          lambda_home?: number;
          lambda_away?: number;
          rho?: number | null;
          max_goals?: number;
          matrix?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prediction_score_matrices_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prediction_score_matrices_model_version_id_fkey";
            columns: ["model_version_id"];
            isOneToOne: false;
            referencedRelation: "model_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prediction_score_matrices_prediction_run_id_fkey";
            columns: ["prediction_run_id"];
            isOneToOne: false;
            referencedRelation: "prediction_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      predictions: {
        Row: {
          id: number;
          match_id: number;
          model_version_id: number;
          prediction_run_id: number;
          market: string;
          line: number | null;
          selection: string;
          probability: number;
          push_probability: number | null;
          confidence_score: number;
          explanation: Json;
          features_hash: string;
          as_of: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          match_id: number;
          model_version_id: number;
          prediction_run_id: number;
          market: string;
          line?: number | null;
          selection: string;
          probability: number;
          push_probability?: number | null;
          confidence_score: number;
          explanation?: Json;
          features_hash: string;
          as_of: string;
          created_at?: string;
        };
        Update: {
          id?: never;
          match_id?: number;
          model_version_id?: number;
          prediction_run_id?: number;
          market?: string;
          line?: number | null;
          selection?: string;
          probability?: number;
          push_probability?: number | null;
          confidence_score?: number;
          explanation?: Json;
          features_hash?: string;
          as_of?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "predictions_model_version_id_fkey";
            columns: ["model_version_id"];
            isOneToOne: false;
            referencedRelation: "model_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "predictions_prediction_run_id_fkey";
            columns: ["prediction_run_id"];
            isOneToOne: false;
            referencedRelation: "prediction_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          status: Database["public"]["Enums"]["account_status"];
          suspended_at: string | null;
          suspended_by: string | null;
          created_at: string;
          updated_at: string;
          name_color: string | null;
          name_style: string | null;
          avatar_style: string | null;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          suspended_at?: string | null;
          suspended_by?: string | null;
          created_at?: string;
          updated_at?: string;
          name_color?: string | null;
          name_style?: string | null;
          avatar_style?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          suspended_at?: string | null;
          suspended_by?: string | null;
          created_at?: string;
          updated_at?: string;
          name_color?: string | null;
          name_style?: string | null;
          avatar_style?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_suspended_by_fkey";
            columns: ["suspended_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_entity_map: {
        Row: {
          provider: string;
          entity_type: Database["public"]["Enums"]["football_entity_type"];
          provider_entity_id: string;
          entity_id: number;
          observed_at: string;
        };
        Insert: {
          provider: string;
          entity_type: Database["public"]["Enums"]["football_entity_type"];
          provider_entity_id: string;
          entity_id: number;
          observed_at?: string;
        };
        Update: {
          provider?: string;
          entity_type?: Database["public"]["Enums"]["football_entity_type"];
          provider_entity_id?: string;
          entity_id?: number;
          observed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_entity_map_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
        ];
      };
      providers: {
        Row: {
          code: string;
          name: string;
          website: string;
          terms_url: string | null;
          terms_verified_at: string | null;
          licence_summary: string;
          attribution: string | null;
          docs_path: string;
          created_at: string;
          updated_at: string;
          primary_data_kind: Database["public"]["Enums"]["football_data_kind"];
        };
        Insert: {
          code: string;
          name: string;
          website: string;
          terms_url?: string | null;
          terms_verified_at?: string | null;
          licence_summary: string;
          attribution?: string | null;
          docs_path: string;
          created_at?: string;
          updated_at?: string;
          primary_data_kind?: Database["public"]["Enums"]["football_data_kind"];
        };
        Update: {
          code?: string;
          name?: string;
          website?: string;
          terms_url?: string | null;
          terms_verified_at?: string | null;
          licence_summary?: string;
          attribution?: string | null;
          docs_path?: string;
          created_at?: string;
          updated_at?: string;
          primary_data_kind?: Database["public"]["Enums"]["football_data_kind"];
        };
        Relationships: [];
      };
      recommended_slips: {
        Row: {
          id: number;
          window_kind: string;
          window_start: string;
          profile: string;
          signature: string;
          picks: Json;
          price: number;
          probability: number;
          expected_value: number;
          odds_observed_at: string | null;
          first_kickoff_at: string;
          source: string;
          first_seen_at: string;
          last_seen_at: string;
          model_version_id: number | null;
          rules_version: string | null;
          rules: Json | null;
          relax_step: number | null;
        };
        Insert: {
          id?: never;
          window_kind: string;
          window_start: string;
          profile: string;
          signature: string;
          picks: Json;
          price: number;
          probability: number;
          expected_value: number;
          odds_observed_at?: string | null;
          first_kickoff_at: string;
          source?: string;
          first_seen_at?: string;
          last_seen_at?: string;
          model_version_id?: number | null;
          rules_version?: string | null;
          rules?: Json | null;
          relax_step?: number | null;
        };
        Update: {
          id?: never;
          window_kind?: string;
          window_start?: string;
          profile?: string;
          signature?: string;
          picks?: Json;
          price?: number;
          probability?: number;
          expected_value?: number;
          odds_observed_at?: string | null;
          first_kickoff_at?: string;
          source?: string;
          first_seen_at?: string;
          last_seen_at?: string;
          model_version_id?: number | null;
          rules_version?: string | null;
          rules?: Json | null;
          relax_step?: number | null;
        };
        Relationships: [];
      };
      roles: {
        Row: {
          code: Database["public"]["Enums"]["app_role"];
          rank: number;
          description: string;
        };
        Insert: {
          code: Database["public"]["Enums"]["app_role"];
          rank: number;
          description: string;
        };
        Update: {
          code?: Database["public"]["Enums"]["app_role"];
          rank?: number;
          description?: string;
        };
        Relationships: [];
      };
      seasons: {
        Row: {
          id: number;
          competition_id: number;
          label: string;
          start_date: string;
          end_date: string;
          current_matchday: number | null;
          provider: string;
          observed_at: string;
          event_time: string | null;
          quality: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          competition_id: number;
          label: string;
          start_date: string;
          end_date: string;
          current_matchday?: number | null;
          provider: string;
          observed_at: string;
          event_time?: string | null;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          competition_id?: number;
          label?: string;
          start_date?: string;
          end_date?: string;
          current_matchday?: number | null;
          provider?: string;
          observed_at?: string;
          event_time?: string | null;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seasons_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seasons_ingestion_run_id_fkey";
            columns: ["ingestion_run_id"];
            isOneToOne: false;
            referencedRelation: "ingestion_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seasons_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
        ];
      };
      source_freshness_rules: {
        Row: {
          provider: string;
          data_kind: Database["public"]["Enums"]["football_data_kind"];
          max_age: string | null;
        };
        Insert: {
          provider: string;
          data_kind: Database["public"]["Enums"]["football_data_kind"];
          max_age?: string | null;
        };
        Update: {
          provider?: string;
          data_kind?: Database["public"]["Enums"]["football_data_kind"];
          max_age?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "source_freshness_rules_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
        ];
      };
      standings: {
        Row: {
          id: number;
          competition_id: number;
          season_id: number;
          team_id: number;
          standing_type: Database["public"]["Enums"]["standing_type"];
          stage: string;
          group_name: string;
          position: number;
          played: number;
          won: number;
          draw: number;
          lost: number;
          goals_for: number;
          goals_against: number;
          points: number;
          provider: string;
          observed_at: string;
          event_time: string;
          quality: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id: number | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          competition_id: number;
          season_id: number;
          team_id: number;
          standing_type?: Database["public"]["Enums"]["standing_type"];
          stage?: string;
          group_name?: string;
          position: number;
          played: number;
          won: number;
          draw: number;
          lost: number;
          goals_for: number;
          goals_against: number;
          points: number;
          provider: string;
          observed_at: string;
          event_time: string;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          competition_id?: number;
          season_id?: number;
          team_id?: number;
          standing_type?: Database["public"]["Enums"]["standing_type"];
          stage?: string;
          group_name?: string;
          position?: number;
          played?: number;
          won?: number;
          draw?: number;
          lost?: number;
          goals_for?: number;
          goals_against?: number;
          points?: number;
          provider?: string;
          observed_at?: string;
          event_time?: string;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "standings_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "standings_ingestion_run_id_fkey";
            columns: ["ingestion_run_id"];
            isOneToOne: false;
            referencedRelation: "ingestion_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "standings_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "standings_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "standings_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      team_aliases: {
        Row: {
          id: number;
          team_id: number;
          alias: string;
          normalized_alias: string | null;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          team_id: number;
          alias: string;
          normalized_alias?: never;
          source: string;
          created_at?: string;
        };
        Update: {
          id?: never;
          team_id?: number;
          alias?: string;
          normalized_alias?: never;
          source?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_aliases_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          id: number;
          name: string;
          short_name: string | null;
          tla: string | null;
          area_code: string | null;
          provider: string;
          observed_at: string;
          event_time: string | null;
          quality: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          name: string;
          short_name?: string | null;
          tla?: string | null;
          area_code?: string | null;
          provider: string;
          observed_at: string;
          event_time?: string | null;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          name?: string;
          short_name?: string | null;
          tla?: string | null;
          area_code?: string | null;
          provider?: string;
          observed_at?: string;
          event_time?: string | null;
          quality?: Database["public"]["Enums"]["quality_status"];
          ingestion_run_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teams_ingestion_run_id_fkey";
            columns: ["ingestion_run_id"];
            isOneToOne: false;
            referencedRelation: "ingestion_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teams_provider_fkey";
            columns: ["provider"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["code"];
          },
        ];
      };
      user_bet_slip_selections: {
        Row: {
          id: number;
          slip_id: number;
          user_id: string;
          leg_no: number;
          match_id: number;
          market: string;
          line: number | null;
          selection: string;
          prediction_id: number | null;
          odds_snapshot_id: number | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          slip_id: number;
          user_id?: string;
          leg_no: number;
          match_id: number;
          market: string;
          line?: number | null;
          selection: string;
          prediction_id?: number | null;
          odds_snapshot_id?: number | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          slip_id?: number;
          user_id?: string;
          leg_no?: number;
          match_id?: number;
          market?: string;
          line?: number | null;
          selection?: string;
          prediction_id?: number | null;
          odds_snapshot_id?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_bet_slip_selections_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_bet_slip_selections_odds_snapshot_id_fkey";
            columns: ["odds_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "odds_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_bet_slip_selections_prediction_id_fkey";
            columns: ["prediction_id"];
            isOneToOne: false;
            referencedRelation: "predictions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_bet_slip_selections_slip_fk";
            columns: ["slip_id","user_id"];
            isOneToOne: false;
            referencedRelation: "user_bet_slips";
            referencedColumns: ["id","user_id"];
          },
        ];
      };
      user_bet_slips: {
        Row: {
          id: number;
          user_id: string;
          name: string;
          notes: string | null;
          source_proposal_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          user_id?: string;
          name: string;
          notes?: string | null;
          source_proposal_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          user_id?: string;
          name?: string;
          notes?: string | null;
          source_proposal_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_bet_slips_source_proposal_id_fkey";
            columns: ["source_proposal_id"];
            isOneToOne: false;
            referencedRelation: "bet_proposals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_bet_slips_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_birthdays: {
        Row: {
          user_id: string;
          birth_date: string;
          show_birthday: boolean;
          updated_at: string;
        };
        Insert: {
          user_id?: string;
          birth_date: string;
          show_birthday?: boolean;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          birth_date?: string;
          show_birthday?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_birthdays_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_dashboard_settings: {
        Row: {
          user_id: string;
          settings: Json;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          settings?: Json;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          settings?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_dashboard_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_follows: {
        Row: {
          id: number;
          user_id: string;
          team_id: number | null;
          competition_id: number | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          user_id?: string;
          team_id?: number | null;
          competition_id?: number | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          user_id?: string;
          team_id?: number | null;
          competition_id?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_follows_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_follows_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_follows_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_preferences: {
        Row: {
          user_id: string;
          locale: string;
          timezone: string;
          odds_format: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          locale?: string;
          timezone?: string;
          odds_format?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          locale?: string;
          timezone?: string;
          odds_format?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          user_id: string;
          role: Database["public"]["Enums"]["app_role"];
          granted_by: string | null;
          granted_at: string;
        };
        Insert: {
          user_id: string;
          role: Database["public"]["Enums"]["app_role"];
          granted_by?: string | null;
          granted_at?: string;
        };
        Update: {
          user_id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          granted_by?: string | null;
          granted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_role_fkey";
            columns: ["role"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      v_active_bet_proposals: {
        Row: {
          proposal_id: number | null;
          run_id: number | null;
          slate_date: string | null;
          category: Database["public"]["Enums"]["bet_proposal_category"] | null;
          rank: number | null;
          rank_score: number | null;
          kind: Database["public"]["Enums"]["bet_proposal_kind"] | null;
          legs_count: number | null;
          probability: number | null;
          combined_price: number | null;
          expected_value: number | null;
          confidence_score: number | null;
          first_kickoff_at: string | null;
          last_kickoff_at: string | null;
          odds_observed_at: string | null;
          legs_stale: number | null;
          legs_price_changed: number | null;
          explanation: Json | null;
          created_at: string | null;
          model_version_id: number | null;
          model_key: string | null;
          model_version: string | null;
        };
        Relationships: [];
      };
      v_active_predictions: {
        Row: {
          match_id: number | null;
          kickoff_at: string | null;
          match_status: Database["public"]["Enums"]["match_status"] | null;
          competition_id: number | null;
          season_id: number | null;
          home_team_name: string | null;
          away_team_name: string | null;
          market: string | null;
          line: number | null;
          selection: string | null;
          probability: number | null;
          push_probability: number | null;
          confidence_score: number | null;
          explanation: Json | null;
          as_of: string | null;
          created_at: string | null;
          model_version_id: number | null;
          model_key: string | null;
          model_version: string | null;
        };
        Relationships: [];
      };
      v_agent_queue_summary: {
        Row: {
          type: string | null;
          status: Database["public"]["Enums"]["agent_job_status"] | null;
          jobs: number | null;
          ready: number | null;
          lease_expired: number | null;
          next_run_at: string | null;
          last_change_at: string | null;
        };
        Relationships: [];
      };
      v_agent_status: {
        Row: {
          source: Database["public"]["Enums"]["agent_run_source"] | null;
          expected_interval_minutes: number | null;
          degraded_after_minutes: number | null;
          last_run_at: string | null;
          last_run_status: Database["public"]["Enums"]["agent_run_status"] | null;
          last_success_at: string | null;
          runs_24h: number | null;
          failed_runs_24h: number | null;
          observed_interval_minutes: number | null;
          is_degraded: boolean | null;
        };
        Relationships: [];
      };
      v_bankroll_summary: {
        Row: {
          bankroll_id: number | null;
          name: string | null;
          kind: Database["public"]["Enums"]["bankroll_kind"] | null;
          currency: string | null;
          flat_stake_pct: number | null;
          created_at: string | null;
          deposits: number | null;
          withdrawals: number | null;
          adjustments: number | null;
          settled_profit: number | null;
          open_stakes: number | null;
          balance: number | null;
          available: number | null;
          open_bets: number | null;
          settled_bets: number | null;
          settled_stakes: number | null;
          bookmaker_code: string | null;
          bookmaker_name: string | null;
        };
        Relationships: [];
      };
      v_best_odds_h2h: {
        Row: {
          event_id: number | null;
          match_id: number | null;
          competition_id: number | null;
          commence_time: string | null;
          home_team_name: string | null;
          away_team_name: string | null;
          best_home_price: number | null;
          best_home_bookmaker: string | null;
          best_draw_price: number | null;
          best_draw_bookmaker: string | null;
          best_away_price: number | null;
          best_away_bookmaker: string | null;
          bookmakers: number | null;
          italian_bookmakers: number | null;
          observed_at: string | null;
        };
        Relationships: [];
      };
      v_bet_builder_latest_run: {
        Row: {
          run_id: number | null;
          status: Database["public"]["Enums"]["ingestion_run_status"] | null;
          triggered_by: string | null;
          started_at: string | null;
          finished_at: string | null;
          candidates_evaluated: number | null;
          proposals_written: number | null;
          rules: Json | null;
          model_version_id: number | null;
          model_key: string | null;
          model_version: string | null;
        };
        Relationships: [];
      };
      v_bet_proposal_legs: {
        Row: {
          proposal_id: number | null;
          leg_no: number | null;
          match_id: number | null;
          kickoff_at: string | null;
          match_status: Database["public"]["Enums"]["match_status"] | null;
          competition_id: number | null;
          home_team_name: string | null;
          away_team_name: string | null;
          market: string | null;
          line: number | null;
          selection: string | null;
          probability: number | null;
          confidence_score: number | null;
          bookmaker: string | null;
          bookmaker_title: string | null;
          price: number | null;
          odds_event_time: string | null;
          odds_observed_at: string | null;
          prediction_id: number | null;
          odds_snapshot_id: number | null;
          current_price: number | null;
          current_observed_at: string | null;
          current_freshness: Database["public"]["Enums"]["freshness_status"] | null;
          model_probability: number | null;
          market_probability: number | null;
          italian_market: boolean | null;
        };
        Relationships: [];
      };
      v_bets: {
        Row: {
          id: number | null;
          bankroll_id: number | null;
          placed_at: string | null;
          match_id: number | null;
          description: string | null;
          market: string | null;
          selection: string | null;
          line: number | null;
          odds: number | null;
          stake: number | null;
          bookmaker: string | null;
          status: Database["public"]["Enums"]["bet_status"] | null;
          payout: number | null;
          settled_at: string | null;
          closing_odds: number | null;
          bet_proposal_id: number | null;
          model_version_id: number | null;
          model_probability: number | null;
          note: string | null;
          created_at: string | null;
          updated_at: string | null;
          bankroll_kind: Database["public"]["Enums"]["bankroll_kind"] | null;
          bankroll_name: string | null;
          profit: number | null;
        };
        Relationships: [];
      };
      v_latest_odds: {
        Row: {
          event_id: number | null;
          match_id: number | null;
          competition_id: number | null;
          bookmaker: string | null;
          market: string | null;
          selection: string | null;
          price: number | null;
          provider: string | null;
          event_time: string | null;
          observed_at: string | null;
          quality: Database["public"]["Enums"]["quality_status"] | null;
        };
        Relationships: [];
      };
      v_latest_standings: {
        Row: {
          competition_id: number | null;
          competition_name: string | null;
          season_id: number | null;
          season_label: string | null;
          standing_type: Database["public"]["Enums"]["standing_type"] | null;
          stage: string | null;
          group_name: string | null;
          position: number | null;
          team_id: number | null;
          team_name: string | null;
          team_tla: string | null;
          played: number | null;
          won: number | null;
          draw: number | null;
          lost: number | null;
          goals_for: number | null;
          goals_against: number | null;
          goal_difference: number | null;
          points: number | null;
          provider: string | null;
          observed_at: string | null;
          event_time: string | null;
          quality: Database["public"]["Enums"]["quality_status"] | null;
          freshness: Database["public"]["Enums"]["freshness_status"] | null;
        };
        Relationships: [];
      };
      v_league_season_stats: {
        Row: {
          season_id: number | null;
          competition_id: number | null;
          matches: number | null;
          avg_goals: number | null;
          avg_home_goals: number | null;
          avg_away_goals: number | null;
          home_win_rate: number | null;
          draw_rate: number | null;
          away_win_rate: number | null;
          over_2_5_rate: number | null;
          both_scored_rate: number | null;
          first_match_at: string | null;
          last_match_at: string | null;
        };
        Relationships: [];
      };
      v_match_center: {
        Row: {
          match_id: number | null;
          kickoff_at: string | null;
          status: Database["public"]["Enums"]["match_status"] | null;
          matchday: number | null;
          stage: string | null;
          group_name: string | null;
          competition_id: number | null;
          competition_code: string | null;
          competition_name: string | null;
          area_name: string | null;
          season_id: number | null;
          season_label: string | null;
          home_team_id: number | null;
          home_team_name: string | null;
          home_team_short_name: string | null;
          home_team_tla: string | null;
          away_team_id: number | null;
          away_team_name: string | null;
          away_team_short_name: string | null;
          away_team_tla: string | null;
          home_score: number | null;
          away_score: number | null;
          home_score_ht: number | null;
          away_score_ht: number | null;
          score_duration: Database["public"]["Enums"]["score_duration"] | null;
          provider: string | null;
          provider_name: string | null;
          provider_match_id: string | null;
          observed_at: string | null;
          event_time: string | null;
          quality: Database["public"]["Enums"]["quality_status"] | null;
          freshness: Database["public"]["Enums"]["freshness_status"] | null;
          open_issues: number | null;
        };
        Relationships: [];
      };
      v_match_odds_h2h: {
        Row: {
          event_id: number | null;
          match_id: number | null;
          competition_id: number | null;
          commence_time: string | null;
          home_team_name: string | null;
          away_team_name: string | null;
          bookmaker: string | null;
          bookmaker_title: string | null;
          italian_market: boolean | null;
          home_price: number | null;
          draw_price: number | null;
          away_price: number | null;
          overround: number | null;
          home_probability: number | null;
          draw_probability: number | null;
          away_probability: number | null;
          provider: string | null;
          observed_at: string | null;
          event_time: string | null;
          quality: Database["public"]["Enums"]["quality_status"] | null;
          freshness: Database["public"]["Enums"]["freshness_status"] | null;
        };
        Relationships: [];
      };
      v_match_results: {
        Row: {
          match_id: number | null;
          competition_id: number | null;
          season_id: number | null;
          matchday: number | null;
          kickoff_at: string | null;
          home_team_id: number | null;
          away_team_id: number | null;
          home_score: number | null;
          away_score: number | null;
          home_score_ht: number | null;
          away_score_ht: number | null;
          score_duration: Database["public"]["Enums"]["score_duration"] | null;
          provider: string | null;
          observed_at: string | null;
          quality: Database["public"]["Enums"]["quality_status"] | null;
        };
        Relationships: [];
      };
      v_model_versions_summary: {
        Row: {
          model_version_id: number | null;
          model_key: string | null;
          version: string | null;
          status: Database["public"]["Enums"]["model_status"] | null;
          code_commit: string | null;
          training_window_start: string | null;
          training_window_end: string | null;
          training_matches: number | null;
          created_at: string | null;
          activated_at: string | null;
          backtest_id: number | null;
          backtest_window_start: string | null;
          backtest_window_end: string | null;
          backtest_matches: number | null;
          brier: number | null;
          log_loss: number | null;
          ece: number | null;
          baseline_brier: number | null;
          baseline_log_loss: number | null;
          beats_baseline: boolean | null;
          calibration: Json | null;
        };
        Relationships: [];
      };
      v_odds_coverage: {
        Row: {
          competition_id: number | null;
          competition_code: string | null;
          competition_name: string | null;
          events: number | null;
          matched_events: number | null;
          bookmakers: number | null;
          italian_bookmakers: number | null;
          last_observed_at: string | null;
        };
        Relationships: [];
      };
      v_pre_kickoff_predictions: {
        Row: {
          match_id: number | null;
          kickoff_at: string | null;
          match_status: Database["public"]["Enums"]["match_status"] | null;
          competition_id: number | null;
          season_id: number | null;
          home_team_name: string | null;
          away_team_name: string | null;
          market: string | null;
          line: number | null;
          selection: string | null;
          probability: number | null;
          push_probability: number | null;
          confidence_score: number | null;
          explanation: Json | null;
          as_of: string | null;
          created_at: string | null;
          model_version_id: number | null;
          model_key: string | null;
          model_version: string | null;
        };
        Relationships: [];
      };
      v_source_health: {
        Row: {
          provider: string | null;
          name: string | null;
          website: string | null;
          terms_verified_at: string | null;
          attribution: string | null;
          last_run_status: Database["public"]["Enums"]["ingestion_run_status"] | null;
          last_run_at: string | null;
          last_error: string | null;
          quota_remaining: number | null;
          last_success_at: string | null;
          runs_24h: number | null;
          failed_runs_24h: number | null;
          requests_24h: number | null;
          open_issues: number | null;
          open_errors: number | null;
          freshness: Database["public"]["Enums"]["freshness_status"] | null;
          health: string | null;
        };
        Relationships: [];
      };
      v_team_form: {
        Row: {
          season_id: number | null;
          team_id: number | null;
          form: string | null;
          last_match_at: string | null;
        };
        Relationships: [];
      };
      v_team_match_results: {
        Row: {
          match_id: number | null;
          competition_id: number | null;
          season_id: number | null;
          kickoff_at: string | null;
          team_id: number | null;
          opponent_id: number | null;
          is_home: boolean | null;
          goals_for: number | null;
          goals_against: number | null;
        };
        Relationships: [];
      };
      v_team_season_stats: {
        Row: {
          season_id: number | null;
          competition_id: number | null;
          team_id: number | null;
          team_name: string | null;
          team_tla: string | null;
          played: number | null;
          won: number | null;
          draw: number | null;
          lost: number | null;
          goals_for: number | null;
          goals_against: number | null;
          points: number | null;
          home_played: number | null;
          home_won: number | null;
          home_goals_for: number | null;
          home_goals_against: number | null;
          away_played: number | null;
          away_won: number | null;
          away_goals_for: number | null;
          away_goals_against: number | null;
          clean_sheets: number | null;
          both_scored: number | null;
          over_2_5: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      accept_invitation: { Args: Record<PropertyKey, never>; Returns: Database["public"]["Enums"]["app_role"] };
      add_team_alias: { Args: { p_team_id: number | null; p_alias: string | null }; Returns: number };
      admin_update_profile: { Args: { p_user_id: string | null; p_display_name: string | null; p_name_color: string | null; p_name_style: string | null; p_avatar_style: string | null }; Returns: undefined };
      agent_watchdog: { Args: Record<PropertyKey, never>; Returns: number };
      ask_consume: { Args: Record<PropertyKey, never>; Returns: number };
      ask_record: { Args: { p_tokens: number | null; p_rejected: boolean | null }; Returns: undefined };
      authorize_password_reset: { Args: { p_user_id: string | null }; Returns: string };
      auto_activate_model_version: { Args: { p_model_version_id: number | null; p_reason: string | null }; Returns: undefined };
      birthdays_today: { Args: Record<PropertyKey, never>; Returns: { display_name: string | null; name_color: string | null; name_style: string | null }[] };
      claim_agent_jobs: { Args: { p_worker_id: string | null; p_limit?: number | null; p_lease_seconds?: number | null; p_types?: string[] | null; p_run_id?: number | null }; Returns: { id: number; type: string; idempotency_key: string; payload: Json; status: Database["public"]["Enums"]["agent_job_status"]; attempts: number; max_attempts: number; next_run_at: string; locked_by: string | null; locked_until: string | null; last_error: string | null; result: Json | null; last_run_id: number | null; created_at: string; updated_at: string; started_at: string | null; finished_at: string | null }[] };
      community_feed: { Args: { p_channel: string | null; p_limit?: number | null }; Returns: { id: number | null; channel: string | null; body: string | null; slip: Json | null; created_at: string | null; author_name: string | null; name_color: string | null; name_style: string | null; avatar_style: string | null; is_own: boolean | null; reactions: Json | null }[] };
      complete_agent_job: { Args: { p_job_id: number | null; p_worker_id: string | null; p_result?: Json | null }; Returns: undefined };
      consume_agent_quota: { Args: { p_provider: string | null; p_window: Database["public"]["Enums"]["agent_quota_window"] | null; p_quota: number | null; p_cost?: number | null }; Returns: boolean };
      consume_rate_limit: { Args: { p_key: string | null; p_max: number | null; p_window_seconds: number | null }; Returns: boolean };
      create_invitation: { Args: { p_email: string | null; p_role: Database["public"]["Enums"]["app_role"] | null }; Returns: string };
      enqueue_agent_job: { Args: { p_type: string | null; p_idempotency_key: string | null; p_payload?: Json | null; p_run_at?: string | null; p_max_attempts?: number | null }; Returns: { job_id: number | null; created: boolean | null; status: Database["public"]["Enums"]["agent_job_status"] | null }[] };
      extend_agent_job_lease: { Args: { p_job_id: number | null; p_worker_id: string | null; p_lease_seconds?: number | null }; Returns: string };
      fail_agent_job: { Args: { p_job_id: number | null; p_worker_id: string | null; p_error: string | null; p_retryable?: boolean | null }; Returns: Database["public"]["Enums"]["agent_job_status"] };
      finish_agent_run: { Args: { p_run_id: number | null; p_status: Database["public"]["Enums"]["agent_run_status"] | null; p_jobs_claimed?: number | null; p_jobs_done?: number | null; p_jobs_failed?: number | null; p_error_summary?: string | null }; Returns: undefined };
      finish_bet_builder_run: { Args: { p_run_id: number | null; p_status: Database["public"]["Enums"]["ingestion_run_status"] | null; p_candidates_evaluated?: number | null; p_error_summary?: string | null }; Returns: undefined };
      finish_ingestion_run: { Args: { p_run_id: number | null; p_status: Database["public"]["Enums"]["ingestion_run_status"] | null; p_requests_used?: number | null; p_quota_remaining?: number | null; p_rows_upserted?: number | null; p_error_count?: number | null; p_error_summary?: string | null; p_resume_cursor?: Json | null }; Returns: undefined };
      finish_prediction_run: { Args: { p_run_id: number | null; p_status: Database["public"]["Enums"]["ingestion_run_status"] | null; p_matches_scored?: number | null; p_error_summary?: string | null }; Returns: undefined };
      ingest_football_batch: { Args: { p_run_id: number | null; p_batch: Json | null }; Returns: Json };
      ingest_match_details: { Args: { p_run_id: number | null; p_batch: Json | null }; Returns: Json };
      ingest_odds_batch: { Args: { p_run_id: number | null; p_batch: Json | null }; Returns: Json };
      latest_odds_for_matches: { Args: { p_match_ids: number[] | null }; Returns: { match_id: number | null; bookmaker: string | null; market: string | null; selection: string | null; price: number | null; event_time: string | null; observed_at: string | null; quality: Database["public"]["Enums"]["quality_status"] | null }[] };
      match_comment_feed: { Args: { p_match_id: number | null }; Returns: { id: number | null; body: string | null; created_at: string | null; author_name: string | null; name_color: string | null; name_style: string | null; avatar_style: string | null; is_own: boolean | null }[] };
      moderate_community_post: { Args: { p_post_id: number | null }; Returns: undefined };
      moderate_match_comment: { Args: { p_comment_id: number | null }; Returns: undefined };
      notify_user: { Args: { p_user_id: string | null; p_kind: string | null; p_title: string | null; p_body?: string | null; p_severity?: Database["public"]["Enums"]["notification_severity"] | null; p_link?: string | null; p_dedupe_key?: string | null }; Returns: number };
      prune_predictions: { Args: { p_keep_days?: number | null; p_limit?: number | null }; Returns: Json };
      recent_comment_feed: { Args: { p_limit?: number | null }; Returns: { id: number | null; match_id: number | null; home_team: string | null; away_team: string | null; kickoff_at: string | null; body: string | null; created_at: string | null; author_name: string | null; name_color: string | null; name_style: string | null; avatar_style: string | null; is_own: boolean | null }[] };
      record_backtest: { Args: { p: Json | null }; Returns: number };
      record_bet_proposals: { Args: { p_run_id: number | null; p_batch: Json | null }; Returns: Json };
      record_predictions: { Args: { p_run_id: number | null; p_batch: Json | null }; Returns: Json };
      recover_expired_agent_jobs: { Args: Record<PropertyKey, never>; Returns: number };
      register_model_version: { Args: { p: Json | null }; Returns: number };
      report_quality_issues: { Args: { p_run_id: number | null; p_issues: Json | null }; Returns: number };
      resolve_quality_issues: { Args: { p_run_id: number | null; p_check_codes: string[] | null; p_provider_entity_ids: string[] | null }; Returns: number };
      retire_superseded_model_versions: { Args: { p_keep: number[] | null }; Returns: number };
      retry_dead_agent_job: { Args: { p_job_id: number | null }; Returns: undefined };
      revoke_invitation: { Args: { p_invitation_id: string | null }; Returns: string };
      set_account_status: { Args: { p_user_id: string | null; p_status: Database["public"]["Enums"]["account_status"] | null }; Returns: undefined };
      set_active_model_version: { Args: { p_model_version_id: number | null }; Returns: undefined };
      set_user_role: { Args: { p_user_id: string | null; p_role: Database["public"]["Enums"]["app_role"] | null }; Returns: undefined };
      start_agent_run: { Args: { p_source: Database["public"]["Enums"]["agent_run_source"] | null; p_schedule: string | null; p_worker_id: string | null }; Returns: number };
      start_bet_builder_run: { Args: { p_model_version_id: number | null; p_code_commit: string | null; p_rules: Json | null; p_triggered_by?: string | null }; Returns: number };
      start_ingestion_run: { Args: { p_provider: string | null; p_job_type: string | null; p_window_key: string | null; p_triggered_by?: string | null }; Returns: number };
      start_prediction_run: { Args: { p_model_version_id: number | null; p_code_commit: string | null; p_triggered_by?: string | null }; Returns: number };
      training_results: { Args: { p_as_of: string | null }; Returns: { match_id: number | null; competition_id: number | null; season_id: number | null; matchday: number | null; kickoff_at: string | null; home_team_id: number | null; away_team_id: number | null; home_score: number | null; away_score: number | null; home_score_ht: number | null; away_score_ht: number | null; score_duration: Database["public"]["Enums"]["score_duration"] | null; provider: string | null; observed_at: string | null; quality: Database["public"]["Enums"]["quality_status"] | null }[] };
    };
    Enums: {
      account_status: "ACTIVE" | "SUSPENDED";
      agent_job_status: "queued" | "running" | "done" | "failed" | "dead";
      agent_quota_window: "minute" | "hour" | "day" | "month";
      agent_run_source: "qstash" | "github_actions" | "manual";
      agent_run_status: "running" | "succeeded" | "partial" | "failed";
      app_role: "SUPER_ADMIN" | "ADMIN" | "USER";
      bankroll_kind: "REAL" | "SIMULATED";
      bankroll_movement_kind: "DEPOSIT" | "WITHDRAWAL" | "ADJUSTMENT";
      bet_proposal_category: "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";
      bet_proposal_kind: "SINGLE" | "MULTIPLE" | "SAME_MATCH";
      bet_status: "OPEN" | "WON" | "LOST" | "VOID" | "HALF_WON" | "HALF_LOST" | "CASHED_OUT";
      competition_type: "LEAGUE" | "CUP" | "LEAGUE_CUP" | "PLAYOFFS";
      football_data_kind: "competitions" | "teams" | "matches" | "standings" | "odds";
      football_entity_type: "competition" | "season" | "team" | "match";
      freshness_status: "FRESH" | "STALE";
      ingestion_run_status: "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED";
      invitation_status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
      issue_severity: "INFO" | "WARNING" | "ERROR";
      issue_status: "OPEN" | "RESOLVED" | "IGNORED";
      match_status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "SUSPENDED" | "CANCELLED" | "ABANDONED" | "AWARDED";
      model_status: "CANDIDATE" | "ACTIVE" | "RETIRED";
      notification_severity: "info" | "warning" | "error";
      quality_status: "OK" | "WARNING" | "ERROR";
      score_duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
      standing_type: "TOTAL" | "HOME" | "AWAY";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
