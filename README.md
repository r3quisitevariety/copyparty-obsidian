# Copyparty Uploader — Obsidian Plugin

Paste or drop any media file into Obsidian and it gets uploaded to your
self-hosted [Copyparty](https://github.com/9001/copyparty) server automatically.
The file never touches your vault — only the embed is inserted.

## What it does

| Action | Result |
|---|---|
| Paste image from clipboard | Uploads → `![filename](url?raw)` |
| Paste/drop video | Uploads → `<video src="url?raw" controls>` |
| Paste/drop audio | Uploads → `<audio src="url?raw" controls>` |
| Paste/drop PDF | Uploads → `![filename](url?raw)` |
| Drop any other file | Uploads → `[filename](url?raw)` |
| Run "Migrate local attachments" command | Uploads existing local files and rewrites links |

## Setup

### 1. Build

```bash
cd copyparty-obsidian
npm install
npm run build
```

### 2. Install

Copy the three output files into your vault's plugin folder:

```
.obsidian/plugins/copyparty-uploader/
  main.js
  manifest.json
  styles.css   (not needed, skip if absent)
```

Then enable the plugin in Obsidian → Settings → Community Plugins.

### 3. Configure

Go to Settings → Copyparty Uploader:

- **Server URL**: `http://inspiron:3923` (no trailing slash)
- **Upload path**: `/obsidian-uploads` or wherever you want files to land
- **Username / Password**: leave blank if your upload path has `w: *` (world-writable)

Hit **Test** to confirm connectivity.

### 4. Copyparty config

Make your upload directory world-writable so no credentials are needed:

```ini
[/obsidian-uploads]
/path/to/obsidian-uploads
accs:
  rwda: you
  rw: *        ← world read+write, no password
```

Or keep it write-only from outside and enter your credentials in plugin settings.

Also ensure you have the following options in your global config to allow copyparty to properly communicate with obsidian:

```ini
[global]
acao: *
acam: GET, HEAD, PUT, POST, DELETE, OPTIONS
allow-csrf
```

Note that this plugin has been tested on a LAN + tailscale setup without port forwarding, meaning it can be potentially unsafe to do this on the public internet.

## Migrate existing local attachments

Run the command palette → **Copyparty: Upload all local attachments in this note**
to retroactively move any `![[local-file.png]]` or `![](relative/path.mp4)` references
out of your vault and onto the server.

## Notes

- Files are uploaded via HTTP PUT. Copyparty handles deduplication server-side.
- Filenames are sanitized (spaces → underscores) before upload.
- If upload fails, Obsidian's default paste behaviour is blocked for that file
  and an error notice is shown. The file is not saved locally as fallback —
  this is intentional for a thin-client setup.
- Auth credentials are stored in `.obsidian/plugins/copyparty-uploader/data.json`
  (plain text). Fine for a local homelab, not for anything public-facing.
