---
layout: post
title: "Note to myself: Don't be lazy"
date: 2013-02-25 12:00
---

Back in October 2012 I wrote two blog posts,
[getUserMedia part 1](/blog/2012/10/building-a-live-green-screen-with-getusermedia-and-mediastreams/)
and [part 2](/blog/2012/10/getusermedia-part-2-building-an-eyetoy-like-mini-game/),
including demos which unfortunately would run in Firefox, only. I did not
explicitly want to be exclusive but I think I just did not feel like looking up
why my code did not work in Opera and why exactly webkitGetUserMedia() behaved
differently than mozGetUserMedia(). I was being lazy.

I also intended to mix in a couple of nice JavaScript features, like
block-scoped variable definitions with
[let](https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Statements/let),
[destructuring assignments](https://developer.mozilla.org/en-US/docs/JavaScript/New_in_JavaScript/1.7)
or [Sets](https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Set)
(did I just do it again?). In hindsight this does not really make sense as I
should not expect visitors to want to learn about cutting-edge JavaScript
features when viewing a getUserMedia() post.

Before finishing my third piece on getUserMedia() I decided to update the demos
of my older posts to run in any modern browser. I also seized the chance to
overhaul code examples which did not adhere to my coding standards anymore.

If you should ever be in a similar situation - please take a couple of minutes
to write code that runs in all modern browsers so people can enjoy your demos in
their browser of choice. Please don't be lazy.
