#!/usr/bin/env node

/**
 * Publish Bitcoin UTXO snapshot torrents as NIP-35 events
 *
 * Source: https://bitcoin-snapshots.jaonoctus.dev/
 *
 * Usage:
 *   node scripts/publish-utxo-snapshots.js [--dry-run]
 *
 * Reads nostr.privkey from git config for signing.
 */

var { execSync } = require('child_process')
var { finalizeEvent } = require('nostr-tools/pure')
var WebSocket = require('ws')

var RELAYS = [
  'wss://nos.lol/',
  'wss://relay.damus.io/',
  'wss://nostr.mom/',
  'wss://relay.primal.net/',
  'wss://relay.mostr.pub/'
]

var TORRENTS = [
  // Mainnet
  {
    title: 'Bitcoin UTXO Snapshot — Block 935,000 (v31.0+)',
    infohash: '3492d082655d173d3459f7a5e454f3dd4ed0101b',
    file: 'utxo-935000.dat',
    size: 20951449,
    trackers: ['udp://tracker.bitcoin.sprovoost.nl:6969', 'udp://tracker.opentrackr.org:1337/announce'],
    network: 'btc',
    block: 935000,
    coreVersion: '31.0',
    desc: 'AssumeUTXO chainstate snapshot at block 935,000 for Bitcoin Core v31.0+. Enables fast initial sync by loading a verified UTXO set directly.\n\nSource: https://bitcoin-snapshots.jaonoctus.dev/'
  },
  {
    title: 'Bitcoin UTXO Snapshot — Block 910,000 (v30.0+)',
    infohash: '7019437a2b1530624b100c0795cfc5f90b8322ca',
    file: 'utxo-910000.dat',
    size: 20865843,
    trackers: [],
    network: 'btc',
    block: 910000,
    coreVersion: '30.0',
    desc: 'AssumeUTXO chainstate snapshot at block 910,000 for Bitcoin Core v30.0+. Enables fast initial sync by loading a verified UTXO set directly.\n\nSource: https://bitcoin-snapshots.jaonoctus.dev/'
  },
  {
    title: 'Bitcoin UTXO Snapshot — Block 880,000 (v29.0+)',
    infohash: '559bd78170502971e15e97d7572e4c824f033492',
    file: 'utxo-880000.dat',
    size: 20771021,
    trackers: [],
    network: 'btc',
    block: 880000,
    coreVersion: '29.0',
    desc: 'AssumeUTXO chainstate snapshot at block 880,000 for Bitcoin Core v29.0+. Enables fast initial sync by loading a verified UTXO set directly.\n\nSource: https://bitcoin-snapshots.jaonoctus.dev/'
  },
  {
    title: 'Bitcoin UTXO Snapshot — Block 840,000 (v28.0+)',
    infohash: '596c26cc709e213fdfec997183ff67067241440c',
    file: 'utxo-840000.dat',
    size: 20645478,
    trackers: [],
    network: 'btc',
    block: 840000,
    coreVersion: '28.0',
    desc: 'AssumeUTXO chainstate snapshot at block 840,000 for Bitcoin Core v28.0+. Enables fast initial sync by loading a verified UTXO set directly.\n\nSource: https://bitcoin-snapshots.jaonoctus.dev/'
  },

  // Testnet4
  {
    title: 'Bitcoin Testnet4 UTXO Snapshot — Block 120,000 (v31.0+)',
    infohash: '25733a7e451ca435f2901921b805c167f560424d',
    file: 'utxo-testnet4-120000.dat',
    size: 6281011,
    trackers: [],
    network: 'tbtc4',
    block: 120000,
    coreVersion: '31.0',
    desc: 'AssumeUTXO chainstate snapshot for Bitcoin testnet4 at block 120,000. Bitcoin Core v31.0+.\n\nSource: https://bitcoin-snapshots.jaonoctus.dev/'
  },
  {
    title: 'Bitcoin Testnet4 UTXO Snapshot — Block 90,000 (v30.0+)',
    infohash: '7bc8da992eccff153c342512e15269c45e8ee6c6',
    file: 'utxo-testnet4-90000.dat',
    size: 4708147,
    trackers: [],
    network: 'tbtc4',
    block: 90000,
    coreVersion: '30.0',
    desc: 'AssumeUTXO chainstate snapshot for Bitcoin testnet4 at block 90,000. Bitcoin Core v30.0+.\n\nSource: https://bitcoin-snapshots.jaonoctus.dev/'
  },

  // Testnet3
  {
    title: 'Bitcoin Testnet3 UTXO Snapshot — Block 4,840,000 (v31.0+)',
    infohash: 'dfe62321ec8e9538a47e4f019d34a88510eaa751',
    file: 'utxo-testnet-4840000.dat',
    size: 22011707,
    trackers: [],
    network: 'tbtc3',
    block: 4840000,
    coreVersion: '31.0',
    desc: 'AssumeUTXO chainstate snapshot for Bitcoin testnet3 at block 4,840,000. Bitcoin Core v31.0+.\n\nSource: https://bitcoin-snapshots.jaonoctus.dev/'
  },
  {
    title: 'Bitcoin Testnet3 UTXO Snapshot — Block 2,500,000 (v26.0+)',
    infohash: '4063ff1580db4923e6dbc3ac6cab3baf4cf19bc4',
    file: 'utxo-testnet-2500000.dat',
    size: 22011707,
    trackers: [],
    network: 'tbtc3',
    block: 2500000,
    coreVersion: '26.0',
    desc: 'AssumeUTXO chainstate snapshot for Bitcoin testnet3 at block 2,500,000. Bitcoin Core v26.0+.\n\nSource: https://bitcoin-snapshots.jaonoctus.dev/'
  },
]

var DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337',
  'udp://tracker.openbittorrent.com:6969',
  'udp://open.stealth.si:80',
  'udp://tracker.torrent.eu.org:451'
]

function buildEvent(torrent) {
  var tags = [
    ['title', torrent.title],
    ['btih', torrent.infohash],
    ['file', torrent.file, String(torrent.size)],
  ]

  var trackers = torrent.trackers.length > 0 ? torrent.trackers : DEFAULT_TRACKERS
  trackers.forEach(function(t) { tags.push(['tracker', t]) })

  tags.push(['t', 'bitcoin'])
  tags.push(['t', 'utxo'])
  tags.push(['t', 'assumeutxo'])
  tags.push(['t', 'snapshot'])
  tags.push(['t', torrent.network])

  tags.push(['i', 'tcat:software'])

  return {
    kind: 2003,
    content: torrent.desc,
    tags: tags,
    created_at: Math.floor(Date.now() / 1000),
  }
}

function publishEvent(event, relay) {
  return new Promise(function(resolve, reject) {
    var ws = new WebSocket(relay)
    var timer = setTimeout(function() {
      ws.close()
      reject(new Error('timeout'))
    }, 10000)

    ws.on('open', function() {
      ws.send(JSON.stringify(['EVENT', event]))
    })

    ws.on('message', function(data) {
      var msg = JSON.parse(data.toString())
      clearTimeout(timer)
      ws.close()
      if (msg[0] === 'OK' && msg[2] === true) resolve({ relay: relay, ok: true })
      else if (msg[0] === 'OK') resolve({ relay: relay, ok: false, reason: msg[3] })
      else resolve({ relay: relay, ok: false, reason: String(msg) })
    })

    ws.on('error', function(err) {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function main() {
  var dryRun = process.argv.includes('--dry-run')

  var skHex
  try {
    skHex = execSync('git config nostr.privkey', { encoding: 'utf8' }).trim()
  } catch {
    console.error('Error: no nostr.privkey in git config')
    console.error('Set with: git config --global nostr.privkey <hex>')
    process.exit(1)
  }
  var sk = Uint8Array.from(Buffer.from(skHex, 'hex'))

  console.log('Publishing', TORRENTS.length, 'UTXO snapshot torrents as NIP-35 events')
  if (dryRun) console.log('  (dry run — not sending to relays)\n')
  else console.log('  to', RELAYS.length, 'relays\n')

  for (var torrent of TORRENTS) {
    var unsigned = buildEvent(torrent)
    var signed = finalizeEvent(unsigned, sk)

    console.log(torrent.network.toUpperCase(), '|', torrent.title)
    console.log('  infohash:', torrent.infohash)
    console.log('  event id:', signed.id)

    if (dryRun) {
      console.log('  tags:', JSON.stringify(signed.tags))
      console.log()
      continue
    }

    var results = await Promise.allSettled(
      RELAYS.map(function(r) { return publishEvent(signed, r) })
    )

    var ok = 0, fail = 0
    results.forEach(function(r) {
      if (r.status === 'fulfilled' && r.value.ok) ok++
      else {
        fail++
        var reason = r.status === 'rejected' ? r.reason.message : (r.value && r.value.reason) || 'unknown'
        console.log('  FAIL', r.status === 'fulfilled' ? r.value.relay : '', reason)
      }
    })
    console.log('  published:', ok + '/' + RELAYS.length)
    console.log()
  }

  console.log('Done.')
}

main()
