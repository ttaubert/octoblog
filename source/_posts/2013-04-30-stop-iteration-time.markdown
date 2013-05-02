---
layout: post
title: "Stop. Iteration time!"
date: 2013-05-03 18:00
---

You have probably already heard of
[generators/iterators](https://developer.mozilla.org/en-US/docs/JavaScript/Guide/Iterators_and_Generators)
coming to a browser near you. They have been available in Firefox for a long
time and are used extensively all over the Mozilla code base. The V8 team
will implement iterators and generators
[once ES6 has been finalized](http://code.google.com/p/v8/issues/detail?id=2355).

This post describes the current implementation in SpiderMonkey and tries to
include the current state of the ES6 draft and discussions.

## A simple generator

Let us take a look at a simple example of a generator function that represents
an infinite sequence containing all the numbers from 0 to *Number.MAX_VALUE*.
Once it reaches *MAX_VALUE* it will not increase any further but always return
the same number.

{% codeblock lang:js %}
function myInfiniteGenerator() {
  var i = 0;
  while (true) {
    yield i++;
  }
}

var iter = myInfiniteGenerator();

while (true) {
  console.log(iter.next());
}
{% endcodeblock %}

Any object of the following shape is an
[iterator](http://wiki.ecmascript.org/doku.php?id=harmony:iterators):

{% codeblock lang:js %}
{ next: function() -> any }
{% endcodeblock %}

The *next()* method simply returns the item next in the sequence.

## Finite sequences

As you surely noticed the generator of the first example produces iterators that
will never run out of items. The next example shows an iterator representing a
finite sequence:

{% codeblock lang:js %}
function MyFiniteIterator(max) {
  this.cur = 0;
  this.max = max;
}

MyFiniteIterator.prototype.next = function () {
  if (this.cur < this.max) {
    return this.cur++;
  }

  throw StopIteration;
};
{% endcodeblock %}

Here you can see how to implement custom iterators without writing generator
functions. Please note that it throws *StopIteration* as soon as it reaches the
maximum value to signal that the sequence is exhausted. It is a lot more elegant
to implement the same sequence using a generator function:

{% codeblock lang:js %}
function myFiniteGenerator(max) {
  var i = 0;
  while (i < max) {
    yield i++;
  }
}
{% endcodeblock %}

Generator functions will automatically throw *StopIteration* when terminating.
So how should one consume iterators with finite sequences?

## Consuming sequences

In Java, you would check *iter.hasNext()* and stop when it returns false. In
JavaScript however you need to use a *try...catch* statement to catch
*StopIteration* when it is being thrown.

{% codeblock lang:js %}
var iter = myFiniteGenerator(10);

while (true) {
  try {
    console.log(iter.next());
  } catch (e if e === StopIteration) {
    break;
  }
}
{% endcodeblock %}

You might wonder if there is a better way to do this and indeed there is. Using
*for...in* or *for...of* you do not have to catch *StopIteration* yourself, the
JavaScript engine will do it for you. As soon as the sequence is exhausted the
loop will terminate normally without the exception being propagated:

{% codeblock lang:js %}
var iter = myFiniteGenerator(10);

for (var i in iter) {
  console.log(iter.next());
}
{% endcodeblock %}

## StopIteration is special

*StopIteration* actually is a standard variable that is bound to an object of
class *StopIteration*. It is an ordinary object with no properties of its own
and it is not a constructor function.

{% codeblock lang:js %}
try {
  throw StopIteration;
} catch (e if e instanceof StopIteration) {
  // This works because:
  StopIteration instanceof StopIteration === true;
}
{% endcodeblock %}

As *StopIteration* is a singleton of type *StopIteration* you can also catch it
by checking for equality:

{% codeblock lang:js %}
try {
  throw StopIteration;
} catch (e if e === StopIteration) {
  // ... handle exception
}
{% endcodeblock %}

## StopIteration is mutable

You should be aware that *StopIteration* is a mutable global. Just like
*undefined* it can be modified to hold any other value. If you write a library
and want to shield against modifications from outside you can use this neat
little trick I found on
[Dave Herman's blog](http://calculist.blogspot.de/2008/04/how-to-spell-stopiteration.html):

{% codeblock lang:js %}
(function(){try{(function(){true||(yield)})().next()}catch(e){return e}})()
{% endcodeblock %}

The inner function is a generator that terminates immediately and therefore will
throw a *StopIteration*. The outer function simply catches and returns it.

## StopIteration may become a constructor

The current
[iterator strawman](http://wiki.ecmascript.org/doku.php?id=harmony:iterators#stopiteration)
states that *StopIteration* will become a constructor to maintain compatibility
with generator functions returning values.

{% codeblock lang:js %}
Iter.prototype.next = function () {
  if (this.cur < this.max) {
    return this.cur++;
  }

  var stop = new StopIteration();
  stop.value = "sequence exhausted";
  throw stop;
};
{% endcodeblock %}

The equality check from above would not work anymore so it might be better to
just use *instanceof*.

## StopIteration may not be part of ES6

The Python way of throwing to denote the end of a sequence is backwards
compatible with old ECMAScript versions but there seem to be
[people](https://mail.mozilla.org/pipermail/es-discuss/2013-February/028668.html)
[not happy](https://mail.mozilla.org/pipermail/es-discuss/2013-March/028937.html)
[with the current proposal](http://esdiscuss.org/notes/2013-03-12).
While I can't tell whether *StopIteration* is really to be removed from the
proposal a couple of alternative suggestions have been made:

### Introduce a keyword to end a frame

To not misuse exceptions for normal control flow ES6 could introduce a
*stopiteration* or *endframe* keyword that would end the current frame with
an optional return value. The downside is that it would not scale well and is
probably not backwards compatible.

{% codeblock lang:js %}
Iter.prototype.next = function () {
  if (this.cur < this.max) {
    return this.cur++;
  }

  stopiteration [reason];
  // or endframe [reason];
};
{% endcodeblock %}

### Add an iterator.hasNext() method

Just like Java the iterator API could consist of the two methods *next()* and
*hasNext()*. The client would then need to check *hasNext()* every time before
calling *next()*.

{% codeblock lang:js %}
Iter.prototype = {
  hasNext: function () {
    return this.cur < this.max;
  },

  next: function () {
    if (this.hasNext()) {
      return this.cur++;
    }

    throw new Error("sequence exhausted");
  }
};
{% endcodeblock %}

### Let next() return an object of shape:

Custom iterators would be required to implement a single method but would not
need to throw. Instead they would return an object with *done* set to true to
indicate that the sequence has ended. The *value* property would be used to
store values passed to *yield* or *return* in a generator function.

{% codeblock lang:js %}
{
  next() -> { done: false , value: any }
          | { done: true[, value: any] }
}
{% endcodeblock %}

This is in no way a complete list of possibilites or proposals that were brought
up on [es-discuss](http://mail.mozilla.org/pipermail/es-discuss/) but merely
some food for thought if you might think that *StopIteration* is not the right
approach.
