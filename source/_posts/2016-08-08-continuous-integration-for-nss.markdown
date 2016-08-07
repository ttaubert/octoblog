---
layout: post
title: "Continuous Integration for NSS"
subtitle: "Automating builds and tests with Mozilla's Taskcluster framework"
date: 2016-08-08 18:00:00 +0200
---

The following image shows our [TreeHerder dashboard](https://treeherder.mozilla.org/#/jobs?repo=nss)
after pushing a changesets to the [NSS repository](https://hg.mozilla.org/projects/nss).
It is the result of a rather moderate amount of work (on our side):

{% img /images/treeherder.png The TreeHerder dashboard showing the NSS repository %}

[Taskcluster](https://docs.taskcluster.net/) makes it easy to set up and manage
continous integration for Mozilla projects. Having spent the last few weeks
doing exactly that for NSS I'll share my experience in this post - and even if
you don't manage a Mozilla project you might be interested in the nitty-gritty
of our next-generation task execution framework.

## What is the goal?

The development of NSS has for a long time been heavily supported by a fleet of
buildbots. You can see them in action by looking at our [Waterfall diagram](http://test.nss-crypto.org/)
showing the build status of the latest pushes to the NSS repository.

Unfortunately, this setup is rather complex and the bots are slow. Build and
test tasks are run sequentially and so on some machines it takes 10-15 hours
before you will be notified about potential breakage.

The first thing that needs to be done is to replicate the current setup as good
as possible and then split monolithic test runs into many small tasks that can
be run in parallel. Builds will be prepared by build tasks, test tasks will
later download those pieces (called *artifacts*) to run tests.

A good turnaround time is essential, ideally one should know whether a push
broke the tree after not more than 15-30 minutes. We want a [TreeHerder](https://github.com/mozilla/treeherder/)
dashboard that gives a good overview of all current build and test tasks, as
well as an IRC and email notification system so we don't have to watch the
tree all day.

## Docker for Linux tasks

To build and test on Linux, Taskcluster uses Docker. The build instructions for
the image containing all NSS dependencies, as well as the scripts to build and
run tests, can be found in the [automation/taskcluster/docker](https://hg.mozilla.org/projects/nss/file/tip/automation/taskcluster/docker)
directory.

Once you have NSS and its tests building and running in a local Docker container,
the next step is to kick off a Taskcluster task in the *cloud*. You can use the
[Task Creator](https://tools.taskcluster.net/task-creator/) to spawn a one-off
task, experiment with your Docker image, and with the task definition.
Taskcluster will automatically pull your image from DockerHub:

```json
{

  "created": " ... ",
  "deadline": " ... ",
  "payload": {
    "image": "ttaubert/nss-ci:0.0.19",
    "command": [
      ...
    ],
    "maxRunTime": 3600
  },

}
```

Docker is well-documented, so this step shouldn't be too difficult and you
should be able to confirm everything runs fine in almost no time. Now instead
of kickingoff tasks manually the next logical step is to spawn tasks
automatically when changesets are pushed to the repository.

## Using taskcluster-github

Triggering tasks on repository pushes should remind you of Travis CI, CircleCI,
or AppVeyor, if you worked with any of those before. Taskcluster offers a similar
tool called [taskcluster-github](https://github.com/taskcluster/taskcluster-github)
that uses a configuration file in the root of your repository for task definitions.

If your master is a Mercurial repository then it's very helpful that you don't
have to mess with it until you get the configuration right, and instead simply
create a fork on GitHub. The [documentation](http://docs.taskcluster.net/services/taskcluster-github/)
is rather self-explanatory, and the task definition is similar to the one used
by the Task Creator.

Once the WebHook is set up and receives pings, a push to your fork will make
"Lisa Lionheart", the Taskcluster bot, comment on your push and leave either an
error message or a link to the task graph. If on the first try you see failures
about missing scopes you are lacking permissions and should talk to the nice
folks over in [#taskcluster](irc://irc.mozilla.org/taskcluster).

## Move scripts into the repository

Once you have a GitHub fork that is kicking off build and test tasks when
pushing you should move all the scripts you wrote so far into the repository.
The only script left on the Docker image would be a script that checks out the
hg/git repository and then uses the scripts in the tree to build and run tests.

This step will pay off very early in the process, rebuilding and pushing the
Docker image to DockerHub is something that you really don't want to do too
often. All NSS scripts for Linux live in the [automation/taskcluster/scripts](https://hg.mozilla.org/projects/nss/file/tip/automation/taskcluster/scripts)
directory.

```bash
#!/usr/bin/env bash

set -v -e -x

if [ $(id -u) = 0 ]; then
    # Drop privileges by re-running this script.
    exec su worker $0 $@
fi

# Do things here ...
```

Use the above snippet as a template for your scripts. It will set a few flags
that help with debugging later, drop root privileges, and rerun it as the
unprivileged *worker* user. If you need to do things as root before building or
running tests, just put them before the `exec su ...` call.

## Split build and test runs

Taskcluster encourages many small tasks. It's easy to split the big monolithic
test run I mentioned at the beginning into multiple tasks, one for each test
suite. However, you wouldn't want to build NSS before every test run again,
so we should build it only once and then reuse the binary. Taskcluster allows
to leave artifacts after a task run that can then be downloaded by subtask.

```bash
# Build.
cd nss && make nss_build_all

# Package.
mkdir artifacts
tar cvfjh artifacts/dist.tar.bz2 dist
```

The above snippet builds NSS and creates an archive containing all the binaries
and libraries. You need to let Taskcluster know that there's a directory with
artifacts so that it picks those up and makes them available to the public.

```json
{

  "created": " ... ",
  "deadline": " ... ",
  "payload": {
    "image": "ttaubert/nss-ci:0.0.19",
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
    "maxRunTime": 3600
  },

}
```

The test tasks uses the `$TC_PARENT_TASK_ID` environment variable to determine
the correct download URL, unpacks the build and starts running tests. Making
artifacts automatically available to subtasks, without having to pass the parent
task ID and build a URL, will hopefully be added to Taskcluster in the future.

```bash
# Fetch build artifact.
curl --retry 3 -Lo dist.tar.bz2 https://queue.taskcluster.net/v1/task/$TC_PARENT_TASK_ID/artifacts/public/dist.tar.bz2
tar xvjf dist.tar.bz2

# Run tests.
cd nss/tests && ./all.sh
```

## Writing decision tasks

Specifying task dependencies in your .taskcluster.yml file is unfortunately not
possible at the moment. Even though the set of builds and tasks you want may
be static you can't create the necessary links without knowing the random task
IDs assigned to them.

Your only option is to create a so-called *decision task*. A decision task is
the only task defined in your .taskcluster.yml file and started after you
push a new changeset. It will leave an artifact in the form of a JSON file that
Taskcluster picks up and uses to extend the task graph, i.e. schedule further
tasks with appropriate dependencies. You can use whatever tool you like to
generate these JSON files, e.g. Python, Ruby, Node.JS, C, ...

```yaml
task:
  payload:
    image: "ttaubert/nss-ci:0.0.19"

    maxRunTime: 1800

    artifacts:
      public:
        type: "directory"
        path: "/home/worker/artifacts"
        expires: "{{#from_now}}7 days{{/from_now}}"

    graphs:
      - /home/worker/artifacts/graph.json
```

All task graph definitions including the Node.JS build script for NSS can be
found in the [automation/taskcluster/graph](https://hg.mozilla.org/projects/nss/file/tip/automation/taskcluster/graph)
directory. Depending on the needs of your project you might want to use a
completely different structure. All that matters is that in the end you
produce a valid JSON file. Slightly more intelligent decision tasks can be used
to implement features like [try syntax](https://wiki.mozilla.org/NSS:TryServer#Using_try_syntax).

## mozilla-taskcluster for Mercurial projects

If all of the above is working with GitHub but your main repository is hosted
on *hg.mozilla.org* you will want to have Mercurial kick off Taskcluster tasks,
instead of the GitHub WebHook.

The Taskcluster team is working on making .taskcluster.yml files work for
Mozilla-hosted Mercurial repositories too, but while that work isn't finished
yet you have to add your project to [mozilla-taskcluster](https://github.com/taskcluster/mozilla-taskcluster/).
mozilla-taskcluster will listen for pushes and then kick off decision tasks
just like the WebHook.

## TreeHerder Configuration

A CI is no CI without a proper dashboard. That's the role of [TreeHerder](https://github.com/mozilla/treeherder/)
at Mozilla. Add your project to the end of the [repository.json](https://github.com/mozilla/treeherder/blob/master/treeherder/model/fixtures/repository.json)
file and create a new pull request. It will usually take a day or two after
merging until your change is deployed and your project shows up in the
dashboard.

TreeHerder gets the per-task configuration from the task definition. You can
configure the symbol, the platform and collection (i.e. row), and other
parameters. Here's the configuration data for the green *B* at the start of the
fifth row of the image at the top of this post:

```json
{

  "created": " ... ",
  "deadline": " ... ",
  "payload": {
    ...
  },
  "extra": {
    "treeherder": {
      "jobKind": "build",
      "symbol": "B",
      "build": {
        "platform": "linux64"
      },
      "machine": {
        "platform": "linux64"
      },
      "collection": {
        "debug": true
      }
    }
  }

}
```

## IRC and email notifications

Taskcluster is a very modular system and offers many APIs. It's built with
Node, and thus there many Node libraries available to interact with the many
parts. The communication between those is realized by RabbitMQ.

The last missing piece is an IRC and email notification sysmte, a bot that
notifies about failures on IRC and sends emails to all parties involved. It was
a piece of cake to write [nss-tc](https://github.com/ttaubert/nss-taskcluster)
that uses Taskcluster Node.JS libraries and Mercurial JSON APIs to connect to
the task queue and listen for task definitions and failures.

## A view from above

I could have probably written a post with details about each of the above
sections but I think it's much more helpful to start with a good overview of
all necessary steps to get the CI for a project up and running. The steps
itself will require some more time but their progression is hopefully much more
obvious now if you haven't had too much of a clue about Taskcluster and TreeHerder
so far.
