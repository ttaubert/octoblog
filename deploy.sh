#!/bin/sh

rsync -avcze 'ssh' --dry-run --exclude='*.swp' --exclude='*.swo' --delete _site/ timtaubert:/opt/www/timtaubert.de/
