var WebSocket = require('ws')

var DEFAULT_RELAYS = [
  'wss://nos.lol/',
  'wss://relay.damus.io/',
  'wss://nostr.mom/',
  'wss://relay.primal.net/',
  'wss://relay.mostr.pub/'
]

var DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337',
  'udp://tracker.openbittorrent.com:6969',
  'udp://open.stealth.si:80',
  'udp://tracker.torrent.eu.org:451'
]

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KiB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MiB'
  return (bytes / 1073741824).toFixed(2) + ' GiB'
}

function parseEvent(ev) {
  if (ev.kind !== 2003) return null
  var tags = ev.tags || []
  var title = '', infohash = '', files = [], trackers = [], cats = [], extRefs = {}, totalSize = 0

  tags.forEach(function(tag) {
    if (tag[0] === 'title' && tag[1]) title = tag[1]
    else if ((tag[0] === 'x' || tag[0] === 'btih') && tag[1]) infohash = tag[1]
    else if (tag[0] === 'file' && tag[1]) {
      var size = parseInt(tag[2]) || 0
      files.push({ name: tag[1], size: size })
      totalSize += size
    }
    else if (tag[0] === 'tracker' && tag[1]) trackers.push(tag[1])
    else if (tag[0] === 't' && tag[1]) cats.push(tag[1])
    else if (tag[0] === 'i' && tag[1]) {
      var parts = tag[1].split(':')
      var prefix = parts[0]
      var val = parts.slice(1).join(':')
      if (prefix === 'tcat') cats = cats.concat(val.split(','))
      else extRefs[prefix] = val
    }
  })

  if (!infohash) return null
  var trk = trackers.length > 0 ? trackers : DEFAULT_TRACKERS
  var magnet = 'magnet:?xt=urn:btih:' + infohash
  if (title) magnet += '&dn=' + encodeURIComponent(title)
  trk.forEach(function(t) { magnet += '&tr=' + encodeURIComponent(t) })

  return {
    name: title || 'Untitled',
    infohash: infohash,
    desc: ev.content || '',
    author: ev.pubkey ? ev.pubkey.slice(0, 16) : '',
    created: (ev.created_at || 0) * 1000,
    files: files,
    fileCount: files.length,
    totalSize: totalSize,
    magnet: magnet,
    categories: cats.filter(function(c, i, a) { return c && a.indexOf(c) === i }).join(', '),
    imdb: extRefs.imdb || '',
    tmdb: extRefs.tmdb || '',
    eventId: ev.id
  }
}

function fetchTorrents(options) {
  options = options || {}
  var relays = options.relays || DEFAULT_RELAYS
  var limit = options.limit || 500
  var timeout = options.timeout || 15000
  var onProgress = options.onProgress || function() {}

  return new Promise(function(resolve) {
    var seen = {}
    var torrents = []
    var relayStats = {}
    var connected = 0
    var eoseCount = 0
    var resolved = false
    var sockets = []

    relays.forEach(function(r) {
      relayStats[r] = { url: r, status: 'connecting', events: 0, unique: 0, dupes: 0, latencyMs: 0, errors: 0 }
    })

    function finish() {
      if (resolved) return
      resolved = true
      sockets.forEach(function(ws) { try { ws.close() } catch(e) {} })
      torrents.sort(function(a, b) { return (b.created || 0) - (a.created || 0) })
      resolve({ torrents: torrents, relayStats: relayStats })
    }

    relays.forEach(function(url) {
      var rs = relayStats[url]
      var t0 = Date.now()
      var ws
      try { ws = new WebSocket(url) } catch(e) { rs.status = 'error'; rs.errors++; return }
      sockets.push(ws)

      ws.on('open', function() {
        connected++
        rs.status = 'connected'
        rs.latencyMs = Date.now() - t0
        ws.send(JSON.stringify(['REQ', 'browse', { kinds: [2003], limit: limit }]))
        onProgress({ type: 'connected', relay: url, connected: connected, total: relays.length })
      })

      ws.on('message', function(data) {
        try {
          var msg = JSON.parse(data)
          if (msg[0] === 'EVENT' && msg[2]) {
            rs.events++
            if (!seen[msg[2].id]) {
              seen[msg[2].id] = true
              rs.unique++
              var t = parseEvent(msg[2])
              if (t) {
                torrents.push(t)
                onProgress({ type: 'event', count: torrents.length })
              }
            } else { rs.dupes++ }
          } else if (msg[0] === 'EOSE') {
            rs.status = 'done'
            eoseCount++
            if (eoseCount >= connected) finish()
          }
        } catch(err) {}
      })

      ws.on('error', function() {
        rs.status = 'error'
        rs.errors++
        eoseCount++
        if (eoseCount >= relays.length && !resolved) finish()
      })

      ws.on('close', function() {
        if (rs.status === 'connected') rs.status = 'closed'
        if (!resolved && eoseCount >= connected) finish()
      })
    })

    setTimeout(function() {
      if (!resolved) {
        if (torrents.length > 0) finish()
        else {
          resolved = true
          sockets.forEach(function(ws) { try { ws.close() } catch(e) {} })
          resolve({ torrents: [], relayStats: relayStats })
        }
      }
    }, timeout)
  })
}

module.exports = {
  DEFAULT_RELAYS: DEFAULT_RELAYS,
  DEFAULT_TRACKERS: DEFAULT_TRACKERS,
  formatSize: formatSize,
  parseEvent: parseEvent,
  fetchTorrents: fetchTorrents
}
