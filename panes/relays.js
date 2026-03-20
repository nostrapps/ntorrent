import { createStore } from '../losos/store.js'
import { html, render, onUnmount } from '../losos/html.js'

var statusSymbols = {
  done:       { icon: '\u2705', label: 'Connected', color: '#5cb85c' },
  connected:  { icon: '\u{1F7E1}', label: 'Receiving...', color: '#f0ad4e' },
  connecting: { icon: '\u23F3', label: 'Connecting...', color: '#999' },
  error:      { icon: '\u274C', label: 'Error', color: '#d9534f' },
  closed:     { icon: '\u26AA', label: 'Closed', color: '#999' }
}

function getRelays() {
  // Read live stats if available, fall back to snapshot
  var stats = window.__NT_RELAY_STATS
  var relayUrls = window.__NT_RELAYS
  if (stats && relayUrls) {
    return relayUrls.map(function(url) {
      var s = stats[url]
      return { url: s.url, status: s.status, events: s.events, unique: s.unique, dupes: s.dupes, latencyMs: s.latencyMs, errors: s.errors }
    })
  }
  return null
}

export default {
  label: 'Relays',
  icon: '\u{1F4E1}',

  canHandle(subject, store) {
    var node = store.get(subject.value)
    var type = store.type(node)
    return type && type.includes('TorrentFeed')
  },

  render(subject, lionStore, container, rawData) {
    var data = rawData
    var store = createStore(data, { debounce: 500 })
    var root = store.get('#this')
    var pollTimer = null

    function renderRelays() {
      var relays = getRelays()
      if (!relays) {
        var relayJson = store.prop(root, 'relayData')
        try { relays = JSON.parse(relayJson) } catch(e) { relays = [] }
      }

      var totalEvents = 0, totalUnique = 0, totalDupes = 0
      relays.forEach(function(r) {
        totalEvents += r.events || 0
        totalUnique += r.unique || 0
        totalDupes += r.dupes || 0
      })
      var maxEvents = Math.max.apply(null, relays.map(function(r) { return r.events || 0 })) || 1

      render(container, html`
        <div style="font-family:Verdana,Geneva,sans-serif;font-size:13px;background:#f5f5f5;min-height:100vh">

          <div style="background:linear-gradient(180deg,#3b3b3b 0%,#2a2a2a 100%);padding:14px 20px;text-align:center">
            <div style="font-size:16px;font-weight:700;color:#fff">\u{1F4E1} Nostr Relays</div>
            <div style="font-size:10px;color:#999;margin-top:2px">WebSocket connections to the Nostr network</div>
          </div>

          <div style="max-width:800px;margin:0 auto;padding:16px">

            <!-- Summary -->
            <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #ccc;margin-bottom:14px">
              <tr style="background:#444;color:#ddd;font-size:10px;text-transform:uppercase;letter-spacing:0.5px">
                <th style="padding:6px 10px;text-align:left;font-weight:700;border-right:1px solid #555">Network Summary</th>
                <th style="padding:6px 10px;text-align:right;font-weight:700">Value</th>
              </tr>
              <tr style="border-bottom:1px solid #eee">
                <td style="padding:6px 10px;border-right:1px solid #eee">Relays configured</td>
                <td style="padding:6px 10px;text-align:right;font-weight:700">${relays.length}</td>
              </tr>
              <tr style="background:#f9f9f9;border-bottom:1px solid #eee">
                <td style="padding:6px 10px;border-right:1px solid #eee">Total events received</td>
                <td style="padding:6px 10px;text-align:right;font-weight:700">${totalEvents}</td>
              </tr>
              <tr style="border-bottom:1px solid #eee">
                <td style="padding:6px 10px;border-right:1px solid #eee">Unique torrents</td>
                <td style="padding:6px 10px;text-align:right;font-weight:700;color:#5cb85c">${totalUnique}</td>
              </tr>
              <tr style="background:#f9f9f9;border-bottom:1px solid #eee">
                <td style="padding:6px 10px;border-right:1px solid #eee">Duplicates (cross-relay)</td>
                <td style="padding:6px 10px;text-align:right;font-weight:700;color:#f0ad4e">${totalDupes}</td>
              </tr>
              <tr style="border-bottom:1px solid #eee">
                <td style="padding:6px 10px;border-right:1px solid #eee">Dedup ratio</td>
                <td style="padding:6px 10px;text-align:right;font-weight:700">${totalEvents > 0 ? Math.round((totalDupes / totalEvents) * 100) : 0}%</td>
              </tr>
            </table>

            <!-- Per-relay cards -->
            ${relays.map(function(r, i) {
              var s = statusSymbols[r.status] || statusSymbols.connecting
              var eventPct = (r.events / maxEvents) * 100
              var uniquePct = r.events > 0 ? Math.round((r.unique / r.events) * 100) : 0
              var shortUrl = r.url.replace('wss://', '').replace(/\/$/, '')

              return html`
                <div style="${'background:#fff;border:1px solid #ccc;margin-bottom:8px;overflow:hidden' + (r.status === 'error' ? ';border-color:#d9534f' : '')}">
                  <!-- Relay header -->
                  <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fafafa;border-bottom:1px solid #eee">
                    <span style="font-size:16px">${s.icon}</span>
                    <div style="flex:1">
                      <div style="font-size:13px;font-weight:700;color:#333;font-family:Consolas,monospace">${shortUrl}</div>
                      <div style="font-size:10px;color:${s.color};font-weight:700;margin-top:1px">${s.label}</div>
                    </div>
                    ${r.latencyMs ? html`<div style="font-size:10px;color:#888;text-align:right">${r.latencyMs}ms<br/><span style="color:#aaa">latency</span></div>` : ''}
                  </div>

                  <!-- Stats -->
                  <div style="padding:10px 14px">
                    <div style="display:flex;gap:20px;margin-bottom:8px">
                      <div>
                        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#999;margin-bottom:2px">Events</div>
                        <div style="font-size:18px;font-weight:700;color:#333">${r.events}</div>
                      </div>
                      <div>
                        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#999;margin-bottom:2px">Unique</div>
                        <div style="font-size:18px;font-weight:700;color:#5cb85c">${r.unique}</div>
                      </div>
                      <div>
                        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#999;margin-bottom:2px">Dupes</div>
                        <div style="font-size:18px;font-weight:700;color:#f0ad4e">${r.dupes}</div>
                      </div>
                      <div>
                        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#999;margin-bottom:2px">Unique %</div>
                        <div style="font-size:18px;font-weight:700;color:#1a0dab">${uniquePct}%</div>
                      </div>
                    </div>

                    <!-- Event bar -->
                    <div style="font-size:9px;color:#aaa;margin-bottom:3px">Events share (of ${maxEvents} max)</div>
                    <div style="height:12px;background:#eee;border:1px solid #ddd;overflow:hidden">
                      <div style="display:flex;height:100%">
                        <div style="${'height:100%;background:#5cb85c;width:' + ((r.unique / maxEvents) * 100) + '%'}" title="${r.unique + ' unique'}"></div>
                        <div style="${'height:100%;background:#f0ad4e;width:' + ((r.dupes / maxEvents) * 100) + '%'}" title="${r.dupes + ' dupes'}"></div>
                      </div>
                    </div>
                    <div style="display:flex;gap:12px;margin-top:3px;font-size:9px;color:#aaa">
                      <span>\u{25A0} <span style="color:#5cb85c">unique</span></span>
                      <span>\u{25A0} <span style="color:#f0ad4e">duplicate</span></span>
                    </div>
                  </div>
                </div>
              `
            })}

            <!-- How it works -->
            <div style="background:#fffff0;border:1px solid #cba;padding:12px 14px;margin-top:12px;font-size:11px;color:#555;line-height:1.6">
              <b>How it works:</b> Nostr Torrent Browser connects to multiple Nostr relays via WebSocket and requests
              <code style="background:#f0f0f0;padding:1px 4px;border-radius:2px">kind:2003</code> events (NIP-35 torrents).
              Events are deduplicated by ID across relays. Each relay independently stores and serves torrent
              listings published by users. The more relays connected, the more complete the index.
            </div>

            <!-- Protocol info -->
            <div style="background:#fff;border:1px solid #ccc;padding:12px 14px;margin-top:8px;font-size:10px;color:#777;line-height:1.6">
              <b>Protocol:</b> Nostr (Notes and Other Stuff Transmitted by Relays)<br/>
              <b>NIP:</b> 35 (Torrent)<br/>
              <b>Event kind:</b> 2003 (torrent index), 2004 (torrent comment)<br/>
              <b>Filter:</b> <code style="background:#f0f0f0;padding:1px 4px;border-radius:2px">{"kinds":[2003],"limit":500}</code><br/>
              <b>Transport:</b> WebSocket (wss://)
            </div>

            <div style="text-align:center;padding:16px 0;font-size:10px;color:#aaa">
              NIP-35 \u2022 Nostr \u2022 <a href="https://losos.org" style="color:#999;font-size:10px">LOSOS</a> \u2022 <a href="https://nostrcg.github.io/did-nostr/" style="color:#999;font-size:10px">did:nostr</a>
            </div>
          </div>
        </div>
      `)
    }

    // Poll live stats until all relays settle
    function startPolling() {
      pollTimer = setInterval(function() {
        var stats = window.__NT_RELAY_STATS
        if (!stats) { clearInterval(pollTimer); return }
        var allSettled = true
        var relayUrls = window.__NT_RELAYS || []
        relayUrls.forEach(function(url) {
          var s = stats[url]
          if (s && (s.status === 'connecting' || s.status === 'connected')) allSettled = false
        })
        renderRelays()
        if (allSettled) clearInterval(pollTimer)
      }, 1000)
    }

    var unsub = store.onChange(renderRelays)
    setTimeout(renderRelays, 0)
    startPolling()
    onUnmount(container, function() {
      unsub()
      if (pollTimer) clearInterval(pollTimer)
    })
  }
}
