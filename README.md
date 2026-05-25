# Copyparty Uploader — Obsidian Plugin

> [!WARNING]
> Back up your vault before using this plugin. By default, it uploads attachments to Copyparty based on your current Obsidian attachment settings, and it may remove the local files from your vault without rewriting the links in your notes.
>
> If you want to migrate gradually, use the migration command to upload and rewrite attachments note by note.
>
> To test the plugin safely before fully committing, temporarily change **Settings → Files & Links → Default location for new attachments** to a separate folder and try it there first.

This plugin currently does not support obsidian canvas.

---

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
| Run "Migrate local attachments" command | Uploads existing local files **in currently viewed note** and rewrites links |

## Setup

### 1. Build

```bash
git clone https://github.com/r3quisitevariety/copyparty-obsidian.git
cd copyparty-obsidian
npm install
npm run build
```

### 2. Install

Copy the three output files into your vault's plugin folder:

```bash
# make the directory "copyparty-uploader" under .obsidian/plugins if it doesnt exist
cp main.js manifest.json styles.css ~/path/to/vault/.obsidian/plugins/copyparty-uploader

# this is what the directory should look like
.obsidian/plugins/copyparty-uploader/
  main.js
  manifest.json
  styles.css   #(not needed, skip if absent)
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

Note that this plugin has been tested on a LAN + tailscale setup, meaning it can be potentially unsafe to add these options if your copyparty setup exists on the public internet.

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
