/**
 * Given a filename and a remote URL (with ?raw already appended),
 * return the correct embed string for Obsidian.
 *
 * Rules (confirmed against Obsidian's Electron/Chromium renderer):
 *   - Images           → ![](url)           native embed
 *   - Audio (native)   → <audio> tag         Obsidian's ![]() is unreliable for audio
 *   - Audio (all)      → <audio> tag         safest universal approach
 *   - Video (all)      → <video> tag         ![]() does NOT work for remote video
 *   - PDF              → ![](url)            native embed
 *   - Markdown         → [filename](url)     can't transclude remote md
 *   - Everything else  → [filename](url)     plain link fallback
 */
export function makeEmbed(filename: string, rawUrl: string): string {
	const ext = getExtension(filename);

	if (IMAGE_EXTS.has(ext)) {
		return `![${filename}](${rawUrl})`;
	}

	if (AUDIO_EXTS.has(ext)) {
		return `<audio src="${rawUrl}" controls></audio>`;
	}

	if (VIDEO_EXTS.has(ext)) {
		return `<video src="${rawUrl}" controls width="100%"></video>`;
	}

	if (PDF_EXTS.has(ext)) {
		return `![${filename}](${rawUrl})`;
	}

	// Fallback: plain markdown link
	return `[${filename}](${rawUrl})`;
}

// ─── Extension sets ───────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set([
	"png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg",
]);

const AUDIO_EXTS = new Set([
	// Obsidian-native (mp3, flac, ogg, wav, m4a) AND non-native — all use <audio>
	// for consistency; Chromium handles all of these fine
	"mp3", "flac", "ogg", "wav", "m4a",
	"opus", "aac", "weba", "wma", "aiff", "aif",
]);

const VIDEO_EXTS = new Set([
	"mp4", "webm", "mkv", "mov", "avi", "wmv", "ogv", "m4v", "ts",
]);

const PDF_EXTS = new Set(["pdf"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExtension(filename: string): string {
	// Strip query params first in case URL sneaks in
	const clean = filename.split("?")[0];
	const parts = clean.split(".");
	if (parts.length < 2) return "";
	return parts[parts.length - 1].toLowerCase();
}
