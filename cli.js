#!/usr/bin/env node

var nostr = require('./lib/nostr')
var format = require('./lib/format')

var args = process.argv.slice(2)

function getFlag(name) {
  var i = args.indexOf(name)
  if (i === -1) return null
  var val = args[i + 1]
  args.splice(i, val && !val.startsWith('-') ? 2 : 1)
  return val || true
}

function hasFlag(name) {
  var i = args.indexOf(name)
  if (i === -1) return false
  args.splice(i, 1)
  return true
}

if (hasFlag('--help') || hasFlag('-h')) {
  console.log([
    'Usage: ntorrent [command] [options]',
    '',
    'Commands:',
    '  (default)      List latest torrents',
    '  search <q>     Search torrents by name/description',
    '  relays         Show relay statistics',
    '',
    'Options:',
    '  --cat <name>   Filter by category (video, audio, game, software, other)',
    '  --magnet       Output magnet links only',
    '  --json         Output as JSON',
    '  --limit <n>    Max events per relay (default: 500)',
    '  --relay <url>  Use specific relay (repeatable)',
    '  -h, --help     Show this help',
    '',
    'Examples:',
    '  ntorrent                           List latest torrents',
    '  ntorrent search "ubuntu"           Search by name',
    '  ntorrent --cat audio --magnet      Audio magnet links',
    '  ntorrent search linux --json       JSON output',
    '  ntorrent relays                    Relay statistics'
  ].join('\n'))
  process.exit(0)
}

var wantMagnet = hasFlag('--magnet')
var wantJson = hasFlag('--json')
var catFilter = getFlag('--cat')
var limitVal = getFlag('--limit')
var limit = limitVal ? parseInt(limitVal) || 500 : 500

var customRelays = []
var r
while ((r = getFlag('--relay')) && r !== true) customRelays.push(r)

var command = args[0] || ''
var query = ''

if (command === 'search') {
  query = args.slice(1).join(' ')
  if (!query) { console.error('Usage: ntorrent search <query>'); process.exit(1) }
} else if (command === 'relays') {
  // handled below
} else if (command && !command.startsWith('-')) {
  query = args.join(' ')
  command = 'search'
}

var isTTY = process.stderr.isTTY

function progress(ev) {
  if (!isTTY) return
  if (ev.type === 'connected') {
    process.stderr.write('\rConnected to ' + ev.connected + '/' + ev.total + ' relays...')
  } else if (ev.type === 'event') {
    process.stderr.write('\r' + ev.count + ' torrents found...          ')
  }
}

var fetchOpts = { limit: limit, onProgress: progress }
if (customRelays.length > 0) fetchOpts.relays = customRelays

nostr.fetchTorrents(fetchOpts).then(function(result) {
  if (isTTY) process.stderr.write('\r\x1b[K')

  if (command === 'relays') {
    console.log(format.formatRelayStats(result.relayStats))
    process.exit(0)
  }

  var torrents = result.torrents

  if (query) {
    var q = query.toLowerCase()
    torrents = torrents.filter(function(t) {
      return ((t.name || '') + ' ' + (t.categories || '') + ' ' + (t.desc || '')).toLowerCase().indexOf(q) >= 0
    })
  }

  if (catFilter) {
    torrents = torrents.filter(function(t) { return format.matchesCat(t.categories, catFilter) })
  }

  if (torrents.length === 0) {
    if (isTTY) process.stderr.write('No torrents found.\n')
    process.exit(0)
  }

  if (wantJson) {
    console.log(format.formatJson(torrents))
  } else if (wantMagnet) {
    console.log(format.formatMagnets(torrents))
  } else {
    if (isTTY) process.stderr.write(torrents.length + ' results\n')
    console.log(format.formatTable(torrents))
  }

  process.exit(0)
})
