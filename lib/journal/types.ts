export type JournalEntry = {
  id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  raw_text: string;
  audio_url: string | null;
  summary: string | null;
  tags: string[] | null;
  mood: string | null;
  raw_capture_id: string | null;
  created_at: string;
  updated_at: string;
};

export type JournalGroup = {
  date: string; // YYYY-MM-DD
  entries: JournalEntry[];
  summary: string | null; // from journal_daily_summaries
};

export const JOURNAL_SELECT =
  "id, user_id, entry_date, raw_text, audio_url, summary, tags, mood, raw_capture_id, created_at, updated_at";
