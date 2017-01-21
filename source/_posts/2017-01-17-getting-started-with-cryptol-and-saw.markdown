---
layout: post
title: "Cryptol and SAW"
subtitle: "Part 2: Using SAW to verify a C++ implementation against a Cryptol spec"
date: 2017-01-21 16:00:00 +0100
---

Building on the [previous post](#) I'm going to show writing a Cryptol specification and using SAW to prove the correctness of a constant-time C++ implemenation of the same algorithm.

Apart from introducing very simple Cryptol we're also going to take a look at SAW's `llvm_verify` function that allows much more complicated verifications. Instead of only simple variables we're also going to deal with pointers that will take the result of the computation.

## Constant-time multiplication

{% codeblock lang:cpp %}
uint8_t msb(uint8_t x) {
  return 0 - (x >> (8 * sizeof(x) - 1));
}

uint8_t nz(uint8_t x) {
  return ~msb(~x & (x - 1));
}

uint8_t ge(uint8_t a, uint8_t b) {
  return ~msb(a ^ ((a ^ b) | ((a - b) ^ b)));
}

uint8_t add(uint8_t a, uint8_t b, uint8_t *carry) {
  *carry = msb(ge(a, 0 - b) & nz(b)) & 1;
  return a + b;
}

void mul(uint8_t a, uint8_t b, uint8_t *hi, uint8_t *lo) {
  uint8_t a1 = a >> 4, a0 = a & 0xf;
  uint8_t b1 = b >> 4, b0 = b & 0xf;
  uint8_t z0 = a0 * b0;
  uint8_t z2 = a1 * b1;

  uint8_t z1, z1carry, carry, trash;
  z1 = add(a0 * b1, a1 * b0, &z1carry);
  *lo = add(z1 << 4, z0, &carry);
  *hi = add(z2, (z1 >> 4) + carry, &trash);
  *hi = add(*hi, z1carry << 4, &trash);
}
{% endcodeblock %}

{% codeblock lang:text %}
$ clang-3.8/bin/clang -c -emit-llvm -o cmul.bc cmul.c
{% endcodeblock %}

## The SAW code

{% codeblock lang:saw %}
{% raw %}
m <- llvm_load_module "cmul.bc";

let {{
  mul : [8] -> [8] -> ([8], [8])
  mul a b = (take`{8} prod, drop`{8} prod)
      where prod = (pad a) * (pad b)
            pad x = zero # x
}};

time (llvm_verify m "mul" [] do {
  a <- llvm_var "a" (llvm_int 8);
  b <- llvm_var "b" (llvm_int 8);
  llvm_ptr "hi" (llvm_int 8);
  hi <- llvm_var "*hi" (llvm_int 8);
  llvm_ptr "lo" (llvm_int 8);
  lo <- llvm_var "*lo" (llvm_int 8);

  let res = {{ mul a b }};
  llvm_ensure_eq "*hi" {{ res.0 }};
  llvm_ensure_eq "*lo" {{ res.1 }};

  llvm_verify_tactic abc;
});
{% endraw %}
{% endcodeblock %}

## Verification

{% codeblock lang:text %}
$ PATH=saw/bin/:z3/bin saw cmul.saw
Loading module Cryptol
Loading file "cmul.saw"
Successfully verified @mul
Time: 14.257227s
{% endcodeblock %}
