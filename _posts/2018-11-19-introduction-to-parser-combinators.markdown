---
layout: post
comments: true
title: "Gentle introduction to Parser Combinators"
date: 2018-11-19 12:04:27 +0100
categories: parsers
---

In this tutorial we're going to build a set of parser combinators.

## What is a parser combinator?

We'll answer the above question in 2 steps

1. what is a parser?
2. and.. what is a parser combinator?

So first question: What is parser?

Answer: (in its simplest form) a parser is a

1. a function
2. that takes some input in form of a raw sequence (like a string of characters)
3. and returns some meaningful data built from the raw input
4. **or** some error if the raw input does not conform to what is expected

Here is a very simple example. A parser that takes a string. If the string represents a valid integer it returns that integer, otherwise it returns a parse error.

```js
function parseInteger(input) {
  const match = /^\d+$/.exec(input);
  if (match != null) {
    return +match[0];
  }
  return new Error("Invalid integer");
}
```

```sh
$ parseInteger("12")
  >> 12

$ parseInteger("hey")
  >> Error: Invalid integer
```

Nice, but what about

```sh
$ parseInteger("12hey")
  >> Error: Invalid integer
```

Because we used `^` & `$` our regular expression checks if the entire input is a valid integer. It makes sense if this is the only thing we want to parse. However, very often we want to parse more complicated things.

## Sequencing parsers

Here is another example, we want to parse the following sequence

1. an integer
2. a '+' character
3. then another integer

And return the sum of the 2 numbers obtained in (1) and (3)

We'll keep it simple and not allow spaces between the 3 steps. So how do we approach it?

We have already our `parseInteger` function. We could reuse it somehow with another function `parsePlus`. But we need to rethink our previous definition.

Let's think about it: to parse the above sequence, we need to run 3 parsers (ie functions) one after another. But it's not as simple as composing simple functions. Passing from one step to another requires some glue code.

1. first `parseInteger` will try to parse an integer from the begining of the input
2. if (1) returns an error then we stop parsing and returns that error
3. otherwise, we call the second parser with the rest of the string

But to achieve (3) we must get the rest of the string from the first parser. So now our parser function should return

1. either an error if the parser has failed
2. or the result plus the rest of the input in case of success

So that with the return value in (2) we can call the next parser in the sequence to parse the rest of the input.

Before rewriting `parseInteger` let's first make some changes to our parser interface.

```js
// We'll use our own error description
function failure(expected, actual) {
  return { isFailure: true, expected, actual };
}

function success(data, rest) {
  return { data, rest };
}

// And for our main parsing, we'll invoke this function
function parse(parser, input) {
  const result = parser(input);
  if (result.isFailure) {
    throw new Error(`Parse error.
		expected ${result.expected}.
		instead found '${result.actual}'
	`);
  } else {
    return result;
  }
}
```

Now let's modify the parseInteger function to fit the new interface (from now on we'll use a more concise naming convention: eg `ìnteger` insetad of `parseInteger`. It will make our code more readable as we'll be defining more complex parsers)

```js
function integer(input) {
  // note we removed $ from the end of the regular expression
  const match = /^\d+/.exec(input);
  if (match != null) {
    const matchedText = match[0];
    return success(+matchedText, input.slice(matchedText.length));
  }
  return failure("an integer", input);
}
```

```sh
$ parse(integer, "12")
  >> {data: 12, rest: ""}

$ parse(integer, "hey")
  Uncaught Error: Parse error.
		expected an integer.
		instead found 'hey'

$ parse(integer, "12hey")
  >> {data: 12, rest: "hey"}
```

Fine. Let's write our second parser which parses the '+' character. This one is much simpler

```js
function plus(input) {
  if (input[0] === "+") {
    return success("+", input.slice(1));
  }
  return failure("'+'", input);
}
```

and 2 quick tests

```sh
$ parse(plus, '+33')
  >> {data: "+", rest: "33"}

$ parse(plus, '33+')
  >> Uncaught Error: Parse error.
		expected '+'.
		instead found '33+'
```

Now we'll write our main parser which will parse the entire sequence

```js
function plusExpr(input) {
  // step 1 : parse the first integer
  const result1 = integer(input);
  if (result1.isFailure) return result1;
  const { data: int1, rest: input1 } = result1;

  // step 2 : parse "+"
  const result2 = plus(input1);
  if (result2.isFailure) return result2;
  const { rest: input2 } = result2;

  // step 3 : parse the second integer
  const result3 = integer(input2);
  if (result3.isFailure) return result3;
  const { data: int2, rest: input3 } = result3;

  // one last check
  if (input3.length > 0) {
    return failure("end of input", input3);
  }
  // everything is allright. returns the final result
  return success(int1 + int2, input3);
}
```

```sh
$ parse(plusExpr, "12+34")
  >> {data: 46, rest: ""}

$ parse(plusExpr, "12a+34")
  >> Uncaught Error: Parse error.
		expected '+'.
		instead found 'a+34'

parse(plusExpr, "12-34")
>> Uncaught Error: Parse error.
		expected '+'.
		instead found '-34'

$ parse(plusExpr, "12+34rest")
  >> Uncaught Error: Parse error.
		expected end of input.
		instead found '12+34rest'
```

So far so good. But for our parser to be practical we need to make some improvements

1. we would like to have some resuable way parse more things and not just numbers.
2. we need also some reusable way to create sequences like in `plusExpr`. Right now sequencing parsers involves some boilerplate:

- at each step we must check if the result is an error to decide whether we should continue or stop
- we need also to take care of passing the rest of the input to the next parser

This may not seem too much. But remember that in practice we'll be creating this kind of sequences a lot of time. So abstracting this someway is going to make our life easier.

So first (1). We're going to make a couple of helper functions which create parsers.

The first one will just generate a parser that parses a given a string of characters

```js
function text(match) {
  return function textParser(input) {
    if (input.startsWith(match)) {
      return success(match, input.slice(match.length));
    }
    return failure(`'${match}'`, input);
  };
}

// example
const plus = text("+");
```

```js
$ parse(plus, "+12")
  >> {data: "+", rest: "12"}

$ parse(plus, "12+")
  >> Uncaught Error: Parse error.
		expected '+'.
		instead found '12+'
```

Our second helper works like the first one but matches regular expressions instead of plain text

```js
function regex(regex) {
  const anchoredRegex = new RegExp(`^${regex.source}`);

  return function regexParser(input) {
    const match = anchoredRegex.exec(input);
    if (match != null) {
      const matchedText = match[0];
      return success(matchedText, input.slice(matchedText.length));
    }
    return failure(regex, input);
  };
}

const decimal = regex(/\d+(?:\.\d+)?/);
```

```sh
parse(decimal, "12.34")
  >> {data: "12.34", rest: ""}
```

Hmm... not quite. Our aim is for an actual number 2.3 and not just its textual representation.

We can not blame our regex helper. A regular expression can be used to parse arbitrary data types, it have no idea what kind of data we are expecting. So we need some general way of transforming the textual representation into some meaningful data.

To make it even more 'general' we'll define another helper function which transforms the result of any parser not just regex ones. meet the `map` function

```js
function map(func, parser) {
  return function mapParser(input) {
    const result = parser(input);
    if (result.isFailure) return result;
    return success(func(result.data), result.rest);
  };
}

const decimal = map(x => +x, regex(/\d+(?:\.\d+)?/));
```

```sh
$ parse(decimal, "12.34")
  >> {data: 12.34, rest: ""}

$ parse(decimal, "a12.34")
  >> Uncaught Error: Parse error.
		expected /\d+(?:\.\d+)?/.
		instead found 'a12.34'
```

Certainely not the most helpful error message. We'll see later how to improve that.

Now that we defined our _primitive_ parsers. Let's define our sequencing combinator.

We already know that our sequencer needs to take care of **error handling** and **state passing** (ie passing the rest of the input) between steps. The last question is: what should be the return value?

There may be multiple answers

1. we could return just the result of the last step
2. we could also return an array with the results from all steps
3. we could apply some given function to the results from all steps and returns the result

If we think about it, we can define (1) and (2) in terms of (3) (another possibility is to take (2) and use it with `map` but we'll stick with (3)).

Ok. So our combinator will take 2 parameters :

1. a function that will be applied to the collected results from all parsers
2. an array of parsers to be sequenced

```js
function apply(func, parsers) {
  return function applyParser(input) {
    const accData = [];
    let currentInput = input;

    for (const parser of parsers) {
      const result = parser(currentInput);
      if (result.isFailure) return result;
      accData.push(result.data);
      currentInput = result.rest;
    }

    return success(func(...accData), currentInput);
  };
}
```

Our `plusExpr` parser can now be defined in terms of apply

```js
const plusExpr = apply((num1, _, num2) => num1 + num2, [
  decimal,
  plus,
  decimal
]);
```

```sh
$ parse(plusExpr, "12+34")
  >> {data: 46, rest: ""}

$ parse(plusExpr, "12+34rest")
  >> {data: 46, rest: "rest"}
```

Oops! we forgot to take care of the end of input.

Never mind. We'll just create a parser for that

```js
function eof(input) {
  if (input.length === 0) return success(null, input);
  return failure("end of input", input);
}

// fix plusExpr
const plusExpr = apply((num1, _, num2) => num1 + num2, [
  decimal,
  plus,
  decimal,
  eof
]);
```

```sh
$ parse(plusExpr, "12+34rest")
  >> Uncaught Error: Parse error.
		expected end of input.
		instead found 'rest'
```

Using `apply` we can define helpers for the other possible results of sequencing

```js
// Yeah not the best name I guess
function sequence(...parsers) {
  return apply((...results) => results[results.length - 1], parsers);
}
```

```js
function collect(...parsers) {
  return apply((...results) => results, parsers);
}
```

```sh
$ parse(
    sequence(text("hello"), text(", "), text("world")),
    "hello, world"
  )
  >> {data: "world", rest: ""}

$ parse(
    collect(text("hello"), text(", "), text("world")),
    "hello, world"
  )
  >> {data: ["hello", ", ", "world"], rest: ""}
```

## Merging parsers

We are going improve our expression parser by allowing more arithmetic operations.

We need to modify `plusExpr` so that in its 2nd step it can handle other _alternatives_ than '+'.

Ah and as usual we need our solution to be general so that we can allow alternatives between arbitrary parsers and not just from simple strings (so you guessed it, a simple regex wont do it).

You should be used to it now. We need another parser combinator.

```js
function oneOf(...parsers) {
  return function oneOfParser(input) {
    for (const parser of parsers) {
      const result = parser(input);
      if (result.isFailure) continue;
      return result;
    }
    // We'll see later a way to improve error reporting
    return failure("oneOf", input);
  };
}
```

We're equiped now to make a better experssion parser (and evaluator).

```js
const opMap = {
  "+": (left, right) => left + right,
  "-": (left, right) => left - right,
  "*": (left, right) => left * right,
  "/": (left, right) => left / right
};

function getOp(op) {
  return opMap[op];
}

const op = map(getOp, oneOf(text("+"), text("-"), text("*"), text("/")));

const decimal = map(x => +x, regex(/\d+(?:\.\d+)?/));

const expr = apply((num1, opFunc, num2) => opFunc(num1, num2), [
  decimal,
  op,
  decimal
]);
```

```sh
$ parse(expr, "12-34")
  >> {data: -22, rest: ""}

$ parse(expr, "12*34")
  >> {data: 408, rest: ""}
```

Works great. But error reporting could be better

```sh
$ parse(expr, "a12*34")

>> Uncaught Error: Parse error.
		expected /\d+(?:\.\d+)?/.
		instead found 'a12*34'

parse(expr, "12 + 34")
  >> Uncaught Error: Parse error.
		expected oneOf.
		instead found ' + 34'
```

And we are not still supporting white spaces.

Proper error reporting for real world parsers includes much more than just printing freindly names for regular expressions or the `oneOf` pasrers. We need to report the precise location (file, line & column) of the error as well as all the alternatives expected at this location (including from deeply nested parsers).

We ~~will~~ may cover error reporting in more detail in another post. For now our solution will be a simple `label` helper which decorates a given parser with a user freindly message. The implementation has some pitfalls (more precisely we need to fix lookahead) but will suffice for our current needs

```js
function label(parser, expected) {
  return function labelParser(input) {
    const result = parser(input);
    if (result.isFailure) {
      // replace the parser error with our custom one
      return failure(expected, result.actual);
    }
    return result;
  };
}

const decimal = map(x => +x, label(regex(/\d+(?:\.\d+)?/), "a decimal"));

const expr = apply((num1, opFunc, num2) => opFunc(num1, num2), [
  decimal,
  label(op, "an arithmetic operator"),
  decimal
]);
```

```sh
$ parse(expr, "12 + 34")
  >> Uncaught Error: Parse error.
		expected an arithmetic operator.
		instead found ' + 34'

$ parse(expr, "a12 + 34")
  >> Uncaught Error: Parse error.
		expected a decimal.
		instead found 'a12 + 34'
```

Our final touch will be to make the parser a little more realisic by skipping white spaces.

```js
// lexeme is a function which takes a parser for 'junk' (eg whitespaces, comments)
function lexeme(junk) {
  // and returns another function which takes a parser for some meaningful data
  return function createTokenParser(parser) {
    // the (second) function returns a parser that
    // parses the menaninful data then skips the junk
    return apply((data, _) => data, [parser, junk]);
  };
}

const spaces = regex(/\s*/);
const token = lexeme(spaces);

// redefine our experssion to skip leading and trailing spaces
const expr = apply((_, num1, opFunc, num2) => opFunc(num1, num2), [
  spaces, // skips leading spaces
  token(decimal),
  token(label(op, "an arithmetic operator")),
  token(decimal), // skips trailing spaces
  eof
]);
```

```sh
$ parse(expr, " 12 + 34 ")
  >> {data: 46, rest: ""}
```

## Yielding parsers

Some of you may know that as the original author of [redux-saga](https://github.com/redux-saga/redux-saga)
I have a soft spot for generators (which some FP folks see as a restricted do notation but whatever).

Imagine we could use genertaors to write sequences like `expr`. Instead of `apply` we could write something like

```js
const expr = go(function*() {
  yield spaces;
  const num1 = yield decimal;
  const opFunc = yield op;
  const num2 = yield decimal;
  yield eof;
  return opFunc(num1, num2);
});
```

The yield statements embed all the machinery of error handling and state passing. We can write our sequences as if we were calling normal functions.

It doesnt take much more to implement `go` than `apply`. The only difference is that instead of stepping over an array of parsers we step over a generator object. The generator yields successive parsers and at the end returns a value which will be returned as the final result of the main parser.

```js
function go(genFunc) {
  return function yieldParser(input) {
    const gen = genFunc();
    let currentInput = input;
    let genResult = gen.next();
    // if not done yet, genResult.value is the next parser
    while (!genResult.done) {
      const result = genResult.value(currentInput);
      if (result.isFailure) return result;
      currentInput = result.rest;
      genResult = gen.next(result.data);
    }
    // if done, genResult.value is the return value of the parser
    return success(genResult.value, currentInput);
  };
}
```

The generator definition of `expr` looks more imperative than the `apply` based one (aka Applicative definition). Some people will prefer the first style, other will prefer the second. 'Generator definitions' (aka Monadic definitions) also allows some things that are not possible with Applicative ones. For example, imagine parsing an html like syntax where each opening tag must have a corresponding closing tag

```js
const openBracket = text("<");
const closeBracket = text(">");

const element = go(function*() {
  // parses opening tag
  yield openBracket;
  const tagName = yield identifier;
  yield closeBracket;
  yield whateverContent;
  yield text(`</${tagName}>`);
});
```

In the last step, the yielded parser is created dynamically. There is no way to know what will be the closing tag before parsing the opening tag. With `apply` all parsers must be statically passed (known in advance) so we cant have the above kind of definitions.

Generators can also allow some nice recusive definitions. For example, suppose we want to parse some token as many times as possible

```sh
$ parse(many(regex(/\d/)), "123xyz")
  should return >> {data: ["1", "2", "3"], rest: "xyz"}
```

We can define `many` using generators like this

```js
// creates a parser that always succeeds with `value` without consuming any input
function pure(value) {
  return function pureParser(input) {
    return success(value, input);
  };
}

function many(parser) {
  const self = oneOf(
    go(function*() {
      const head = yield parser;
      // 1. keep calling self recursively
      const tail = yield self;
      return [head, ...tail];
    }),
    // 2. until it fails in which case we return an empty array
    pure([])
  );
  return self;
}
```

Using `many` we can for example parse expressions of an arbitrary length

```js
const expr = go(function*() {
  yield spaces;
  const num1 = yield decimal;
  const rest = yield many(collect(op, decimal));
  yield eof;
  return rest.reduce((acc, [opFunc, num]) => opFunc(acc, num), num1);
});
```

```sh
$ parse(expr, '1 + 2 + 3 + 4')
  >> {data: 10, rest: ""}
```

### There is much more

A single post can not cover parser combinators in detail. For those who want to go further, I made a library [pcomb](https://github.com/yelouafi/pcomb) that packages a more comprhensive set of combinators. It'not something ready for production but there are already enough features to play with more advanced parsers. Included also some examples of parsers which illustrates how combinators work.

Here are things that still need to be covered (may do that in later posts)

- Lookahead: For example Our `oneOf` definition allows for an arbitrary lookahead. It means that even if an alternative consumes an arbitrary amount of input before failing, `oneOf` will always restart the next alternative from the begining of the current input.

This is not efficient in practice and doesnt allow for proper error reporting. In practice we may better restrict the lookahead so that `oneOf` will not try another alternative if the current one has failed while consuming some input. This will also allow for better error reporting since we can propagate exactly what's expected at a specific location.

- (Proper) Error reporting, this includes reporting the exact location of the failure as well as the expected items at that location while still allowing developpers to plug in their own error messages.

- User state: Parsing complex languages involves state bookeeping (eg "are we inside a function body?"). This involves allowing a parser to read/write state information. The most simple and composable solution is to write state readers/writers themeseves as parsers that can be inserted in a sequence.

- Refactoring using modular interfaces: abstarcts away error handling & state passing into sparate interfaces (as done in Haskell with stacks of Monad Transformers). This provides a more flexible interface allowing developpers to plug in their own implementations.

I hope you enjoyed this post and that you'll have some fun creating your own parsers.
