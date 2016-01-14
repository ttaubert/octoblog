---
layout: post
title: "Build your own Signal Desktop"
subtitle: "Package the Signal Private Messenger and NW.js into a standalone app"
date: 2016-01-15 16:00:00 +0100
---

The Signal Private Messenger is great. **Use it.** It's probably the best secure
messenger on the market. When recently a desktop app was announced people were
eager to join the beta and even happier when an invite finally showed up in
their inbox. So was I, it's a great app and works surprisingly well for an early
version.

The only problem is that it's a Chrome App. Apart from excluding folks with
other browsers it's also a shitty user experience. If you too want your
messaging app not tied to a browser then let's just build our own standalone
variant of Signal Desktop.

## Build your very own Signal

Signal Desktop is a Chrome App, so the easiest way to turn it into a standalone
app is to use [NW.js](http://nwjs.io/). Conveniently, their next release v0.13
will ship with Chrome App support and is available for download as a beta
version.

First, make sure you have `git` and `npm` installed. Then open a terminal and
prepare a temporary build directory to which we can download a few things and
where we can build the app:

{% codeblock lang:text %}
$ mkdir signal-build
$ cd signal-build
{% endcodeblock %}

## [OS X] Packaging Signal and NW.js

Download the latest beta of NW.js and `unzip` it. We'll extract the application
and use it as a template for our Signal clone. The NW.js project does
unfortunately not seem to provide a secure source (or at least hashes)
for their downloads.

{% codeblock lang:text %}
$ wget http://dl.nwjs.io/v0.13.0-beta3/nwjs-sdk-v0.13.0-beta3-osx-x64.zip
$ unzip nwjs-sdk-v0.13.0-beta3-osx-x64.zip
$ cp -r nwjs-sdk-v0.13.0-beta3-osx-x64/nwjs.app SignalPrivateMessenger.app
{% endcodeblock %}

Next, clone the Signal repository and use NPM to install the necessary modules.
Run the `grunt` automation tool to build and package the application.

{% codeblock lang:text %}
$ git clone https://github.com/WhisperSystems/Signal-Desktop.git
$ cd Signal-Desktop/
$ npm install
$ node_modules/grunt-cli/bin/grunt
{% endcodeblock %}

Finally, simply to copy the `dist` folder containing all the juicy Signal files
into the application template we created a few moments ago.

{% codeblock lang:text %}
$ cp -r dist ../SignalPrivateMessenger.app/Contents/Resources/app.nw
$ open ..
{% endcodeblock %}

The last command opens a Finder window. Move `SignalPrivateMessenger.app` to
your Applications folder and launch it as usual. You should now see a welcome
page!

## [Linux] Packaging Signal and NW.js

The build instructions for Linux aren't too different but I'll write them down,
if just for convenience. Start by cloning the Signal Desktop repository and
build the Chrome App.

{% codeblock lang:text %}
$ git clone https://github.com/WhisperSystems/Signal-Desktop.git
$ cd Signal-Desktop/
$ npm install
$ node_modules/grunt-cli/bin/grunt
{% endcodeblock %}

The `dist` folder contains the app, ready to be launched. `zip` it and place
the resulting package somewhere handy.

{% codeblock lang:text %}
$ cd dist
$ zip -r ../../package.nw *
{% endcodeblock %}

Back to the top. Download the NW.js binary, `unzip` it, and change into the
newly created directory. Move the `package.nw` file we created earlier next to
the `nw` binary and we're done. The `nwjs-sdk-v0.13.0-beta3-linux-x64` folder
does now contain the standalone Signal app.

{% codeblock lang:text %}
$ cd ../..
$ wget http://dl.nwjs.io/v0.13.0-beta3/nwjs-sdk-v0.13.0-beta3-linux-x64.tar.gz
$ tar xfz nwjs-sdk-v0.13.0-beta3-linux-x64.tar.gz
$ cd nwjs-sdk-v0.13.0-beta3-linux-x64
$ mv ../package.nw .
{% endcodeblock %}

Finally, launch NW.js. You should see a welcome page!

{% codeblock lang:text %}
$ ./nw
{% endcodeblock %}

## If you see something, file something

Our standalone Signal clone mostly works, but it's far from perfect. We're
pulling from master and that might bring breaking changes that weren't
sufficiently tested.

We don't have the right icons. The app crashes when you click a media message.
It opens a blank popup when you click a link. It's quite big because also NW.js
has bugs and so we have to use the SDK build for now. In the future it would be
great to have automatic updates, and maybe even signed builds.

Remember, Signal Desktop is beta, and completely untested with NW.js. If you
want to help file bugs, but only after checking that those affect the Chrome
App too. If you want to fix a bug only occurring with NW.js it's probably best
to file a pull request.
