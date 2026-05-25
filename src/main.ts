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

export default class CopypartyPlugin extends Plugin {
	settings: CopypartySettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new CopypartySettingTab(this.app, this));

		// Intercept paste events
		this.registerEvent(
			this.app.workspace.on(
				"editor-paste",
				this.handlePaste.bind(this)
			)
		);

		// Intercept drag-and-drop events
		this.registerEvent(
			this.app.workspace.on(
				"editor-drop",
				this.handleDrop.bind(this)
			)
		);

		// Command: upload current file's local attachments to copyparty
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

	// ─── Paste handler ────────────────────────────────────────────────────────

	private async handlePaste(
		evt: ClipboardEvent,
		editor: Editor,
		_view: MarkdownView
	) {
		if (!this.settings.serverUrl) {
			// No server configured — let Obsidian handle it normally
			return;
		}

		const files = evt.clipboardData?.files;
		if (!files || files.length === 0) return;

		// Only intercept if there are actual files (not plain text paste)
		const mediaFiles = Array.from(files).filter((f) =>
			this.isSupportedFile(f.name)
		);
		if (mediaFiles.length === 0) return;

		// Prevent Obsidian from saving locally
		evt.preventDefault();

		for (const file of mediaFiles) {
			await this.uploadAndInsert(file, editor);
		}
	}

	// ─── Drop handler ─────────────────────────────────────────────────────────

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

		// Match wikilink attachments: ![[filename.ext]]
		const wikilinkRe = /!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|avif|bmp|svg|mp4|webm|mkv|mov|avi|mp3|flac|ogg|wav|m4a|opus|aac|pdf|docx|xlsx|pptx))\]\]/gi;
		// Match markdown attachments: ![alt](path)  where path is not http
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
			// Resolve vault file
			const basename = filename.split("/").pop() ?? filename;
			const tfile = this.app.metadataCache.getFirstLinkpathDest(basename, view.file?.path ?? "");

			if (!(tfile instanceof TFile)) {
				new Notice(`⚠ Could not find vault file: ${basename}`, 4000);
				continue;
			}

			try {
				const arrayBuffer = await this.app.vault.readBinary(tfile);
				const blob = new Blob([arrayBuffer]);
				const file = new File([blob], tfile.name, { type: guessMimeType(tfile.name) });

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
			// images
			"png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg",
			// video
			"mp4", "webm", "mkv", "mov", "avi", "wmv", "ogv", "m4v", "ts",
			// audio
			"mp3", "flac", "ogg", "wav", "m4a", "opus", "aac", "weba", "wma", "aiff",
			// documents
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
