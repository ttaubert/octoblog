#!/bin/sh
for png in `find source/images/ -name "*.png"`
do
  pngcrush -brute -ow "$png"
done
