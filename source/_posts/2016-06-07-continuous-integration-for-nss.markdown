---
layout: post
title: "Continuous Integration for NSS"
subtitle: "Automated builds and tests using Mozilla's Taskcluster framework"
date: 2016-06-14 17:17:01 +0200
published: false
---

The following image shows our [TreeHerder dashboard](https://treeherder.mozilla.org/#/jobs?repo=nss)
and the effects of pushing one or multiple changesets to the
[NSS repository](https://hg.mozilla.org/projects/nss). All this is the result
of a rather moderate amount of work (on our side at least):

{% img /images/treeherder.png The TreeHerder dashboard showing the NSS repository %}

With [Taskcluster](https://docs.taskcluster.net/) it's nowadays surprisingly
easy to set up and manage continous integration for Mozilla projects. Having
spent the last few weeks doing exactly that for NSS I want to seize the chance
to write about our experience - and even if you don't manage a Mozilla project
you might be interested in the nitty-gritty of our next-generation task
execution framework.

## What's the goal?

The development of NSS as of now is heavily supported by RedHat's
[Kai Engert](https://kuix.de/) and his fleet of buildbots. One can see them in
action by looking at our [Waterfall diagram](http://test.nss-crypto.org/)
showing the build status of the latest pushes to the NSS repository.

The problem with the current setup is that it's unfortunately rather complex
and the bots are slow. Build and test tasks are run sequentially, all NSS tests
as a big monolithic chunk. On some machines it takes 10-15 hours, that is after
they became available, before you will be notified about potential breakage.

So the first thing that needs to be done is to replicate the current setup as
good as possible and then split monolithic test runs into many small tasks that
can be run in parallel. Builds will be prepared by build tasks, test tasks will
later download and use them to run tests.

A good turnaround time is essential, ideally one should know whether a push
broke the tree after not more than 15-30 minutes. In addition to all of that
we also want to run a few more tools, like code formatters, static analyzers,
and interoperability test suites. We want a [TreeHerder](https://github.com/mozilla/treeherder/)
dashboard that gives a good overview of all current build and test tasks, as
well as an IRC and email notification system so we don't have to watch the
tree all day.

As Taskcluster already offers excellent Linux support, let's concentrate on
that. When everything is done we will be able to add Windows and OS X tasks
to the setup without a lot of work, except for some fiddling with the respective
toolchains.

## Docker for Linux tasks

To execute Linux tasks, Taskcluster uses Docker. The first thing we had to do
was to create a Linux-based Docker image that contains all the dependencies
needed to build NSS/NSPR, as well as the scripts to build and run tests. Our
Docker image can be built from the files contained in the
[automation/taskcluster/docker](https://hg.mozilla.org/projects/nss/file/tip/automation/taskcluster/docker)
directory.

Once we had NSS and its tests building and running in Docker locally, the next
step was to kick off Taskcluster tasks to see if the same holds true in the
"cloud". Using the [Task Creator](https://tools.taskcluster.net/task-creator/)
it's not too hard to spawn a one-off task, experiment with your Docker image,
and with the task definition. Taskcluster will automatically pull your image
from DockerHub if you give it the name of your repository:

```json
{

  "created": " ... ",
  "deadline": " ... ",
  "payload": {
    "image": "ttaubert/nss-ci:0.0.16",
    "command": [
      ...
    ],
    "maxRunTime": 600
  },

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
Taskcluster offers a similar tool called [taskcluster-github](https://github.com/taskcluster/taskcluster-github)
that also uses a configuration file in the root of your repository for task
definitions.

It's very helpful that you don't have to mess with your upstream repository to
get the configuration right, you can simply create a fork on GitHub, even if
your main repository is Mercurial. The [documentation](http://docs.taskcluster.net/services/taskcluster-github/)
is rather self-explanatory, and the task definition is similar to the one used
by the Task Creator.

What didn't work for us was to set up the GitHub WebHook, so as a member of the
Mozilla organization on GitHub the easiest solution was to move the test
repository there. The taskcluster-github WebHook is set up for every
repository in there automatically.

Once the WebHook is set up and receives the right pings, a push to your fork
will make "Lisa Lionheart", the Taskcluster bot, comment on your push and leave
either an error message or a link to the task graph.

If on the first try you see failures about missing scopes then you are very
likely lacking a few permissions. Talk to the nice folks over in
[#taskcluster](irc://irc.mozilla.org/taskcluster) and they can
create the necessary role your repository needs to create tasks.

## Move build and test scripts into the repository

Once you have a GitHub fork that is kicking off build and test tasks for you
when pushing you should move all the scripts you wrote for that into your
repository.

The only script left on the Docker image would be a script that checks out
the mercurial/git repository and then uses the scripts in the tree to build
and run tests.

This will pay off already very early, rebuilding the Docker image and pushing
to DockerHub is something that you really wouldn't want to do too often.

The scripts for Linux for NSS live here: https://hg.mozilla.org/projects/nss/file/tip/automation/taskcluster/scripts

It's helpful to start your bash scripts with the following. This will have your
bash script echo all its steps to the console, which is great for debugging,
and exit as soon as a single command fails.

Use this as a template, it will drop the root privileges your scripts has been
executed with and run it as "worker".

```bash
#!/usr/bin/env bash

set -v -e -x

if [ $(id -u) = 0 ]; then
    # Drop privileges by re-running this script.
    exec su worker $0
fi

# Do things here ...
```

## Splitting build and test runs

If you have a build process that takes long you wouldn't want to do it before
every test run then you can split your tasks into specific build and test tasks.

Taskcluster allows to leave artifacts after a task run, those can then be
downloaded by dependent tasks after the build completed.

```bash
# Build.
cd nss && make nss_build_all

# Package.
mkdir artifacts
tar cvfjh artifacts/dist.tar.bz2 dist tests_results
```

```json
{

  "created": " ... ",
  "deadline": " ... ",
  "payload": {
    "image": "ttaubert/nss-ci:0.0.16",
    "artifacts": {
      "public": {
        "type": "directory",
        "path": "/home/worker/artifacts",
        "expires": " ... "
      }
    },
    "command": [
      ...
    ],
    "maxRunTime": 600
  },

}
```

(show snippet of how to download an artifact)

## Writing decision tasks

Specifying task dependencies with taskcluster-github is unfortunately not
possible at the moment. Even though the set of builds and tasks you want may
be static, you can't create the necessary links between them without knowing
the random taskIds assigned to them.

The only option you have is to create a so-called *decision task*. A decision
task is the only task defined in your .taskcluster.yml file and started after
you pushed a new changeset.

It will leave an artifact in the form of a JSON file that Taskcluster will pick
up and use to extend the task graph, i.e. schedule further tasks with
appropriate dependencies. As you can use whatever tool you like to generate
these JSON files (e.g. Python, Ruby, Node.JS, C, etc.) it is easy to generate
random UUIDs for tasks and link them.

The whole task graph definition including the Node.JS build script for NSS can
be found here: https://hg.mozilla.org/projects/nss/file/tip/automation/taskcluster/graph

Depending on the needs of your project you might want to use a completely
different structure for you task graph definition. However you do it doesn't
really matter though as long as at the end there is a valid JSON file ready
for pick up.

```yaml
task:
  payload:
    image: "ttaubert/nss-ci:0.0.16"

    maxRunTime: 1800

    artifacts:
      public:
        type: "directory"
        path: "/home/worker/artifacts"
        expires: "{{#from_now}}7 days{{/from_now}}"

    graphs:
      - /home/worker/artifacts/graph.json
```

## mozilla-taskcluster (with HG)
## TreeHerder repo config
## TreeHerder extra config
## more tools

e.g. static analyzers etc.

## irc and email notifications
