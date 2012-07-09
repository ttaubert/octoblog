---
layout: post
title: "Firefox Add-on: Facebook Auto-Logout"
date: 2011-10-29 18:56
---

While talking to a friend of mine recently I got to know that he really dislikes that Facebook hides the Logout link in a sub-menu. He told me that he even uses a separate browser only for Facebook because he is very well aware of Facebook’s business model relying on tracking users wherever they are (this is not a big issue for me because I’m very happy with [Ghostery](https://addons.mozilla.org/de/firefox/addon/ghostery/)).

A quick search revealed that there seem to be lot more users than I expected that would find an auto-logout of Facebook very useful. If not for privacy issues it’s also quite useful if someone else uses your computer and wants to post weird status updates.

So I wrote a Firefox add-on that logs the user out of Facebook when quitting Firefox or after a configurable amount of time has passed since he last closed a Facebook page (and there’s no active tab). It removes all cookies belonging to facebook.com so even tracking should not be an issue anymore (unless Facebook implements alternative tracking techniques).

Add-on: <https://addons.mozilla.org/en-US/firefox/addon/facebook-auto-logout/>  
Source: <https://github.com/ttaubert/facebook-auto-logout>
