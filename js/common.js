// 共通関数（ホーム担当）。Supabaseへの接続はこのファイルだけで行う。
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

// Supabaseの Project Settings → API からコピーして貼る。
// anon（公開）キーはコミットしてOK。service_role キーは絶対に書かない。
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession();
  let authUser = data.session ? data.session.user : null;
  if (!authUser) {
    const { data: signIn, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    authUser = signIn.user;
  }
  const { data: profile, error: readError } = await supabase
    .from("users").select("*").eq("id", authUser.id).maybeSingle();
  if (readError) throw readError;
  if (profile) return profile;
  const { data: created, error } = await supabase
    .from("users").insert({ id: authUser.id, display_name: "ゲスト" }).select().single();
  if (error) throw error;
  return created;
}

export function getTripIdFromUrl() {
  return new URLSearchParams(location.search).get("trip");
}

export async function fetchTrip(tripId) {
  const { data, error } = await supabase.from("trips").select("*").eq("id", tripId).single();
  if (error) throw error;
  return data;
}

export async function fetchMembers(tripId) {
  const { data, error } = await supabase
    .from("trip_members").select("users(id, display_name, icon)").eq("trip_id", tripId);
  if (error) throw error;
  return data.map((row) => row.users);
}

// ヘッダー用の <header id="header"> に表示する
export function renderHeader(trip, memberCount) {
  const el = document.getElementById("header");
  el.className = "trip-header";
  el.innerHTML = "";

  const back = document.createElement("a");
  back.href = "index.html";
  back.textContent = "‹";
  back.setAttribute("aria-label", "ホームへ戻る");

  const title = document.createElement("span");
  title.className = "trip-title";
  title.textContent = trip.name + " (" + memberCount + ")";

  const share = document.createElement("button");
  share.type = "button";
  share.textContent = "共有";
  share.addEventListener("click", async () => {
    const { shareInvite } = await import("./home.js"); // 循環importを避ける
    shareInvite(trip);
  });

  el.append(back, title, share);
}

// 下部タブ用の <nav id="tabbar"> に表示する
export function renderTabBar(activeTab) {
  const el = document.getElementById("tabbar");
  el.className = "tab-bar";
  el.innerHTML = "";
  const tripId = getTripIdFromUrl();
  [["dates", "DATES"], ["spots", "SPOTS"], ["budget", "BUDGET"]].forEach(([key, label]) => {
    const a = document.createElement("a");
    a.href = key + ".html?trip=" + encodeURIComponent(tripId);
    a.textContent = label;
    if (key === activeTab) a.className = "active";
    el.appendChild(a);
  });
}

export function subscribeChanges(table, tripId, onChange) {
  supabase
    .channel(table + "-" + tripId)
    .on("postgres_changes",
      { event: "*", schema: "public", table: table, filter: "trip_id=eq." + tripId },
      onChange)
    .subscribe();
}

export function formatYen(amount) {
  return Number(amount).toLocaleString("ja-JP") + "円";
}

export function formatDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  const week = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, d).getDay()];
  return m + "/" + d + "(" + week + ")";
}
