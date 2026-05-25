import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type CopypartyPlugin from "./main";

export interface CopypartySettings {
  /** Base URL of the copyparty server, e.g. http://inspiron:3923 */
  serverUrl: string;
  /** Remote path to upload into, e.g. /uploads or /home/Pictures */
  uploadPath: string;
  /** Optional: username for basic auth */
  username: string;
  /** Optional: password for basic auth (stored in plugin data — not ideal but
   *  acceptable for a local homelab setup) */
  password: string;
  /** Whether to show a confirmation dialog before uploading */
  confirmBeforeUpload: boolean;
}

export const DEFAULT_SETTINGS: CopypartySettings = {
  serverUrl: "",
  uploadPath: "/",
  username: "",
  password: "",
  confirmBeforeUpload: false,
};

export class CopypartySettingTab extends PluginSettingTab {
  plugin: CopypartyPlugin;

  constructor(app: App, plugin: CopypartyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Copyparty" });

    // ── Server URL ─────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Server URL")
      .setDesc(
        "Base URL of your copyparty instance. No trailing slash. " +
        "Example: http://inspiron:3923"
      )
      .addText((text) =>
        text
          .setPlaceholder("http://inspiron:3923")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.replace(/\/$/, "");
            await this.plugin.saveSettings();
          })
      );

    // ── Upload path ────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Upload path")
      .setDesc(
        "Path on the server to upload files into. " +
        "Example: /obsidian-uploads"
      )
      .addText((text) =>
        text
          .setPlaceholder("/")
          .setValue(this.plugin.settings.uploadPath)
          .onChange(async (value) => {
            // Ensure leading slash, strip trailing
            let p = value.trim();
            if (!p.startsWith("/")) p = "/" + p;
            p = p.replace(/\/$/, "") || "/";
            this.plugin.settings.uploadPath = p;
            await this.plugin.saveSettings();
          })
      );

    // ── Auth ───────────────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Authentication (optional)" });
    containerEl.createEl("p", {
      text: "Leave blank if your upload path is world-writable.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Username")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.username)
          .onChange(async (value) => {
            this.plugin.settings.username = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Password")
      .addText((text) => {
        text
          .setValue(this.plugin.settings.password)
          .onChange(async (value) => {
            this.plugin.settings.password = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      });

    // ── Behaviour ─────────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Behaviour" });

    new Setting(containerEl)
      .setName("Confirm before uploading")
      .setDesc(
        "Show a confirmation prompt before uploading pasted or dropped files."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.confirmBeforeUpload)
          .onChange(async (value) => {
            this.plugin.settings.confirmBeforeUpload = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Test connection ────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Ping the server to check connectivity.")
      .addButton((btn) =>
        btn.setButtonText("Test").onClick(async () => {
          const url = this.plugin.settings.serverUrl;
          if (!url) {
            new Notice("Enter a server URL first.");
            return;
          }
          try {
            const headers = buildAuthHeaders(this.plugin.settings);
            const res = await fetch(url + "/?ls&json", { headers });
            if (res.ok) {
              new Notice("✓ Connected to copyparty successfully.");
            } else {
              new Notice(`✗ Server returned HTTP ${res.status}`);
            }
          } catch (e) {
            new Notice(`✗ Could not reach server: ${e.message}`);
          }
        })
      );
  }
}

export function buildAuthHeaders(settings: CopypartySettings): HeadersInit {
  const headers: Record<string, string> = {};
  if (settings.username && settings.password) {
    const creds = btoa(`${settings.username}:${settings.password}`);
    headers["Authorization"] = `Basic ${creds}`;
  } else if (settings.password) {
    // copyparty also supports cookie-based auth via cppwd
    // but Basic auth is simpler for PUT uploads
    headers["Cookie"] = `cppwd=${settings.password}`;
  }
  return headers;
}
