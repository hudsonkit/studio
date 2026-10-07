(function () {
  var d = document, root = d.documentElement
  var prefix = (d.querySelector('meta[name="dewey-root"]') || {}).content || './'
  function get(key) { try { return localStorage.getItem(key) } catch (e) { return null } }
  function set(key, value) { try { localStorage.setItem(key, value) } catch (e) {} }
  function icon(paths) { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>' }
  var MOON = icon('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>')
  var SUN = icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>')
  var CHECK = icon('<path d="M20 6 9 17l-5-5"/>')
  function on(selector, event, handler) { d.querySelectorAll(selector).forEach(function (el) { el.addEventListener(event, handler) }) }

  // Dark mode: the head snippet already applied the saved or system choice.
  var toggle = d.querySelector('.dw-header-theme-toggle')
  function paint() {
    if (!toggle) return
    var dark = root.classList.contains('dark'), label = dark ? 'Switch to light mode' : 'Switch to dark mode'
    toggle.innerHTML = dark ? SUN : MOON
    toggle.setAttribute('aria-label', label); toggle.title = label
  }
  if (toggle) toggle.addEventListener('click', function () { var dark = !root.classList.contains('dark'); root.classList.toggle('dark', dark); set('dewey-dark-mode', String(dark)); paint() })
  paint()

  // Color theme.
  var select = d.querySelector('select.dw-fresh-theme'), preset = d.getElementById('dewey-preset')
  if (select && preset) {
    var saved = get('dewey-site-theme')
    if (saved && [].some.call(select.options, function (option) { return option.value === saved })) select.value = saved
    select.addEventListener('change', function () { preset.href = prefix + 'themes/' + select.value + '.css'; set('dewey-site-theme', select.value) })
  }

  // Sidebar groups collapse.
  on('.dw-sidebar-group-title[aria-expanded]', 'click', function () {
    var open = this.getAttribute('aria-expanded') !== 'true', list = this.parentElement.querySelector('.dw-sidebar-list'), chevron = this.querySelector('.dw-sidebar-chevron')
    this.setAttribute('aria-expanded', String(open))
    if (list) list.hidden = !open
    if (chevron) chevron.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)'
  })

  // Phone menu.
  var menu = d.querySelector('.dw-header-menu-btn'), sidebar = d.querySelector('.dw-sidebar')
  if (menu && sidebar) {
    var overlay = d.createElement('button')
    overlay.type = 'button'; overlay.className = 'dw-sidebar-overlay'; overlay.hidden = true; overlay.setAttribute('aria-label', 'Close navigation')
    sidebar.parentNode.insertBefore(overlay, sidebar)
    var setNav = function (open) { sidebar.classList.toggle('open', open); menu.setAttribute('aria-expanded', String(open)); overlay.hidden = !open; if (open) { var first = sidebar.querySelector('a'); if (first) first.focus() } }
    menu.addEventListener('click', function () { setNav(!sidebar.classList.contains('open')) })
    overlay.addEventListener('click', function () { setNav(false) })
    on('.dw-sidebar-close', 'click', function () { setNav(false); menu.focus() })
    d.addEventListener('keydown', function (event) { if (event.key === 'Escape' && sidebar.classList.contains('open')) { setNav(false); menu.focus() } })
  }

  // Copy buttons.
  on('.dw-code-block-copy', 'click', function () {
    var button = this, code = button.parentElement.querySelector('pre')
    if (!code || !navigator.clipboard) return
    var before = button.innerHTML
    navigator.clipboard.writeText(code.innerText.replace(/\n$/, '')).then(function () {
      button.innerHTML = CHECK; button.setAttribute('aria-label', 'Copied')
      setTimeout(function () { button.innerHTML = before; button.setAttribute('aria-label', 'Copy code') }, 1500)
    })
  })

  // Copy the page's Markdown copy from the page head, as it is or wrapped as a prompt for an agent.
  // Safari only allows a copy during the click, so the clipboard gets the pending text when it can.
  var copyPage = function (button, href, wrap) {
    var target = button.querySelector('.dw-action-label') || button, label = target.textContent, menu = button.closest('details')
    var status = button.closest('.dw-ctx') && button.closest('.dw-ctx').querySelector('.dw-ctx-status')
    var text = fetch(href).then(function (response) { if (!response.ok) throw new Error(response.status); return response.text() }).then(wrap)
    var copied = !navigator.clipboard ? Promise.reject(new Error('no clipboard'))
      : window.ClipboardItem ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then(function (value) { return new Blob([value], { type: 'text/plain' }) }) })])
      : text.then(function (value) { return navigator.clipboard.writeText(value) })
    var done = function (message) {
      target.textContent = message
      if (status) status.textContent = message
      setTimeout(function () { target.textContent = label; if (status) status.textContent = ''; if (menu) menu.open = false }, 1200)
    }
    copied.then(function () { done('Copied') }, function () { done('Copy failed') })
  }
  on('[data-dw-copy-markdown]', 'click', function () { copyPage(this, this.getAttribute('data-dw-copy-markdown'), function (text) { return text }) })
  on('[data-dw-copy-prompt]', 'click', function () {
    var button = this, href = button.getAttribute('data-dw-copy-prompt'), url = new URL(href, location.href).href
    copyPage(button, href, function (text) {
      return button.getAttribute('data-dw-prompt-head') + '\nMarkdown: ' + url + '\n\nUse the Markdown below as source context.\n\n<doc>\n' + text.trim() + '\n</doc>\n'
    })
  })

  // The Copy page menu: chat links ask the assistant to read this page's Markdown; outside clicks and Escape close it.
  var CHATS = { chatgpt: 'https://chatgpt.com/?hints=search&q=', claude: 'https://claude.ai/new?q=' }
  d.querySelectorAll('[data-dw-open]').forEach(function (link) {
    var url = new URL(link.getAttribute('data-dw-markdown'), location.href).href
    link.href = CHATS[link.getAttribute('data-dw-open')] + encodeURIComponent('Read ' + url + ' so you can answer questions about it.')
  })
  var menus = [].slice.call(d.querySelectorAll('details.dw-ctx-more'))
  if (menus.length) {
    d.addEventListener('click', function (event) { menus.forEach(function (menu) { if (menu.open && !menu.contains(event.target)) menu.open = false }) })
    d.addEventListener('keydown', function (event) { if (event.key === 'Escape') menus.forEach(function (menu) { if (menu.open) { menu.open = false; menu.querySelector('summary').focus() } }) })
    on('.dw-ctx-menu a', 'click', function () { var menu = this.closest('details'); setTimeout(function () { menu.open = false }, 0) })
  }

  // Active heading in "On this page".
  var links = [].slice.call(d.querySelectorAll('.dw-toc-link'))
  var targets = links.map(function (link) { return d.getElementById(decodeURIComponent(link.hash.slice(1))) })
  if (links.length && 'IntersectionObserver' in window) {
    var mark = function () {
      var index = 0
      targets.forEach(function (target, i) { if (target && target.getBoundingClientRect().top < 120) index = i })
      links.forEach(function (link, i) { link.classList.toggle('active', i === index) })
    }
    var pending = false
    addEventListener('scroll', function () { if (!pending) { pending = true; requestAnimationFrame(function () { pending = false; mark() }) } }, { passive: true })
    mark()
  }

  // Search. The index is a script, not JSON, so it also loads from file://.
  var triggers = [].slice.call(d.querySelectorAll('.dw-cmd-trigger')), trigger = null, overlayEl = null, loading = null
  function load() {
    if (window.DEWEY_SEARCH) return Promise.resolve(window.DEWEY_SEARCH)
    if (!loading) loading = new Promise(function (resolve, reject) {
      var script = d.createElement('script'); script.src = prefix + 'search.js'
      script.onload = function () { resolve(window.DEWEY_SEARCH || []) }; script.onerror = reject
      d.head.appendChild(script)
    })
    return loading
  }
  function escape(text) { return text.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function rank(pages, query) {
    var words = query.toLowerCase().split(/\s+/).filter(Boolean), hits = []
    if (!words.length) return pages.map(function (page) { return { page: page, score: 0 } })
    pages.forEach(function (page) {
      var title = page.t.toLowerCase(), body = page.x.toLowerCase(), score = 0, heading = null
      for (var i = 0; i < words.length; i++) {
        var word = words[i], best = 0
        if (title.indexOf(word) >= 0) best = title.indexOf(word) === 0 ? 12 : 8
        page.h.forEach(function (h) { if (h[1].toLowerCase().indexOf(word) >= 0 && best < 5) { best = 5; heading = heading || h } })
        if (!best && (page.s + ' ' + body).toLowerCase().indexOf(word) >= 0) best = 1
        if (!best) return
        score += best
      }
      hits.push({ page: page, score: score, heading: heading })
    })
    return hits.sort(function (a, b) { return b.score - a.score })
  }
  function snippet(page, query) {
    var word = query.toLowerCase().split(/\s+/).filter(Boolean)[0], text = page.x, at = word ? text.toLowerCase().indexOf(word) : -1
    if (at < 0) return escape(page.s)
    var start = Math.max(0, at - 40)
    if (start) { var space = text.indexOf(' ', start); start = space >= 0 && space < at ? space + 1 : start }
    var part = text.slice(start, at + 90).replace(/\s+\S*$/, '')
    return (start ? '…' : '') + escape(part).replace(new RegExp('(' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>') + '…'
  }
  function open() {
    if (overlayEl) return
    overlayEl = d.createElement('div'); overlayEl.className = 'dw-cmd-overlay'
    overlayEl.innerHTML = '<div class="dw-cmd-palette" role="dialog" aria-modal="true" aria-label="Search docs"><div class="dw-cmd-input-row">' + icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>').replace('<svg', '<svg class="dw-cmd-input-icon"') + '<input class="dw-cmd-input" type="text" placeholder="Search documentation" aria-label="Search documentation" aria-controls="dw-cmd-results" autocomplete="off" spellcheck="false"><kbd class="dw-cmd-kbd">esc</kbd></div><div class="dw-cmd-results" id="dw-cmd-results" role="listbox"></div></div>'
    d.body.appendChild(overlayEl)
    var input = overlayEl.querySelector('input'), results = overlayEl.querySelector('.dw-cmd-results'), active = 0
    var select = function (index) { var items = results.querySelectorAll('.dw-cmd-result'); if (!items.length) return; active = (index + items.length) % items.length; items.forEach(function (item, i) { item.setAttribute('aria-selected', String(i === active)) }); items[active].scrollIntoView({ block: 'nearest' }) }
    var render = function () {
      load().then(function (pages) {
        var query = input.value.trim(), hits = rank(pages, query).slice(0, 12)
        results.innerHTML = hits.length ? hits.map(function (hit) {
          var href = prefix + hit.page.u + (hit.heading ? '#' + hit.heading[0] : '')
          return '<a class="dw-cmd-result" role="option" href="' + escape(href) + '"><span class="dw-cmd-result-body"><span class="dw-cmd-result-title">' + escape(hit.page.t) + (hit.heading ? '<span class="dw-cmd-result-heading"> › ' + escape(hit.heading[1]) + '</span>' : '') + '</span><span class="dw-cmd-result-snippet">' + snippet(hit.page, query) + '</span></span><span class="dw-cmd-result-meta">' + escape(hit.page.g) + '</span></a>'
        }).join('') : '<p class="dw-cmd-empty">No pages match “' + escape(query) + '”.</p>'
        select(0)
      }, function () { results.innerHTML = '<p class="dw-cmd-empty">Search is unavailable.</p>' })
    }
    input.addEventListener('input', render)
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') { event.preventDefault(); select(active + 1) }
      else if (event.key === 'ArrowUp') { event.preventDefault(); select(active - 1) }
      else if (event.key === 'Enter') { var item = results.querySelectorAll('.dw-cmd-result')[active]; if (item) location.href = item.href }
    })
    overlayEl.addEventListener('click', function (event) { if (event.target === overlayEl) close() })
    input.focus(); render()
  }
  function close() { if (overlayEl) { overlayEl.remove(); overlayEl = null; if (trigger) trigger.focus() } }
  triggers.forEach(function (button) { button.addEventListener('click', function () { trigger = button; open() }); button.addEventListener('mouseenter', load, { once: true }) })
  d.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); overlayEl ? close() : open() }
    else if (event.key === '/' && !overlayEl && !/INPUT|TEXTAREA|SELECT/.test((d.activeElement || {}).tagName || '')) { event.preventDefault(); open() }
    else if (event.key === 'Escape') close()
  })
})()
