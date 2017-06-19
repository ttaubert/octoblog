#!/usr/bin/env bash

set -v -e -x

# Update packages.
export DEBIAN_FRONTEND=noninteractive
apt-get -y update && apt-get -y upgrade

apt_packages=()
apt_packages+=('build-essential')
apt_packages+=('git')
apt_packages+=('locales')
apt_packages+=('python')
apt_packages+=('ruby')
apt_packages+=('ruby-dev')
apt_packages+=('silversearcher-ag')
apt_packages+=('tzdata')
apt_packages+=('vim')

# Install packages.
apt-get install -y ${apt_packages[@]} --no-install-recommends

locale-gen en_US.UTF-8
dpkg-reconfigure locales

# Set timezone.
echo Europe/Berlin > /etc/timezone
dpkg-reconfigure -f noninteractive tzdata

# Cleanup.
rm -rf ~/.ccache ~/.cache
apt-get autoremove -y
apt-get clean
apt-get autoclean
rm $0
