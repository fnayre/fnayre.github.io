# Algebraic Effects in JavaScript part 1 - continuations and control transfer

This is the first post of a series about Algebraic Effects and Handlers.

There are 2 ways to approach this topic:

- Denotational: explain Algebraic Effects in terms of their meaning in mathematics/Category theory
- Operational: explain the mechanic of Algebraic Effects by showing how they operate under a chosen runtime environment

Both approaches are valuables and give different insights on the topic. However, not everyone (including me), has the prerequisites to grasp the concepts of Category theory and Abstract Algebra. On the other hand, the operational approach is accessible to a much wider audience of programmers even if it doesn't provide the full picture.

So we'll take the operational road. We'll work out our way through a serie of examples and build, progressively, the intuition on the introduced concepts. By the end of this serie, we'll have a working implementation of Algebraic Effects based on JavaScript Generators.

Since this is going to be a long topic, we'll split it in ~3~ 4 parts:

- **First we need to familiarize with the concepts of Continuations and Control Transfer**
- Next post we'll see [how to use Generators to capture Continuations](algebraic-effects/algebraic-effects-series-2.md)
- Then we'll see [how to delimit the extent of continuations](algebraic-effects/algebraic-effects-series-3.md)
- Finally we'll see [the mechanics behind Algebraic Effects and Handlers](algebraic-effects/algebraic-effects-series-4.md)

### Direct Style vs Continuation Passing Style

In this part, we'll build our concepts around the example of a simple interpreter for a small functional language. The language will support numbers, addition and calling functions that return other expressions.

We'll use the following functions to build the AST (Abstract Syntax Tree) that will be passed to the interpreter:

```js
function fun(param, body) {
  return { type: "fun", param, body };
}

function call(funExp, argExp) {
  return { type: "call", funExp, argExp };
}

function add(exp1, exp2) {
  return { type: "add", exp1, exp2 };
}

// example
const doubleFun = fun("x", add("x", "x"));
program = call(doubleFun, 10);
```

The interpreter takes an AST like above and returns a _final value_. Final values mirror atomic expressions, which don't require further evaluation (here a number or `fun`) and are objects of the target language (here JavaScript), we'll represent numbers as is and `fun` expressions with JavaScript functions.

To evaluate a program, the interpreter takes, in addition to the program AST, an _environment_ that maps variable names to their values. We'll use a plain JavaScript Object to represent the environment.

Below a possible implementation for the interpreter:

```js
function evaluate(exp, env) {
  if (typeof exp === "number") {
    return exp;
  }
  if (typeof exp === "string") {
    return env[exp];
  }
  if (exp.type === "add") {
    return evaluate(exp.exp1, env) + evaluate(exp.exp2, env);
  }
  if (exp.type === "fun") {
    return function(value) {
      const funEnv = { ...env, [exp.param]: value };
      return evaluate(exp.body, funEnv);
    };
  }
  if (exp.type === "call") {
    const funValue = evaluate(exp.funExp, env);
    const argValue = evaluate(exp.argExp, env);
    return funValue(argValue);
  }
}

evaluate(program);
// => 20
```

Here's how `evaluate` works:

- Simple numbers are returned as is
- Variables are resolved from the current environment. We don't handle unknown variables for now
- Addition recursively evaluates its operands and returns the sum of the evaluated results
- For the `fun`ction case, we return a JavaScript function that will be called with a final value (the result of some other evaluation). When invoked, the function will build a new environment in which the `fun` param is bound to the provided value, then it evaluates the `fun` body in this new environment
- The `call` case is similar to `add` we evaluate the function and argument expressions recursively then apply the function value to the argument value

`evaluate` is said to be written in _direct style_. This is not something specific to interpreters. A program that is in direct style simply means that the functions communicate their results via `return` statement. For example this simple function is also in direct style:

```js
function add(x, y) {
  return x + y;
}
```

In contrast, in the Continuation Passing Style (CPS):

1. The function takes a callback as an additional argument
2. The function never returns its result. It always uses the callback to communicate its result
3. Contrary to what you may think. Originally, it has nothing to do with async Node.js functions

For example, converted to CPS, the previous function becomes:

```js
function add(x, y, next) {
  const result = x + y;
  return next(result);
}
```

The provided callback is also called a _continuation_, because it specifies what to do next in the program. When a CPS function terminates, it throws the result on its continuation.

> **Recommended**: as a quick exercise, try to convert the interpreter into CPS form. Start by adding the continuation parameter to the signature of `evaluate`.

Solution:

```js
function evaluate(exp, env, next) {
  if (typeof exp === "number") {
    return next(exp);
  }
  if (typeof exp === "string") {
    return next(env[exp]);
  }
  if (exp.type === "add") {
    return evaluate(exp.exp1, env, function addCont1(val1) {
      return evaluate(exp.exp2, env, function addCont2(val2) {
        return next(val1 + val2);
      });
    });
  }
  if (exp.type === "fun") {
    // notice the function value becomes a CPS itself
    const closure = function(value, next) {
      const funEnv = { ...env, [exp.param]: value };
      return evaluate(exp.body, funEnv, next);
    };
    return next(closure);
  }
  if (exp.type === "call") {
    return evaluate(exp.funExp, env, function callCont1(funValue) {
      return evaluate(exp.argExp, env, function callCont2(argValue) {
        return funValue(argValue, next);
      });
    });
  }
}

function run(program) {
  return evaluate(program, {}, x => x);
}
```

Here are the things to notice:

1. Every `return` statement either calls the continuation or another CPS function
2. All those calls are in [tail call position](https://en.wikipedia.org/wiki/Tail_call)
3. In the case we need to evaluate multiple expressions (`add` and `call` cases) we chain those evaluations by providing intermediate continuations which capture the intermediate results. When the chaining is terminated we throw the result onto the main continuation
4. Life is better with direct style

At this stage, the program is already harder to read. So you're probably asking

### why would we want write a program in such style?

Short answer: you don't. But that doesn't make CPS useless.

There are various reasons which make CPS useful and even preferable, but not all of them are applicable to JavaScript (in its current status).

1. First and foremost is control. In the direct style version, the caller controls what to do next, the continuation is implicit and hidden from us. In the CPS version, however, the continuation is made explicit and passed as argument, the callee can decide what to do next by invoking the continuation. As we'll see in the next section, CPS can be used to implement various control flows that are not possible with direct style

2. Second all function calls are in tail call position in CPS. Tail calls don't need to grow the call stack (explained in next section). Since there is nothing to do after the tail call, the execution context doesn't have to be saved before performing the tail call. A compiler can optimize those tail calls by directly replacing the current execution context with the one of the function been called (instead of pushing it on top of the current one). This process is known as tail call elimination and is heavily exploited by functional compilers. Unfortunately, [current JavaScript engines dot not all implement tail call elimination](<https://kangax.github.io/compat-table/es6/#test-proper_tail_calls_(tail_call_optimisation)>) despite being part of the ECMAScript specification

3. And the most important of course is the required Asynchrony due the single threaded nature of JavaScript. If we were to use direct style functions to perform remote requests, we would have to suspend the only thread we have until the request is fulfilled, blocking the process on the current statement and preventing any other interaction meantime. CPS provides a handy and efficient way to _fork_ some work, so the current code can continue to execute and handle other interactions. In fact, one may consider this as the only practical reason to use that style in JavaScript

4. Finally, **CPS is quite powerful but not something meant to be used directly by humans**. It's a more suitable target for compilers or interpreters. Our brain is more comfortable with the structured direct style. So while we wont be writing in CPS ourselves, it's still a powerful tool use by an interpreter behind the scene. In the upcoming posts, we'll see how we exploit the power of CPS behind the scenes to present a more powerful direct style API

For our purpose, reasons 1, 2 and 4 apply. We need a more flexible control about the code and we need to handle the async problem while still recovering back the direct style.

Currently, the idiomatic solution in JavaScript is using async/await, this effectively gives us 3 and 4 but not 1. We don't have enough power over control flow.

### What is control flow?

> control flow is the order in which individual statements, instructions or function calls of an imperative program are executed or evaluated ([wikipedia](https://en.wikipedia.org/wiki/Control_flow)).

By default, in an imperative language like JavaScript, statements are executed sequentially (at the CPU level, the _instruction pointer_ is automatically incremented unless you execute a control transfer instruction). But the language also provides some control operators to alter that behavior. For example when we `break` inside a loop, the control jumps to the first instruction following the loop block. Similarly, an `if` may skip a whole block if its condition evaluates to false. All those are examples of local control transfer, meaning jumps that occur inside the same function.

An important control transfer mechanism is function invocation. It works thanks to a data structure known as the call stack. [this short video](https://www.youtube.com/watch?v=Q2sFmqvpBe0) gives a good explanation of the mechanism (PS it's worth watching).

Notice how, in the video, the caller pushes the return address which points to the next instruction after the callee returns. This looks very similar to how we provide the continuation as an additional argument to a CPS function. With the call stack, however, we don't have any power over this continuation. When a function terminates, control is automatically transferred back to the caller. In CPS, we do have this power since the continuation is reified as a normal function.

> That doesn't mean we're not using the call stack in CPS mode. A CPS call still uses the call stack but doesn't rely on it for control transfer (this is the reason we never return). It means the call stack grows with each step. With a compiler that supports tail call optimization this is a no problem (since CPS calls are always in tail position), but it can be in a language like JavaScript **if** a significant part of our process is synchronous (like heavy recursive calls). But since we're using CPS mostly here to handle asynchronous calls, we don't have this issue.

**Exceptions** represent a common form of non local control transfer. A function throwing an exception may cause the control to jump outside to another function located far up in the call hierarchy.

```js
function main() {
  try {
    // ...
    child1();
    // ...
  } catch (something) {
    console.log(something);
  }
}

function child1() {
  // ...
  child2();
  workAfterChild2();
}

function child2() {
  // ...
  throw something;
  //...
}
```

`throw` bypasses intermediate function calls in order to reach the closest handler. When we reach the `catch` clause, all the intermediate stack frames are automatically discarded. In the above example, the remaining `workAfterChild2()` in the intermediate call to `child1` is skipped. Since this is implicitly managed by the compiler, we don't have any way to recover the skipped work. We'll comeback to this mechanism later when talking about Algebraic Effects.

To illustrate how CPS can implement other control flows, we're going to add error handling to our interpreter without relying on native Javascript Exceptions. The trick is to provide, along the normal completion continuation, another one which bypasses the next step and aborts the whole computation.

```js
function evaluate(exp, env, abort, next) {
  if (typeof exp === "number") {
    return next(exp);
  }
  if (typeof exp === "string") {
    if (!env.hasOwnProperty(exp)) {
      return abort(`Unkown variable ${exp}!`);
    }
    return next(env[exp]);
  }
  if (exp.type === "add") {
    return evaluate(exp.exp1, env, abort, function cont1(val1) {
      if (typeof val1 != "number") {
        return abort("add called with a non numeric value");
      }
      return evaluate(exp.exp2, env, abort, function cont2(val2) {
        if (typeof val2 != "number") {
          return abort("add called with a non numeric value");
        }
        return next(val1 + val2);
      });
    });
  }
  if (exp.type === "fun") {
    // notice the function value becomes a CPS itself
    const closure = function(value, abort, next) {
      const funEnv = { ...env, [exp.param]: value };
      return evaluate(exp.body, funEnv, abort, next);
    };
    return next(closure);
  }
  if (exp.type === "call") {
    return evaluate(exp.funExp, env, abort, function cont1(funValue) {
      if (typeof funValue != "function") {
        return abort("trying to call a non function");
      }
      return evaluate(exp.argExp, env, abort, function cont2(argValue) {
        return funValue(argValue, abort, next);
      });
    });
  }
}

function run(program) {
  return evaluate(program, {}, console.error, x => x);
}

run(add("x", 3), 10);
// => Unkown variable x!

run(call(5, 3), 10);
// => 5 is not a function
```

We'll conclude this part by adding a feature that will give you an early taste on captured continuations: the `escape` operator.

To see how `escape` works, consider the following example:

```js
// ie: (x => x + x)(3 + 4)
call(fun("x", add("x", "x")), add(3, 4));
```

which evaluates to `14`. If we wrap it inside the `escape` operator like this

```js
// escape (eject) in (x => x + x)(3 + eject(4))
escape(
  "eject", // name of the eject function
  call(fun("x", add("x", "x")), add(3, call("eject", 4)))
);
```

We obtain `4` instead, because the `eject` function aborts the whole expression with the provided value.

Below are the required additions to our code. The implementation is surprisingly short:

```js
function escape(eject, exp) {
  return { type: "escape", eject, exp };
}

function evaluate(exp, env, abort, next) {
  //...
  if (exp.type === "escape") {
    const escapeEnv = { ...env, [exp.eject]: next };
    return evaluate(exp.exp, escapeEnv, abort, next);
  }
}

run(escape("eject", call(fun("x", add("x", "x")), add(3, call("eject", 4)))));
// => 4
```

All we need is to bind the `eject` parameter to the current continuation of the escape expression.

### Conclusion

Main takeaways of the first part:

1. Direct style relies on the call stack for control transfer
2. In direct style, control transfer between functions is implicit and hidden from us. A function must always return to its direct caller
3. You can use Exceptions for making non local control transfer
4. CPS functions never return their results. They take additional callback argument(s) representing the continuation(s) of the current code
5. In CPS, control transfer doesn't rely on the call stack. It's made explicit via the provided continuation(s)
6. CPS can emulate both local and non local control transfers but...
7. **CPS is not something meant to be used by humans, hand written CPS code becomes quickly unreadable**
8. Make sure to read the previous sentence

Next part we'll see how to use Generators in order to:

- recover back the direct style
- Capture the continuation when needed
- The difference between undelimited and delimited continuations

Thanks for being a patient reader!
