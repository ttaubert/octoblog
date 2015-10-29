---
layout: post
title: "Firefox Panorama: Deferred loading of inactive groups"
date: 2011-05-20 17:59
---

Starting with tomorrow’s Nightly hidden tabs are not anymore restored by default when starting Firefox. That means tabs from inactive Panorama groups will not load until these groups/tabs are shown. Finally we have a part of the behavior everyone actually expects when using Panorama.

If you have lots of tabs and tab groups like me (~120 tabs in 12 groups) the landing of [bug 595601](https://bugzilla.mozilla.org/show_bug.cgi?id=595601 "Bug 595601 - Option to not load tabs from inactive groups on initial browser startup (and until such time as the tab(s) become part of an active group)") for Firefox 6 is going to be a huge win in terms of (perceived) startup speed and memory usage. But let’s check the numbers.

{% img /images/panorama.png Panorama with lots of groups %}

## Memory Usage (with hidden tabs restored)

Remember: all tabs are restored and rendered regardless of whether they’re hidden or not. JavaScripts, plugins and the like are executed, too.

{% codeblock lang:text %}
Mapped Memory
2,066.92 MB (100.0%) -- mapped
├──1,288.00 MB (62.31%) -- heap
├────679.80 MB (32.89%) -- other
└─────99.12 MB (04.80%) -- js
├──94.49 MB (04.57%) -- mjit-code
└───4.63 MB (00.22%) -- tjit-code

Used Heap Memory
1,264.93 MB (100.0%) -- heap-used
├────574.40 MB (45.41%) -- other
├────405.63 MB (32.07%) -- js
├────199.56 MB (15.78%) -- images
├─────61.39 MB (04.85%) -- layout
├─────21.25 MB (01.68%) -- storage
└──────2.70 MB (00.21%) -- gfx
└──2.70 MB (00.21%) -- surface
└──2.70 MB (00.21%) -- image
{% endcodeblock %}

## Memory Usage (no hidden tabs restored)

The tabs are technically still present but haven’t been restored and therefore they’re not loaded or rendered and no JavaScripts and plugins are executed until they’re shown.

{% codeblock lang:text %}
Mapped Memory
920.39 MB (100.0%) -- mapped
├──586.25 MB (63.70%) -- other
├──317.00 MB (34.44%) -- heap
└───17.14 MB (01.86%) -- js
├──16.52 MB (01.79%) -- mjit-code
└───0.63 MB (00.07%) -- tjit-code

Used Heap Memory
283.59 MB (100.0%) -- heap-used
├──146.84 MB (51.78%) -- other
├──119.16 MB (42.02%) -- js
├────6.74 MB (02.38%) -- layout
├────5.40 MB (01.91%) -- storage
├────5.33 MB (01.88%) -- images
└────0.12 MB (00.04%) -- (1 omitted)
{% endcodeblock %}

## Startup Time

When we would try to measure startup times with [about:startup](https://addons.mozilla.org/en-US/firefox/addon/about-startup/) we would probably see no big difference. This is because the patch does not change how the whole session is restored but when every single tab is. So our visible tabs get restored a bit faster and they are earlier available for user interaction (because no tab in the background disturbs with network or CPU usage). Bonus: hidden tabs with auto-play stuff can’t annoy you anymore (looking at you, Youtube!).

The test setup includes a visible group (out of 12) with 4 normal tabs (out of 120) and 4 pinned tabs (including Google Groups, Twitter and Facebook). I simply started the timer when I could see the browser window and stopped it when every visible tab finished loading.

{% codeblock lang:text %}
Startup time (before)  - 17.5s (avg)
Startup time (after)   - 13.5s (avg)
{% endcodeblock %}

We only see a small win here but that’s no surprise as the session restore component already does a pretty clever job in prioritizing visible tabs higher than hidden tabs and we have also a lot of prioritization at networking level.

## What’s next?

The next thing we probably should address is the hibernation of entire tab groups that haven’t been used for a while because there are lots of people out there who tend to never close their browsers (like me, yeah) – but that’s another bug.
