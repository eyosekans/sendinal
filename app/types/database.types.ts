/**
 * Database types for the Supabase `public` schema.
 *
 * Source of truth is `supabase/migrations/`. Keep this file in sync when the
 * schema changes. Once the Supabase CLI is wired up locally this can be
 * regenerated with:
 *   supabase gen types typescript --linked > app/types/database.types.ts
 *
 * Shape matches @supabase/supabase-js' expected `Database` generic (including the
 * per-table `Relationships` arrays it requires — without them, insert/update
 * payload types collapse to `never`).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type ContactStatus = 'active' | 'unsubscribed' | 'bounced' | 'complained'
export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'cancelled'
  | 'failed'
export type SendStatus = 'queued' | 'sent' | 'failed' | 'bounced' | 'complained'
export type EmailEventType =
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'unsubscribed'
export type TrackingTokenType = 'open' | 'click'

export interface Database {
  public: {
    Tables: {
      contacts: {
        Row: {
          id: string
          email: string
          first_name: string | null
          last_name: string | null
          attributes: Json
          status: ContactStatus
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          email: string
          first_name?: string | null
          last_name?: string | null
          attributes?: Json
          status?: ContactStatus
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          first_name?: string | null
          last_name?: string | null
          attributes?: Json
          status?: ContactStatus
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      lists: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string
        }
        Relationships: []
      }
      list_contacts: {
        Row: {
          list_id: string
          contact_id: string
          added_at: string
        }
        Insert: {
          list_id: string
          contact_id: string
          added_at?: string
        }
        Update: {
          list_id?: string
          contact_id?: string
          added_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'list_contacts_list_id_fkey'
            columns: ['list_id']
            referencedRelation: 'lists'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'list_contacts_contact_id_fkey'
            columns: ['contact_id']
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
        ]
      }
      campaigns: {
        Row: {
          id: string
          name: string
          subject: string
          from_name: string
          from_email: string
          html: string
          design: Json
          list_id: string | null
          segment_rules: Json
          status: CampaignStatus
          scheduled_at: string | null
          sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          subject: string
          from_name: string
          from_email: string
          html: string
          design: Json
          list_id?: string | null
          segment_rules?: Json
          status?: CampaignStatus
          scheduled_at?: string | null
          sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          subject?: string
          from_name?: string
          from_email?: string
          html?: string
          design?: Json
          list_id?: string | null
          segment_rules?: Json
          status?: CampaignStatus
          scheduled_at?: string | null
          sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'campaigns_list_id_fkey'
            columns: ['list_id']
            referencedRelation: 'lists'
            referencedColumns: ['id']
          },
        ]
      }
      templates: {
        Row: {
          id: string
          name: string
          subject: string
          html: string
          design: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          subject: string
          html: string
          design: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          subject?: string
          html?: string
          design?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sends: {
        Row: {
          id: string
          campaign_id: string
          contact_id: string
          status: SendStatus
          ses_message_id: string | null
          error: string | null
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          contact_id: string
          status?: SendStatus
          ses_message_id?: string | null
          error?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          contact_id?: string
          status?: SendStatus
          ses_message_id?: string | null
          error?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sends_campaign_id_fkey'
            columns: ['campaign_id']
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sends_contact_id_fkey'
            columns: ['contact_id']
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
        ]
      }
      email_events: {
        Row: {
          id: string
          send_id: string
          type: EmailEventType
          url: string | null
          metadata: Json
          occurred_at: string
        }
        Insert: {
          id?: string
          send_id: string
          type: EmailEventType
          url?: string | null
          metadata?: Json
          occurred_at?: string
        }
        Update: {
          id?: string
          send_id?: string
          type?: EmailEventType
          url?: string | null
          metadata?: Json
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'email_events_send_id_fkey'
            columns: ['send_id']
            referencedRelation: 'sends'
            referencedColumns: ['id']
          },
        ]
      }
      tracking_tokens: {
        Row: {
          token: string
          send_id: string
          type: TrackingTokenType
          url: string | null
          created_at: string
        }
        Insert: {
          token: string
          send_id: string
          type: TrackingTokenType
          url?: string | null
          created_at?: string
        }
        Update: {
          token?: string
          send_id?: string
          type?: TrackingTokenType
          url?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tracking_tokens_send_id_fkey'
            columns: ['send_id']
            referencedRelation: 'sends'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
