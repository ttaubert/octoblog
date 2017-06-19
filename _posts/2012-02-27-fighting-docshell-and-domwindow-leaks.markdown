---
layout: post
title: "Fighting DocShell and DOMWindow leaks"
date: 2012-02-27 19:13
---

In my post [Leak hunting in browser-chrome mochitests]({{ root_url }}/blog/2011/09/leak-hunting-in-browser-chrome-mochitests/) I wrote about the measures we were considering to prevent regressing efforts to get rid of leaks in Firefox. Now that [bug 683953](https://bugzilla.mozilla.org/show_bug.cgi?id=683953 "Bug 683953 - Browser-chrome mochitests should show statistics about leaked DOMWindows and DocShells") has landed we finally have a way to detect the leakage of whole DocShells and DOMWindows for the lifetime of the browser when running the browser-chrome mochitest suite.

How does it work?
-----------------

While our browser-chrome mochitest suite runs we parse stdout to track starting and ending tests as well as the creation and removal of DocShells and DOMWindows. Just before the test suite shuts down we schedule a precise GC and wait until it’s completed. Any DOMWindows and DocShells still active are now counted as leaks and assigned to the tests that created them. Additionally we collect the URLs of DOMWindows to help debugging a bit.

How does this prevent new leaks?
--------------------------------

We implemented a threshold of (currently) 130 leaks that must not be exceeded. If a test run leaks more than the limit we configured it goes orange and the patch should be backed out from the tree. These are the current numbers:

{% codeblock lang:text %}
Linux (64): 116 (116) leaks
OS X (64): 79 (89) leaks
Windows (XP): 120 (118) leaks
{% endcodeblock %}

Additionally, I filed [bug 730797](https://bugzilla.mozilla.org/show_bug.cgi?id=730797 "Bug 730797 - Track number of DOMWindow/DocShell leaks and report improvements/regressions") to integrate these leaks statistics into our Talos infrastructure. So the leak count for each push will be recorded and compared to previous runs to make sure the numbers don’t regress. As the leak numbers differ quite heavily between OSes it makes sense to apply a custom threshold per OS, this will be implemented in [bug 730800](https://bugzilla.mozilla.org/show_bug.cgi?id=730800 "Bug 730800 - Apply per-OS threshold for shutdown leaks").

Why is there even a threshold?
------------------------------

First, there are DocShells and DOMWindows that are intentionally kept alive until the browser closes. Second, it’s nearly impossible to bring all these leaks down to “zero” at once. It’s a list of bugs that have to be addressed and we will slowly decrease the threshold to approach “zaroo”.

Thanks to Dão who has been doing great work in [bug 658738](https://bugzilla.mozilla.org/show_bug.cgi?id=658738 "Bug 658738 - (bc-leaks) [meta] We seem to be leaking hundreds of windows until shutdown during browser-chrome tests") discovering all those leaks manually, which in the first place gave me the idea of automating it.
