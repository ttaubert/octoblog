FROM ubuntu:latest
MAINTAINER Tim Taubert <tim@timtaubert.de>

RUN useradd -d /home/worker -s /bin/bash -m worker
WORKDIR /home/worker

# Install dependencies.
ADD setup.sh /tmp/setup.sh
RUN bash /tmp/setup.sh

# Change user.
USER worker

# Install dependencies.
ADD setup-user.sh /tmp/setup-user.sh
RUN bash /tmp/setup-user.sh

# Env variables.
ENV HOME /home/worker
ENV SHELL /bin/bash
ENV USER worker
ENV LOGNAME worker
ENV HOSTNAME worker
ENV LANG en_US.UTF-8
ENV LC_ALL en_US.UTF-8
ENV HOST localhost
ENV DOMSUF localdomain

# Binaries.
ENV PATH "${PATH}:/home/worker/.gem/ruby/2.3.0/bin"

# Set a default command for debugging.
CMD ["/bin/bash", "--login"]
