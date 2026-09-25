export type MentionConfidence =
  | "high"
  | "medium"
  | "low"
  | "ambiguous"
  | "unresolved";

export type MentionSourceType = "capture" | "task" | "journal";

export type PersonTier = "person" | "contact";

export type PersonPhone = {
  id: string;
  person_id: string;
  number_raw: string;
  number_e164: string | null;
  label: string | null;
  is_current: boolean;
  include_in_export: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PersonEmail = {
  id: string;
  person_id: string;
  email: string;
  label: string | null;
  is_current: boolean;
  include_in_export: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Person = {
  id: string;
  first_name: string;
  last_name: string | null;
  display_name: string | null;
  relationship: string | null;
  /** Derived (0140): the first current number / address, for screens that show one. The lists are `phones` / `emails`. */
  phone?: string | null;
  email?: string | null;
  phones?: PersonPhone[];
  emails?: PersonEmail[];
  /** people-contacts C1: a contact is an imported card that nothing has linked to yet. */
  tier?: PersonTier;
  deleted_at?: string | null;
  merged_into_id?: string | null;
  promoted_at?: string | null;
  linked_user_id?: string | null;
  birthday: string | null;
  address: string | null;
  where_we_met: string | null;
  mutual_interests: string | null;
  notes: string | null;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
};

export type PersonAlias = {
  id: string;
  person_id: string;
  alias: string;
  is_primary: boolean;
  created_at: string;
};

export type PersonWithAliases = Person & {
  aliases: PersonAlias[];
  mention_count?: number;
  quote_count?: number;
  /** distinct day-log days they were in a reviewed scene of (people_daylog_stats) */
  days_together?: number;
  last_mention_at?: string | null;
};

export type PersonMention = {
  id: string;
  person_id: string | null;
  source_type: MentionSourceType;
  source_id: string;
  raw_alias: string;
  confidence: MentionConfidence;
  candidate_person_ids: string[] | null;
  needs_review: boolean;
  resolved_at: string | null;
  created_at: string;
};

/** Result of resolveMention. */
export type MentionResolution = {
  raw_alias: string;
  person_id: string | null;
  candidate_person_ids: string[];
  confidence: MentionConfidence;
  auto_created: boolean;
  needs_review: boolean;
};

/** Snippet attached to a mention when listing on the person detail page. */
export type MentionWithSnippet = PersonMention & {
  snippet: string | null;
  source_at: string | null;
};

/** Item rendered in the review queue. */
export type ReviewQueueItem =
  | {
      kind: "ambiguous_mention";
      mention: PersonMention;
      candidates: Person[];
      snippet: string | null;
      created_at: string;
    }
  | {
      kind: "auto_created_person";
      person: Person;
      mention_count: number;
      first_seen_at: string;
    };

export type PersonImport = {
  first_name: string;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  address?: string | null;
  relationship?: string | null;
};

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { index: number; reason: string }[];
};
