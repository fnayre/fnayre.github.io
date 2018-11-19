---
layout: post
title: "Algebraic Effects in JavaScript part 4 - Implementing Algebraic Effects and Handlers"
date: 2018-11-19 13:01:27 +0100
categories: algebraic-effects
---

This is the final part of a series about Algebraic Effects and Handlers.

- Part 1 : [continuations and control transfer]({{ site.baseurl }}{% post_url 2018-11-19-algebraic-effects-series-1 %})
- Part 2 : [Capturing continuations with Generators]({{ site.baseurl }}{% post_url 2018-11-19-algebraic-effects-series-2 %})
- Part 3 : [Delimited continuations]({{ site.baseurl }}{% post_url 2018-11-19-algebraic-effects-series-3 %})
- **Part 4 : Implementing Algebraic Effects and handlers**

So we've come to the core topic. The reality is that we've already covered most of it in the previous parts. Especially, in the third part, where we saw delimited continuations at work.

In this part, we'll see that the mechanism of Algebraic Effects isn't much different from that of delimited continuations. But first, let's approach the topic from a more familiar perspective. We'll exploit the similarity with JavaScript Error handling to introduce the concept.

### From Exceptions to Algebraic Effects

Below a simple example of Error handling. Don't pay much attention to the program logic, all we're interested on are the mechanics of the Call Stack.

```js
function main(n) {
  return handler(n);
}

function handler(n) {
  try {
    unsafeOperation(n);
  } catch (e) {
    return 0;
  }
}

function unsafeOperation(n) {
  const x = oneMoreIndirection(n);
  return x * 2;
}

function oneMoreIndirection(n) {
  if (n < 0) {
    throw "cant be under zero!";
  }
  return n + 1;
}

main(-1);
// => 0
```

Once we reach the `oneMoreIndirection`, the Call Stack looks like:

```
main(-1) -> handler(-1) -> unsafeOperation(-1) -> oneMoreIndirection(-1)
```

When `oneMoreIndirection` throws, the exception bubbles up to the closest `try`/`catch` block, which in this case is located in `handler`. All stack frames below that handler (`oneMoreIndirection(-1) -> unsafeOperation(-1)`) are discarded. So the Call Stack becomes like:

```
main() -> handler()
```

Now, let's envision what those discarded frames represent concretely. If we were to resume after `throw "can't be a zero!"`, then we should

1. `return n + 1` from `oneMoreIndirection`
2. then `return x * 2` from `unsafeOperation`
3. then return to ...hmmm

Where should we return after? It must be somewhere inside `handler` but where exactly? The control is now inside `catch` but it may not be obvious where our continuation would fit. But remember, exceptions work through a double decision

1. control is transferred to the most recent enclosing handler
2. the stack frames from the throwing function up to the handler are discarded

So what happens if we keep decision (1) but change (2): the stack frames aren't discarded but reified as a function (a delimited continuation), which is provided as argument to the handler? In an hypothetical JavaScript, this would look like:

```js
function handler() {
  try {
    unsafeOperation(0);
  } catch (e, /**/resume/**/) {
    // ...
    return 0;
  }
}
```

Now it may not be obvious what should we do with `resume`. After all, it doesn't make much sense to resume a function that has already aborted. But that's only if we consider non-local control transfer as exclusively meant to signal exceptions. What if we could use it in a more general way, as a sort of interaction between a (maybe deeply nested) function and an enclosing handler?

The function can _throw a request_, and the handler interprets the request then resumes the function using the provided continuation. As with exceptions, the function doesn't need to know anything about the handler or how the request is fullfilled. And, that's the core idea of Algebraic Effects.

> I'm not going to discuss the motivation behind throwing effects vs executing them right away inside a function. The question just translates to why we should separate pure and impure computations, which is a whole subject ont its own.

> The thing I want to mention here, is that many discussions I saw on this subject lack the required context. Many arguments that are valid in a language like Haskell aren't necessarily transposable to a language like JavaScript. In the former, things like purity makes it easier to give a mathemtical interpretation to a program, which can be exploited by the compiler to prove many properties about the program at compile time. This isn't the case in JavaScript, which doesn't have the same mathematical formalism underline (for example I see no reason to forbid mutation of local varibales **in** JavaSript). On the other hand, I do beleive some other properties, like [Compositionality](https://en.wikipedia.org/wiki/Principle_of_compositionality), are equally important in any programming language.

So back to our earlier example, here's how the whole example may look like in our hypothetical JavaScript:

```js
function main() {
  return handler();
}

function handler() {
  try {
    operation();
  } catch (e, resume) {
    return resume("Yassine");
  }
}

function operation() {
  return oneMoreIndirection();
}

function oneMoreIndirection() {
  const name = throw "Your name, please?";
  return `Hi ${name}`;
}
```

If you ever worked with libraries like `redux-saga` it's the same idea but on streoids. Here, you have full control over the effects (while in libs like `redux-saga` the interpretation of effects is hard coded in the library). As we'll see, you have even control over the return value of the handled computation.

Ok, having seen what could be JavaScript in a parallel universe, let's go back to reality. While we'll, probably, never see the `catch` clause taking a continuation argument some day, we can use our old freinds, Generators, as a decent consolation.

### Implementing Algebraic Effects with Generators

We're going to do this in two steps.

1. First, we'll implement just the exception like part: transfer the control to the closest handler
2. Then we'll add the code to capture the delimited continuation up to the handler

We'll base our implementation on this version from the last post

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

Quick remainder, the code relies on a `_return` field on the Generator, which points to the parent Generator. Inside a Generator, we can either yield a call to a child Generator (in which case we set its `_return` to the current one), or yield a suspended computation (just a fancy name for a function taking the current Generator).

First, let's add the equivalent of our `try/catch` clause.

```js
function withHandler(handler, gen) {
  function* withHandlerFrame() {
    const result = yield gen;
    // eventually handles the return value
    if (handler.return != null) {
      return yield handler.return(result);
    }
    return result;
  }

  const withHandlerGen = withHandlerFrame();
  withHandlerGen._handler = handler;
  return withHandlerGen;
}
```

- First thing we need is to run `withHandler` in its own Generator, this way it'll have its own stack frame
- We save the provided handler in a `_handler` field in `withHandler`'s own Generator
- Inside this Generator, we run the provided computation
- The handler may eventually handle the return value of the computation, we'll see later how it can be useful

For example:

```js
const abortHandler = {
  //optional, handles the return value
  *return(result) {
    // ...
  },
  *abort(msg) {
    console.error(msg);
    return 0;
  }
};

function* main() {
  yield withHandler(abortHandler, someFunc());
}
```

We set `abortHandler` as a handler for all `abort` effects thrown from inside `someFunc()`. The function, or one of its children, can use `perform("abort", msg)` to throw an exception that will bubbles up to the handler.

Below our first implementation of `perform` (note we don't capture the continuation)

```js
function perform(type, data) {
  return performGen => {
    // finds the closest handler for effect `type`
    let withHandlerGen = performGen;
    while (
      withHandlerGen._handler == null ||
      !withHandlerGen._handler.hasOwnProperty(type)
    ) {
      if (withHandlerGen._return == null) break;
      withHandlerGen = withHandlerGen._return;
    }

    if (
      withHandlerGen._handler == null ||
      !withHandlerGen._handler.hasOwnProperty(type)
    ) {
      throw new Error(`Unhandled Effect ${type}!`);
    }

    // found a handler, get the withHandler Generator
    const handlerFunc = withHandlerGen._handler[type];
    const handlerGen = handlerFunc(data);

    // will return to the parent of withHandler
    handlerGen._return = withHandlerGen._return;
    runGenerator(handlerGen, null);
  };
}
```

The function returns a suspended computation that does the following

1. lookup for the closest handler that can handle `type` like effects
2. if we can't find a suitable handler, we throw (for real this time) an error
3. if a matching handler is found, we instantiate its function with the effect data
4. set the `_return` address of the handler's Generator to the parent of `withHandler` clause
5. run the handler's Generator

Note the last step means we're purely ignoring `performGen`, which corresponds to how `catch` discards the throwing function.

Let's see how it works with the earlier error handling example adapted to Generators

```js
const abort = {
  *abort(msg) {
    console.error(msg);
    return 0;
  }
};

function* main(n) {
  return yield handler(n);
}

function* handler(n) {
  return yield withHandler(abort, unsafeOperation(n));
}

function* unsafeOperation(n) {
  const x = yield oneMoreIndirection(n);
  return x * 2;
}

function* oneMoreIndirection(n) {
  if (n < 0) {
    // throw
    yield perform("abort", "can't be under zero!");
  }
  return n + 1;
}

start(main(2), console.log);
// => 6

start(main(-1), console.log);
// => can't be under zero!
// => 0
```

Let's take a closer look to how `perform`/`withHandler` work together in this case.

Since `withHandler` doesn't change the Call Stack, but just wraps the given Generator and sets a special `_handler` field, when we reach the `oneMoreIndirection(-1)` the stack looks like this:

```
main(-1) -> handler(-1) -> withHandler({abort}) -> unsafeOperation(-1) ->  oneMoreIndirection(-1)
```

`yield perform("abort", msg)` finds the closest handler, which becomes the direct child for the parent of `withHandler` clause:

```
main(-1) -> handler(-1) -> abort(msg)
```

Notice how this is similar to `shift`/`reset` we saw in the previous post. When `shift` doesn't use the captured continuation, it effectively discards all the stack frames up to, and including, the `reset` block. `shift` repalces, then, the whole surrounding `reset` block and becomes the main expression of `reset`'s parent. In fact, `shift`/`reset` presents much more similaralities with `perform`/`withHanndler` as we'll see in a moment.

#### Capturing the delimited continuation

We shall, now, generalize our exception like handling by providing the handler with a delimited continuation that represents the previously discarded stack frames. This time, however, we'll proceed differently. Before jumping into the code, we'll start with a usage example, analyze how things should work in this example, then show the implementation.

The example uses a `read` effect to get a value from the surrounding environment. For our purpose, the handler will interpret the effect with a constant value.

```js
// define the `read` handler
const constRead = {
  *read(_, resume) {
    const result = yield resume("Stranger");
    return result;
  }
};

function* main() {
  return yield withHandler(constRead, greet());
}

function* greet() {
  const name = yield withCivility();
  return `Hi, ${name}`;
}

function* withCivility() {
  // throw the `read` effect
  const name = yield perform("read");
  return `M. ${name}`;
}

start(main(), console.log);
// => Hi, M.Stranger;
```

Assuming we have a working `perform` implementation, let's envision how the example should manipulate the Call Stack. As always, nothing happens until we reach `withCivility()`

```
main() -> withHandler({read}) -> greet() -> withCivility()
```

When performing the `read` effect, we know from the previous example that the handler will become the direct child of `main()`. However, the intermediate frames, previously discarded, will now become the delimited continuation provided to the `read` handler

```
main() -> read(_, <<withHandler({read}) -> greet() -> withCivility()>>)
```

We should point to an important thing here. The captured continuation is still wrapped by `withHandler({read})`, this is essential because we still want to handle further `read` effects from the rest of the computation. Notice, also, that the `read` handler runs outside `withHandler({read})` scope, this is also important, this handler may, itself, forward `read` effects (or any other effect) to an upstream handler. This makes it possible to compose different handlers. Each handler in the chain may perform some preprocessing then delegate the same (or another) effect to a parent handler.

So, now when `read`'s handler resumes the delimited continuation the stack becomes

```
main() -> read(_, <<>>) -> withHandler({read}) -> greet() -> withCivility()
```

Note our continuations can only be invoked once (one shot). This is repersented by setting the second argument of `read` to `<<>>`.

In the case `withCivility` performs a second `read` effect, it will be trapped again by the surrounding `withHandler` and a new handler instance will be created and inserted into the stack. The parent of the new handler will be `withHandler({rad})`'s parent, which in this case the former `read` handler.

Ok, having seen an example of how `perform` should manipulate the Call Stack. Let's put it into actual code

```js
function perform(type, data) {
  return performGen => {
    // finds the closest handler for effect `type`
    let withHandlerGen = performGen;
    while (
      withHandlerGen._handler == null ||
      !withHandlerGen._handler.hasOwnProperty(type)
    ) {
      if (withHandlerGen._return == null) break;
      withHandlerGen = withHandlerGen._return;
    }

    if (
      withHandlerGen._handler == null ||
      !withHandlerGen._handler.hasOwnProperty(type)
    ) {
      throw new Error(`Unhandled Effect ${type}!`);
    }

    // found a handler, get the withHandler Generator
    const handlerFunc = withHandlerGen._handler[type];

    const handlerGen = handlerFunc(data, function resume(value) {
      return currentGen => {
        withHandlerGen._return = currentGen;
        runGenerator(performGen, value);
      };
    });

    // will return to the parent of withHandler
    handlerGen._return = withHandlerGen._return;
    runGenerator(handlerGen, null);
  };
}
```

The key code is

```js
function resume(value) {
  return currentGen => {
    withHandlerGen._return = currentGen;
    runGenerator(performGen, value);
  };
}
```

It gives its meaning to the line `const result = yield resume("Stranger")` in the handler code. Especially, `withHandlerGen._return = currentGen` delimits the continuation starting from `performGen` (the Generator that performed the effect) to `currentGen` (the Generator that executed `yield resume(...)`).

You may have noticed how the implementation of `withHandler`/`perform` looks similar to `shift`/`reset` from the previous post:

- `reset` puts a special mark on a satck frame
- `withHandler` installs a handler on a stack frame

- `shift` finds the closest `reset` and becomes the direct child of `reset`'s parent
- `perform` finds the closest & matching `withHandler`, the matching handler becomes the direct child of `withHandler`'s parent

- `shift` captures all the intermediate frames and reifies them into an argument to its computation
- `perform` captures all the intermediate frames and reifies them into an argument to the matching handler

In fact, Algebraic Effects can be seen as a more structured alternative to delimited continuations.

Voilà, that's all mechanics of Algebraic Effects in action. In the remaining of this post, we'll see some more examples.

### Example 1: reverse logging

Our first example will be a `log` handler that prints the logged messages in the reverse order. It may look a little fancy, but should give us a more firm understanding of the mechanics.

```js
function log(msg) {
  return perform("log", msg);
}

const reverseLog = {
  *log(msg, resume) {
    yield resume();
    console.log(msg);
  }
};

function* main() {
  return yield withHandler(reverseLog, parent());
}

function* parent() {
  yield child();
}

function* child() {
  yield log("A");
  yield log("B");
  yield log("C");
}
```

Let's see the Call stack before performing the first `log` effect

```
main() -> withHandler({reverseLog}) -> parent() -> child()
```

After `yield log("A")`

```
main() -> log("A", <<withHandler({reverseLog}) -> parent() -> child()>>)
```

The handler invokes the continuation before logging the message so

```
main() -> log("A", <<>>) -> withHandler({reverseLog}) -> parent() -> child()
```

After `yield log("B")`

```
main() -> log("A", <<>>) -> log("B", <<withHandler({reverseLog}) -> parent() -> child()>>)
```

Again the second handler instance invokes the continuation before logging, so

```
main() -> log("A", <<>>) -> log("B", <<>>) -> withHandler({reverseLog}) -> parent() -> child()
```

After `yield log("C")`

```
main() -> log("A", <<>>) -> log("B", <<>>) -> log("C", <<withHandler({reverseLog}) -> parent() -> child()>>)
```

After the third handler instance invokes the continuation

```
main() -> log("A", <<>>) -> log("B", <<>>) -> log("C", <<>>) -> withHandler({reverseLog}) -> parent() -> child()
```

`child()`, `parent()`, `withHandler({reverseLog})` terminate successively, which results in the following Call Stack

```
main() -> log("A", <<>>) -> log("B", <<>>) -> log("C", <<>>)
```

The logs will now resume starting from rightmost stack frame, which prints the messages in the reverse order.

### Example 2: collecting logs

This one collects the logs in an array instead of logging them

```js
const collectLogs = {
  return(x) {
    return [x, ""];
  },
  *log(msg, resume) {
    const [x, acc] = yield resume();
    return [x, `${msg} {acc}`];
  }
};

function* main() {
  return yield withHandler(collectLogs, parent());
}

function* parent() {
  return yield child();
}

function* child() {
  yield log("A");
  yield log("B");
  yield log("C");
  return 10;
}

start(main(), console.log);
// => [10, "A B C "]
```

After the third handler instance invokes the continuation, we endup with

```
main() -> log("A", <<>>) -> log("B", <<>>) -> log("C", <<>>) -> withHandler({collectLogs}) -> parent() -> child()
```

`child()` returns `10` to `parent()`, which returns the same value to `withHandler({collectLogs})`

```
main() -> log("A", <<>>) -> log("B", <<>>) -> log("C", <<>>) -> withHandler({collectLogs})
```

Since `collectLogs` has defined a `return` clause, the value will be processed by the matching handler, which results in `withHandler({collectLogs})` returning `[10, ""]` to its parent `log("C")`. This one concats `""` (`acc`) with `"C"` (`msg`) and returns `[10, "C "]` to `log("B")`. The whole process results in `[10, "A B C "]` being returned

### Combining handlers

Here we compose the two precedent handlers

```js
const reverseLog = {
  *log(msg, resume) {
    yield resume();
    console.log(msg);
    yield log(msg);
  }
};

const collectLogs = {
  return(x) {
    return [x, ""];
  },
  *log(msg, resume) {
    const [x, acc] = yield resume();
    return [x, `${msg} ${acc}`];
  }
};

function* main() {
  return yield withHandler(collectLogs, withHandler(reverseLog, parent()));
}

// ... rest unmodified

start(main(), console.log);
// => C
// => B
// => A
// => [undefined, "C B A "]
```

The first handler prints the message in the reverse order, then forwards the `log` effect to `collectLogs`, since the logs are forwarded in the reverse order, they endup collected also in the reverse order.

### Conclusion

There are many other examples (state, async, ...). Some simple ones could be found [here](https://github.com/yelouafi/algebraic-effects.js/tree/master/examples). If you feel more adventurous, you can consult [this collection of ocaml examples](https://github.com/kayceesrk/effects-examples) (not all of them would be applicable in JavaScript).

This concludes our series about Algebraic Effects & Handlers. Hope it wasn't too booring, and thanks again for being a patient reader!

### Some references

- [An Introduction to Algebraic Effects and Handlers using Eff language](https://www.eff-lang.org/handlers-tutorial.pdf)
- [A talk about Algebraic Effects using the language Koka](https://www.youtube.com/watch?v=hrBq8R_kxI0)
- [What's algebraic about Algebraic Effects](https://arxiv.org/abs/1807.05923), if you feel more adventurous. (hint: In programming world, the arity of an algebraic operation isn't the number of params but the number of the possible outcomes, the interpretation `I^A -> I` can be translated into `(A -> I) -> I` (function == exponential) which is also the siganture of a CPS function that invokes its continuation `(A -> I)` with a value of type `A`, the same siganture of a handler, example: a boolean type has 2 possible outcomes `Bool -> I -> I` can be seen as `I^2 -> I`; please don't ask me more!)
