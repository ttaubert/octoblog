---
layout: post
title: "getUserMedia() part 2: building an EyeToy-like mini-game"
date: 2012-10-18 22:00
---

This post is a follow-up to my previous one about
[building a live green screen with getUserMedia() and MediaStreams](/blog/2012/10/building-a-live-green-screen-with-getusermedia-and-mediastreams/).
If you have not read it yet, this might be a good time. We will extend the small
example to build an EyeToy-like mini-game.

## Some additions

{% codeblock lang:js %}
var video, width, height, context;
var revealed = Object.create(null);

function initialize() {
{% endcodeblock %}

First, we will add a variable called *revealed* that keeps track of all pixels
that have already been revealed by holding a green object in front of the
camera. Instead of *replaceGreen()* we will call our method *revealGreen()*
from now on:

{% codeblock lang:js %}
function revealGreen(data) {
  var len = width * height;

  for (var i = 0, j = 0; i < len; i++, j += 4) {
    // This pixel has already been revealed.
    if (i in revealed) {
      data[j + 3] = 0;
      continue;
    }
{% endcodeblock %}

When iterating over all of the canvas' pixels we check whether the current
index in the typed array is marked as revealed. If so we do not need to check
its color but set its opacity to zero and continue with the next iteration.

{% codeblock lang:js %}
    // Convert from RGB to HSL...
    var hsl = rgb2hsl(data[j], data[j + 1], data[j + 2]);
    var h = hsl[0], s = hsl[1], l = hsl[2];

    // ... and check if we have a somewhat green pixel.
    if (h >= 90 && h <= 160 && s >= 25 && s <= 90 && l >= 20 && l <= 75) {
      data[j + 3] = 0;
      revealed[i] = true;
    }
  }
}
{% endcodeblock %}

If the pixel has not been revealed yet but is a green one, we make it
transparent like before and mark it to make it stay that way.

## Demo and screencast

That is all! Take a look at the [live demo](/demos/eye-toy/) or watch the
screencast below:

<iframe class="embed"
 src="http://player.vimeo.com/video/51703468?title=1&amp;byline=1&amp;portrait=1"
 width="500" height="195" frameborder="0"
 webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>

## I know...

... this is not much of a game but rather a small demo one could turn into a
mini-game with little effort. Play around with the code and see what you can
come up with!
