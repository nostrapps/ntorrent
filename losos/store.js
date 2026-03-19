/**
 * LOSOS Reactive Store — v1
 * Mutable JSON-LD graph with dirty tracking and debounced HTTP PUT.
 * ~2KB. No dependencies.
 */

export function createStore(jsonLd, options) {
  options = options || {}
  var url = options.url || null
  var doFetch = options.authFetch || fetch
  var debounceMs = options.debounce || 1000
  var nodes = new Map()
  var context = jsonLd['@context'] || {}
  var dirty = false
  var timer = null
  var listeners = []
  var ws = null
  var wsDelay = 1000

  function connectWs(wsUrl) {
    if (ws) return
    try {
      ws = new WebSocket(wsUrl)
      ws.onopen = function() {
        ws.send('sub ' + url)
        wsDelay = 1000
      }
      ws.onmessage = function(e) {
        if (e.data.startsWith('pub ') && !dirty) {
          store.reload()
        }
      }
      ws.onclose = function() {
        ws = null
        setTimeout(function() { connectWs(wsUrl) }, wsDelay)
        wsDelay = Math.min(wsDelay * 2, 30000)
      }
      ws.onerror = function() { ws.close() }
    } catch (e) { ws = null }
  }

  // Index all nodes by @id
  function index(obj) {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) { obj.forEach(index); return }
    var id = obj['@id']
    if (id) nodes.set(id, obj)
    Object.keys(obj).forEach(function(k) {
      if (k.startsWith('@')) return
      var v = obj[k]
      if (Array.isArray(v)) v.forEach(index)
      else if (v && typeof v === 'object') index(v)
    })
  }
  index(jsonLd)

  function resolveKey(node, key) {
    if (node[key] !== undefined) return key
    for (var k in node) {
      if (k === key) return k
      if (k.endsWith(':' + key) || k.endsWith('/' + key) || k.endsWith('#' + key)) return k
    }
    return null
  }

  function markDirty() {
    dirty = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(function() { store.save() }, debounceMs)
    notify()
  }

  function notify() {
    listeners.forEach(function(fn) { fn() })
  }

  var store = {
    get: function(id) {
      return nodes.get(id) || null
    },

    prop: function(node, key) {
      if (!node) return null
      var k = resolveKey(node, key)
      return k ? node[k] : null
    },

    propAll: function(node, key) {
      var val = store.prop(node, key)
      if (val == null) return []
      return Array.isArray(val) ? val : [val]
    },

    type: function(node) {
      return node ? (node['@type'] || null) : null
    },

    set: function(node, key, value) {
      if (!node) return
      var k = resolveKey(node, key) || key
      if (node[k] === value) return
      node[k] = value
      if (value && typeof value === 'object') index(value)
      markDirty()
    },

    unset: function(node, key) {
      if (!node) return
      var k = resolveKey(node, key)
      if (k) { delete node[k]; markDirty() }
    },

    push: function(node, key, value) {
      if (!node) return
      var k = resolveKey(node, key) || key
      if (!Array.isArray(node[k])) node[k] = node[k] ? [node[k]] : []
      node[k].push(value)
      if (value && typeof value === 'object') index(value)
      markDirty()
    },

    remove: function(node, key, fn) {
      if (!node) return
      var k = resolveKey(node, key)
      if (!k || !Array.isArray(node[k])) return
      node[k] = node[k].filter(function(item) { return !fn(item) })
      markDirty()
    },

    reorder: function(node, key, fromIdx, toIdx) {
      if (!node) return
      var k = resolveKey(node, key)
      if (!k || !Array.isArray(node[k])) return
      var arr = node[k]
      var item = arr.splice(fromIdx, 1)[0]
      arr.splice(toIdx, 0, item)
      markDirty()
    },

    toJSON: function() {
      return JSON.stringify(jsonLd, null, 2)
    },

    save: function() {
      if (!dirty || !url) return Promise.resolve()
      dirty = false
      if (timer) { clearTimeout(timer); timer = null }
      return doFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/ld+json' },
        body: store.toJSON()
      }).then(function(res) {
        if (res && res.headers && !ws) {
          var wsUrl = res.headers.get('Updates-Via')
          if (wsUrl) connectWs(wsUrl)
        }
      }).catch(function(err) {
        console.warn('Save failed:', err)
        dirty = true
      })
    },

    reload: function() {
      if (!url) return Promise.resolve()
      return doFetch(url, {
        headers: { 'Accept': 'application/ld+json' }
      }).then(function(res) { return res.json() })
        .then(function(newData) {
          Object.keys(newData).forEach(function(k) {
            if (k !== '@context') jsonLd[k] = newData[k]
          })
          nodes.clear()
          index(jsonLd)
          notify()
        })
        .catch(function(err) { console.warn('Reload failed:', err) })
    },

    onChange: function(fn) {
      listeners.push(fn)
      return function() {
        listeners = listeners.filter(function(f) { return f !== fn })
      }
    },

    get dirty() { return dirty },
    get data() { return jsonLd },
    get context() { return context }
  }

  if (url) {
    doFetch(url, { method: 'HEAD' }).then(function(res) {
      if (res && res.headers) {
        var wsUrl = res.headers.get('Updates-Via')
        if (wsUrl) connectWs(wsUrl)
      }
    }).catch(function() {})
  }

  return store
}
