#!/bin/sh

cd $(dirname $0)
rsync -avcze 'ssh' --exclude='*.swp' --exclude='*.swo' --delete _site/ timtaubert:/opt/www/timtaubert.de/
