---
layout: post
title: "Force Octopress/Jekyll to use a specific time zone"
date: 2012-09-25 15:00
---

I could not be happier ever since I switched from Wordpress to Octopress.
I usually write and publish blog posts from where I live, Berlin. The time zone
here is CET (UTC+1). While recently visiting Mozilla's HQ in Mountain View I
wrote another blog post just as usual and typed "rake generate" to turn my
Markdown files into static HTML files.

Looking at the output though, got me a little puzzled. All timestamps were
changed to be calculated off the PDT time zone. While certainly that is not a
big deal as they are still the same timestamps, I did not feel like changing
all of those every now and then I am somewhere in a different time zone.

If you want to use a "static" time zone when generating your page, do it like
this:

{% codeblock lang:text %}
TZ=CET rake generate
{% endcodeblock %}

**TL;DR** - put your time zone into the TZ variable if you want to force Jekyll
to use a specific time zone when generating your HTML files.
