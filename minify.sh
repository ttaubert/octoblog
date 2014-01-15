#!/bin/sh

# app
cat scripts/jquery.min.js \
    scripts/slimbox2.js \
    scripts/main.js \
    > source/javascripts/main.tmp.js

java -jar ~/workspace/yuicompressor-2.4.8.jar \
    -o source/javascripts/main.js \
    source/javascripts/main.tmp.js

rm source/javascripts/main.tmp.js
