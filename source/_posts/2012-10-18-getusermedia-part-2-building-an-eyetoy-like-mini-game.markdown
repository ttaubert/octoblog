---
layout: post
title: "getUserMedia() part 2: building an EyeToy-like mini-game"
date: 2012-10-18 18:00
---

This post is a follow-up to my previous one about
[building a live green screen with getUserMedia() and MediaStreams](/blog/2012/10/building-a-live-green-screen-with-getusermedia-and-mediastreams/).
If you have not read it yet, this might be a good time. We will extend the small
example to build an EyeToy-like mini-game.

## Some additions

{% codeblock lang:js %}
let GreenScreen = {
  // Keep track of revealed pixels.
  revealed: new Set(),

  start: function () {
{% endcodeblock %}

Let us add a
[Set](https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Set)
to *GreenScreen* that keeps track of all pixels that have already been
revealed by holding a green object in front of the camera.

{% codeblock lang:js %}
    // Iterate over all pixels in the current frame.
    for (let i = 0; i < len; i++) {
      // This pixel has already been revealed.
      if (this.revealed.has(i)) {
        frame.data[i * 4 + 3] = 0;
        continue;
      }
{% endcodeblock %}

When iterating over all of the canvas' pixels we check if the current index is
contained in the set. If so we do not need to check its color but set its
opacity to zero and continue with the next iteration.

{% codeblock lang:js %}
      // Convert from RGB to HSL...
      let [h, s, l] = this.rgb2hsl(r, g, b);

      // ... and check if we have a somewhat green pixel.
      if (h >= 90 && h <= 160 &&
          s >= 25 && s <= 90 &&
          l >= 20 && l <= 75) {
        frame.data[i * 4 + 3] = 0;
        this.revealed.add(i);
      }
{% endcodeblock %}

If the pixel is not in the set but is a green one, we make it transparent like
before and add it to the set to make it stay that way.

## Demo and screencast

That is all! Take a look at the [live demo](/demos/eye-toy/) or watch the
screencast below:

<iframe class="embed"
 src="http://player.vimeo.com/video/51598757?title=1&amp;byline=1&amp;portrait=1"
 width="500" height="195" frameborder="0"
 webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>

## I know...

... this is not much of a game but rather a small demo one could turn into a
mini-game with little effort. Play around with the code and see what you can
come up with!
