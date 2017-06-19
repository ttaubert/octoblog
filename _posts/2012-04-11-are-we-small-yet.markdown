---
layout: post
title: "Are we small, yet?"
subtitle: "A histogram of Firefox download sizes"
date: 2012-04-11 00:22
---

Lately, [Asa Dotzler](http://weblogs.mozillazine.org/asa/) [posted to dev.apps.firefox](https://groups.google.com/forum/#!topic/mozilla.dev.apps.firefox/k7fzkhdt9io) regarding the download size of Firefox:

> This evening I noticed that my full win32 mar update for Firefox was 21MB. That caused me to look at what our full win32 installer size was. I was a bit surprised to see it’s up to 17MB. When we shipped Firefox 1, our Windows installer build was 4.7MB. [...]
> 
> Firefox 12 is a 16.1 MB download.
> Firefox 4 was a 12.0 MB download.
> Firefox 3.6 was a 7.7 MB download.
> 
> In less than three years we’ve more than doubled in size. (fuller chart here <http://grab.by/cSHA>)

While there’s no doubt that adding new features and supporting new platforms are good reasons for increasing the build size it’s definitely a metric that impacts users. It hits them the hardest when downloading Firefox the first time, especially with slow internet connections. It still hits them every time we provide application updates.

To better illustrate the steady growth over the last few years I created <http://www.arewesmallyet.com/>. It’s updated daily, shows differences between nightly builds and links to the corresponding changelog if one would like to investigate the cause of increasing build sizes.

{% img /images/arewesmallyet.png arewesmallyet.com %}

While this surely isn’t the most important battle we have right now I hope this will turn out useful to anyone willing to pick this up and tackle some build size optimizations.

GitHub: <https://github.com/ttaubert/arewesmallyet>
