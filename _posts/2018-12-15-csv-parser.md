---
layout: post
comments: true
title: "Write a CSV Parser"
date: 2018-12-15 12:33:27 +0100
categories: parsers
---

Some time ago, I wrote a [tutorial about parser combinators]({{ site.baseurl }}{% post_url 2018-11-19-introduction-to-parser-combinators %}). The tutorial shows ho we can, with a few primitive parsers (e.g. for text and regular expressions) and combinators, we can gradually compose simple parsers to build more complex parsers. Alongside the post, I also published a JavaScript library called [pcomb](https://github.com/yelouafi/pcomb) to play with the introduced concepts. The library features many parser combinators that can be used to compose complex parsers.

In this post, I'd like to walk the interested reader through an example of using parser combinators. We'll implement a parser for tabular [CSV file format](https://en.wikipedia.org/wiki/Comma-separated_values).

First, we need a precise definition for our language. Usually we should use a formal notation like EBNF to define the grammar, but here to keep things simple, and also because the language is not too complicated, we'll just do with a textual definition.

Quoting Wikipedia page:

> a comma-separated values (CSV) file is a delimited text file that uses a comma to separate values. A CSV file stores tabular data (numbers and text) in plain text. Each line of the file is a data record. Each record consists of one or more fields, separated by commas.

So for our purpose, assuming we have a string containing the CSV file content

- A CSV is a collection of records separated by line breaks.
- A record is a collection of fields separated by commas.

Let's try to translate this into actual code.

## First attempt

We begin by importing some basic parsers

```js
import { text, regex, eof } from "pcomb";
```

- `text` allows us to match (=parse) a given literal string
- `regex` allows us to parse a string that matches a given regular expression
- `eof` ensures that we've reached the **e**nd **o**f **f**ile (there are no more superfluous charachters on the input string).

Next we define our most basic parsers.

```js
const lineBreak = text("\n");
const comma = text(",");
const field = regex(/[^\n,]*/);
```

We may also call the above definitions _lexical scanners_. If you've consulted some other parser tutorials, you may have encountered the following description of a parsing workflow

```
  | Lexical scanner | --> | Parser |
```

We first run a lexical scanning phase on the input string, where we transform the sequence of raw input characters into a sequence of _tokens_ (e.g. numbers, operators, simple variables). Then we feed this token sequence into a parsing phase that assembles them into more complex structures (e.g. arithmetic expressions).

With parser combinators, we can follow a similar process, except that we're using the same abstraction. Since everything is a parser, we're just assembling basic parsers into more complex parsers.

Note that, for each one of above parsers (or lexers if you want), the result of parsing an input string is a string representing the matched slice. For example, `field` will return a substring matching any character except `\n` and `,`.

Next, we define records, remember the definition was

> a collection of fields separated by commas

```js
const record = field.sepBy(comma);
```

The definition is rather self-descriptive. The `A.sepBy(SEP)` method transforms a parser for a thing `a` into a parser of a collection of zero or more things `a sep a sep a ...`. `SEP` can be an arbitrary parser (as long as it doesn't _overlap_ with the definition of `A`).

More concretely, the result of parsing an input string with `record` will return an array of strings (or raise an error if the input string doesn't match the expected format)

Finally the definition of a parser for the whole CSV input was

> A CSV is a collection of records separated by line breaks

Which translates to

```js
const csv = record.sepBy(lineBreak).skip(eof);
```

`record.sepBy(lineBreak)` should be obvious by now. `skip(eof)` ensure that there are no more characters left on the input string.

The full source code is given below

```js
import { text, regex, eof } from "pcomb";

const lineBreak = text("\n");
const comma = text(",");
const field = regex(/[^\n,]*/);
const record = field.sepBy(comma);
const csv = record.sepBy(lineBreak).skip(eof);
```

To run the parser on an input string we use the `parse` method. It either returns the parse result or raises an error. For example:

```js
function parse(parser, source) {
  try {
    return parser.parse(source);
  } catch (error) {
    console.error(error);
  }
}
```

```js
parse(csv, "Id,Name\n1,Yahya\n2,Ayman");
// => [["Id","Name"],["1","Yahya"],["2","Ayman"]]
```

## Improving the parser

One caveat with the above parser appears when we try to parse an input like

```
Year,Make,Model,Description,Price
1997,Ford,E350,"ac, abs, moon",3000.00
```

When parsing the above input we get

```js
[
  ["Year", "Make", "Model", "Description", "Price"],
  ["1997", "Ford", "E350", '"ac', " abs", ' moon"', "3000.00"]
];
```

Our header (first line) presupposes that each record should contain 5 fields, yet the parsed result for the second line contains 7 fields.

The issue is that the 4th field of the second line contains commas (`,`) embedded within quotes (`""`). It's not exactly that the implementation of our parser was wrong, the real issue is our definition was not accurate enough to account for _quoted fields_, i.e. fields which use quotes to embed characters that would normally be interpreted as tokens (newlines or commas) in our defined language.

So to 'fix' our language we must improve our description with a definition for field content

- A CSV is a collection of records separated by line breaks.
- A record is a collection of fields separated by commas.
- A field is either
  - a quoted string
  - an unquoted string
- A quoted string is a sequence of characters between quotes (`"..."`). Within the quotes a character `"` must be prefixed by another `"` (like `"abc""xyz"`).
- An unquoted string is any string not starting with a quote `"`, any character except `\n` and `,` are allowed.

Let's translate this into code, first we need to update our imports

```js
import { text, regex, oneOf, eof } from "pcomb";
```

We add an import for the `oneOf` combinator, we'll see the usage later.

Next we update our 'tokens'

```js
const lineBreak = text("\n");
const comma = text(",");
// new tokens
const unquoted = regex(/[^\n,]*/);
const quoted = regex(/"(?:[^"]|"")*"/).map(s =>
  s.slice(1, s.length - 1).replace(/""/g, '"')
);
```

We introduce 2 new tokens to reflect the new definition. `unquoted` is basically the same as the previous `field`. `quoted` introduces the new feature of embedding reserved tokens within quotes.

We also add some post cleanup using the `map` method, `A.map(f)` method allows transforming the result of a parser `a` into result `f(a)` using the given function `f`. In our example, we remove the surrounding quotes and convert any eventual embedded double quotes back into single quotes.

Next we update the definition of `field`, remember the new definition is now

> A field is either a quoted or unquoted string

```js
const field = oneOf(quoted, unquoted);
```

The `oneOf(...ps)` combinator introduces a _choice_ between 2 (or more) parsers. The resulting parser will match any of the given parsers (or fail if none matches).

The rest of the definitions remain unchanged. The whole new implementation becomes

```js
import { text, regex, oneOf, eof } from "pcomb";

const lineBerak = text("\n");
const comma = text(",");
const unquoted = regex(/[^\n,]*/);
const quoted = regex(/"(?:[^"]|"")*"/).map(s =>
  s.slice(1, s.length - 1).replace(/""/g, '"')
);
const field = oneOf(quoted, unquoted);
const record = field.sepBy(comma);
const csv = record.sepBy(lineBerak).skip(eof);
```

Using on the previous input

```js
const result = parse(
  csv,
  `Year,Make,Model,Description,Price
1997,Ford,E350,"ac, abs, moon",3000.00`
);

console.log(JSON.stringify(result));
```

We get the correct number of fields in the records.

```sh
[
  ["Year","Make","Model","Description","Price"],
  ["1997","Ford","E350","ac, abs, moon","3000.00"]
]
```

## Addendum: Enforcing more constraints

So far, we've seen how to enforce what could be (roughly) described as _syntactic constraints_ with our parser definitions. Our parser could also be further improved to enforce some _semantic constraints_. For example, observe the following input

```
Year,Make,Model,Description,Price
1997,Ford,E350,"ac, abs, moon",3000.00
1999,Chevy,"Venture ""Extended Edition""","",4900.00
1996,Jeep,Grand Cherokee,"MUST SELL!, 5000.00,
```

The first line, the header, presupposes that each record in the CSV table should contain 5 records. But the last line mistakenly contains a trailing comma `,`. Parsing the above input will succeed, but as a result we get a table where all records do not contain the same number of columns.

We could enforce this kind of constraints by running a post-parse traversal on the parse result to ensure that the number of fields is consistent in the resulting table. But this looks like a sub-optimal solution, for example if we're parsing a huge CSV file, and the above kind of error is located in one of the first lines, we don't need to continue parsing the rest of the input, we can stop parsing immediately at the wrong line.

A more optimal solution would be detecting those semantic errors as early as possible during parsing. The solution involves usually maintaining some user defined state during parsing and placing appropriate _guards_ at specific parse steps (guards usually test a parse result against some actual user defined state).

Since I intend to keep this a short tutorial, I'll leave it here. And (maybe :)) I'll write another post with a more detailed walk through on how to enforce semantic constraints.

## Links

- [A codesanbox demo](https://codesandbox.io/s/jj91jjoy73) featuring a demo of the CSV and many other example parsers
