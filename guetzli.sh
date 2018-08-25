#!/bin/sh
for jpg in `find images/ -name "*.jpg"`
do
  guetzli "$jpg" "$jpg"
done
