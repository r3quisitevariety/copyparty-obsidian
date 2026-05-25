import {
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
} from "obsidian";
import { CopypartySettingTab, DEFAULT_SETTINGS, CopypartySettings } from "./settings";
import { uploadFileToCopyparty } from "./uploader";
import { makeEmbed } from "./embed";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default class CopypartyPlugin extends Plugin {
  settings: CopypartySettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new CopypartySettingTab(this.app, this));

    // Desktop: intercept paste before Obsidian saves locally
    this.registerEvent(
      this.app.workspace.on("editor-paste", this.handlePaste.bind(this))
    );

    // Desktop: intercept drag-and-drop
    this.registerEvent(
      this.app.workspace.on("editor-drop", this.handleDrop.bind(this))
    );

    // Mobile fallback: Obsidian saves locally first, we intercept after
    this.registerEvent(
      this.app.vault.on("create", this.handleVaultCreate.bind(this))
    );

    // Command: migrate existing local attachments in the current note
    this.addCommand({
      id: "upload-local-attachments",
      name: "Upload all local attachments in this note to Copyparty",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        await this.migrateLocalAttachments(editor, view);
      },
    });

    console.log("Copyparty plugin loaded");
  }

  onunload() {
    console.log("Copyparty plugin unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ─── Desktop paste handler ────────────────────────────────────────────────

  private async handlePaste(
    evt: ClipboardEvent,
    editor: Editor,
    _view: MarkdownView
  ) {
    if (!this.settings.serverUrl) return;

    const files = evt.clipboardData?.files;
    if (!files || files.length === 0) return;

    const mediaFiles = Array.from(files).filter((f) =>
      this.isSupportedFile(f.name)
    );
    if (mediaFiles.length === 0) return;

    evt.preventDefault();

    for (const file of mediaFiles) {
      await this.uploadAndInsert(file, editor);
    }
  }

  // ─── Desktop drop handler ─────────────────────────────────────────────────

  private async handleDrop(
    evt: DragEvent,
    editor: Editor,
    _view: MarkdownView
  ) {
    if (!this.settings.serverUrl) return;

    const files = evt.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const mediaFiles = Array.from(files).filter((f) =>
      this.isSupportedFile(f.name)
    );
    if (mediaFiles.length === 0) return;

    evt.preventDefault();

    for (const file of mediaFiles) {
      await this.uploadAndInsert(file, editor);
    }
  }

  // ─── Mobile fallback: vault create hook ──────────────────────────────────
  // On mobile, Obsidian bypasses editor-paste and saves files directly to
  // the vault. We watch for new files in the attachments folder and
  // immediately upload + rewrite + delete them.

  private async handleVaultCreate(file: TFile) {
    if (!this.settings.serverUrl) return;
    if (!this.isSupportedFile(file.name)) return;

    // Only intercept files landing in the configured attachments folder
    const attachmentFolder = (
      (this.app.vault as any).getConfig("attachmentFolderPath") as string
    ) || "/";
    const normalised = attachmentFolder.replace(/^\//, "").replace(/\/$/, "");
    const inAttachments =
      normalised === "" ||
      normalised === "." ||
      file.path.startsWith(normalised + "/") ||
      file.path.includes("/" + normalised + "/");

    if (!inAttachments) return;

    // Wait for Obsidian to finish writing the file
    await sleep(500);

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return;
    const editor = activeView.editor;

    const notice = new Notice(`Uploading ${file.name} to Copyparty…`, 0);
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const blob = new Blob([arrayBuffer]);
      const f = new File([blob], file.name, {
        type: guessMimeType(file.name),
      });

      const remoteUrl = await uploadFileToCopyparty(f, this.settings);
      notice.hide();

      // Delete the local copy
      await this.app.vault.delete(file);

      // Rewrite the wikilink Obsidian already inserted
      const content = editor.getValue();
      const localLink = `![[${file.name}]]`;
      const embed = makeEmbed(file.name, remoteUrl);
      if (content.includes(localLink)) {
        editor.setValue(content.replace(localLink, embed));
      } else {
        // Obsidian may have used a different link format; append as fallback
        editor.replaceSelection(embed + "\n");
      }

      new Notice(`✓ Uploaded: ${file.name}`);
    } catch (err) {
      notice.hide();
      console.error("Copyparty vault-create upload error:", err);
      new Notice(`✗ Upload failed: ${file.name}\n${err.message}`, 5000);
    }
  }

  // ─── Core upload + insert ─────────────────────────────────────────────────

  async uploadAndInsert(file: File, editor: Editor) {
    const notice = new Notice(`Uploading ${file.name} to Copyparty…`, 0);
    try {
      const remoteUrl = await uploadFileToCopyparty(file, this.settings);
      const embed = makeEmbed(file.name, remoteUrl);
      editor.replaceSelection(embed + "\n");
      new Notice(`✓ Uploaded: ${file.name}`);
    } catch (err) {
      console.error("Copyparty upload error:", err);
      new Notice(`✗ Upload failed: ${file.name}\n${err.message}`, 5000);
    } finally {
      notice.hide();
    }
  }

  // ─── Migrate existing local attachments ──────────────────────────────────

  private async migrateLocalAttachments(editor: Editor, view: MarkdownView) {
    if (!this.settings.serverUrl) {
      new Notice("Configure Copyparty server URL in plugin settings first.");
      return;
    }

    const content = editor.getValue();

    const wikilinkRe = /!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|avif|bmp|svg|mp4|webm|mkv|mov|avi|mp3|flac|ogg|wav|m4a|opus|aac|pdf|docx|xlsx|pptx))\]\]/gi;
    const mdLinkRe = /!\[([^\]]*)\]\((?!https?:\/\/)([^)]+\.(png|jpg|jpeg|gif|webp|avif|bmp|svg|mp4|webm|mkv|mov|avi|mp3|flac|ogg|wav|m4a|opus|aac|pdf|docx|xlsx|pptx))\)/gi;

    const localFiles: { match: string; filename: string }[] = [];

    for (const m of content.matchAll(wikilinkRe)) {
      localFiles.push({ match: m[0], filename: m[1] });
    }
    for (const m of content.matchAll(mdLinkRe)) {
      localFiles.push({ match: m[0], filename: m[2] });
    }

    if (localFiles.length === 0) {
      new Notice("No local attachments found in this note.");
      return;
    }

    new Notice(`Found ${localFiles.length} local attachment(s). Uploading…`);

    let newContent = content;

    for (const { match, filename } of localFiles) {
      const basename = filename.split("/").pop() ?? filename;
      const tfile = this.app.metadataCache.getFirstLinkpathDest(
        basename,
        view.file?.path ?? ""
      );

      if (!(tfile instanceof TFile)) {
        new Notice(`⚠ Could not find vault file: ${basename}`, 4000);
        continue;
      }

      try {
        const arrayBuffer = await this.app.vault.readBinary(tfile);
        const blob = new Blob([arrayBuffer]);
        const file = new File([blob], tfile.name, {
          type: guessMimeType(tfile.name),
        });

        const notice = new Notice(`Uploading ${tfile.name}…`, 0);
        const remoteUrl = await uploadFileToCopyparty(file, this.settings);
        notice.hide();

        const embed = makeEmbed(tfile.name, remoteUrl);
        newContent = newContent.replace(match, embed);

        new Notice(`✓ Migrated: ${tfile.name}`);
      } catch (err) {
        console.error(`Failed to migrate ${basename}:`, err);
        new Notice(`✗ Failed: ${basename} — ${err.message}`, 5000);
      }
    }

    editor.setValue(newContent);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private isSupportedFile(filename: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const supported = [
      "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg",
      "mp4", "webm", "mkv", "mov", "avi", "wmv", "ogv", "m4v", "ts",
      "mp3", "flac", "ogg", "wav", "m4a", "opus", "aac", "weba", "wma", "aiff",
      "pdf", "md", "markdown",
    ];
    return supported.includes(ext);
  }
}

function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mp3: "audio/mpeg",
    flac: "audio/flac",
    ogg: "audio/ogg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    opus: "audio/opus",
    aac: "audio/aac",
    pdf: "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}
