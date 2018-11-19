---
layout: post
comments: true
title: "Algebraic Effects in JavaScript part 2 - Capturing continuations with Generators"
date: 2018-11-19 12:54:27 +0100
categories: algebraic-effects
---

This is the second part of a series about Algebraic Effects and Handlers.

- Part 1 : [continuations and control transfer]({{ site.baseurl }}{% post_url 2018-11-19-algebraic-effects-series-1 %})
- **Part 2 : Capturing continuations with Generators**
- Part 3 : [Delimited continuations]({{ site.baseurl }}{% post_url 2018-11-19-algebraic-effects-series-3 %})
- Part 4 : [Algebraic Effects and handlers]({{ site.baseurl }}{% post_url 2018-11-19-algebraic-effects-series-4 %})

> Note: initially I planned a 3-part series, but since the current post on undelimited continuations ended up taking
> more space than intended. We'll treat delimited continuations in a separate post

In the [first post](2018-11-19-algebraic-effects-series-1.md) we introduced
the notions of continuation and control transfer. We saw how programs written in Continuation
Passing Style (CPS) are more flexible in terms of control transfer manipulation.
While, in direct style, control transfer is implicitly managed by the compiler via the call stack, in CPS continuations
are reified as first class arguments to CPS functions.

However, a major drawback of CPS programs is that they are harder to read and write by humans, so they are more suitable
to be manipulated by other programs like compilers or interpreters. This is why programming languages that expose
continuations often provide a direct style syntax/API to manipulate them.

In this part, we'll do the same in JavaScript. Although the language doesn’t provide a way to access continuations
we can always [try to] emulate them using Generator functions.

> This post assumes the reader is familiar with Generator functions.

### Driving Generators in direct style

Say we have this simple function

```js
function greet(name) {
  const message = `Hi ${name}`;
  return message;
}

greet("Stranger");
// => "Hi Stranger"
```

Running this function is as simple as `const result = greet(someString)`. Now if we take the Generator version

```js
function* greet(name) {
  const message = yield `Hi ${name}`;
  return message;
}

greet("Stranger");
// => greet { <suspended>, __proto__: Generator, ... }
```

We get only the Generator object. In order to get the result we need to step the Generator until it's done. Below is the
code for a function that drives the Generator and returns its result

```js
function runGenerator(gen, arg) {
  const { done, value } = gen.next(arg);
  if (done) {
    return value;
  }
  return runGenerator(gen, value);
}

runGenerator(greet("Stranger"));
// => "Hi Stranger"
```

Works greet, but just like normal functions can call other normal functions, we'd like also for our Generators to call other Generators.
For example, this is the Generator version of the factorial function

```js
function* factorial(n) {
  if (n === 0) return 1;
  const n1 = yield factorial(n - 1);
  return n * n1;
}

runGenerator(factorial(10));
// => NaN
```

Fortunately, Generators allow us to intercept yielded values. This gives us the ability to interpret those values as desired then resume
the Generator with the result of the interpretation.

In our case, interpreting child generators amounts to recursively running them and getting their result.

```js
function isGenerator(x) {
  return x != null && typeof x.next === "function";
}

function runGenerator(gen, arg) {
  const { done, value } = gen.next(arg);
  if (done) {
    return value;
  }
  // interpret calls to child Generators
  if (isGenerator(value)) {
    const result = runGenerator(value);
    return runGenerator(gen, result);
  }
  return runGenerator(gen, value);
}

runGenerator(factorial(10));
// => 3628800
```

So far, we can call a Generator like a normal function, which includes nested and recursive calls. It seems like we've been able to
emulate the call stack. Note here we're just reusing the underlying JavaScript call stack.

However, as we saw in the previous post, direct style can't deal with the async problem. CPS allows us to perform asynchronous calls
but that comes with a price. Our next step is to allow those calls while still preserving the direct style.

### Driving Generators in CPS

Let's say we want to implement a `sleep` function that, when yielded in a Generator, will pause its execution for some time

```js
function* slowDouble(x) {
  yield sleep(2000);
  return x * 2;
}
```

In its current form, `runGenerator` is unable to implement the `sleep` behavior because it runs recursively/synchronously until completion.

In order to allow async calls, we need to rewrite the function in CPS: remember in this style we don't return function results, instead we pass them to the
provided continuation(s)

```js
function runGenerator(gen, arg, next) {
  const { done, value } = gen.next(arg);
  if (done) {
    next(value);
  } else if (isGenerator(value)) {
    runGenerator(value, null, function(result) {
      runGenerator(gen, result, next);
    });
  } else {
    runGenerator(gen, value, next);
  }
}
```

But we're not there yet. So far we can only yield child generators or plain values. We need a way to represent async calls and we need
to interpret the given representation.

A simple solution is to represent async calls themselves as CPS functions. Let's say we write a CPS `sleep` version

```js
function sleep(millis, next) {
  setTimeout(next, millis);
}
```

If we curry it

```js
function sleep(millis) {
  return next => setTimeout(next, millis);
}
```

The curried version is more suitable to use with `runGenerator`. We can simply plug in a continuation that will
resume the Generator with the async result. More generally, we'll represent async calls with functions taking
a single callback. We'll call those functions _suspended computations_.

```js
function runGenerator(gen, arg, next) {
  const { done, value } = gen.next(arg);
  if (done) {
    next(value);
  } else if (isGenerator(value)) {
    runGenerator(value, null, function continuation(result) {
      runGenerator(gen, result, next);
    });
  } else if (typeof value === "function") {
    // here we handle suspended computations
    value(function continuation(result) {
      runGenerator(gen, result, next);
    });
  } else {
    runGenerator(gen, value, next);
  }
}

runGenerator(slowDouble(10), null, console.log);
// tic tac toc
// 20
```

For readers already familiar with async implementation on top of Generators, this seems just like the old plumbing trick. But observe
that the callback we provided to the suspended computation represents the continuation of **the whole program**, so now we have the full
control over what to do next. Put another way, we gain the flexibility of CPS while still writing direct style code.

As a simple illustration, here is an example that simulates debugger's `break`. Instead of invoking the continuation,
we save it in a variable and then pause the whole program.

```js
let resume;

const BREAK = next => {
  console.log("**PAUSED**");
  resume = next;
};

function* main() {
  yield breakTest();
  yield sleep(1000);
  console.log("end of main");
}

function* breakTest() {
  for (let i = 1; i < 5; i++) {
    yield sleep(1000);
    console.log("message", i);
    if (i % 2 === 0) yield BREAK;
  }
}

// typing this in the console
runGenerator(main(), null, console.log);
/*
  message 1
  message 2
  **** PROGRAM PAUSED ****
*/
resume();
/*
  message 3
  message 4
  **** PROGRAM PAUSED ****
*/
resume();
// end of main
```

Another example would be an `exit(result)` function that, when yielded from inside a deeply nested Generator, would
skip all the parents and abort the whole computation with the given result. For example consider the following code

```js
function* main() {
  const result = yield parent();
  return `main result: (${result})`;
}

function* parent() {
  const result = yield child();
  return `parent result: (${result})`;
}

function* child() {
  return "child result";
}

runGenerator(main(), null, console.log);
// => main result: (parent result: (child result))
```

Using `exit` we could abort directly from inside `child`

```js
function main() { ... }

function parent() { ... }

function* child() {
  yield exit("child result");
  throw "This shouldn't happen";
}

runGenerator(main(), null, console.log);
// should be => child result
```

> If you recall the interpreter example in the previous post, at some point we did the same thing by providing the top-level
> continuation as a second argument to all child CPS functions. We can do the same trick here with `runGenerator`. It would be
> a good exercise.

### The road to undelemited continuations

Ok, I assume, with good faith, that you did the last exercise. Here is ~the~ my solution

```js
function runGenerator(gen, arg, abort, next) {
  const { done, value } = gen.next(arg);
  if (done) {
    next(value);
  } else if (isGenerator(value)) {
    runGenerator(value, null, abort, function continuation(result) {
      runGenerator(gen, result, abort, next);
    });
  } else if (typeof value === "function") {
    value(abort, function continuation(result) {
      runGenerator(gen, result, abort, next);
    });
  } else {
    runGenerator(gen, value, abort, next);
  }
}

// helper function to thread in the top-level continuation
function start(gen, next) {
  runGenerator(gen, null, next, next);
}

start(main(), console.log);
// => child result
```

It works, but it's not very satisfactory. We said that the promise of CPS is to empower us,
end users of the API, so we can implement various control operators. But in the above solution, the control is hard
coded inside the interpreter (`runGenerator`). We don't want to modify the interpreter each time we want to add
some control construct and more importantly we don't want to implement our solutions in low level CPS code. What w're really
aiming for is to provide some more general API in order to implement `exit` or other control flow in user land.

Let's go step by step. First, observe that what `start` does, essentially, is _capturing_ the top-level continuation.
But we know we can capture a continuation by yielding a suspended computation in the Generator. So, our first step would
be capturing the top-level continuation.

For that, We'll make `start` itself a Generator and capture its continuation.

```js
function* start(genFunc) {
  const result = yield function(abort) {
    runGenerator(genFunc(abort), null, abort);
  };
  return result;
}
```

We're using `runGenerator` manually, which is a little awkaward, but this leaves our interpreter unmodified. Later we'll see how
to abstract away this code.

Next, we observe that the captured continuation is just passed as an additional argument to the nested `runGenerator` calls in order to
keep it visible in the current scope. We can do the same by exploiting the lexical scope of Generators and passing the captured continuation
as an argument to child Generators.

Our first tentative of refactoring yields the below code

```js
function* start(genFunc) {
  const result = yield function(abort) {
    runGenerator(genFunc(abort), null, abort);
  };
  return result;
}

function* main(abort) {
  const result = yield parent(abort);
  return `main result: (${result})`;
}

function* parent(abort) {
  const result = yield child(abort);
  return `parent result: (${result})`;
}

function* child(abort) {
  yield next => abort("child result");
  throw "This shouldn't happen";
}

runGenerator(start(main), null, console.log);
// => child result
```

By the way, notice how, in `child`, the `next` continuation is ignored in the body of the suspended computation, which
instead invokes `abort`. It means the next statement `throw "This shouldn't happen"` won't be executed and the control will
jump back directly into the `start` Generator.

But we're not there yet, how can we implement the generic `exit(result)` function?

Well, given the current code, we can't. Our `exit` has no way to get the `abort` continuation without this being visible in scope.
Surely this is awkward, we don't want to end up writing `yield next => abort(result)` each time we want to exit.

There is less awkward alternative, though. Instead of forwarding the captured continuation itself, then
creating the suspended computation (`exit`) inside the exiting function, we can create `exit` itself inside the
code that captures the top-level continuation (here in the `start` Generator), then pass it to child Generators.

```js
function* start(genFunc) {
  const result = yield function(abort) {
    function exit(value) {
      return next => abort(value);
    }
    runGenerator(genFunc(exit), null, abort);
  };
  return result;
}

function* main(exit) {
  const result = yield parent(exit);
  return `main result: (${result})`;
}

function* parent(exit) {
  const result = yield child(exit);
  return `parent result: (${result})`;
}

function* child(exit) {
  yield exit("child result");
  throw "This shouldn't happen";
}

runGenerator(start(main), null, console.log);
// => child result
```

All we need, in order to complete the refactoring, is to abstract away the code that captures the top-level continuation inside a reusable
function. But first we need to pick a suitable name for it. `call_with_current_continuation` looks expressive but quite verbose, so let's
abbreviate it to [`callcc`](https://en.wikipedia.org/wiki/Call-with-current-continuation).

```js
function callcc(genFunc) {
  return function(capturedCont) {
    // this is our previous exit
    function jumpToCallccPos(value) {
      return next => capturedCont(value);
    }
    runGenerator(genFunc(jumpToCallccPos), null, capturedCont);
  };
}

function* start() {
  const result = yield callcc(main);
  return result;
}

// rest of the code unmodified

runGenerator(start(), null, console.log);
// => child result
```

Note that, unlike what's found in languages like `Scheme`, our implementation allows only one invocation of the `callcc` continuation.
We're here constrained by how Generators work in JavaScript. Each call to `generator.next()` is a one way ticket, so invoking
the continuation multiple times will just keep advancing the Generator. Continuations that can be
resumed only once are said to be _one shot_. Continuations that can be resumed many times are said to be _multi shot_.

> In this series, we'll content ourselves with one shot continuations. If you're interested in how we could emulate multi shoot
> continuations [Here is an example](https://gist.github.com/yelouafi/858095244b62c36ec7ebb84d5f3e5b02). Note this has a non
> negligible space/time cost.

The rest of the post illustrates the use of `callcc` with a couple of common examples.

### Example 1: Emulating try/cacth

The previous `exit` example implemented a simplified version of exceptions. Next, we'll try to make a more elaborated example of structured
exception handling

```js
const handlerStack = [];

function* trycc(computation, handler) {
  return yield callcc(function*(k) {
    handlerStack.push([handler, k]);
    const result = yield computation;
    handlerStack.pop();
    return result;
  });
}

function* throwcc(exception) {
  const [handler, k] = handlerStack.pop();
  const result = yield handler(exception);
  yield k(result);
}
```

`trycc/throwcc` emulates the `try/catch/throw` statements. `trycc` starts by capturing the current continuation, saves it in a stack along
with the handler, then run the computation, which may (or may not) throw. If the computation returns successfully then no exception was
thrown and we can remove the handler from the stack. In the case the computation has invoked `throwcc` then we also pop the handler stack
along with the captured continuation, run the handler then use the captured continuation to jump back to where `trycc` was called.

### Example 2: cooperative scheduling

Another popular example is the implementation of cooperative scheduling using what we call _coroutines_. They are somewhat similar to Generators.
Once started, a coroutine executes some code then may yield to a central scheduler. The scheduler will save the state of the coroutine then
pick another coroutine to run. Below is an example

```js
function* main() {
  yield fork(proc("1", 4));
  yield fork(proc("2", 2));
  yield dequeue();
  console.log("end main");
}

function* proc(id, n) {
  for (let i = 0; i <= n; i++) {
    yield sleep(1000);
    console.log(id, i);
    yield pause;
  }
}
```

Assuming we have implemented `fork` and `pause`, the result of running `main()` gives the following outputs

```sh
  1 0
  2 0
  1 1
  2 1
  1 2
  2 2
  1 3
  1 4
  end main
```

A possible implementation of coroutines is given below

```js
const processQueue = [];

function fork(gen) {
  return next => {
    processQueue.push(
      (function*() {
        yield gen;
        yield dequeue();
      })()
    );
    next();
  };
}

const pause = callcc(function*(k) {
  processQueue.push(k());
  yield dequeue();
});

function* dequeue() {
  if (processQueue.length) {
    const next = processQueue.shift();
    yield next;
  }
}
```

Here's how the above code works

- `fork` doesn't start the provided coroutine immediately, it just adds it to a global queue of processes
- `pause` saves the state of the current coroutine by capturing its continuation, adding it to the process queue then
  picking the next coroutine to resume
- `dequeue` is called both when a coroutine pauses and when it returns

### Conclusion

Voilà! we reached the end of the second part. Just a couple more of posts to complete the understanding Algebraic Effects and Handlers.

Main takeaways of this part:

- When driven using dierct style, Generators can emulate the call stack, but can't support async calls
- When driven using CPS, Generators can perfom async work while still allowing the user to program in direct style
- More important, we can capture the current contiuation of the program anytime we need it (`callcc`)
- When the `callcc` continuation is invoked it aborts the current execution context and resumes from when `callcc` was invoked

Although `callcc` is quite powerful, it has a major limitation. The captured continuation represents the rest of the whole program. It means
the `yield k(someValue)` can't return values since all we can do is resume until the program completes. This kind of continuations is known as
_undelimited continuations_.

Next part, we'll see an even more powerful kind: _delimited continuations_, which allow us to capture only a slice of the rest of the program.
A delimited continuation can return a value and thus it can be composed inside other functions.

See you next post. Thanks for being a patien reader!
