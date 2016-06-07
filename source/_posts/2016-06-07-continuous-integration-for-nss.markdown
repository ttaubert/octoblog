---
layout: post
title: "Continuous Integration for NSS"
subtitle: "Using Taskcluster ..."
date: 2016-06-07 17:17:01 +0200
---

The following image shows the result of a few weeks of work, the
[TreeHerder](https://github.com/mozilla/treeherder/) UI displaying the effects
of pushing one or multiple changesets to the [NSS repository](https://hg.mozilla.org/projects/nss):

{% img /images/treeherder.png The TreeHerder UI showing the NSS repository %}

Using [Taskcluster](https://docs.taskcluster.net/) it nowadays is surprisingly
easy to set up and manage your own continous integration infrastructure in the
Mozilla world. I will use this post to explain the steps we took as well as the
challenges we overcame. Even if you don't contribute to Mozilla you might be
interested in a few more details of our next-generation task execution framework.

## Docker for Linux tasks

To execute Linux tasks, Taskcluster uses Docker. So the first thing we had to
do was to create a Docker image based on one of the official Linux images. It
will have to contain all dependencies needed to build NSS/NSPR, as well as the
scripts to build and run tests. The Docker image can be built from the files
contained in the [automation/taskcluster/docker](https://hg.mozilla.org/projects/nss/file/tip/automation/taskcluster/docker)
directory.

Once we had NSS and its tests building and running in Docker locally, the next
step was to kick off a Taskcluster tasks to see if the same holds true when
run in our "cloud". Using the [Task Creator](https://tools.taskcluster.net/task-creator/)
it's not too hard to spawn a one-off task, experiment with your Docker image,
as well as with the task definition. Taskcluster will automatically pull your
image from DockerHub if you specify the correct repository:

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

Using this we were able to rather quickly run a successful build and tests on
the Taskcluster infrastructure. Now instead of kicking those off manually the
next logical step is to spawn tasks automatically when something is pushed.

## Using taskcluster-github

Using taskcluster-github is very similar to how TravisCI works, you put a
configuration into the root of your repository that will contain task
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

asdf

## Splitting in Build and Test runs

artifacts...

## how to decision tasks

bla....

## mozilla-taskcluster (with HG)

bla....
