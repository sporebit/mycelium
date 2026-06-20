export type MediaType = "watch" | "listen" | "read";
export type MediaStatus = "backlog" | "in_progress" | "completed" | "dropped";

export const MEDIA_TYPES: readonly MediaType[] = ["watch", "listen", "read"];
export const MEDIA_STATUSES: readonly MediaStatus[] = [
  "backlog",
  "in_progress",
  "completed",
  "dropped",
];

export const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  watch: "Watch",
  listen: "Listen",
  read: "Read",
};

export const MEDIA_STATUS_LABEL: Record<MediaStatus, string> = {
  backlog: "BACKLOG",
  in_progress: "IN PROGRESS",
  completed: "COMPLETED",
  dropped: "DROPPED",
};

export const MEDIA_STATUS_LABEL_BY_KIND: Record<MediaType, Record<MediaStatus, string>> = {
  watch: { backlog: "WANT TO WATCH", in_progress: "WATCHING", completed: "WATCHED", dropped: "DROPPED" },
  listen: { backlog: "WANT TO LISTEN", in_progress: "LISTENING", completed: "LISTENED", dropped: "DROPPED" },
  read: { backlog: "WANT TO READ", in_progress: "READING", completed: "READ", dropped: "DROPPED" },
};

export const MEDIA_SUB_TYPES: Record<MediaType, readonly string[]> = {
  watch: ["Film", "Series", "Other"],
  listen: ["Music", "Podcast"],
  read: ["Book", "Article", "Other"],
};

export type MediaItem = {
  id: string;
  user_id: string;
  title: string;
  creator: string | null;
  media_type: MediaType;
  media_status: MediaStatus;
  rating: number | null;
  notes: string | null;
  tags: string[] | null;
  url: string | null;
  raw_capture_id: string | null;
  completed_at: string | null;
  owned: boolean;
  streaming_services: string[] | null;
  streaming_checked_at: string | null;
  review: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};
