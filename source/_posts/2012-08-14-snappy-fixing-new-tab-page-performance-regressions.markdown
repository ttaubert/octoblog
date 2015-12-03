---
layout: post
title: "Fixing new tab page performance regressions"
date: 2012-08-14 12:00
---

As you probably already know, Firefox 13 introduced a neat new feature - the
[new tab page]({{ root_url }}/blog/2012/02/help-us-test-the-new-tab-page/).
We replaced the old blank page with a list of thumbnails of recently visited
sites. While the feature itself works great for many people it has definitely
made opening new tabs a little more noisy.

## Do not show loading indicators

As we are now loading a real (although local) page, there are loading indicators
when opening a new tab. The throbber starts to spin and the tab title changes
to "Connecting…" until the page has loaded. That is a lot of unnecessary noise.

In [bug 716108](https://bugzilla.mozilla.org/show_bug.cgi?id=716108
"Bug 716108 - [New Tab Page] Connecting… should not briefly flicker in the tab title when a new tab is opened")
(Firefox 17) we removed loading indicators for newly opened tabs. No spinning
throbber, no flickering tab label. It only is a very subtle change but the whole
action of opening a new tab feels a lot smoother again.

## Preload new tab pages in the background

If you happen to have a slower machine you will notice that loading the new tab
page takes a little while. It is a normal HTML (and partly XUL) page that we
need to parse and render. As all tabs start out with a blank docShell you will
first see a white canvas that then is replaced by "about:newtab". As a last step
all thumbnails will be loaded and drawn progressively.

Opening a new tab is a very frequent action so it should feel snappy and not get
in your way at all. As optimizing the parsing and rendering stages any further
is more than a non-trivial task I came up with a little trick in
[bug 753448](https://bugzilla.mozilla.org/show_bug.cgi?id=753448
"Bug 753448 - [New Tab Page] preload newtab pages in the background and swap them in when opening a new tab").
The idea is to preload the new tab page in the background so it has already
loaded when users open a new tab. All we now have to do is switch docShells
and the new tab page gets shown instantly.

You can give it a try as it landed in yesterday's Nightly (2012-08-14). Just go
to "about:config" and set "browser.newtab.preload" to "true". This option is
not yet enabled by default as we first have to figure out some minor talos
regressions until it is ready for prime time.
