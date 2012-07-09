---
layout: post
title: "Using Xvfb on Linux to run mochitests in the background"
date: 2011-05-01 14:08
---

Seeing mochitests run for the first time is awesome but gets pretty annoying at the 50th time, especially when executing whole test suites. I’ve always wanted to be able to do some bug triage or catch up with the mailing lists while letting mochitests run in the background.

Spawning a second XServer seemed a bit too much but fortunately there is another solution: Xvfb – a virtual frame buffer. Xvfb spawns a virtual XServer on the specified display and runs purely in memory.

Here is how to set up Xvfb and run mochitests on Ubuntu (shouldn’t be too hard on other distros either):

{% codeblock lang:text %}
me@host:~$ sudo apt-get install xvfb
me@host:~$ xvfb-run make -C $(OBJDIR) mochitest-browser-chrome
{% endcodeblock %}

Enjoy!
