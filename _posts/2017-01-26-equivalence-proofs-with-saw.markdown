---
layout: post
title: "Equivalence proofs with SAW"
subtitle: "Exploring formal verification (part 1)"
date: 2017-01-26 16:00:00 +0100
---

> Part 1: Equivalence proofs with SAW  
> [Part 2: Simple Cryptol specifications](/blog/2017/02/simple-cryptol-specifications/)  
> [Part 3: Finding and fixing real-world bugs](/blog/2017/06/finding-and-fixing-real-world-bugs/)

This is the first of a small series of posts that will scratch the surface of the world of formal verification. I will mainly use [SAW](http://saw.galois.com/), the Software Analysis Workbench, and [Cryptol](http://cryptol.net/), a DSL for specifying crypto algorithms. Both are powerful tools for verifying C, C++, and even Rust code, i.e. almost anything that compiles to LLVM bitcode.

Verifying the implementation of a specific algorithm not only helps you weed out bugs early, it lets you *prove* that your code is correct and contains no further bugs - assuming you made no mistakes writing your algorithm specification in the first place.

Even if you don't know a lot about formal verification, or anything, it's easy to get started experimenting with Cryptol and SAW, and get a glimpse of what's possible.

In this first post I'll show how you can use SAW to prove equality of multiple implementations of the same algorithm, potentially written in different languages.

## Setting up your workspace

To get started, download the latest SAW and Z3, as well as clang 3.8:

* SAW: http://saw.galois.com/builds/nightly/
* Z3: https://github.com/Z3Prover/z3/releases
* LLVM 3.8: http://releases.llvm.org/download.html

You need clang 3.8, later versions seem currently not supported. Xcode's latest clang would (probably) work for this small example but give you headaches with more advanced verification later on.

Unzip and copy the tools someplace you like, just don't forget to update your `$PATH` environment variable. Especially if you already have clang on your system.

Let's start with a simple example.

## Unsigned addition without overflow

We define an addition function `add(a, b)` that takes two `uint8_t` arguments and returns a `uint8_t`. It deals with overflows so that `123 + 200 = 255`, that is it caps the number at `UINT8_MAX` instead of wrapping around.

{% codeblock lang:cpp add.c https://gist.github.com/ttaubert/ecf5b710e849ddfefa81c14a70631eec#file-add-c [gist.github.com/ttaubert/ecf5b710e849ddfefa81c14a70631eec#file-add-c] %}
uint8_t add(uint8_t a, uint8_t b) {
  uint8_t sum = a + b;
  return sum < a ? UINT8_MAX : sum;
}
{% endcodeblock %}

That's such a trivial function that we probably wouldn't write a test for it. If it compiles we're somewhat confident it'll work just fine:

{% codeblock lang:text %}
$ clang -c -emit-llvm -o add.bc add.c
{% endcodeblock %}

Note that the above command will not produce a binary or shared library, but instead instruct clang to emit LLVM bitcode and store it in `add.bc`. We'll feed this into SAW in a minute.

## Constant-time addition

Now imagine that we actually want to use `add` as part of a bignum library to implement cryptographic algorithms, and thus want it to have a [constant runtime](https://cryptocoding.net/index.php/Coding_rules#Avoid_branchings_controlled_by_secret_data), independent of the arguments given. Here's how you could do this:

{% codeblock lang:cpp cadd.c https://gist.github.com/ttaubert/ecf5b710e849ddfefa81c14a70631eec#file-cadd-c [gist.github.com/ttaubert/ecf5b710e849ddfefa81c14a70631eec#file-cadd-c] %}
// 0xff if MSB(x) = 1 else 0x00
uint8_t msb(uint8_t x) {
  return 0 - (x >> (8 * sizeof(x) - 1));
}

// 0xff if a < b else 0x00
uint8_t lt(uint8_t a, uint8_t b) {
  return msb(a ^ ((a ^ b) | ((a - b) ^ b)));
}

uint8_t add(uint8_t a, uint8_t b) {
  return (a + b) | lt(a + b, a);
}
{% endcodeblock %}

If `a + b < a`, i.e. the addition overflows, `lt(a + b, a)` will return `0xff` and change the return value into `UINT8_MAX = 0xff`. Otherwise it returns `0` and the return value will simply be `a + b`. That's easy enough, but did we get `msb` and `lt` right?

{% codeblock lang:text %}
$ clang -c -emit-llvm -o cadd.bc cadd.c
{% endcodeblock %}

Let's compile the constant-time `add` function to LLVM bitcode too and use SAW to prove that both our addition functions are equivalent to each other.

## Writing the SAW script

SAW executes scripts to automate theorem proving, and we need to write one in order to check that our two implementations are equivalent. The first thing our script does is load the LLVM bitcode from the files we created earlier, `add.bc` and `cadd.bc`, as modules into the variables `m1` and `m2`, respectively.

{% codeblock lang:saw add.saw https://gist.github.com/ttaubert/ecf5b710e849ddfefa81c14a70631eec#file-add-saw [gist.github.com/ttaubert/ecf5b710e849ddfefa81c14a70631eec#file-add-saw] %}
{% raw %}
m1 <- llvm_load_module "add.bc";
m2 <- llvm_load_module "cadd.bc";

add <- llvm_extract m1 "add" llvm_pure;
cadd <- llvm_extract m2 "add" llvm_pure;

let thm = {{ \x y -> add x y == cadd x y }};
prove_print abc thm;
{% endraw %}
{% endcodeblock %}

Next, we'll extract the `add` functions defined in each of these modules and store them in `add` and `cadd`, the latter being our constant-time implementation. `llvm_pure` indicates that a function always returns the same result given the same arguments, and thus has no side-effects.

Last, we define a theorem `thm` stating that for all arguments `x` and `y` both functions have the same return value, that they are equivalent to each other. We choose to prove this theorem with the ABC tool from UC Berkeley.

We're all set now, time to actually prove something.

## Proving equivalence

Make sure you have `saw` and `z3` in your `$PATH`. Run SAW and pass it the file we created in the previous section --- it will execute the script and automatically prove our theorem.

{% codeblock lang:text %}
$ saw add.saw
Loading module Cryptol
Loading file "add.saw"
Valid
{% endcodeblock %}

*Valid*, that was easy. Maybe too easy. Would SAW even detect if we sneak a minor mistake into the program? Let's find out...

{% codeblock lang:diff %}
 uint8_t lt(uint8_t a, uint8_t b) {
-  return msb(a ^ ((a ^ b) | ((a - b) ^ b)));
+  return msb(a ^ ((a ^ b) | ((a + b) ^ b)));
 }
{% endcodeblock %}

The diff above changes the behavior of `lt` just slightly, a bug that we could have introduced by accident. Let's run SAW again and see whether it spots it:

{% codeblock lang:text %}
$ saw add.saw
Loading module Cryptol
Loading file "add.saw"
saw: user error ("prove_print" (add.saw:8:1):
prove: 1 unsolved subgoal(s)
Invalid: [x = 240, y = 0])
{% endcodeblock %}

*Invalid*! The two functions disagree on the return value at `[x = 240, y = 0]`. SAW of course doesn't know which function is at fault, but we are confident enough in our reference implementation to know where to look.

I can't possibly explain how this all works in detail, but I can hopefully give you a rough idea. What SAW does is parse the LLVM bitcode and [symbolically execute](https://en.wikipedia.org/wiki/Symbolic_execution) it on symbolic inputs to translate it into a circuit representation.

This circuit is then, together with our theorems, fed into a theorem prover. Z3 is an [automated theorem prover](https://en.wikipedia.org/wiki/Automated_theorem_proving), and ABC a tool for logic synthesis and verification; both are able to prove equality using automated reasoning.

## Next: Some Cryptol and more SAW

In [the second post](/blog/2017/02/simple-cryptol-specifications/) I talk about verifying the implementation of a slightly more complex function, also written in C/C++, and show how you can use Cryptol to write a simple specification, as well as introduce more advanced SAW commands for verification.

If you found this interesting, play around with the examples above and come up with your own. Write a straightforward implementation of an algorithm that you can be certain to get right and then optimize it, make it constant-time, or change it in any other way and see how SAW behaves.
