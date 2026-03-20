var nostr = require('./nostr')

var catMap = {
  movie: 'Video', video: 'Video', tv: 'Video', anime: 'Video',
  music: 'Audio', audio: 'Audio',
  game: 'Games', games: 'Games',
  software: 'App', app: 'App', linux: 'App', iso: 'App',
  ebook: 'Other', book: 'Other', books: 'Other'
}

function getCat(categories) {
  if (!categories) return 'Other'
  var lower = categories.toLowerCase()
  for (var k in catMap) {
    if (lower.indexOf(k) >= 0) return catMap[k]
  }
  return 'Other'
}

function matchesCat(categories, filter) {
  if (!filter) return true
  filter = filter.toLowerCase()
  var target = { video: 'Video', audio: 'Audio', game: 'Games', games: 'Games', software: 'App', app: 'App', other: 'Other' }[filter] || filter
  return getCat(categories) === target
}

function fmtDate(ts) {
  if (!ts) return '-'
  var d = new Date(ts)
  var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return mo[d.getMonth()] + ' ' + String(d.getDate()).padStart(2, '0')
}

function truncate(str, len) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len - 1) + '\u2026' : str
}

function pad(str, len) {
  str = String(str || '')
  if (str.length >= len) return str.slice(0, len)
  return str + ' '.repeat(len - str.length)
}

function padLeft(str, len) {
  str = String(str || '')
  if (str.length >= len) return str
  return ' '.repeat(len - str.length) + str
}

function formatTable(torrents) {
  var cols = process.stdout.columns || 80
  var nameW = Math.max(20, cols - 38)
  var lines = []

  lines.push(pad('Name', nameW) + pad('Cat', 7) + padLeft('Size', 10) + padLeft('Files', 7) + '  ' + pad('Date', 7))
  lines.push('-'.repeat(Math.min(cols, nameW + 31)))

  torrents.forEach(function(t) {
    lines.push(
      pad(truncate(t.name, nameW), nameW) +
      pad(getCat(t.categories), 7) +
      padLeft(nostr.formatSize(t.totalSize) || '-', 10) +
      padLeft(t.fileCount || '-', 7) +
      '  ' + fmtDate(t.created)
    )
  })

  return lines.join('\n')
}

function formatMagnets(torrents) {
  return torrents.map(function(t) { return t.magnet }).join('\n')
}

function formatJson(torrents) {
  return JSON.stringify(torrents, null, 2)
}

function formatRelayStats(relayStats) {
  var lines = []
  var relays = Object.keys(relayStats).map(function(k) { return relayStats[k] })

  var totalEvents = 0, totalUnique = 0, totalDupes = 0
  relays.forEach(function(r) {
    totalEvents += (r.unique || 0) + (r.dupes || 0)
    totalUnique += r.unique || 0
    totalDupes += r.dupes || 0
  })

  lines.push(pad('Relay', 30) + padLeft('Status', 8) + padLeft('Events', 8) + padLeft('Unique', 8) + padLeft('Dupes', 8) + padLeft('Latency', 9) + padLeft('Uniq%', 7))
  lines.push('-'.repeat(78))

  relays.forEach(function(r) {
    var short = r.url.replace('wss://', '').replace(/\/$/, '')
    var total = (r.unique || 0) + (r.dupes || 0)
    var pct = total > 0 ? Math.round((r.unique / total) * 100) + '%' : '-'
    var lat = r.latencyMs ? r.latencyMs + 'ms' : '-'
    lines.push(
      pad(short, 30) +
      padLeft(r.status, 8) +
      padLeft(total, 8) +
      padLeft(r.unique, 8) +
      padLeft(r.dupes, 8) +
      padLeft(lat, 9) +
      padLeft(pct, 7)
    )
  })

  lines.push('-'.repeat(78))
  var dedupPct = totalEvents > 0 ? Math.round((totalDupes / totalEvents) * 100) + '%' : '-'
  lines.push(
    pad('Total', 30) +
    padLeft('', 8) +
    padLeft(totalEvents, 8) +
    padLeft(totalUnique, 8) +
    padLeft(totalDupes, 8) +
    padLeft('', 9) +
    padLeft(dedupPct, 7)
  )

  return lines.join('\n')
}

module.exports = {
  getCat: getCat,
  matchesCat: matchesCat,
  formatTable: formatTable,
  formatMagnets: formatMagnets,
  formatJson: formatJson,
  formatRelayStats: formatRelayStats
}
