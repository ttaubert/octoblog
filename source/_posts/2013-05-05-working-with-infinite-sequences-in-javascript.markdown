---
layout: post
title: "Working with infinite sequences in JavaScript"
date: 2013-05-05 22:59
---

Using the new generators implementing infinite sequence is a trivial task.

Without generators implementing sequences would be tedious.

{% codeblock lang:js %}
[1, 2, 3].map(x => x + 1); // result: [2, 3, 4];
{% endcodeblock %}

{% codeblock lang:js %}
// Sequence of all natural numbers, starting with 1.
function nat() {
  var i = 1;
  while (true) {
    yield i++;
  }
}

var it = nat();
console.log(it.next(), it.next(), it.next()); // prints 1 2 3
{% endcodeblock %}

Before generators however, sequences were mostly implemented using Arrays.
Arrays bring all important functionality like map(), filter(), some() and
every() but they were designed with only Arrays in mind. They are not at all
suited to work with infinite sequences. We therefore need to write our own
tools.

## Mapping

Let us start with *map()* - a function at the very heart of functional
programming. It builds a new sequence by applying a given function to all
elements of a given sequence.

{% codeblock lang:js %}
function map(it, f) {
  for (var x of it) {
    yield f(x);
  }
}
{% endcodeblock %}

Using the generator implementation of *map()* we could now write a function
called *squares()* that implements the sequence of squares of all natural
numbers (1², 2², 3², ..., n²).

{% codeblock lang:js %}
// Sequence of squares of all natural numbers.
function squares() {
  return map(nat(), x => x * x);
}

var it = squares();
console.log(it.next(), it.next(), it.next()); // prints 1 4 9
{% endcodeblock %}

## Filtering

Another common task is filtering specific values from a sequence. Our custom
implementation of *filter()* takes an iterator and a predicate. The returned
sequence will consist of all items of the original one for which the predicate
holds.

{% codeblock lang:js %}
// Returns a sequence consisting of all items of the
// original sequence where the given predicate holds.
function filter(it, f) {
  for (var x of it) {
    if (f(x)) {
      yield x;
    }
  }
}
{% endcodeblock %}

We could now use *filter()* to easily create the sequence of all even natural
numbers.

{% codeblock lang:js %}
// Sequence of all even natural numbers.
function even() {
  return filter(nat(), x => x % 2 === 0);
}

var it = even();
console.log(it.next(), it.next(), it.next()); // prints 2 4 6
{% endcodeblock %}

*filterNot()* is quite simple to derive from *filter()* and we could use that
too to implement *even()*.

{% codeblock lang:js %}
// Returns a sequence consisting of all items of the
// original sequence where the given predicate does *NOT* hold.
function filterNot(it, f) {
  return filter(it, x => !f(x));
}

// Sequence of all even natural numbers.
function even() {
  return filterNot(nat(), x => x % 2);
}
{% endcodeblock %}

## Mersenne primes

Suppose we were to find all
[Mersenne prime numbers](https://en.wikipedia.org/wiki/Mersenne_prime) and want
to use generators.

Let us define some helper functions. *range(from, to)* and *forall()* are common
helpers in functional programming languages. *range()* allows us to iterate all
numbers in a given range. *forall()* returns true if the given predicate returns
true for all items in the sequence and should therefore only be used for finite
ones.

{% codeblock lang:js %}
// Sequence of numbers in range [lo, hi].
function range(lo, hi) {
  while (lo <= hi) {
    yield lo++;
  }
}

// Returns a boolean to indicate whether a given
// predicate holds for all items of a given sequence.
function forall(it, f) {
  for (var x of it) {
    if (!f(x)) {
      return false;
    }
  }

  return true;
}
{% endcodeblock %}

Mersenne primes are defined as numbers of the form M_n = 2^n - 1, that is the
set of all numbers of the given form that have no positive divisors other than
1 and themselves. *candidates()* is the sequence of all Mersenne numbers that is
then filtered using *isPrime()*. The algorithm used by *isPrime()* is a very
simple but slow one and checks that the given candidate is not divisible by any
of the numbers in the range of 2 to candidate - 1.

{% codeblock lang:js %}
// Sequence of all Mersenne numbers.
function mersenneNumbers() {
  return map(nat(), x => Math.pow(2, x) - 1);
}

// Sequence of all Mersenne prime numbers.
function mersennePrimes() {
  return filter(mersenneNumbers(), function isPrime(n) {
    // Very simple and naive primality filter.
    return forall(range(2, n - 1), x => n % x > 0);
  });
}

var it = mersennePrimes();
console.log(it.next(), it.next(), it.next()); // prints 1 3 7
{% endcodeblock %}

## Flattening

{% codeblock lang:js %}
function flatten(it) {
  for (var x of it) {
    if (Array.isArray(x) || (typeof x === "function" && x.isGenerator())) {
      for (var y of flatten(x)) {
        yield y;
      }
    } else {
      yield x;
    }
  }
}
{% endcodeblock %}

{% codeblock lang:js %}
function flatMap(it, f) {
  return flatten(map(it, f));
}

var it = flatMap(even(), x => [x - 1, x]);
console.log(it.next(), it.next(), it.next()); // prints 1 2 3
{% endcodeblock %}
