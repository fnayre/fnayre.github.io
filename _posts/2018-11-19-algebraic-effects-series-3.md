---
layout: post
comments: true
title: "Algebraic Effects in JavaScript part 3 - Delimited Continuations"
date: 2018-11-19 12:55:27 +0100
categories: algebraic-effects
---

> This post was originally posted as a [Github gist](https://gist.github.com/yelouafi/7261da07c97c5e6322da3894f6ea60e2)

This is the third part of a series about Algebraic Effects and Handlers.

- Part 1 : [continuations and control transfer]({{ site.baseurl }}{% post_url 2018-11-19-algebraic-effects-series-1 %})
- Part 2 : [Capturing continuations with Generators]({{ site.baseurl }}{% post_url 2018-11-19-algebraic-effects-series-2 %})
- **Part 3 : Delimited continuations**
- Part 4 : [Algebraic Effects and handlers]({{ site.baseurl }}{% post_url 2018-11-19-algebraic-effects-series-4 %})

In the preceding parts, we introduced the notions of continuations and control transfer. We saw how to capture the current
continuation inside a Generator, and illustrated how to implement (the one shot version) of the famous `callcc`.

In this part, we're going to see how to capture delimited continuations with Generators. While `callcc` allowed us to capture the rest of the whole program, we can also choose to capture only a slice of it. One of the direct consequences of this concept is that delimited continuations can now return a value, and thus they can be composed inside the flow of another function. This is an important trait that will be exploited in the next part.

### Back to the Call Stack

In direct style, we saw that control transfer between functions works through the Call Stack.

- Each function call pushes a new frame (called also an activation record) onto the stack
- Each function return pops the corresponding frame from the stack

Let's consider the following example, which computes the product of an array of numbers

```js
function main() {
  const result = product([2, 4, 6]);
  return result;
}

function product(xs) {
  if (xs.length === 0) return 1;
  const [y, ...ys] = xs;
  return y * product(ys);
}
```

To visualize the call stack at a given moment, we can set a breakpoint in the browser devtools then run the above example in the console. The program will pause and we can examine the Call Stack panel of the browser

![call-stack-1](https://user-images.githubusercontent.com/5453835/45965848-7be72600-c021-11e8-80e9-ffb332d1fa28.png)

Here, the program is paused on the third line of `product()`. The Call Stack contains already four frames:

- `anonymous` can be seen as the root frame of the browser console session
- `main` corresponds to the `main()` call executed in the console
- The first `product` frame represents `product([2, 4, 6])` executed in `main`
- The second `product` frame represents the recursive call inside the `return y * product(ys)` statement (ie `return 2 * product([4,6])`)

In other words, the Call Stack tells us what part of the work has already been done. It tells us, also, what part of the work remains to do:

- The rest of the work to do inside the current frame (`product([4,6])`), namely calling `product([6])`, multiplying the result by `y (= 4)` then returning the result (`24`) to the parent frame
- Plus the rest of the work to do in the parent frames:
  - the call frame of `product([2,4,6])` will multiply the previous result by `2` then returns `48` to the `main` frame
  - The call frame of `main()` will simply return the result `48` to its parent frame
  - The call frame of `anonymous` will display the result into the console

In other words, the continuation is mainly represented with the state of the Call Stack at the considered moment of
execution. Therefore, if we could implement something similar to the Call Stack on top of Generators we'll be able, in principle,
to capture current continuations.

Contrast this with the CPS representation of the continuation as an ordinary function. This stateless representation may be seen as superior (to the Call Stack's statefull representation) since it brings us closer to purity. However, the Call Stack representation has some advantages as well:

- It's easier to implement more advanced stack manipulations, like delimited continuations, using the
  statefull representation (possible because JavaScript is single threaded)
- It's easier to add DX features on top of the statefull approach. For example, a babel plugin can
  instrument the code to add some useful information (function name, line, column) to the stack frames, and some program API
  can dump this information in developer mode.

### Modeling the Call Stack with Generators

Below is a new implementation using the statefull approach

```js
function isGenerator(x) {
  return x != null && typeof x.next === "function";
}

function runGenerator(gen, arg) {
  const { value, done } = gen.next(arg);

  if (done) {
    const _return = gen._return;
    if (isGenerator(_return)) {
      runGenerator(_return, value);
    } else if (typeof _return === "function") {
      _return(value);
    }
  } else {
    if (isGenerator(value)) {
      value._return = gen;
      runGenerator(value, null);
    } else if (typeof value === "function") {
      value(gen);
    }
  }
}

function start(gen, onDone) {
  gen._return = onDone;
  runGenerator(gen, null);
}
```

Instead of passing a continuation argument, we now rely on the presence of a `_return` field in the Generator, which
represents the parent frame (it may be safer to use a Symbol here). When the Generator is done, it passes the return value to its caller. When we call a child Generator, we set its `_return` to the current Generator.

Note also that we're now passing the Generator itself to the yielded function. So to implement something like `sleep(millis)`
we have to write

```js
function sleep(ms) {
  return function(gen) {
    setTimeout(x => runGenerator(gen, null), ms);
  };
}
```

In the statefull implementation, we're effectively building a linked list of Generators (with a callback inserted at the
root by `start`).

The implementation of `callcc` can be also automatically adapted

```js
function callcc(genFunc) {
  return function(capturedGen) {
    // this is our escape function
    function jumpToCallccPos(value) {
      // instead if resuming the current generator
      // we directly resume the one captured by callcc
      return next => runGenerator(capturedGen, value);
    }
    const gen = genFunc(jumpToCallccPos);
    gen._return = capturedGen;
    runGenerator(gen, null);
  };
}
```

Ok, now that we have reified the Call stack as a concrete data structure, we're ready to tackle delimited continuations.

### Delimited Continuations

We'll introduce how delimited continuations work step by step through a series of examples.

We said that delimited continuations capture only a slice of the Call Stack. Our first step will be, then, some way
to mark a stack frame as the limit of the continuation to be captured. This is the purpose of `reset`

```js
function reset(genFunc) {
  return function(parentGen) {
    const gen = genFunc();
    gen._return = parentGen;
    // setting the limit of the continuation
    gen._reset = true;
    runGenerator(gen, null);
  };
}
```

`reset` takes a Generator function and returns a suspended computation (here a function taking the parent Generator).
Like `runGenerator`, the suspended computation will run the provided Generator function after setting its `_return`
field to the caller Generator. It also adds a special `_reset` field, which acts as a marker on the Call Stack. This
field will serve us to limit the extent of the captured continuation as we'll see later.

The first thing to note is that, when invoked on an 'ordinary' Generator, `reset` amounts to a simple Generator call

```js
function* main() {
  const result = yield reset(function*() {
    return "Hi";
  });
  return result;
}

start(main(), console.log);
// => Hi
```

So alone, `reset` is pretty useless. The interesting stuff happens when we introduce our next function `shift` inside a `reset` block.

We'll first introduce a simplified version of `shift` that doesn't capture the current continuation

```js
function shift(genFunc) {
  return function(parentGen) {
    // finds the closest reset
    let resetGen = parentGen;
    while (!resetGen._reset) {
      resetGen = resetGen._return;
    }
    const gen = genFunc();
    // gen will directly return to the parent of reset
    gen._return = resetGen._return;
    runGenerator(gen, null);
  };
}
```

Here's an example of how it works

```js
function* main() {
  const result = yield reset(function* resetFn() {
    const name = yield child();
    return "Hi " + name;
  });
  return result;
}

function* child() {
  const result = yield shift(function* shiftFn() {
    return "from inside shift";
  });
  return result;
}

start(main(), console.log);
// => from inside shift
```

In a normal sequence of calls, we'd expect the result to be `'Hi from inside shift'`. However, `shift` isn't an ordinary
function. In the above code, the Generator provided to `shift` will return, directly, to the parent of the closest
`reset` block. In this case, it effectively behaves as our previous `exit` function. More concretely, w've transformed
the following Call Stack

```
main() -> reset(resetFn) -> child() -> shift(shiftFn)
```

into this one

```
main -> shiftFn()
```

Put another way, we've discarded all the stack frames between shift and (including) reset.

What happens to the discarded frames? Well, here's the more interesting stuff, those would constitute
the delimited continuation that should be provided to `shift`.

```js
function shift(genFunc) {
  return function(parentGen) {
    // finds the closest reset
    let resetGen = parentGen;
    while (!resetGen._reset) {
      resetGen = resetGen._return;
    }

    function delimitedCont(value) {
      // captures the continuation from after shift up to reset
      return nextGen => {
        resetGen._return = nextGen;
        // resume from the shift's parent frame
        runGenerator(parentGen, value);
      };
    }

    const gen = genFunc(delimitedCont);
    gen._return = resetGen._return;
    runGenerator(gen, null);
  };
}
```

It may seem confusing how this works, so let's go step by step on a simple example

```js
function* main() {
  const x = yield reset(function* resetFn() {
    const a = 10;
    const b = yield shift(function* shiftFn(k) {
      const c = yield k(2);
      return c + 3;
    });
    return a * b;
  });
  return x;
}
```

The sequence of calls until `shift` corresponds to

```
main() -> #resetFn() -> shift(shiftFn)
```

Where `#` is used to mark the reset position. We saw that the first effect of `shift` is to discard the frames up to the enclosing `reset`

```
main() -> shift(shiftFn) -> ...
```

Then the discarded frames (here `#resetFn()`) are provided as a continuation to `shiftFn`. So after the
`yield k(2)` we obtain the following sequence

```
main() -> shiftFn(k) -> #resetFn()
```

What does `#resetFn()` corresponds to? it's the rest of work to do after the `shift` position: namely setting `b` with some provided value then multiplying by `a (= 10)`. ie it's like a function: `(v => a * v) -> (2 * 10) -> 20`

After `#resetFn()` returns, `shift` continues by adding the obtained result `20` to `3`. The final result is then `23`.

Naturally, you have all the right to ask the legitimate question: why do we have to program in such a confusing style?

We have the choice between two answers:

I can repeat the arguments from the previous parts about how this can give control-flow super-powers. Which is
partly true, but maybe not too concrete.

Or, you can read the next (and final) part: this time we'll be really talking about Algebraic Effects and Handlers.
