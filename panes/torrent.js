import { createStore } from '../losos/store.js'
import { html, render, onUnmount } from '../losos/html.js'

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '-'
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KiB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MiB'
  return (bytes / 1073741824).toFixed(2) + ' GiB'
}

var catMap = {
  movie:'Video',video:'Video',tv:'Video',music:'Audio',audio:'Audio',
  game:'Games',games:'Games',software:'Applications',app:'Applications',
  ebook:'Other',book:'Other',anime:'Video',linux:'Applications'
}

export default {
  label: 'Stats',
  icon: '\u{1F4CA}',

  canHandle(subject, store) {
    var node = store.get(subject.value)
    var type = store.type(node)
    return type && type.includes('TorrentFeed')
  },

  render(subject, lionStore, container, rawData) {
    var data = rawData
    var store = createStore(data, { debounce: 500 })
    var root = store.get('#this')

    function renderStats() {
      var torrents = store.propAll(root, 'torrent')

      // Category distribution
      var cats = {}
      torrents.forEach(function(t) {
        if (!t.categories) { cats['Other'] = (cats['Other'] || 0) + 1; return }
        var mapped = false
        t.categories.split(',').forEach(function(c) {
          c = c.trim().toLowerCase()
          if (catMap[c]) { cats[catMap[c]] = (cats[catMap[c]] || 0) + 1; mapped = true }
        })
        if (!mapped) cats['Other'] = (cats['Other'] || 0) + 1
      })
      var catList = Object.keys(cats).map(function(k) { return { name: k, count: cats[k] } })
        .sort(function(a, b) { return b.count - a.count })
      var maxCat = catList.length ? catList[0].count : 1
      var catColors = { Video:'#d9534f', Audio:'#5bc0de', Games:'#5cb85c', Applications:'#f0ad4e', Other:'#999' }

      var totalBytes = 0, totalFiles = 0
      var largest = { size: 0, name: '' }

      torrents.forEach(function(t) {
        if (t.totalSize) totalBytes += t.totalSize
        if (t.fileCount) totalFiles += t.fileCount
        if ((t.totalSize || 0) > largest.size) { largest.size = t.totalSize; largest.name = t.name }
      })

      var now = Date.now()
      var days = new Array(30).fill(0)
      torrents.forEach(function(t) {
        if (!t.created) return
        var daysAgo = Math.floor((now - t.created) / 86400000)
        if (daysAgo >= 0 && daysAgo < 30) days[daysAgo]++
      })
      var maxDay = Math.max.apply(null, days) || 1

      var hasImdb = torrents.filter(function(t) { return t.imdb }).length
      var hasTmdb = torrents.filter(function(t) { return t.tmdb }).length

      render(container, html`
        <div style="font-family:Verdana,Geneva,sans-serif;font-size:13px;background:#f5f5f5;min-height:100vh">

          <div style="background:linear-gradient(180deg,#3b3b3b 0%,#2a2a2a 100%);padding:14px 20px;text-align:center">
            <div style="font-size:16px;font-weight:700;color:#fff">\u{1F4CA} Feed Statistics</div>
            <div style="font-size:10px;color:#999;margin-top:2px">${torrents.length} torrent events indexed</div>
          </div>

          <div style="max-width:800px;margin:0 auto;padding:16px">

            <!-- Key numbers -->
            <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #ccc;margin-bottom:12px">
              <tr style="background:#444;color:#ddd;font-size:10px;text-transform:uppercase;letter-spacing:0.5px">
                <th style="padding:6px 10px;text-align:left;font-weight:700;border-right:1px solid #555">Metric</th>
                <th style="padding:6px 10px;text-align:right;font-weight:700">Value</th>
              </tr>
              <tr style="border-bottom:1px solid #eee"><td style="padding:6px 10px;border-right:1px solid #eee">Total torrents</td><td style="padding:6px 10px;text-align:right;font-weight:700">${torrents.length}</td></tr>
              <tr style="background:#f9f9f9;border-bottom:1px solid #eee"><td style="padding:6px 10px;border-right:1px solid #eee">Total data</td><td style="padding:6px 10px;text-align:right;font-weight:700;color:#1a0dab">${formatSize(totalBytes)}</td></tr>
              <tr style="border-bottom:1px solid #eee"><td style="padding:6px 10px;border-right:1px solid #eee">Total files</td><td style="padding:6px 10px;text-align:right;font-weight:700">${totalFiles.toLocaleString()}</td></tr>
              <tr style="background:#f9f9f9;border-bottom:1px solid #eee"><td style="padding:6px 10px;border-right:1px solid #eee">IMDb linked</td><td style="padding:6px 10px;text-align:right;font-weight:700;color:#f0c040">${hasImdb}</td></tr>
              <tr style="border-bottom:1px solid #eee"><td style="padding:6px 10px;border-right:1px solid #eee">TMDb linked</td><td style="padding:6px 10px;text-align:right;font-weight:700;color:#01b4e4">${hasTmdb}</td></tr>
            </table>

            ${largest.size > 0 ? html`
              <div style="background:#fffff0;border:1px solid #cba;padding:8px 12px;margin-bottom:12px;font-size:11px">
                <b>Largest:</b> ${largest.name} <span style="color:#1a0dab;font-weight:700">(${formatSize(largest.size)})</span>
              </div>
            ` : ''}

            <!-- Categories -->
            <div style="background:#fff;border:1px solid #ccc;padding:12px 14px;margin-bottom:12px">
              <div style="font-size:12px;font-weight:700;color:#333;margin-bottom:10px">Categories</div>
              ${catList.map(function(c) {
                var pct = (c.count / maxCat) * 100
                var color = catColors[c.name] || '#999'
                return html`
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
                    <div style="width:90px;font-size:11px;color:#555;text-align:right">${c.name}</div>
                    <div style="flex:1;height:14px;background:#eee;border:1px solid #ddd;overflow:hidden">
                      <div style="${'height:100%;background:' + color + ';width:' + pct + '%'}"></div>
                    </div>
                    <div style="width:30px;font-size:11px;font-weight:700;color:#333;text-align:right">${c.count}</div>
                  </div>
                `
              })}
            </div>

            <!-- Activity -->
            <div style="background:#fff;border:1px solid #ccc;padding:12px 14px">
              <div style="font-size:12px;font-weight:700;color:#333;margin-bottom:10px">Activity (30 days)</div>
              <div style="display:flex;align-items:flex-end;gap:1px;height:50px">
                ${days.map(function(count, d) {
                  var pct = (count / maxDay) * 100
                  return html`
                    <div style="flex:1" title="${d + 'd ago: ' + count}">
                      <div style="${'width:100%;min-height:1px;background:#5cb85c;height:' + Math.max(1, pct) + '%'}"></div>
                    </div>
                  `
                }).reverse()}
              </div>
              <div style="display:flex;justify-content:space-between;font-size:9px;color:#aaa;margin-top:3px">
                <span>30d ago</span><span>today</span>
              </div>
            </div>

            <div style="text-align:center;padding:16px 0;font-size:10px;color:#aaa">
              NIP-35 \u2022 Nostr \u2022 <a href="https://losos.org" style="color:#999;font-size:10px">LOSOS</a>
            </div>
          </div>
        </div>
      `)
    }

    var unsub = store.onChange(renderStats)
    setTimeout(renderStats, 0)
    onUnmount(container, unsub)
  }
}
