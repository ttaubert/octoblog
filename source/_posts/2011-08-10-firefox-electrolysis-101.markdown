---
layout: post
title: "Firefox Electrolysis 101"
date: 2011-08-10 18:21
---

You probably have all heard of this weird new thing called [Electrolysis (a.k.a. e10s)](https://wiki.mozilla.org/Electrolysis). Basically it’s all about running the browser UI and its tabs in separated processes. I recently rewrote a part of Panorama to be e10s-future-proof and thought I should share what I’ve learned so far…

*(If you don’t know why we’re all doing this, please read: <http://blog.mozilla.com/products/2011/07/15/goals-for-multi-process-firefox/>)*

*__Update__: There is a global message manager. You __can__ send messages through the global or the per-window message manager. Corrected the different loadFrameScript() behaviors. Thanks to Mark Finkle for these corrections!*

## The message manager

(<https://developer.mozilla.org/en/The_message_manager>)

We’re using messages to establish communication between the chrome process and the content processes. The message manager sends messages and registers message listeners. It’s also capable of injecting so-called frame scripts (or content scripts) into a content process – these send or receive messages and interact with the DOM loaded into the <browser\>. There are four types of message managers:

### global messageManager

This message manager sends messages to and receives them from  every <browser\> loaded in every window. You can access it by doing:

{% codeblock lang:js %}
/* chrome script */
let globalMM = Cc["@mozilla.org/globalmessagemanager;1"]
                 .getService(Ci.nsIChromeFrameMessageManager);
{% endcodeblock %}

### window.messageManager

This message manager sends messages to and receives them from every <browser\> loaded in the given window.

### browser.messageManager

This message manager is specific to a single <browser\>.

### Available methods

{% codeblock lang:js %}
messageManager.addMessageListener(messageName, listener)
messageManager.removeMessageListener(messageName, listener)
messageManager.sendAsyncMessage(messageName[, json])
messageManager.loadFrameScript(url[, allowDelayedLoad])
{% endcodeblock %}

### content/frame scripts

The methods of a content script’s message manager are available as global functions. Note that a content script can send synchronous messages, unlike the message managers accessible from chrome scripts. The chrome process is not allowed to block on content processes.

{% codeblock lang:js %}
addMessageListener(messageName, listener)
removeMessageListener(messageName, listener)
sendAsyncMessage(messageName[, json])
sendSyncMessage(messageName[, json])
{% endcodeblock %}

### e10s components

Here is an overview of all Electrolysis components. That’s not exactly how e10s is implemented in Gecko but rather a logical view to clarify interactions between these parts.

{% img /images/electrolysis.png Overview of Electrolysis components %}

## A simple example

### The chrome script

This is the part of the code that runs in the browser process and listens for messages sent by frame scripts. We’re processing a “click” message and respond with an “alert” message.

{% codeblock lang:js %}
/* chrome script */
let mm = window.messageManager;

mm.addMessageListener("click", function (msg) {
  let browser = msg.target;
  let data = {text: "You clicked a <" + msg.json.tagName + ">!"};
  browser.messageManager.sendAsyncMessage("alert", data);
});

mm.loadFrameScript("chrome://project/content/content.js", true);
{% endcodeblock %}

### The frame script

The frame script (or content script) runs in the same process as the web page and has access to the contentWindow, document and their events. We listen for any click event and send a “click” message providing the tagName of the clicked element. Additionally we listen for “alert” messages and show an alert dialog when we receive them.

{% codeblock lang:js %}
/* content script */
addEventListener("click", function (event) {
  let data = {tagName: event.target.tagName};
  sendAsyncMessage("click", data);
}, false);

addMessageListener("alert", function (msg) {
  alert(msg.json.text);
});
{% endcodeblock %}

### Process communication

This diagram illustrates what the communication between all processes involved looks like (regarding our simple example).

{% img /images/e10s-processes.png Electrolysis process communication %}

## Which parts of your project will be affected by e10s?

### DOM Objects

It’s no longer possible to work with or directly access DOM objects (window, document and normal DOM nodes) from the chrome process. As an example, you are not allowed to access a page’s content window through browser.contentWindow. You’ll have to send a message to a content script that does all the work for you. In content scripts, the “global variable” content is the DOM window of the page loaded in the browser.

### DOM Events

DOMEvents are no longer propagated to the parent <browser\> and you’re not able to call DOMElement.addEventListener(). Use addEventListener() in a content script and then send a message to a listener in the chrome process.

### DocShell

The docShell is no longer accessible. It’s available as a “global variable” named docShell in content scripts.

### nsIWebProgress(Listener)

If you still need to monitor a page’s web progress all you need is (surprise) a content script. This could look like the following:

{% codeblock lang:js %}
/* content script */
let ifaceReq = docShell.QueryInterface(Ci.nsIInterfaceRequestor);
let webProgress = ifaceReq.getInterface(Ci.nsIWebProgress);

let WebProgressListener = { ... };
let mask = Ci.nsIWebProgress.NOTIFY_STATE_ALL;
webProgress.addProgressListener(WebProgressListener, mask);
{% endcodeblock %}

### nsIDOMWindowUtils

The DOM utility interface is also no longer accessible. You still can retrieve it in a content script like this:

{% codeblock lang:js %}
/* content script */
let ifaceReq = content.QueryInterface(Ci.nsIInterfaceRequestor);
let utils = ifaceReq.getInterface(Ci.nsIDOMWindowUtils);
{% endcodeblock %}

## Tips and hints

### sendSyncMessage or sendAsyncMessage?

Sending synchronous message is not allowed for chrome processes. Only content processes can block on the parent. In general you should always try to use sendAsyncMessage() to not block while waiting for the message to be processed. You should try to rewrite your code if it isn’t ready for asynchronous communication, yet. There are a few valid cases where a message needs to be sent synchronously – if you have one of those you should at least try to handle this message as quickly as possible to not block the content process longer than necessary.

### sendSyncMessage()

If you use sendSyncMessage() then you should know that the response is an array of all values returned from each listener.

{% codeblock lang:js %}
/* chrome script */
let mm = browser.messageManager;
mm.addEventListener("mymessage", function () "hello world");
mm.addEventListener("mymessage", function () "hello the 2nd");

/* content script */
let results = sendSyncMessage("mymessage", {foo: "bar"});
print(results[0]); // prints "hello world"
print(results[1]); // prints "hello the 2nd"
{% endcodeblock %}

### globalMessageManager.addFrameScript()

Use this if you want a frame script to be attached to every existing tab/browser of every existing window out there. Set the second parameter, allowDelayedLoad, to true, to automatically load the desired frame script in newly created browsers/tabs (of possibly newly created windows) as well.

### window.loadFrameScript()

The window-specific message manager has the same frame script loading behavior as the global one, but it will add your frame script to every browser in the given window, only.

### browser.loadFrameScript()

If the second parameter, allowDelayedLoad, is false this method will add the frame script only if the browser is ready. If you set it to true and the browser isn’t ready, yet, the script will be added when it becomes ready.

### messageManager.addMessageListener()

When a message from a content script is received the listeners attached via browser.addMessageListener() are called first, and then the ones added via window.addMessageListener(), then the ones via globalMessageManager.addEventListener().

### Message properties

The first argument passed to message listeners is the message they just received. This is an object with the following properties:

{% codeblock lang:text %}
name   - the name of the message
json   - the custom message data
sync   - false if the message was sent asynchronously
         (always false for messages from chrome scripts)
target - the browser associated with the content that this
         message came from
{% endcodeblock %}

### Message name prefixes

At the beginning there won’t be many message users in the Mozilla code base and we should not start consolidating messages before the requirements of all those are fully fleshed out. So it’s better to be over-specific for now and name your messages like "Project:click" instead of just "click" to avoid conflicts.

### Conventions for frame scripts

Frame scripts (or content scripts) should be stored in the same folder as the code that calls loadFrameScript() to load them. A good convention is to name them something like "content-project.js" or just "content.js".
