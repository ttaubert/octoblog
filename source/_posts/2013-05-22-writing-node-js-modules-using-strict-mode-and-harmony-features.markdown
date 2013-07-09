---
layout: post
title: "Writing node.js modules using strict mode and Harmony features"
date: 2013-05-22 09:14
published: false
---

Motivated by seeing generators finally
[land in V8](http://wingolog.org/archives/2013/05/08/generators-in-v8) I thought
it would be a great idea to write a node.js module that makes use of a couple
of ES6 Harmony features and strict mode as well.

Using node.js with strict mode and Harmony features is quite easy. All you have
to do is run node with the arguments `--use_strict` and `--harmony`. If you now
want to test your module it's still very easy to do: `node --use_strict
--harmony test/index.js`.

Now you probably would like to run tests with `npm test` like for every other
node.js module out there and also integrate it with a CI infrastructure like
Travis?

As a newcomer to the node.js community facing the same problem, I picked some
test framework that seemed popular and ended up with `tap`. It unfortunately
lacks the option to pass arbitrary arguments to node and so I filed a
[pull request](https://github.com/isaacs/node-tap/pull/78) that does exactly
this.

To not have to wait until this PR gets eventually merged or not I quickly
created the `tap-harmony` fork. The only thing it does is add the two command
line arguments `--strict` and `--harmony`. All you need to do to use it is
putting these lines into your package.json file:

``` js
{
  "scripts": {
    "test": "tap-harmony --strict --harmony test/*.js"
  },
  "devDependencies": {
    "tape": "~1.0.2",
    "tap-harmony": "~0.4.3"
  }
}
```

You may have noticed the `tape` dependency here.

now you can just do `npm test` or use Travis CI
Travis needs to update their node build env
https://twitter.com/ttaubert/status/335090639710597120

we need tape because tap and its dependencies aren't ready for strict mode

``` js
let test = require("tape").test;

test("simple generator test", function (t) {
  t.plan(2)

  function* g() {
    yield 1;
  }

  let it = g();
  t.equal(it.next().value, 1);
  t.ok(it.next().done);

  t.end();
});
```
