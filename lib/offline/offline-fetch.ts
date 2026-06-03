import { enqueue } from "./queue";
import { requestBackgroundSync } from "./register-sync";

export async function offlineFetch(
  url: string,
  method: string,
  body: Record<string, unknown>,
  clientUuid: string,
): Promise<Response> {
  const payload = { ...body, client_uuid: clientUuid };

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return res;
    if (res.status >= 500 || res.status === 429) {
      await enqueue(clientUuid, url, method, payload);
      void requestBackgroundSync();
      return new Response(JSON.stringify({ queued: true, client_uuid: clientUuid }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }
    return res;
  } catch {
    await enqueue(clientUuid, url, method, payload);
    void requestBackgroundSync();
    return new Response(JSON.stringify({ queued: true, client_uuid: clientUuid }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }
}
