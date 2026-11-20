/**
 * The two people every end-to-end check runs as, on the local stack only.
 *
 *   Phil — the seeded instance owner.
 *   Tess — a second user with her own personal space (the same fixture the
 *          isolation test uses), so each surface can be seen by someone who
 *          is not Phil.
 *
 * Sessions are real GoTrue sessions written as the cookies @supabase/ssr
 * would set, saved as Playwright storage state.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { localSql, localStackEnv } from "../../lib/access/introspect.ts";
import { PHIL_AUTH_UID } from "../../lib/system/identity.ts";
import { E2E_ORIGIN } from "./env.ts";

export const PASSWORD = "mycelium-local";
export const PHIL = { id: PHIL_AUTH_UID, email: "phil@mycelium.local", name: "Phil" } as const;
export const TESS = { id: "7e0f1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b", email: "tess@mycelium.local", name: "Tess" } as const;
export type Person = typeof PHIL | typeof TESS;

export const AUTH_DIR = path.resolve(process.cwd(), "e2e/.auth");
export const storageStateFor = (who: Person) => path.join(AUTH_DIR, `${who.name.toLowerCase()}.json`);

/** Create Tess if she is missing. Unlike the isolation test, her data is left alone. */
export function ensureTess(): void {
  localSql(
    `set local app.allow_uninvited = 'on'; insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      is_sso_user, is_anonymous)
    values ('00000000-0000-0000-0000-000000000000', '${TESS.id}', 'authenticated', 'authenticated',
      '${TESS.email}', extensions.crypt('${PASSWORD}', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"display_name":"Tess"}', now(), now(),
      '', '', '', '', '', '', '', '', false, false)
    on conflict (id) do nothing`,
  );
  localSql(
    `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), '${TESS.id}', '${TESS.id}', jsonb_build_object('sub', '${TESS.id}', 'email', '${TESS.email}', 'email_verified', true), 'email', now(), now(), now())
    on conflict (provider_id, provider) do nothing`,
  );
}

export function personalSpace(who: Person): string {
  const row = localSql(`select personal_space_id from public.profiles where id = '${who.id}'`)[0];
  if (!row?.[0]) throw new Error(`${who.name} has no personal space on the local stack`);
  return row[0];
}

async function sessionCookies(email: string): Promise<{ name: string; value: string }[]> {
  const env = localStackEnv();
  const res = await fetch(`${env.apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`password sign-in failed for ${email}: ${res.status} ${await res.text()}`);
  const session = (await res.json()) as { access_token: string; refresh_token: string };
  const jar = new Map<string, string>();
  const client = createServerClient(env.apiUrl, env.anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const { error } = await client.auth.setSession(session);
  if (error) throw new Error(`setSession failed for ${email}: ${error.message}`);
  return [...jar].map(([name, value]) => ({ name, value }));
}

/** Sign the person in and write their Playwright storage state. */
export async function writeStorageState(who: Person): Promise<string> {
  const cookies = await sessionCookies(who.email);
  const host = new URL(E2E_ORIGIN).hostname;
  const state = {
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: host,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    })),
    origins: [],
  };
  mkdirSync(AUTH_DIR, { recursive: true });
  const file = storageStateFor(who);
  writeFileSync(file, JSON.stringify(state, null, 2));
  return file;
}
