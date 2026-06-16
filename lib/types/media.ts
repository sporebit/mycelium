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
  created_at: string;
  updated_at: string;
};
