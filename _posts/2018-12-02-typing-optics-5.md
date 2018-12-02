---
layout: post
comments: true
title: "Typing Optics (4): Getters and Const"
date: 2018-12-02 16:02:27 +0100
categories: optics
---

OK, continuing my hack to make my [focused lens library](https://github.com/yelouafi/focused) definetely typed.

So far, I have type definitions for

- base typeclasses/interfaces (Monoids, Functor and Applicative)
- Gettings and Getters
- Isos
- Lenses
- Prisms
- Traversals
- Lens & Traversal Composition
- optic operations (`over`, `view`, `preview`)

In this post I'll be adding typings for the Proxy interface.

### Typing Proxy interface

`lensProxy` is they key interface to create Optics in `focused`. The function provides a familiar dot-style to create and compose optics.

For example, say we have the following object shapes

```ts
interface Address {
  street: number;
}

interface Person {
  name: string;
  addresses: Address[];
}
```

Then we can use `lensProxy` (perhaps I should peek a better name)

```ts
const _ = lensProxy();

const Lname = _.name;
// like prop("name")
// type = SimpleLens<Person, string>

const LmainStreet = _.addresses[0].street;
// like compose(prop("addresses"), index(0), prop("street"))
// type = SimpleLens<Person, number>

lAllStreets = _.addresses.$(each).street;
// like compose(prop("addresses"), each, prop("street"))
// type = SimpleTraversal<Person, number>
```

So a Lens Proxy (or a TraversalProxy, IsoProxy...) is

1. A Lens itself
2. But also an object of the shame shape of the focused type ...
3. where each property value is replaced with a Lens focusing at that value
4. repeat the above process recursively for each child object property

For example, a Lens Proxy for `Person` is of the shape

```ts
{
  name: Lens<Person, string>
  addresses: LensProxy<Person, Address[]>
}
```

We need to construct those proxy shapes dynamically from the provided Object type. In Haskell the lens library uses something called Template Haskell (kind of type safe macros). We don't have such thing in TypeScript but fortunately we can use a useful feature called [Mapped Types](https://www.typescriptlang.org/docs/handbook/advanced-types.html)(look for the section of the same name). It lets you _map_ the properties of an object type to another type which is exactly what we need.

For example, here is a possible definition for `LensProxy`

```ts
type LensProxy<P, S> = SimpleLens<P, S> &
  { [K in keyof S]: LensProxy<P, S[K]> };
```

For each property type in the target object we recursively generate a LensProxy for that type.

We need also to put a term to our recursion, we can use TypeScript conditional types to stop recusing on non-object types

```ts
export type LensProxy<P, S> = SimpleLens<P, S> &
  (S extends object ? { [K in keyof S]: LensProxy<P, S[K]> } : {});
```

But that's only half the solution, we still have 2 issues to overcome

1. We need to define composition properly (the resulting Optic from `.` )
2. lensProxy also offers a `$` method where you can plug an arbitrary optic. It composes the given Optic with the current Proxy so we should also type the result properly

A possible solution for (1) is to define a Proxy type for each Optic type. So we'll have an `IsoProxy` for `Iso`, a `TraversalProxy` for `Traversal` and so on.

We know that the `.` creates an Optic using either `prop` or `index` so the second component of composition is always a Lens. It means the result depends only on the parent Proxy.

```ts
type IsoProxy<P, S> = SimpleIso<P, S> &
  {
    // Iso + Lens = Lens
    [K in keyof S]: LensProxy<P, S[K]>
  };

type LensProxy<P, S> = SimpleLens<P, S> &
  {
    // Lens + Lens = Lens
    [K in keyof S]: LensProxy<P, S[K]>
  };

type TraversalProxy<P, S> = SimpleTraversal<P, S> &
  {
    // Traversal + Lens = Traversal
    [K in keyof S]: TraversalProxy<P, S[K]>
  };

type PrismProxy<P, S> = SimplePrism<P, S> &
  {
    // Prism + Lens = Traversal
    [K in keyof S]: TraversalProxy<P, S[K]>
  };
```

In fact, I think we can only keep the `Lens` and `Traversal` variants. First there is no way to create a `PrismProxy` as a root or child Proxy. For `Iso` we can only create a root `IsoProxy` using the trivial Identity Optic, and I don't see how that could be useful to someone.

For (2) we'll add a method `$` to the definition and use overloads to return the right type of the composition

```ts
export type LensProxy<P, S> = SimpleLens<P, S> &
  (S extends object ? { [K in keyof S]: LensProxy<P, S[K]> } : {}) & {
    $<A>(child: SimpleLens<S, A>): LensProxy<P, A>;
    $<A>(child: SimpleTraversal<S, A>): TraversalProxy<P, A>;
  };

export type TraversalProxy<P, S> = SimpleTraversal<P, S> &
  (S extends object ? { [K in keyof S]: TraversalProxy<P, S[K]> } : {}) & {
    $<A>(child: SimpleTraversal<S, A>): TraversalProxy<P, A>;
  };
```

To be honest, I've still some doubts about the recursive code. There are also some (minor) caveats like when we try to compose a LensProxy with plain Lens for example (compiler unable to infer the right types). But for now, the above solution seems to work for most of the common cases.

I think this will be the last post on those series. There are still things left like composing more than 2 optics but this should be just a matter of adding more overloads to `compose`.

### Conclusion

Initially, I thought it was impossible to type the library because Haskell lenses use some advanced features of the Haskell GHC compiler. I thought TypeScript couldn't handle that not because it was an inferior type system, but because of the trade-offs and paradigms are hugely different.

It turns out you can do many things in TypeScript, mainly because the type system is 'flexible' (indexed, mapped & conditional types). It can also get out of the way when you want to (which may also be dangerous if used without extreme care). It makes the system unsound but practical for typing highly dynamic JavaScript libraries (I didn't check Flow but I think the same arguments apply).

For the publishing, I was thinking initially of full rewrite from JS to TS, but I think I'll just add the declaration file for the moment (In fact it's already published in the latest 0.7.0 release).
