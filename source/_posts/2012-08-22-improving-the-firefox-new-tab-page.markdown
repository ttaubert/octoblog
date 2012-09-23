---
layout: post
title: "Improving the Firefox new tab page"
date: 2012-08-23 12:00
published: false
---

Firefox 17 (Nightly, that soon becomes Aurora) includes two improvements for
the new tab page introduced by version 13.

## Customize the number of tiles

[Bug 752841](https://bugzilla.mozilla.org/show_bug.cgi?id=752841
"Bug 752841 - [New Tab Page] make the number of tabs adjustable")
introduced two preferences that allow you to adjust the number of tiles on your
new tab page to your likings. All you have to do is open "about:config" and
modify one or both of the following preferences:

{% codeblock lang:text %}
browser.newtabpage.rows [default=3]
browser.newtabpage.columns [default=3]
{% endcodeblock %}

### TODO [add image(s) of modified new tab page]

Your changes will be applied instantly and all open new tab pages will be
updated. There is no positive limit to the number of rows and columns so feel
free to experiment with those values.

## Restore sites you removed from the grid

With the landing of [bug 722234](https://bugzilla.mozilla.org/show_bug.cgi?id=722234
"Bug 722234 - [New Tab Page] provide an option to undo remove a site")
you will finally be able to undo the removal of sites from your new tab page.
As soon as you remove a site from the grid we will show you a dialog that ask
whether you want to undo the last change or to restore all sites you ever
removed from the grid.

### TODO [add image with undo dialog]
