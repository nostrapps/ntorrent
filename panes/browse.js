import { createStore } from '../losos/store.js'
import { html, render, onUnmount, keyed } from '../losos/html.js'

var catIcons = {
  movie:'Vid', video:'Vid', tv:'Vid', music:'Aud', audio:'Aud',
  game:'Gam', games:'Gam', software:'App', app:'App', ebook:'Othr',
  book:'Othr', books:'Othr', anime:'Vid', linux:'App', iso:'App',
  porn:'Othr', xxx:'Othr'
}

function getCat(cats) {
  if (!cats) return 'Othr'
  var lower = cats.toLowerCase()
  for (var k in catIcons) { if (lower.indexOf(k) >= 0) return catIcons[k] }
  return 'Othr'
}

function getCatColor(cat) {
  return { Vid:'#d9534f', Aud:'#5bc0de', Gam:'#5cb85c', App:'#f0ad4e', Othr:'#999' }[cat] || '#999'
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '-'
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KiB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MiB'
  return (bytes / 1073741824).toFixed(2) + ' GiB'
}

function fmtDate(ts) {
  if (!ts) return '-'
  var d = new Date(ts)
  var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  var m = d.getMinutes()
  return mo[d.getMonth()] + ' ' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

export default {
  label: 'Browse',
  icon: '\u{1F50D}',

  canHandle(subject, store) {
    var node = store.get(subject.value)
    var type = store.type(node)
    return type && type.includes('TorrentFeed')
  },

  render(subject, lionStore, container, rawData) {
    var data = rawData
    var store = createStore(data, { debounce: 500 })
    var root = store.get('#this')

    var state = { search: '', category: '', sortBy: 'date', page: 0, pageSize: 50, selected: null }

    function getCategories() {
      var torrents = store.propAll(root, 'torrent')
      var cats = {}
      torrents.forEach(function(t) {
        if (!t.categories) return
        t.categories.split(',').forEach(function(c) { c = c.trim().toLowerCase(); if (c) cats[c] = (cats[c] || 0) + 1 })
      })
      return Object.keys(cats).map(function(k) { return { name: k, count: cats[k] } })
        .sort(function(a, b) { return b.count - a.count }).slice(0, 12)
    }

    function getFiltered() {
      var torrents = store.propAll(root, 'torrent')
      var filtered = torrents.filter(function(t) {
        if (state.category && (t.categories || '').toLowerCase().indexOf(state.category) === -1) return false
        if (state.search) {
          var q = state.search.toLowerCase()
          if (((t.name || '') + ' ' + (t.categories || '') + ' ' + (t.desc || '')).toLowerCase().indexOf(q) === -1) return false
        }
        return true
      })
      if (state.sortBy === 'date') filtered.sort(function(a, b) { return (b.created || 0) - (a.created || 0) })
      else if (state.sortBy === 'size') filtered.sort(function(a, b) { return (b.totalSize || 0) - (a.totalSize || 0) })
      else if (state.sortBy === 'name') filtered.sort(function(a, b) { return (a.name || '').localeCompare(b.name || '') })
      else if (state.sortBy === 'files') filtered.sort(function(a, b) { return (b.fileCount || 0) - (a.fileCount || 0) })
      return filtered
    }

    function renderApp() {
      var allTorrents = store.propAll(root, 'torrent')
      var categories = getCategories()
      var filtered = getFiltered()
      var paged = filtered.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize)
      var totalPages = Math.ceil(filtered.length / state.pageSize)
      var selected = state.selected ? store.get(state.selected) : null

      render(container, html`
        <div style="font-family:Verdana,Geneva,sans-serif;font-size:13px;background:#f5f5f5;min-height:100vh">

          <!-- Header -->
          <div style="background:linear-gradient(180deg,#3b3b3b 0%,#2a2a2a 100%);padding:14px 20px;text-align:center">
            <div style="max-width:960px;margin:0 auto">
              <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:1px;margin-bottom:2px">\u{1F426} Nostr Torrent Browser</div>
              <div style="font-size:10px;color:#999;letter-spacing:2px;text-transform:uppercase">NIP-35 protocol demo \u2022 Read-only relay client</div>
            </div>
          </div>

          <!-- Search -->
          <div style="background:#454545;padding:10px 20px;text-align:center">
            <div style="max-width:960px;margin:0 auto;display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap">
              <input
                type="text"
                placeholder="Search torrents..."
                value="${state.search}"
                oninput="${function(e) { state.search = e.target.value; state.page = 0; state.selected = null; renderApp() }}"
                style="width:400px;max-width:100%;padding:6px 10px;border:1px solid #666;border-radius:3px;background:#fff;color:#333;font-size:13px;font-family:Verdana,sans-serif;outline:none"
              />
              <select
                style="padding:6px 8px;border:1px solid #666;border-radius:3px;background:#fff;color:#333;font-size:11px;cursor:pointer;font-family:Verdana,sans-serif"
                onchange="${function(e) { state.sortBy = e.target.value; renderApp() }}"
              >
                <option value="date" selected="${state.sortBy === 'date'}">Newest</option>
                <option value="size" selected="${state.sortBy === 'size'}">Size</option>
                <option value="files" selected="${state.sortBy === 'files'}">Files</option>
                <option value="name" selected="${state.sortBy === 'name'}">Name</option>
              </select>
            </div>
          </div>

          <!-- Category nav -->
          <div style="background:#555;padding:6px 20px;text-align:center;border-bottom:2px solid #333">
            <div style="max-width:960px;margin:0 auto;display:flex;gap:2px;justify-content:center;flex-wrap:wrap">
              <a
                href="javascript:void(0)"
                onclick="${function() { state.category = ''; state.page = 0; renderApp() }}"
                style="${'padding:3px 10px;font-size:11px;text-decoration:none;border-radius:2px;color:' + (state.category === '' ? '#fff' : '#ccc') + ';background:' + (state.category === '' ? '#333' : 'transparent') + ';font-weight:' + (state.category === '' ? '700' : '400')}"
              >All (${allTorrents.length})</a>
              ${categories.map(function(c) {
                var active = state.category === c.name
                return html`
                  <a
                    href="javascript:void(0)"
                    onclick="${function() { state.category = active ? '' : c.name; state.page = 0; renderApp() }}"
                    style="${'padding:3px 10px;font-size:11px;text-decoration:none;border-radius:2px;color:' + (active ? '#fff' : '#ccc') + ';background:' + (active ? '#333' : 'transparent') + ';font-weight:' + (active ? '700' : '400')}"
                  >${c.name} (${c.count})</a>
                `
              })}
            </div>
          </div>

          <div style="max-width:960px;margin:0 auto;padding:10px">
            <div style="font-size:11px;color:#777;margin-bottom:6px">${filtered.length} results${state.search ? ' for "' + state.search + '"' : ''}</div>

            ${selected ? renderDetail(selected) : ''}

            <!-- Table header -->
            <div style="display:flex;background:#444;color:#ddd;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #999;border-bottom:none">
              <div style="width:42px;padding:5px 6px;text-align:center;border-right:1px solid #555">Type</div>
              <div style="flex:1;padding:5px 8px;border-right:1px solid #555">Name</div>
              <div style="width:80px;padding:5px 6px;text-align:center;border-right:1px solid #555">Date</div>
              <div style="width:70px;padding:5px 6px;text-align:center;border-right:1px solid #555">Size</div>
              <div style="width:40px;padding:5px 6px;text-align:center">DL</div>
            </div>

            <!-- Table rows -->
            ${keyed(paged, function(t) { return t['@id'] }, function(t, idx) {
              var isSelected = state.selected === t['@id']
              var cat = getCat(t.categories)
              var catColor = getCatColor(cat)
              var rowBg = isSelected ? '#ffffcc' : (idx % 2 === 0 ? '#fff' : '#f1f1f1')
              return html`
                <div
                  style="${'display:flex;border:1px solid #ccc;border-bottom:none;cursor:pointer;background:' + rowBg}"
                  onclick="${function() { state.selected = isSelected ? null : t['@id']; renderApp() }}"
                >
                  <div style="${'width:42px;padding:4px 4px;text-align:center;border-right:1px solid #ddd;font-size:9px;font-weight:700;color:#fff;background:' + catColor}">${cat}</div>
                  <div style="flex:1;padding:4px 8px;min-width:0">
                    <div style="font-size:12px;color:#1a0dab;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:400">${t.name}</div>
                    <div style="font-size:10px;color:#888;margin-top:1px">
                      ${t.categories ? t.categories : ''} ${t.fileCount ? '\u2022 ' + t.fileCount + ' files' : ''}
                    </div>
                  </div>
                  <div style="width:80px;padding:6px 4px;text-align:center;border-left:1px solid #ddd;font-size:10px;color:#666">${fmtDate(t.created)}</div>
                  <div style="width:70px;padding:6px 4px;text-align:center;border-left:1px solid #ddd;font-size:10px;color:#666">${formatSize(t.totalSize)}</div>
                  <div style="width:40px;padding:4px 4px;text-align:center;border-left:1px solid #ddd">
                    <a
                      href="${t.magnet}"
                      onclick="${function(e) { e.stopPropagation() }}"
                      title="Magnet link"
                      style="display:inline-block;font-size:14px;text-decoration:none"
                    >\u{1F9F2}</a>
                  </div>
                </div>
              `
            })}
            <div style="border-top:1px solid #ccc"></div>

            ${filtered.length === 0 ? html`
              <div style="text-align:center;padding:40px;color:#999">No torrents found.</div>
            ` : ''}

            <!-- Pagination -->
            ${totalPages > 1 ? html`
              <div style="text-align:center;padding:12px 0;font-size:11px">
                ${state.page > 0 ? html`<a href="javascript:void(0)" onclick="${function() { state.page--; state.selected = null; renderApp() }}" style="margin:0 6px">&lt; Prev</a>` : html`<span style="color:#ccc;margin:0 6px">&lt; Prev</span>`}
                <span style="color:#666">Page ${state.page + 1} of ${totalPages}</span>
                ${state.page < totalPages - 1 ? html`<a href="javascript:void(0)" onclick="${function() { state.page++; state.selected = null; renderApp() }}" style="margin:0 6px">Next &gt;</a>` : html`<span style="color:#ccc;margin:0 6px">Next &gt;</span>`}
              </div>
            ` : ''}

            <div style="text-align:center;padding:16px 0;font-size:10px;color:#aaa;border-top:1px solid #ddd;margin-top:8px">
              NIP-35 protocol demo \u2022 <a href="https://losos.org" style="color:#999;font-size:10px">LOSOS</a> \u2022 <a href="https://nostrcg.github.io/did-nostr/" style="color:#999;font-size:10px">did:nostr</a>
            </div>
            <div style="text-align:center;padding:0 0 12px;font-size:10px;color:#888;max-width:500px;margin:0 auto;line-height:1.5">
              This is a read-only Nostr relay client for educational and research purposes. It displays publicly
              available NIP-35 events from the Nostr network. It does not host, store, seed, or index any content.
              Users are responsible for compliance with applicable laws in their jurisdiction.
            </div>
          </div>
        </div>
      `)
    }

    function renderDetail(t) {
      var fileList = (t.files || '').split('\n').filter(Boolean)
      var trackerList = (t.trackers || '').split('\n').filter(Boolean)

      return html`
        <div style="background:#fffff0;border:1px solid #cba;padding:12px 14px;margin-bottom:8px;position:relative">
          <a
            href="javascript:void(0)"
            onclick="${function(e) { e.stopPropagation(); state.selected = null; renderApp() }}"
            style="position:absolute;top:8px;right:10px;color:#999;text-decoration:none;font-size:14px;font-weight:700"
          >[x]</a>

          <div style="font-size:14px;font-weight:700;color:#333;margin-bottom:6px">${t.name}</div>

          <table style="font-size:11px;color:#555;border-collapse:collapse;margin-bottom:8px">
            <tr><td style="padding:2px 10px 2px 0;color:#888;font-weight:700">Size:</td><td>${formatSize(t.totalSize)}</td></tr>
            <tr><td style="padding:2px 10px 2px 0;color:#888;font-weight:700">Files:</td><td>${t.fileCount || 0}</td></tr>
            <tr><td style="padding:2px 10px 2px 0;color:#888;font-weight:700">Date:</td><td>${t.created ? new Date(t.created).toLocaleString() : '-'}</td></tr>
            ${t.categories ? html`<tr><td style="padding:2px 10px 2px 0;color:#888;font-weight:700">Tags:</td><td>${t.categories}</td></tr>` : ''}
            <tr><td style="padding:2px 10px 2px 0;color:#888;font-weight:700">Hash:</td><td style="font-family:Consolas,monospace;font-size:10px;word-break:break-all;color:#060">${t.infohash}</td></tr>
          </table>

          <a href="${t.magnet}" style="display:inline-block;padding:5px 14px;background:#5cb85c;color:#fff;text-decoration:none;font-size:12px;font-weight:700;border-radius:3px;margin-bottom:8px">\u{1F9F2} Get this torrent</a>

          ${t.imdb ? html` <a href="${'https://www.imdb.com/title/' + t.imdb}" target="_blank" rel="noopener" style="display:inline-block;padding:5px 10px;background:#f0c040;color:#333;text-decoration:none;font-size:11px;font-weight:700;border-radius:3px;margin-bottom:8px">IMDb</a>` : ''}
          ${t.tmdb ? html` <a href="${'https://www.themoviedb.org/' + t.tmdb.replace(':', '/')}" target="_blank" rel="noopener" style="display:inline-block;padding:5px 10px;background:#01b4e4;color:#fff;text-decoration:none;font-size:11px;font-weight:700;border-radius:3px;margin-bottom:8px">TMDb</a>` : ''}

          ${t.desc ? html`
            <div style="margin-top:6px;padding:8px 10px;background:#fff;border:1px solid #ddd;font-size:11px;color:#555;white-space:pre-wrap;max-height:120px;overflow-y:auto;line-height:1.5">${t.desc}</div>
          ` : ''}

          ${fileList.length > 0 ? html`
            <details style="margin-top:8px">
              <summary style="font-size:11px;font-weight:700;color:#666;cursor:pointer">Files (${fileList.length})</summary>
              <div style="margin-top:4px;padding:6px 8px;background:#fff;border:1px solid #ddd;max-height:150px;overflow-y:auto;font-family:Consolas,monospace;font-size:10px;color:#555">
                ${fileList.map(function(f) {
                  return html`<div style="padding:1px 0">${f}</div>`
                })}
              </div>
            </details>
          ` : ''}

          ${trackerList.length > 0 ? html`
            <details style="margin-top:4px">
              <summary style="font-size:11px;font-weight:700;color:#666;cursor:pointer">Trackers (${trackerList.length})</summary>
              <div style="margin-top:4px;font-family:Consolas,monospace;font-size:10px;color:#888">
                ${trackerList.map(function(tr) { return html`<div>${tr}</div>` })}
              </div>
            </details>
          ` : ''}
        </div>
      `
    }

    var unsub = store.onChange(renderApp)
    setTimeout(renderApp, 0)
    onUnmount(container, unsub)
  }
}
