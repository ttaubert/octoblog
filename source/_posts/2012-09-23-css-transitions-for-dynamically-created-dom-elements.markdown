---
layout: post
title: "CSS transitions for dynamically created DOM elements"
date: 2012-09-23 20:00
---

[CSS transitions](https://developer.mozilla.org/en/CSS/CSS_transitions) are
awesome. You can use them to easily animate the transition of one or multiple
CSS properties from a given state to another. But how does that work if your
element has just been created and inserted into the DOM dynamically?

Let's take a look at this simple example:

{% codeblock lang:css %}
div {
  /* ... */
  transition: opacity 500ms;
}
{% endcodeblock %}

{% codeblock lang:js %}
var elem = document.createElement("div");
document.body.appendChild(elem);

// Make the element fully transparent.
elem.style.opacity = 0;

// Fade it in.
elem.style.opacity = 1;
{% endcodeblock %}

We dynamically insert a new <div\> element into the DOM with its initial
opacity set to zero. Subsequently we want it to fade to full opacity.
This - as you might have guessed - does of course not work that way.

## How about a timeout?

It is clear that we somehow need to make sure the initial state with zero
opacity is "applied" before trying to fade in:

{% codeblock lang:js %}
var elem = document.createElement("div");
document.body.appendChild(elem);

// Make the element fully transparent.
elem.style.opacity = 0;

// Make sure the initial opacity value is applied.
setTimeout(function () {
  // Fade it in.
  elem.style.opacity = 1;
}, 0);
{% endcodeblock %}

This is only marginally better. It seems to work with Webkit and Opera (and
maybe even IE) but not in Firefox (in 99% of the cases). Using setTimeout()
is a little too much overhead and nobody guarantees you that the style has
really been applied after some milliseconds. It may be unsupported and
unreliable, we need something better.

## getComputedStyle to the rescue

There is another way to apply the element's current style that even works
synchronously:

{% codeblock lang:js %}
var elem = document.createElement("div");
document.body.appendChild(elem);

// Make the element fully transparent.
elem.style.opacity = 0;

// Make sure the initial state is applied.
window.getComputedStyle(elem).opacity;

// Fade it in.
elem.style.opacity = 1;
{% endcodeblock %}

Although it looks like we only query the current opacity value, getComputedStyle()
in combination with accessing a property value actually flushes all pending
style changes and forces the layout engine to compute our <div\>'s current
state. This workaround works in all major browsers and does not yield different
results like the setTimeout() approach.
