---
layout: post
title: "Working with infinite sequences in JavaScript"
date: 2013-05-06 12:00
---

> Update: Please note that this post describes the current implementation in
> SpiderMonkey. The final
> [ES6 specification](http://wiki.ecmascript.org/doku.php?id=harmony:generators)
> will require generator functions to have a '\*' token as in *function\* nat()
> { ... }*. The *flatten()* function from the last example could use *yield\** to
> delegate instead of a nested loop.

JavaScript comes with most of the little functional tools you need to work on
finite sequences that are usually implemented using Arrays. Array.prototype
includes a number of methods like *map()* and *filter()* that apply a given
function to all items of the Array and return the resulting new Array.

{% codeblock lang:js %}
[1, 2, 3].map(x => x + 1); // result: [2, 3, 4];
{% endcodeblock %}

These tools however are not a good fit for infinite sequences as they always
consume the whole sequence at once to return a new one. Implementing infinite
sequences by yourself means you would have to come up with your own API that
clients need to adhere to. You often would keep state variables whose values
need to be maintained for the duration of the computation process.

## Generators to the rescue

Using ES6
[generators](https://developer.mozilla.org/en-US/docs/JavaScript/Guide/Iterators_and_Generators)
implementing the infinite sequence of all natural numbers turns out to be a
trivial task. We even have language support to iterate over them.

{% codeblock lang:js %}
function nat() {
  var i = 1;
  while (true) {
    yield i++;
  }
}

var it = nat();
console.log(it.next(), it.next(), it.next()); // prints 1 2 3
{% endcodeblock %}

Now that we have a first infinite set we need a couple of functions that help us
working with, combining, and building new sequences.

## Mapping

Let us start with *map()* - a function at the very heart of functional
programming. It builds a new sequence by applying a function to all elements of
a given sequence.

{% codeblock lang:js %}
function map(it, f) {
  for (var x of it) {
    yield f(x);
  }
}
{% endcodeblock %}

Using the generator implementation of *map()* we can now easily write a function
called *squares()* that represents the set of squares of all natural numbers
(1², 2², 3², ..., n²).

{% codeblock lang:js %}
function squares() {
  return map(nat(), x => x * x);
}

var it = squares();
console.log(it.next(), it.next(), it.next()); // prints 1 4 9
{% endcodeblock %}

Using
[for...in](https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Statements/for...in)
instead of
[for...of](https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Statements/for...of)
works fine but using *of* has a neat advantage in that it properly iterates
Arrays as well. If you want to map values of a finite sequence you can just do
that.

{% codeblock lang:js %}
var it = map([1, 2, 3], x => x * x);
console.log(it.next(), it.next(), it.next()); // prints 1 4 9
{% endcodeblock %}

## Filtering

Another common task is filtering specific values from a sequence. Our custom
implementation of *filter()* takes an iterator and a predicate - the returned
sequence will consist of all items of the original one for which the predicate
holds.

{% codeblock lang:js %}
function filter(it, f) {
  for (var x of it) {
    if (f(x)) {
      yield x;
    }
  }
}
{% endcodeblock %}

We can now use *filter()* to create the set of all even natural numbers.

{% codeblock lang:js %}
function even() {
  return filter(nat(), x => x % 2 === 0);
}

var it = even();
console.log(it.next(), it.next(), it.next()); // prints 2 4 6
{% endcodeblock %}

A common derivation from *filter()* is *filterNot()* that simply negates the
given predicate. We can use that to implement *even()* as well.

{% codeblock lang:js %}
function filterNot(it, f) {
  return filter(it, x => !f(x));
}

function even() {
  return filterNot(nat(), x => x % 2);
}
{% endcodeblock %}

## Mersenne primes

Suppose we were to implement a sequence that represents all
[Mersenne prime numbers](https://en.wikipedia.org/wiki/Mersenne_prime).
Mersenne primes are defined as prime numbers of the form M<sub>n</sub> = 2^n - 1,
that is the set of all numbers of the given form that have no positive divisors
other than 1 and themselves. The set of Mersenne primes is
[assumed to be infinite](https://en.wikipedia.org/wiki/Lenstra%E2%80%93Pomerance%E2%80%93Wagstaff_conjecture)
though this remains unproven, yet.


Let us first define some helper functions. *range(from, to)* and *forall()* are
common helpers in functional programming languages. *range()* returns the set of
natural numbers in a given range. *forall()* returns whether the given predicate
holds for all items in the sequence and should therefore only be used for finite
sequences.

{% codeblock lang:js %}
function range(lo, hi) {
  while (lo <= hi) {
    yield lo++;
  }
}

function forall(it, f) {
  for (var x of it) {
    if (!f(x)) {
      return false;
    }
  }

  return true;
}
{% endcodeblock %}

*mersenneNumbers()* is the set of all numbers of the form M<sub>n</sub> = 2^n - 1.
*isPrime()* is a very simple and naive (and slow) primality checker that returns
whether the given candidate is divisible by any of the numbers in the range of
[2, candidate - 1]. We will use *isPrime()* as a filter to remove all non-prime
numbers from *mersenneNumbers()*.

{% codeblock lang:js %}
function mersenneNumbers() {
  return map(nat(), x => Math.pow(2, x + 1) - 1);
}

function mersennePrimes() {
  function isPrime(n) {
    return forall(range(2, n - 1), x => n % x);
  }

  return filter(mersenneNumbers(), isPrime);
}

var it = mersennePrimes();
console.log(it.next(), it.next(), it.next()); // prints 3 7 31
{% endcodeblock %}

## Flattening

As a last example we will implement a function that flattens nested sequences.

{% codeblock lang:js %}
function flatten(it) {
  for (var x of it) {
    if (Object.prototype.toString.call(x) === "[object Generator]" ||
        Array.isArray(x)) {
      for (var y of flatten(x)) {
        yield y;
      }
    } else {
      yield x;
    }
  }
}
{% endcodeblock %}

Note that using *for...of* comes in handy again as we can use it to iterate
over Arrays and generators. Using *flatten()* we can now do:

{% codeblock lang:js %}
flatten([1, [2, 3], [[4], [5]]]); // result: [1, 2, 3, 4, 5]
{% endcodeblock %}

Combining *flatten()* and *map()* to *flatMap()* we can implement another very
common function that flattens the result of applying a given function to all
items of a sequence. Let us use it to re-build the set of all natural numbers
from the set of all even natural numbers.

{% codeblock lang:js %}
function flatMap(it, f) {
  return flatten(map(it, f));
}

var it = flatMap(even(), x => [x - 1, x]);
console.log(it.next(), it.next(), it.next()); // prints 1 2 3
{% endcodeblock %}

## Generators are powerful

It is quite obvious that studying ES6 generators really repays. They are a very
powerful language construct and I personally cannot wait until they are
available in V8/Node.js as well. They will be in the toolbox of every
professional JavaScript developer soon and I am sure we can count on the
community to come up with lots of great uses and libraries.
