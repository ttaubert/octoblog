#!/bin/sh

# app
cat scripts/jquery.min.js \
    scripts/slimbox2.js \
    scripts/main.js \
    > source/javascripts/main.tmp.js

java -jar ~/Downloads/yuicompressor-2.4.7.jar \
    -o source/javascripts/main.js \
    source/javascripts/main.tmp.js

rm source/javascripts/main.tmp.js
