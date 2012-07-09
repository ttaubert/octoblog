---
layout: post
title: "Firefox Add-on: Websockets for IRCCloud"
date: 2011-12-07 19:00
---

If you don’t know [IRCCloud](https://irccloud.com/), check it out. It’s become a very important tool for my every day work and I really don’t want to miss it. The one thing I never liked about it is that is currently uses a Flash fallback if it detects that the browser doesn’t support the WebSocket API.

The Firefox WebSocket API is currently prefixed (called MozWebSocket) and that’s why even with the newest Firefox you’re forced to use the Flash fallback. They even check for MozWebSocket and explicitly don’t use it if detected. As I didn’t quite understand the reasons behind that I decided to write an add-on that convinces IRCCloud to use native WebSockets in Firefox. Works good so far. I hope that’ll encourage the IRCCloud guys to think about using it again.

Add-on: <https://addons.mozilla.org/en-US/firefox/addon/websockets-for-irccloud/>  
Source: <https://github.com/ttaubert/irccloud-websockets>
