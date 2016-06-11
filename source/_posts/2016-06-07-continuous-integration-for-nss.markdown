---
layout: post
title: "Continuous Integration for NSS"
subtitle: "Using Taskcluster ..."
date: 2016-06-07 17:17:01 +0200
---

The following image shows the [TreeHerder](https://github.com/mozilla/treeherder/)
UI and the effects of pushing one or multiple changesets to the
[NSS repository](https://hg.mozilla.org/projects/nss). All this is the result
of only a few weeks of work (on our side at least):

{% img /images/treeherder.png The TreeHerder UI showing the NSS repository %}

With [Taskcluster](https://docs.taskcluster.net/) it's nowadays surprisingly
easy to set up and manage your own continous integration infrastructure in the
Mozilla world. Having spent the last few weeks at setting up exactly that for
NSS I want to seize the chance to write about all the steps we took and the
challenges we overcame. Even if you don't contribute to Mozilla you might be
interested in the nitty-gritty of our next-generation task execution framework.

## What's the goal?

The development of NSS as of now is heavily supported by RedHat's
[Kai Engert](https://kuix.de/) and his fleet of buildbots. One can see them in
action by looking at our [Waterfall diagram](http://test.nss-crypto.org/)
showing the build status of the latest pushes to the NSS repository.

The problem with the current setup is that these buildbots are unfortunately
rather hard to maintain and slow. Build and test tasks are run sequentially,
all NSS tests are a big monolithic chunk. Some machines take 10-15 hours,
after the machine became available, before you will be notified about
potential breakage.

So the first thing that needs to be done is to replicate the current setup as
good as possible and then split the monolithic test run into many small tasks
that can run in parallel. Builds will be prepare by build tasks, test tasks
will later download those builds and use them to run tests.

We want a great turnaround time, you should know whether a push broke the tree
after not more than 15-30 minutes. In addition to the all of that we also want
to run a few more tools, like code formatters and static analyzers. We want a
[TreeHerder UI](https://treeherder.mozilla.org/#/jobs?repo=nss) that gives a
good overview of all current build and test tasks, as well as an IRC and email
notification system so we don't have to watch the tree all day.

As Linux is usually the easiest platform to develop on, and Taskcluster already
offers excellent support for Linux tasks, let's get started with that.

## Docker for Linux tasks

To execute Linux tasks, Taskcluster uses Docker. So the first thing we had to
do was to create a Docker image based on one of the official Linux images. It
must contain all dependencies needed to build NSS/NSPR, as well as the scripts
to build and run tests. Our Docker image can be built from the files contained
in the [automation/taskcluster/docker](https://hg.mozilla.org/projects/nss/file/tip/automation/taskcluster/docker)
directory.

Once we had NSS and its tests building and running in Docker locally, the next
step was to kick off Taskcluster tasks to see if the same holds true in the
"cloud". Using the [Task Creator](https://tools.taskcluster.net/task-creator/)
it's not too hard to spawn a one-off task, experiment with your Docker image,
and with the task definition. Taskcluster will automatically pull your image
from DockerHub if you give it the name of your repository:

```json
{
  // ...

  "created": " ... ",
  "deadline": " ... ",
  "payload": {
    "image": "ttaubert/nss-ci:0.0.16",
    "command": [
      ...
    ],
    "maxRunTime": 600
  },

  // ...
}
```

As Docker is well-documented this whole step turned out not to be too difficult
and we were able to rather quickly run successful build and test tasks on the
Taskcluster infrastructure. Now instead of kicking those off manually the
next logical step is to spawn tasks automatically when changesets are
pushed to the repository.

## Using taskcluster-github

Triggering tasks on repository pushes will probably remind you of services like
Travis CI, CircleCI, or AppVeyor, if you worked with any of those before.
Taskcluster offers a very similar tool called
[taskcluster-github](https://github.com/taskcluster/taskcluster-github) that
also uses a configuration file in the root of your repository for task
definitions.

Luckily, you don't have to mess up your repository until you get the
configuration right, simply create fork on GitHub, even if your main repository
is Mercurial, like for us.

The [documentation](http://docs.taskcluster.net/services/taskcluster-github/)
is rather self-explanatory, and the task definition is similar to the one used
by the Task Creator.

What didn't work for us was to set up the GitHub WebHook, so as a member of the
Mozilla organization on GitHub the easiest solution was to move my test
repository there. The taskcluster-github WebHook is set up for every repository
in there automatically.

Once you push to your fork, "Lisa Lionheart", a Taskcluster bot, will comment
on your push and leave either an error message or a link to the task graph
created.

On first try you will most likely see failure telling you that you're missing a
few scopes, i.e. permissions. Talk to the nice folks in [#taskcluster](irc://irc.mozilla.org/taskcluster)
and they can create the necessary role your repository needs to create tasks.

## move scripts into the repository
## Splitting in Build and Test runs

artifacts...

## how to decision tasks
## mozilla-taskcluster (with HG)
## TreeHerder repo config
## TreeHerder extra config
## more tools

e.g. static analyzers etc.

## irc and email notifications
