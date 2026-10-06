import type { Platform, RavelBroadcast, RavelSettings } from "../shared/types";

const PLATFORMS: Platform[] = ["generic", "youtube", "instagram", "netflix"];

const toggleList = document.getElementById("platform-toggles")!;
const retentionSelect = document.getElementById("retention-select") as HTMLSelectElement;
const staleDaysSelect = document.getElementById("stale-days-select") as HTMLSelectElement;
const exportBtn = document.getElementById("export-data")!;
const deleteBtn = document.getElementById("delete-everything")!;
const statusEl = document.getElementById("action-status")!;

function setStatus(msg: string) {
  statusEl.textContent = msg;
  setTimeout(() => {
    if (statusEl.textContent === msg) statusEl.textContent = "";
  }, 3500);
}

async function getSettings(): Promise<RavelSettings> {
  return chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
}

async function setSettings(partial: Partial<RavelSettings>): Promise<RavelSettings> {
  return chrome.runtime.sendMessage({ type: "SET_SETTINGS", payload: partial });
}

function renderToggles(settings: RavelSettings) {
  toggleList.innerHTML = "";
  for (const platform of PLATFORMS) {
    const row = document.createElement("div");
    row.className = "toggle-row";

    const label = document.createElement("span");
    label.className = "toggle-label";
    label.textContent = platform === "generic" ? "Generic websites" : platform;
    row.append(label);

    const sw = document.createElement("button");
    sw.className = "switch" + (settings.platformsEnabled[platform] ? " on" : "");
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", String(settings.platformsEnabled[platform]));
    sw.addEventListener("click", async () => {
      const next = !sw.classList.contains("on");
      sw.classList.toggle("on", next);
      const updated = await setSettings({
        platformsEnabled: { ...settings.platformsEnabled, [platform]: next },
      });
      settings.platformsEnabled = updated.platformsEnabled;
    });
    row.append(sw);

    toggleList.append(row);
  }
}

let settings: RavelSettings | null = null;

// If Settings is open in two tabs at once (or the popup flips Tracking
// while this page is open), pick up the change live instead of only
// reflecting whatever was true when this page loaded.
chrome.runtime.onMessage.addListener((message: RavelBroadcast) => {
  if (message.type !== "SETTINGS_UPDATED") return;
  settings = message.settings;
  renderToggles(settings);
  retentionSelect.value = String(settings.retentionDays);
  staleDaysSelect.value = String(settings.staleThreadDays);
});

async function boot() {
  const s = await getSettings();
  settings = s;
  renderToggles(s);
  retentionSelect.value = String(s.retentionDays);
  staleDaysSelect.value = String(s.staleThreadDays);

  staleDaysSelect.addEventListener("change", async () => {
    await setSettings({ staleThreadDays: Number(staleDaysSelect.value) });
    setStatus("Thread rescue threshold updated.");
  });

  retentionSelect.addEventListener("change", async () => {
    await setSettings({ retentionDays: Number(retentionSelect.value) });
    setStatus("Retention updated.");
  });

  exportBtn.addEventListener("click", async () => {
    // The export itself is produced entirely in this page's own JS context -
    // nothing here talks to a server. This pulls the full raw local dataset
    // (every stored event and settings row), not just the last computed
    // insight snapshot.
    const data = await chrome.runtime.sendMessage({ type: "EXPORT_ALL_DATA" });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ravel-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Export downloaded.");
  });

  deleteBtn.addEventListener("click", async () => {
    const confirmed = confirm(
      "This permanently deletes all RAVEL data stored in this browser. This cannot be undone. Continue?"
    );
    if (!confirmed) return;
    await chrome.runtime.sendMessage({ type: "DELETE_EVERYTHING" });
    setStatus("Everything deleted.");
  });
}

boot();
