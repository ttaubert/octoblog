---
layout: post
title: "A formally verified Rust library"
subtitle: "Rust and the Software Analysis Workbench"
date: 2016-01-12 22:36:11 +0100
published: false
---

Attended RWC 2016 and Joe talked about SAW.
Decided to give it a try as Rust compiles everything to LLVM byte code
and then compiles to machine code.
Examples are stolen from the tutorial
http://saw.galois.com/tutorial.html
It leverages automated SAT and SMT solvers to make this process as automated as
possible, and provides a scripting language, called SAW Script, to enable
verification to scale up to more complex systems.

{% codeblock lang:rust %}
#[no_mangle]
pub extern fn ffs_ref(n: u32) -> u32 {
  n.trailing_zeros() + 1
}
{% endcodeblock %}

bla bla bla

{% codeblock lang:rust %}
#[no_mangle]
pub extern fn ffs_imp(n: u32) -> u32 {
  let mut n = n;
  let mut i = 1u8;
  if n & 0xffff == 0 { i += 16; n >>= 16; }
  if n & 0x00ff == 0 { i += 8; n >>= 8; }
  if n & 0x000f == 0 { i += 4; n >>= 4; }
  if n & 0x0003 == 0 { i += 2; n >>= 2; }
  if n > 0 { i as u32 + ((n + 1) & 0x01) } else { 0 }
}
{% endcodeblock %}

balb alb alasdf

{% codeblock lang:rust %}
#[no_mangle]
pub extern fn ffs_bug(n: u32) -> u32 {
  // Buggy version returns 4 instead of 5.
  if n == 0x101010 { 4 } else { ffs_ref(n) }
}
{% endcodeblock %}

asdf asdf asdf

{% codeblock lang:cpp %}
#include <stdint.h>
#include <stdio.h>

extern uint32_t ffs_ref(uint32_t n);
extern uint32_t ffs_imp(uint32_t n);
extern uint32_t ffs_bug(uint32_t n);

int main() {
  printf("ffs_ref(0x101010) = %d\n", ffs_ref(0x101010));
  printf("ffs_imp(0x101010) = %d\n", ffs_imp(0x101010));
  printf("ffs_bug(0x101010) = %d\n", ffs_bug(0x101010));
  return 0;
}
{% endcodeblock %}

asdf asdf asdf asdf asdf

{% codeblock lang:text %}
$ rustc --crate-type=staticlib ffs.rs
$ gcc -L. -l ffs ffs.c -o ffs
$ ./ffs
ffs_ref(0x101010) = 5
ffs_imp(0x101010) = 5
ffs_bug(0x101010) = 4
{% endcodeblock %}

## Compile to byte code

asdf asdf asdf asdf

{% codeblock lang:text %}
rustc --crate-type=staticlib --emit llvm-bc -o ffs.bc ffs.rs
{% endcodeblock %}

## Proving equivalence

{% codeblock lang:python %}
print "Extracting reference term";
l <- llvm_load_module "ffs.bc";
ffs_ref <- llvm_extract l "ffs_ref" llvm_pure;

print "Extracting implementation term";
ffs_imp <- llvm_extract l "ffs_imp" llvm_pure;

print "Extracting buggy term";
ffs_bug <- llvm_extract l "ffs_bug" llvm_pure;

print "Proving equivalence";
let thm1 = {{ "{{ \x -> ffs_ref x == ffs_imp x" }} }};
result <- prove abc thm1;
print result;

print "Finding bug via sat search";
let thm2 = {{ "{{ \x -> ffs_ref x != ffs_bug x" }} }};
result <- sat abc thm2;
print result;

print "Finding bug via failed proof";
let thm3 = {{ "{{ \x -> ffs_ref x == ffs_bug x" }} }};
result <- prove abc thm3;
print result;
{% endcodeblock %}

adsf asdf asdf asdf

{% codeblock lang:text %}
Loading module Cryptol
Loading file "ffs_llvm.saw"
Extracting reference term
Extracting implementation term
Extracting buggy term
Proving equivalence
Valid
Finding bug via sat search
Sat: 1052688
Finding bug via failed proof
Invalid: 1052688
Done.
{% endcodeblock %}
