---
layout: post
title: "Leak hunting in browser-chrome mochitests"
date: 2011-09-09 18:49
---

Some weeks (even months) ago [Dão Gottwald](http://design-noir.de/) started the hunt for leaked DOMWindows and DocShells while running our browser-chrome mochitest suite (see [bug 658738](https://bugzilla.mozilla.org/show_bug.cgi?id=658738 "Bug 658738 - (bc-leaks) [meta] We seem to be leaking hundreds of windows until shutdown during browser-chrome tests")). That means that there are some expensive objects whose lifetimes are longer than they should be – they are kept alive until the test runner shuts down. Sometimes these are caused by only a little typo in the test and sometimes they unveil bigger problems in the core.

Dão has done some great work so far, fixed lots of those leaks and also pointed out patches that introduced new leaks. Inspired by his [script](https://bugzilla.mozilla.org/attachment.cgi?id=553428) that parses the mochitest build log and lists all [leaked URIs](https://bugzilla.mozilla.org/attachment.cgi?id=559090) I wrote a Python script that additionally assigns those URIs to the tests that created these DOMWindows and DocShells. I filed [bug 683953](https://bugzilla.mozilla.org/show_bug.cgi?id=683953 "Bug 683953 - Browser-chrome mochitests should show statistics about leaked DOMWindows and DocShells") to automatically have those statistics at the end of each mochitest run. Here is an example:

{% codeblock lang:text %}
TEST-INFO | leaked 15 DOMWindows and/or DocShells

[browser/components/sessionstore/test/browser/browser_589246.js]
  5x [about:blank]
  4x [chrome://browser/content/browser.xul]
  1x docShells

[browser/devtools/styleinspector/test/browser/styleinspector.js]
  2x [chrome://browser/content/csshtmltree.xhtml]
  1x [data:text/html,basic%20style%20inspector%20tests]
  1x [about:blank]
  1x docShells
{% endcodeblock %}

This would definitely be very helpful as you don’t have to parse a build log manually after the test run finished. It would also allow us to fail (in a far future where all leaks are fixed) when we detect that the current patch would introduce a new leak.

Another approach would be to have an API that allows to check whether a given object should be regarded as “alive” or “dead”. This is what [bug 633670](https://bugzilla.mozilla.org/show_bug.cgi?id=633670 "Bug 633670 - (LifetimeTesting) Need testing support for leaks that do not persist through shutdown") is about. Every test would need to check if the DOMWindows, DocShells and other objects created by it are still considered alive after it has finished. One problem with this is that we would have to run GC after each test to determine an object’s lifetime – which would negatively affect the overall mochitest suite runtime.

No matter which solution (or maybe a combination of both or something completely different) will make it – we definitely need some kind of better leak detection than we currently have. Many of us are not aware that they are accidentally introducing new leaks with new patches they write. Manually checking for new leaks after each push is a real waste of time and shouldn’t be necessary.
