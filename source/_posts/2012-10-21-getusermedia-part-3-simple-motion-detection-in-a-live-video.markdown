---
layout: post
title: "getUserMedia() part 3: simple motion detection in a live video"
date: 2013-01-14 18:00
---

Now that you should already know how to build a
[live green screen](/blog/2012/10/building-a-live-green-screen-with-getusermedia-and-mediastreams/)
and an
[EyeToy-like mini-game](/blog/2012/10/getusermedia-part-2-building-an-eyetoy-like-mini-game/)
using nothing but plain JavaScript and a modern browser supporting WebRTC, let
us move on to another interesting example: simple motion detection in a live
video.

## The code

{% codeblock lang:js %}
  draw: function () {
    this.context.drawImage(this.video, 0, 0, this.width, this.height);
    let frame = this.context.getImageData(0, 0, this.width, this.height);

    this.markLightnessChanges(frame.data);
    this.context.putImageData(frame, 0, 0);
    this.requestAnimationFrame();
  },
{% endcodeblock %}

The main draw() function did not change very much. We read the image data,
highlight motion we detected and put it back to the canvas. The obviously
most interesting function is markLightnessChanges():

{% codeblock lang:js %}
  markLightnessChanges: function (frameData) {
    let lastLightnessData = this.lastLightnessData;
    let lightnessData = this.lastLightnessData = [];

    let len = frameData.length / 4;
    for (let i = 0; i < len; i++) {
      // Determine the current pixel's
      // lightness value and save it for later.
      let pixel = Array.slice(frameData, i * 4, i * 4 + 3);
      let lightness = this.determineLightness(pixel);
      lightnessData.push(lightness);

      // Check if the lightness has changed.
      let changed = lastLightnessData &&
                    Math.abs(lightness - lastLightnessData[i]) >= 15;

      // Changed pixels will be turned black,
      // everything else becomes transparent.
      if (changed) {
        frameData[i * 4] =
          frameData[i * 4 + 1] =
          frameData[i * 4 + 2] = 0;
      }
      frameData[i * 4 + 3] = 255 * changed;
    }
  },
{% endcodeblock %}

We determine the lightness value of every pixel in the canvas and compare it
to its previous value in the previous frame. If the difference exceeds a
specific threshold we change the pixel's color to black - if not it becomes
transparent.

## Bend mode difference

Why do we determine the pixels' lightness values? 

{% codeblock lang:js %}
  determineLightness: function ([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    let min = Math.min(r, g, b);
    let max = Math.max(r, g, b);
    return (min + max) * 50;
  }
{% endcodeblock %}

## Demo and screencast

Take a look at the [live demo](/demos/motion-detection/) or watch the screencast below:

<iframe class="embed"
 src="http://player.vimeo.com/video/51703468?title=1&amp;byline=1&amp;portrait=1"
 width="500" height="195" frameborder="0"
 webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>

## The cool stuff

You can create some pretty amazing demos with this simple technique. Here is a
great one of a xylophone you can play by waving your hands:

[http://www.soundstep.com/blog/experiments/jsdetection/](http://www.soundstep.com/blog/experiments/jsdetection/)   
[http://www.soundstep.com/blog/2012/03/22/javascript-motion-detection/](http://www.soundstep.com/blog/2012/03/22/javascript-motion-detection/)
