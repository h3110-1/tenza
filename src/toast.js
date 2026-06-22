// Transient bottom-of-screen notifications.
import { $ } from "./state.js";

let toastTimer;

export function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("has-action");
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// A toast with an "Undo" action that lingers a few seconds.
export function toastUndo(msg, onUndo) {
  const t = $("toast");
  t.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = msg;
  const btn = document.createElement("button");
  btn.className = "undo-btn";
  btn.textContent = "Undo";
  btn.onclick = () => {
    clearTimeout(toastTimer);
    t.classList.remove("show", "has-action");
    onUndo();
  };
  t.appendChild(span);
  t.appendChild(btn);
  t.classList.add("show", "has-action");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show", "has-action"), 6000);
}
