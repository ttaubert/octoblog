---
layout: post
title: "getUserMedia() part 3: simple motion detection in a live video"
date: 2013-02-27 12:00
---

Now that you should already know how to build a
[live green screen](/blog/2012/10/building-a-live-green-screen-with-getusermedia-and-mediastreams/)
and an
[EyeToy-like mini-game](/blog/2012/10/getusermedia-part-2-building-an-eyetoy-like-mini-game/)
using nothing but plain JavaScript and a modern browser supporting WebRTC, let
us move on to another interesting example: simple motion detection in a live
video.

## The initialization code

To detect motion in a video we need to compare at least two frames. We will use
[typed arrays](https://developer.mozilla.org/en-US/docs/JavaScript_typed_arrays)
to store the lightness data of the previous frames:

{% codeblock lang:js %}
function initialize() {
  // ... code to initialize the canvas and video elements ...

  // Prepare buffers to store lightness data.
  for (var i = 0; i < 2; i++) {
    buffers.push(new Uint8Array(width * height));
  }

  // Get the webcam's stream.
  nav.getUserMedia({video: true}, startStream, function () {});
}
{% endcodeblock %}

We want two frame buffers - a single one results in a heavily
flickering motion video but the more frames we store the more motion blur
we will see. Two seems like a good value for demonstration purposes.

## Illustrating lightness changes

The main *draw()* function from
[part 1](/blog/2012/10/building-a-live-green-screen-with-getusermedia-and-mediastreams/)
did not change except that we now call *markLightnessChanges()* for every frame.
This is also the probably most interesting function of the whole demo:

{% codeblock lang:js %}
function markLightnessChanges(data) {
  // Pick the next buffer (round-robin).
  var buffer = buffers[bufidx++ % buffers.length];

  for (var i = 0, j = 0; i < buffer.length; i++, j += 4) {
    // Determine lightness value.
    var current = lightnessValue(data[j], data[j + 1], data[j + 2]);

    // Set color to black.
    data[j] = data[j + 1] = data[j + 2] = 0;

    // Full opacity for changes.
    data[j + 3] = 255 * lightnessHasChanged(i, current);

    // Store current lightness value.
    buffer[i] = current;
  }
}
{% endcodeblock %}

We determine the lightness value of every pixel in the canvas and compare it
to its values in the previously captured frames. If the difference to one of
those buffers exceeds a specific threshold the pixel will be black, if not it
becomes transparent.

{% codeblock lang:js %}
function lightnessHasChanged(index, value) {
  return buffers.some(function (buffer) {
    return Math.abs(value - buffer[index]) >= 15;
  });
}
{% endcodeblock %}

## Blend mode difference

The simple method we use to detect motion is called a
[blend mode difference](http://en.wikipedia.org/wiki/Blend_modes#Difference).
That is a quite fancy word to say: we compare two images (also called layers
or frames) by putting them on top of each other and subtracting the bottom from
the top layer. In this example we do it for every pixel's L-value of the
[HSL color model](https://en.wikipedia.org/wiki/HSL_and_HSV).

{% codeblock lang:js %}
function lightnessValue(r, g, b) {
  return (Math.min(r, g, b) + Math.max(r, g, b)) / 255 * 50;
}
{% endcodeblock %}

If the current frame is identical to the previous one, the lightness
difference will be exactly zero for all pixels. If the frames differ because
something in that picture has moved then there is a good chance that lightness
values change where motion occured. A small threshold ensures that we ignore
noise in the signal.

## Demo and screencast

That is all! Take a look at the [live demo](/demos/motion-detection/) or watch
the screencast below:

<iframe class="embed"
 src="http://player.vimeo.com/video/60650211?title=1&amp;byline=1&amp;portrait=1"
 width="500" height="195" frameborder="0"
 webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>

You can create some really great demos with this simple technique. Here is a
neat one of
[a xylophone you can play by waving your hands](http://www.soundstep.com/blog/experiments/jsdetection/)
(which unfortunately does not work in Firefox).

Whatever your ideas may be, I encourage you to fiddle around with the small
demos I provided in my three getUserMedia() examples so far and let me know if
you built something amazing!
