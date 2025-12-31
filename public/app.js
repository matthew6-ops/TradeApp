async function checkHealth() {
  const el = document.getElementById("health");
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    el.textContent = data.ok ? "ok" : "unknown";
    el.classList.add(data.ok ? "ok" : "bad");
  } catch (_err) {
    el.textContent = "down";
    el.classList.add("bad");
  }
}

// Minimal “install” button support.
let deferredPrompt = null;
const installBtn = document.getElementById("install");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.disabled = false;
});

installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  installBtn.disabled = true;
  deferredPrompt.prompt();
  try {
    await deferredPrompt.userChoice;
  } finally {
    deferredPrompt = null;
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // non-fatal
  });
}

checkHealth();
