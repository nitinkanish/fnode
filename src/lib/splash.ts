const MIN_MS = 700;
const FADE_MS = 480;

export function dismissSplash() {
  const el = document.getElementById("splash");
  if (!el || el.dataset.done === "1") return;
  el.dataset.done = "1";
  const shown = Number(el.dataset.shownAt ?? Date.now());
  const wait = Math.max(0, MIN_MS - (Date.now() - shown));
  window.setTimeout(() => {
    el.classList.add("is-done");
    el.setAttribute("aria-busy", "false");
    window.setTimeout(() => el.remove(), FADE_MS);
  }, wait);
}

export function armSplash() {
  const el = document.getElementById("splash");
  if (el && !el.dataset.shownAt) el.dataset.shownAt = String(Date.now());
}
