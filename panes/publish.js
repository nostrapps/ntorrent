import { createStore } from '../losos/store.js'
import { html, render, onUnmount } from '../losos/html.js'

// --- Bencode decoder (for .torrent files) ---
function bdecode(buf) {
  var pos = 0, view = new Uint8Array(buf)
  function chr() { return String.fromCharCode(view[pos]) }
  function parse() {
    var c = chr()
    if (c === 'd') {
      pos++; var obj = {}
      while (chr() !== 'e') { var k = parse(); obj[k] = parse() }
      pos++; return obj
    }
    if (c === 'l') {
      pos++; var arr = []
      while (chr() !== 'e') arr.push(parse())
      pos++; return arr
    }
    if (c === 'i') {
      pos++; var s = ''
      while (chr() !== 'e') { s += chr(); pos++ }
      pos++; return parseInt(s)
    }
    // string: length:data
    var len = ''
    while (chr() !== ':') { len += chr(); pos++ }
    pos++ // skip ':'
    var n = parseInt(len)
    // Try to decode as UTF-8, fall back to raw bytes
    var bytes = view.slice(pos, pos + n)
    pos += n
    try { return new TextDecoder().decode(bytes) } catch(e) { return bytes }
  }
  return { result: parse(), end: pos }
}

// Find the raw bytes of the 'info' dict for hashing
function findInfoBytes(buf) {
  var view = new Uint8Array(buf)
  var str = new TextDecoder('ascii').decode(view)
  var idx = str.indexOf('4:info')
  if (idx === -1) return null
  var start = idx + 6
  // Find matching 'e' for the dict starting at 'start'
  var depth = 0, pos = start
  do {
    var c = String.fromCharCode(view[pos])
    if (c === 'd' || c === 'l') { depth++; pos++ }
    else if (c === 'e') { depth--; pos++; if (depth === 0) break }
    else if (c === 'i') { pos++; while (String.fromCharCode(view[pos]) !== 'e') pos++; pos++ }
    else { // string
      var len = ''
      while (String.fromCharCode(view[pos]) !== ':') { len += String.fromCharCode(view[pos]); pos++ }
      pos++ // ':'
      pos += parseInt(len)
    }
  } while (depth > 0 && pos < view.length)
  return buf.slice(start, pos)
}

async function hashInfoDict(buf) {
  var infoBytes = findInfoBytes(buf)
  if (!infoBytes) return null
  var hash = await crypto.subtle.digest('SHA-1', infoBytes)
  return Array.from(new Uint8Array(hash)).map(function(b) { return b.toString(16).padStart(2, '0') }).join('')
}

// --- Magnet link parser ---
function parseMagnet(uri) {
  if (!uri || uri.indexOf('magnet:?') !== 0) return null
  var params = uri.slice(8).split('&')
  var result = { hash: '', name: '', trackers: [] }
  params.forEach(function(p) {
    var kv = p.split('=')
    var k = kv[0], v = decodeURIComponent(kv.slice(1).join('='))
    if (k === 'xt' && v.indexOf('urn:btih:') === 0) result.hash = v.slice(9)
    else if (k === 'dn') result.name = v
    else if (k === 'tr') result.trackers.push(v)
  })
  return result.hash ? result : null
}

function shortId(id) {
  if (!id) return '?'
  return id.length > 20 ? id.slice(0, 10) + '...' + id.slice(-6) : id
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KiB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MiB'
  return (bytes / 1073741824).toFixed(2) + ' GiB'
}

function isValidHash(h) { return /^[a-fA-F0-9]{40}$/.test(h) }

var QUICK_CATS = ['video', 'movie', 'tv', 'music', 'audio', 'game', 'software', 'linux', 'ebook', 'anime', '4k', 'hdr']

// Auto-detect categories from title and file names
var CAT_HINTS = {
  video:    /\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v)\b|x264|x265|hevc|bluray|bdrip|dvdrip|webrip|web-dl|hdtv|remux/i,
  movie:    /\b(1080p|2160p|720p|4k|uhd)\b.*\b(bluray|bdrip|webrip|web-dl|remux)\b|\byts\b|\brarbg\b/i,
  tv:       /\bS\d{1,2}E\d{1,2}\b|\bseason\s*\d|\bcomplete\s*series|\bepisode\b|\bminiseries\b/i,
  music:    /\.(flac|mp3|ogg|aac|wav|opus|alac)\b|\b(album|discography|soundtrack|ost|vinyl|lossless)\b/i,
  audio:    /\baudiobook\b|\bpodcast\b|\.(m4b|aa|aax)\b/i,
  game:     /\b(gog|fitgirl|repack|codex|plaza|skidrow|dodi|steamrip)\b|\.(exe|iso)\b.*\b(crack|setup)\b/i,
  software: /\b(x64|x86|portable|installer|patch|keygen|macos|windows)\b.*\.(exe|dmg|msi|iso|pkg)\b/i,
  linux:    /\b(ubuntu|debian|fedora|arch|linux|manjaro|mint|opensuse|centos|kali)\b/i,
  ebook:    /\.(epub|mobi|pdf|azw3|djvu|cbr|cbz)\b|\bebook\b/i,
  anime:    /\b(horriblesubs|erai-raws|subsplease|\[mal\]|nyaa|anilist)\b|\b(dual\s*audio|multi\s*sub)\b.*\b(jpn|japanese)\b/i,
  '4k':     /\b(2160p|4k|uhd)\b/i,
  hdr:      /\bhdr10?\b|\bdolby\s*vision\b|\bdv\b.*\bhdr\b/i
}

function guessCategories(title, files) {
  var text = (title || '') + ' ' + (files || '')
  var found = []
  for (var cat in CAT_HINTS) {
    if (CAT_HINTS[cat].test(text) && found.indexOf(cat) === -1) found.push(cat)
  }
  // Promote: if "tv" matched, don't also add generic "video"
  if (found.indexOf('tv') >= 0 && found.indexOf('video') >= 0) found.splice(found.indexOf('video'), 1)
  if (found.indexOf('movie') >= 0 && found.indexOf('video') >= 0) found.splice(found.indexOf('video'), 1)
  return found
}

function buildTorrentEvent(opts) {
  var tags = []
  tags.push(['title', opts.title || 'Untitled'])
  tags.push(['x', opts.infohash])
  if (opts.files) opts.files.forEach(function(f) { tags.push(['file', f.name, String(f.size || 0)]) })
  if (opts.trackers) opts.trackers.forEach(function(t) { if (t.trim()) tags.push(['tracker', t.trim()]) })
  if (opts.categories) opts.categories.forEach(function(c) { if (c.trim()) tags.push(['t', c.trim().toLowerCase()]) })
  return { kind: 2003, created_at: Math.floor(Date.now() / 1000), tags: tags, content: opts.description || '' }
}

function publishToRelays(signedEvent, relayUrls) {
  return Promise.all(relayUrls.map(function(url) {
    return new Promise(function(resolve) {
      var ws
      try { ws = new WebSocket(url) } catch(e) { resolve({ url: url, ok: false, error: 'connect failed' }); return }
      var timer = setTimeout(function() { ws.close(); resolve({ url: url, ok: false, error: 'timeout' }) }, 8000)
      ws.onopen = function() { ws.send(JSON.stringify(['EVENT', signedEvent])) }
      ws.onmessage = function(e) {
        try { var msg = JSON.parse(e.data); if (msg[0] === 'OK') { clearTimeout(timer); ws.close(); resolve({ url: url, ok: msg[2], error: msg[2] ? '' : (msg[3] || 'rejected') }) } } catch(err) {}
      }
      ws.onerror = function() { clearTimeout(timer); resolve({ url: url, ok: false, error: 'error' }) }
    })
  }))
}

export default {
  label: 'Publish',
  icon: '\u{1F4E4}',

  canHandle(subject, store) {
    var node = store.get(subject.value)
    var type = store.type(node)
    return type && type.includes('TorrentFeed')
  },

  render(subject, lionStore, container, rawData) {
    var data = rawData
    var store = createStore(data, { debounce: 500 })
    var root = store.get('#this')

    var state = {
      title: '', infohash: '', description: '', trackers: '', categories: [],
      filesRaw: '', filesParsed: [], filesTotalSize: 0,
      publishing: false, results: null, error: null,
      showPreview: false, dragOver: false, magnetInput: ''
    }

    function onAuth() { renderUI() }
    document.addEventListener('xlogin', onAuth)
    document.addEventListener('xlogout', onAuth)

    function xl() { return window.xlogin || null }

    function parseFilesText(text) {
      if (!text.trim()) { state.filesParsed = []; state.filesTotalSize = 0; return }
      var lines = text.trim().split('\n')
      var total = 0
      state.filesParsed = lines.map(function(line) {
        var parts = line.trim().split(/\s+/)
        var size = parseInt(parts[parts.length - 1]) || 0
        var name = size > 0 ? parts.slice(0, -1).join(' ') : line.trim()
        total += size
        return { name: name, size: size }
      })
      state.filesTotalSize = total
    }

    function handleMagnet() {
      var m = parseMagnet(state.magnetInput.trim())
      if (!m) { state.error = 'Invalid magnet link'; renderUI(); return }
      state.infohash = m.hash
      if (m.name) state.title = m.name
      if (m.trackers.length) state.trackers = m.trackers.join('\n')
      // Auto-detect categories from title
      var guessed = guessCategories(m.name || '', '')
      if (guessed.length) state.categories = guessed
      state.magnetInput = ''
      state.error = null
      renderUI()
    }

    function handleTorrentFile(file) {
      var reader = new FileReader()
      reader.onload = function() {
        try {
          var buf = reader.result
          var decoded = bdecode(buf).result
          // Extract title
          var info = decoded.info || decoded['info'] || {}
          if (info.name) state.title = info.name
          // Extract files
          if (info.files) {
            var fileLines = []
            info.files.forEach(function(f) {
              var path = Array.isArray(f.path) ? f.path.join('/') : (f.path || 'unknown')
              var size = f.length || f['length'] || 0
              fileLines.push(path + ' ' + size)
            })
            state.filesRaw = fileLines.join('\n')
          } else if (info.length) {
            state.filesRaw = (info.name || 'file') + ' ' + info.length
          }
          parseFilesText(state.filesRaw)
          // Extract trackers
          var trList = []
          if (decoded['announce']) trList.push(decoded['announce'])
          if (decoded['announce-list']) {
            decoded['announce-list'].forEach(function(tier) {
              if (Array.isArray(tier)) tier.forEach(function(t) { if (trList.indexOf(t) === -1) trList.push(t) })
              else if (typeof tier === 'string' && trList.indexOf(tier) === -1) trList.push(tier)
            })
          }
          if (trList.length) state.trackers = trList.join('\n')
          // Auto-detect categories from title + file names
          var guessed = guessCategories(state.title, state.filesRaw)
          if (guessed.length) state.categories = guessed
          // Compute info hash
          hashInfoDict(buf).then(function(hash) {
            if (hash) state.infohash = hash
            state.error = null
            renderUI()
          })
        } catch(e) {
          state.error = 'Failed to parse .torrent file: ' + e.message
          renderUI()
        }
      }
      reader.readAsArrayBuffer(file)
    }

    function toggleCat(cat) {
      var idx = state.categories.indexOf(cat)
      if (idx >= 0) state.categories.splice(idx, 1)
      else state.categories.push(cat)
      renderUI()
    }

    function getPreviewJSON() {
      var trackers = state.trackers.trim() ? state.trackers.trim().split('\n').filter(Boolean) : (window.__NT_DEFAULT_TRACKERS || [])
      var ev = buildTorrentEvent({
        title: state.title.trim(), infohash: state.infohash.trim(),
        description: state.description, files: state.filesParsed,
        trackers: trackers, categories: state.categories
      })
      return JSON.stringify(ev, null, 2)
    }

    function doPublish() {
      var x = xl()
      if (!x || !x.id) { state.error = 'Not logged in'; renderUI(); return }
      if (!state.title.trim()) { state.error = 'Title is required'; renderUI(); return }
      if (!isValidHash(state.infohash.trim())) { state.error = 'Info hash must be 40 hex characters'; renderUI(); return }

      state.publishing = true; state.error = null; state.results = null; renderUI()

      var trackers = state.trackers.trim() ? state.trackers.trim().split('\n').filter(Boolean) : (window.__NT_DEFAULT_TRACKERS || [])
      var event = buildTorrentEvent({
        title: state.title.trim(), infohash: state.infohash.trim(),
        description: state.description, files: state.filesParsed,
        trackers: trackers, categories: state.categories
      })

      var signPromise = window.nostr
        ? window.nostr.signEvent(Object.assign({ pubkey: x.id }, event))
        : Promise.reject(new Error('No signer available'))

      signPromise.then(function(signed) {
        return publishToRelays(signed, window.__NT_RELAYS || ['wss://relay.nostr.band/', 'wss://nos.lol/', 'wss://relay.damus.io/'])
      }).then(function(results) {
        state.publishing = false; state.results = results; renderUI()
      }).catch(function(e) {
        state.publishing = false; state.error = e.message; renderUI()
      })
    }

    // Validation helpers
    function vIcon(valid) { return valid ? '\u2705' : '\u274C' }
    function vColor(valid) { return valid ? '#5cb85c' : '#d9534f' }

    function renderUI() {
      var x = xl()
      var loggedIn = x && x.id
      var hashValid = isValidHash(state.infohash.trim())
      var titleValid = state.title.trim().length > 0
      var ready = loggedIn && hashValid && titleValid && !state.publishing

      render(container, html`
        <div style="font-family:Verdana,Geneva,sans-serif;font-size:13px;background:#f5f5f5;min-height:100vh">

          <div style="background:linear-gradient(180deg,#3b3b3b 0%,#2a2a2a 100%);padding:14px 20px;text-align:center">
            <div style="font-size:16px;font-weight:700;color:#fff">\u{1F4E4} Publish Torrent</div>
            <div style="font-size:10px;color:#999;margin-top:2px">Sign and broadcast a NIP-35 event</div>
          </div>

          <div style="max-width:700px;margin:0 auto;padding:16px">

            <!-- Auth -->
            <div style="${'background:#fff;border:1px solid #ccc;padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' + (loggedIn ? ';border-left:3px solid #5cb85c' : ';border-left:3px solid #d9534f')}">
              ${loggedIn ? html`
                <div>
                  <span style="font-size:10px;color:#5cb85c;font-weight:700;text-transform:uppercase">\u2705 ${x.type || 'nostr'}</span>
                  <span style="font-family:Consolas,monospace;font-size:11px;color:#555;margin-left:6px">${shortId(x.id)}</span>
                </div>
              ` : html`
                <div style="font-size:11px;color:#888">\u{1F511} Use the xlogin widget to connect your Nostr key</div>
              `}
            </div>

            ${state.error ? html`<div style="background:#fdf0f0;border:1px solid #d9534f;padding:8px 12px;margin-bottom:10px;font-size:11px;color:#d9534f">\u26A0\uFE0F ${state.error}</div>` : ''}
            ${state.results ? html`
              <div style="background:#f0fdf0;border:1px solid #5cb85c;padding:10px 14px;margin-bottom:10px">
                <div style="font-size:12px;font-weight:700;color:#333;margin-bottom:4px">\u2705 Published!</div>
                ${state.results.map(function(r) {
                  var short = r.url.replace('wss://', '').replace(/\/$/, '')
                  return html`<div style="font-size:11px;padding:1px 0">${r.ok ? '\u2705' : '\u274C'} <span style="font-family:Consolas,monospace">${short}</span>${r.ok ? '' : html` <span style="color:#d9534f">${r.error}</span>`}</div>`
                })}
              </div>
            ` : ''}

            <!-- Quick import: magnet or .torrent -->
            <div
              style="${'background:#fff;border:2px dashed ' + (state.dragOver ? '#5cb85c' : '#ccc') + ';padding:14px;margin-bottom:10px;text-align:center;transition:border-color 0.15s'}"
              ondragover="${function(e) { e.preventDefault(); state.dragOver = true; renderUI() }}"
              ondragleave="${function() { state.dragOver = false; renderUI() }}"
              ondrop="${function(e) {
                e.preventDefault(); state.dragOver = false
                var file = e.dataTransfer.files[0]
                if (file && file.name.endsWith('.torrent')) handleTorrentFile(file)
                else { state.error = 'Please drop a .torrent file'; renderUI() }
              }}"
            >
              <div style="font-size:11px;font-weight:700;color:#666;margin-bottom:8px">\u{26A1} Quick Import</div>
              <div style="display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap">
                <input
                  type="text"
                  placeholder="Paste magnet:?xt=urn:btih:..."
                  value="${state.magnetInput}"
                  oninput="${function(e) { state.magnetInput = e.target.value }}"
                  onpaste="${function(e) {
                    setTimeout(function() {
                      if (state.magnetInput.indexOf('magnet:?') === 0) handleMagnet()
                    }, 50)
                  }}"
                  style="flex:1;min-width:200px;padding:5px 8px;border:1px solid #ccc;border-radius:3px;font-size:11px;font-family:Consolas,monospace;outline:none"
                />
                <button onclick="${function() { handleMagnet() }}" style="padding:5px 12px;background:#f0ad4e;color:#fff;border:none;border-radius:3px;font-size:11px;font-weight:700;cursor:pointer">\u{1F9F2} Parse</button>
                <span style="font-size:10px;color:#aaa">or</span>
                <label style="padding:5px 12px;background:#5bc0de;color:#fff;border-radius:3px;font-size:11px;font-weight:700;cursor:pointer">
                  \u{1F4C1} .torrent
                  <input type="file" accept=".torrent" style="display:none"
                    onchange="${function(e) { if (e.target.files[0]) handleTorrentFile(e.target.files[0]) }}" />
                </label>
              </div>
              <div style="font-size:9px;color:#aaa;margin-top:6px">Drop a .torrent file here, paste a magnet link, or fill the form manually</div>
            </div>

            <!-- Form -->
            <div style="${'background:#fff;border:1px solid #ccc;padding:14px' + (!loggedIn ? ';opacity:0.5;pointer-events:none' : '')}">

              <!-- Title -->
              <label style="display:block;margin-bottom:10px">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                  <span style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px">Title</span>
                  <span style="font-size:10px;color:#d9534f">*</span>
                  ${state.title.trim() ? html`<span style="font-size:11px;color:#5cb85c">\u2713</span>` : ''}
                </div>
                <input type="text" value="${state.title}" oninput="${function(e) { state.title = e.target.value; renderUI() }}"
                  placeholder="e.g. Ubuntu 24.04 LTS Desktop amd64"
                  style="${'width:100%;padding:6px 10px;border:1px solid ' + (state.title.trim() ? '#5cb85c' : '#ccc') + ';border-radius:3px;font-size:13px;font-family:Verdana,sans-serif;outline:none'}" />
              </label>

              <!-- Info Hash -->
              <label style="display:block;margin-bottom:10px">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                  <span style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px">Info Hash</span>
                  <span style="font-size:10px;color:#d9534f">*</span>
                  ${state.infohash.trim() ? html`<span style="${'font-size:11px;color:' + (hashValid ? '#5cb85c' : '#d9534f')}">${hashValid ? '\u2713 valid' : '\u2717 need 40 hex chars (' + state.infohash.trim().length + '/40)'}</span>` : ''}
                </div>
                <input type="text" value="${state.infohash}" oninput="${function(e) { state.infohash = e.target.value; renderUI() }}"
                  placeholder="40-character hex (SHA-1)"
                  style="${'width:100%;padding:6px 10px;border:1px solid ' + (state.infohash.trim() ? (hashValid ? '#5cb85c' : '#d9534f') : '#ccc') + ';border-radius:3px;font-size:12px;font-family:Consolas,monospace;outline:none'}" />
              </label>

              <!-- Categories (chips) -->
              <div style="margin-bottom:10px">
                <div style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Categories</div>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  ${QUICK_CATS.map(function(cat) {
                    var active = state.categories.indexOf(cat) >= 0
                    return html`
                      <button
                        onclick="${function() { toggleCat(cat); }}"
                        style="${'padding:3px 10px;border-radius:3px;font-size:10px;font-weight:' + (active ? '700' : '400') + ';cursor:pointer;border:1px solid ' + (active ? '#5cb85c' : '#ddd') + ';background:' + (active ? '#dff0d8' : '#fafafa') + ';color:' + (active ? '#3c763d' : '#888') + ';font-family:Verdana,sans-serif'}"
                      >${cat}</button>
                    `
                  })}
                </div>
                ${state.categories.length > 0 ? html`<div style="font-size:10px;color:#5cb85c;margin-top:3px">\u2713 ${state.categories.join(', ')}</div>` : ''}
              </div>

              <!-- Description -->
              <label style="display:block;margin-bottom:10px">
                <div style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Description</div>
                <textarea oninput="${function(e) { state.description = e.target.value }}"
                  placeholder="Optional description..."
                  style="width:100%;height:60px;padding:6px 10px;border:1px solid #ccc;border-radius:3px;font-size:12px;font-family:Verdana,sans-serif;outline:none;resize:vertical">${state.description}</textarea>
              </label>

              <!-- Files -->
              <label style="display:block;margin-bottom:10px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
                  <span style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px">Files</span>
                  <span style="font-size:10px;color:#aaa">filename size_bytes, one per line</span>
                </div>
                <textarea oninput="${function(e) { state.filesRaw = e.target.value; parseFilesText(e.target.value); renderUI() }}"
                  placeholder="ubuntu-24.04-desktop-amd64.iso 4071903232"
                  style="width:100%;height:50px;padding:6px 10px;border:1px solid #ccc;border-radius:3px;font-size:11px;font-family:Consolas,monospace;outline:none;resize:vertical">${state.filesRaw}</textarea>
                ${state.filesParsed.length > 0 ? html`
                  <div style="font-size:10px;color:#5cb85c;margin-top:3px">\u{1F4C1} ${state.filesParsed.length} files \u2022 ${formatSize(state.filesTotalSize)} total</div>
                ` : ''}
              </label>

              <!-- Trackers -->
              <label style="display:block;margin-bottom:14px">
                <div style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Trackers <span style="color:#aaa;font-weight:400">(blank = defaults)</span></div>
                <textarea oninput="${function(e) { state.trackers = e.target.value }}"
                  placeholder="Leave blank for default trackers"
                  style="width:100%;height:40px;padding:6px 10px;border:1px solid #ccc;border-radius:3px;font-size:11px;font-family:Consolas,monospace;outline:none;resize:vertical">${state.trackers}</textarea>
              </label>

              <!-- Preview toggle -->
              <div style="margin-bottom:12px">
                <a href="javascript:void(0)" onclick="${function() { state.showPreview = !state.showPreview; renderUI() }}" style="font-size:11px;color:#1a0dab">${state.showPreview ? '\u25BC Hide' : '\u25B6 Preview'} NIP-35 event JSON</a>
                ${state.showPreview ? html`
                  <pre style="margin-top:6px;padding:8px 10px;background:#f8f8f0;border:1px solid #ddd;border-radius:3px;font-size:10px;font-family:Consolas,monospace;color:#555;overflow-x:auto;max-height:200px;white-space:pre-wrap">${getPreviewJSON()}</pre>
                ` : ''}
              </div>

              <!-- Submit -->
              <button
                onclick="${function() { doPublish() }}"
                style="${'padding:8px 24px;font-size:13px;font-weight:700;border:none;border-radius:3px;cursor:' + (ready ? 'pointer' : 'default') + ';font-family:Verdana,sans-serif;background:' + (ready ? '#5cb85c' : '#ccc') + ';color:' + (ready ? '#fff' : '#888')}"
              >${state.publishing ? '\u23F3 Publishing...' : '\u{1F4E4} Sign & Publish'}</button>

              ${!titleValid && state.title !== undefined ? html`<span style="font-size:10px;color:#d9534f;margin-left:8px">Title required</span>` : ''}
              ${state.infohash.trim() && !hashValid ? html`<span style="font-size:10px;color:#d9534f;margin-left:8px">Invalid hash</span>` : ''}
            </div>

            <div style="text-align:center;padding:16px 0;font-size:10px;color:#aaa">
              xlogin \u2022 NIP-07 \u2022 NIP-35 \u2022 <a href="https://losos.org" style="color:#999;font-size:10px">LOSOS</a>
            </div>
            <div style="text-align:center;padding:0 0 8px;font-size:10px;color:#888;max-width:500px;margin:0 auto;line-height:1.5">
              Educational protocol demo. Published events are broadcast to public Nostr relays.
              Users are responsible for the content they publish and compliance with applicable laws.
            </div>
          </div>
        </div>
      `)
    }

    setTimeout(renderUI, 0)
    onUnmount(container, function() {
      document.removeEventListener('xlogin', onAuth)
      document.removeEventListener('xlogout', onAuth)
    })
  }
}
