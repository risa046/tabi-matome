// ホーム画面（H-1〜H-4）。担当: ホームチーム
import { supabase, getCurrentUser } from "./common.js";

const nameInput = document.getElementById("display-name");
const toastEl = document.getElementById("toast");
let toastTimer;

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3000);
}

function getDisplayName() {
  return (nameInput && nameInput.value.trim()) || "ゲスト";
}

async function updateDisplayName(userId, displayName) {
  const { error } = await supabase.from("users").update({ display_name: displayName }).eq("id", userId);
  if (error) throw error;
}

export function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい 0 O 1 I を除く
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// H-1 旅をつくる → SPOTS画面へ
export async function createTrip(name) {
  const user = await getCurrentUser();
  await updateDisplayName(user.id, getDisplayName());
  const { data: trip, error } = await supabase
    .from("trips")
    .insert({ name: name, invite_code: generateInviteCode(), owner_id: user.id })
    .select().single();
  if (error) throw error;
  const { error: memberError } = await supabase
    .from("trip_members").insert({ trip_id: trip.id, user_id: user.id });
  if (memberError) throw memberError;
  location.href = "spots.html?trip=" + encodeURIComponent(trip.id);
  return trip;
}

// H-3 招待コードで参加
export async function joinTripByCode(code, displayName) {
  const user = await getCurrentUser();
  const { data: trip, error } = await supabase
    .from("trips").select("*").eq("invite_code", code.trim().toUpperCase()).maybeSingle();
  if (error) throw error;
  if (!trip) throw new Error("コードが見つかりません");
  await updateDisplayName(user.id, displayName);
  const { error: joinError } = await supabase
    .from("trip_members").upsert({ trip_id: trip.id, user_id: user.id });
  if (joinError) throw joinError;
  return trip;
}

// H-4 自分が参加している旅を新しい順に
export async function fetchMyTrips() {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from("trip_members")
    .select("joined_at, trips(id, name, invite_code, created_at)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => row.trips);
}

export function renderTripHistory(trips) {
  const list = document.getElementById("trip-list");
  list.innerHTML = "";
  if (trips.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "まだ旅がありません。上から新しい旅をつくりましょう。";
    list.appendChild(li);
    return;
  }
  trips.forEach((trip) => {
    const created = new Date(trip.created_at);
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "spots.html?trip=" + encodeURIComponent(trip.id);
    const name = document.createElement("span");
    name.textContent = trip.name;
    const date = document.createElement("span");
    date.className = "date";
    date.textContent = "(" + (created.getMonth() + 1) + "/" + created.getDate() + ")";
    a.append(name, date);
    li.appendChild(a);
    list.appendChild(li);
  });
}

// H-2 招待リンクとコードを共有（ヘッダーの共有ボタンから呼ばれる）
export async function shareInvite(trip) {
  const url = new URL("index.html", location.href);
  url.search = "?code=" + trip.invite_code;
  const text = "「" + trip.name + "」に参加してね！\n招待コード: " + trip.invite_code + "\n" + url.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: "旅まとめ", text: text });
    } else {
      await navigator.clipboard.writeText(text);
      showToast("招待リンクをコピーしました");
    }
  } catch (e) {
    if (e.name !== "AbortError") showToast("共有できませんでした");
  }
}

// ---- ホーム画面の初期化（index.html のときだけ動く）----
async function initHome() {
  nameInput.value = localStorage.getItem("tabimatome-name") || "";
  nameInput.addEventListener("change", () => {
    try { localStorage.setItem("tabimatome-name", getDisplayName()); } catch (e) { /* 保存できなくても動く */ }
  });

  const codeFromUrl = new URLSearchParams(location.search).get("code");
  if (codeFromUrl) document.getElementById("invite-code").value = codeFromUrl.toUpperCase();

  document.getElementById("create-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await createTrip(document.getElementById("trip-name").value.trim());
    } catch (err) {
      showToast("旅を作れませんでした。もう一度お試しください");
    }
  });

  document.getElementById("join-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const trip = await joinTripByCode(document.getElementById("invite-code").value, getDisplayName());
      location.href = "spots.html?trip=" + encodeURIComponent(trip.id);
    } catch (err) {
      showToast(err.message === "コードが見つかりません" ? err.message : "参加できませんでした");
    }
  });

  try {
    renderTripHistory(await fetchMyTrips());
  } catch (err) {
    renderTripHistory([]);
    showToast("旅の一覧を読み込めませんでした");
  }
}

if (document.getElementById("create-form")) initHome();
