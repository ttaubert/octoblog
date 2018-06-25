#!/bin/sh
for png in `find images/ -name "*.png"`
do
  pngcrush -brute -ow "$png"
done
