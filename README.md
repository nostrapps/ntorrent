# 🐦 Nostr Torrent Browser

**A decentralized torrent client that runs entirely in your browser. No server. No database. No build step. Just open the HTML file.**

> Connects directly to Nostr relays via WebSocket, pulls NIP-35 torrent events, and renders them with [LOSOS](https://losos.org) — a 6KB reactive framework. The whole app is 14 files and under 200KB.

### 🔗 [Live Demo →](https://nostrapps.github.io/ntorrent/)

---

## What is this?

Every torrent listing is a [Nostr](https://nostr.com) event (kind `2003`, defined in [NIP-35](https://github.com/nostr-protocol/nips/blob/master/35.md)). Instead of a centralized tracker website, torrent metadata lives on the Nostr relay network — censorship-resistant and distributed across thousands of relays worldwide.

This app is a pure frontend that reads those events. **It hosts nothing.** It's a protocol demo that shows how linked data + WebSockets can replace traditional torrent sites.

## Features

🔍 **Browse** — Search, filter by category, sort by date/size/files. Click any torrent for full details, file list, trackers, and magnet link.

📤 **Publish** — Sign in with your Nostr key via [xlogin](https://www.npmjs.com/package/xlogin) (supports nos2x, Alby, or any NIP-07 extension). Drop a `.torrent` file or paste a magnet link — it auto-fills everything including category detection from the title.

📊 **Stats** — Category distribution, 30-day activity timeline, data volume metrics, IMDb/TMDb linkage counts.

📡 **Relays** — Live connection status, per-relay event counts, unique vs duplicate breakdown, latency, and dedup ratio.

## Quick Start

```
git clone https://github.com/nostrapps/ntorrent.git
cd ntorrent
python3 -m http.server 8080
# open http://localhost:8080
```

That's it. No `npm install`. No webpack. No React. Just files and a browser.

## How It Works

```
Browser                          Nostr Relays
  │                                  │
  ├──WebSocket──→ wss://nos.lol     ─┤
  ├──WebSocket──→ wss://relay.nostr.band ─┤  kind:2003
  ├──WebSocket──→ wss://relay.damus.io   ─┤  torrent events
  │                                  │
  ▼                                  │
  JSON-LD ──→ LOSOS store ──→ DOM   │
  (6KB framework, surgical patches)  │
```

1. Opens WebSocket connections to 3 Nostr relays
2. Sends `["REQ", "browse", {"kinds": [2003], "limit": 200}]`
3. Receives torrent events, deduplicates by event ID
4. Transforms to JSON-LD with schema.org vocabulary
5. LOSOS renders the UI with tagged template literals — no virtual DOM, no diffing library

## Publish Flow

1. xlogin detects your NIP-07 browser extension
2. You fill the form (or drop a `.torrent` / paste a magnet link)
3. Category auto-detection runs regex against the title and filenames
4. The form builds a `kind:2003` event with NIP-35 tags
5. Your extension signs it — **private key never leaves the extension**
6. Signed event broadcasts to all connected relays

## NIP-35 Event Structure

```json
{
  "kind": 2003,
  "tags": [
    ["title", "Ubuntu 24.04 LTS Desktop"],
    ["x", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"],
    ["file", "ubuntu-24.04-desktop-amd64.iso", "4071903232"],
    ["tracker", "udp://tracker.opentrackr.org:1337"],
    ["t", "linux"],
    ["t", "software"]
  ],
  "content": "Official Ubuntu 24.04 LTS release"
}
```

## Stack

| Layer | What | Size |
|-------|------|------|
| **html.js** | Tagged templates → surgical DOM patches | 2.5 KB |
| **store.js** | Reactive JSON-LD store with auto-save | 1.9 KB |
| **shell.js** | Pane loader + tab persistence | ~1 KB |
| **lion** | JSON-LD graph store (rdflib replacement) | 1.5 KB |
| **xlogin** | One-line auth shim (Nostr / Solid / guest) | external |
| **Total framework** | | **~7 KB** |

Zero dependencies. Zero build step. Copy the files and open in a browser.

## Files

```
index.html          Main app — Nostr WebSocket client + JSON-LD bootstrap
panes/browse.js     Search, filter, sort, detail view, magnet links
panes/publish.js    xlogin auth, .torrent parser, magnet parser, auto-categorize
panes/torrent.js    Stats dashboard — categories, timeline, metrics
panes/relays.js     Relay status — connections, events, dedup
losos/              LOSOS framework (html.js, store.js, shell.js, registry.js)
lion/               LION JSON-LD store
og.png              Open Graph preview image
```

## Install from npm

```
npm i ntorrent
```

## License

[AGPL-3.0](LICENSE) — If you modify and deploy this, share your source.

## Disclaimer

This is a read-only Nostr relay client for educational and research purposes. It displays publicly available NIP-35 events from the Nostr network. It does not host, store, seed, or index any content. Users are responsible for compliance with applicable laws in their jurisdiction.

---

Built with [LOSOS](https://losos.org) · Powered by [Nostr](https://nostr.com)
