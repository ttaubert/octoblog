#!/usr/bin/env bash

set -v -e -x

# Install gems.
gem install octopress --user-install
gem install octopress-date-format --user-install
gem install rdiscount --user-install
gem install rubypants --user-install
gem install jekyll-sitemap --user-install

# Install patched version of pygments.rb.
git clone -b custom-v0.6.3 https://github.com/ttaubert/pygments.rb
cd pygments.rb/
gem build pygments.rb.gemspec
gem install pygments.rb-0.6.3.gem --user-install
cd ..
