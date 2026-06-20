import { createServerClient } from "@/lib/supabase/server";

const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

function credentials() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  return { id, secret };
}

async function getStoredToken(): Promise<{
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
} | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("spotify_tokens")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { id, secret } = credentials();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const json = await res.json();

  const supabase = createServerClient();
  const expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();
  const updates: Record<string, string> = {
    access_token: json.access_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
  if (json.refresh_token) {
    updates.refresh_token = json.refresh_token;
  }

  const stored = await getStoredToken();
  if (stored) {
    await supabase.from("spotify_tokens").update(updates).eq("id", stored.id);
  }

  return json.access_token;
}

export async function getValidAccessToken(): Promise<string | null> {
  const stored = await getStoredToken();
  if (!stored) return null;

  const expiresAt = new Date(stored.expires_at).getTime();
  if (Date.now() < expiresAt - 60_000) {
    return stored.access_token;
  }

  return refreshAccessToken(stored.refresh_token);
}

export async function spotifyFetch<T = unknown>(path: string): Promise<T | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    console.error(`[spotify] ${path} → ${res.status}`);
    return null;
  }
  return res.json();
}

export function buildAuthUrl(redirectUri: string): string {
  const { id } = credentials();
  const scopes = [
    "user-read-recently-played",
    "user-top-read",
    "user-read-currently-playing",
    "user-read-playback-state",
  ].join(" ");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: id,
    scope: scopes,
    redirect_uri: redirectUri,
    show_dialog: "true",
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const { id, secret } = credentials();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  const json = await res.json();

  const supabase = createServerClient();
  const expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();

  await supabase.from("spotify_tokens").insert({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: expiresAt,
    scopes: json.scope ?? null,
  });

  return json;
}
