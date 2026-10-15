import { getAdmin } from "@/lib/supabase";

// 会話の途中経過（line_staff_sessions に1人1行）。一定時間放置したら無かったことにする
const SESSION_TIMEOUT_MINUTES = 30;

export type Session<D = Record<string, unknown>> = { flow: string; step: string; data: D };

export async function loadSession<D = Record<string, unknown>>(userId: string): Promise<Session<D> | null> {
  const { data, error } = await getAdmin()
    .from("line_staff_sessions")
    .select("flow, step, data, updated_at")
    .eq("line_user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const age = Date.now() - new Date(data.updated_at).getTime();
  if (age > SESSION_TIMEOUT_MINUTES * 60 * 1000) return null;
  return { flow: data.flow, step: data.step, data: (data.data ?? {}) as D };
}

export async function saveSession<D>(userId: string, session: Session<D>): Promise<void> {
  const { error } = await getAdmin().from("line_staff_sessions").upsert({
    line_user_id: userId,
    flow: session.flow,
    step: session.step,
    data: session.data,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function clearSession(userId: string): Promise<void> {
  await getAdmin().from("line_staff_sessions").delete().eq("line_user_id", userId);
}
