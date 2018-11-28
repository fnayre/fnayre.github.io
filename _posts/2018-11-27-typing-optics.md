---
layout: post
comments: true
title: "Typing Optics (3): Isomorphisms and Prisms"
date: 2018-11-24 19:20:27 +0100
categories: optics
---

This is the 3rd post documenting my tentative to add typings to my [focused lens library](https://github.com/yelouafi/focused).

So far, I've been able to add type definitions for

- base typeclasses/interfaces (Functor and Applicative)
- Lenses
- Traversals
- Lens & Traversal Composition
- type definition of `over`

In this post I'll be tackling Isomorphisms and Prisms

### Isomorphisms

If we look at the typical definition of Isos in Haskell

```hs
type Iso s t a b = forall p f. (Profunctor p, Functor f) => p a (f b) -> p s (f t)
```

There is [a story](https://artyom.me/lens-over-tea-4) behind this representation. You can read it in detail in the linked post (but it's not required to follow the rest).

To simplify, an Iso can be represented in 2 ways: functional & concrete . The concrete representation matches our intuition about Isos, a pair of inversible functions

```hs
data CIso a s = CIso (s -> a) (a -> s)
-- or using the polymorphic version
data CIso a b s t = CIso (s -> a) (b -> t)
```

The functional representation is similar to Lenses

```hs
type FIso s t a b = (a -> f b) -> s -> f t
```

We need Isos _to be both above representations at once_. In Haskell we do this by creating a typeclass (something like an interface) that abstracts over both representations and instantiate (implement) the typeclass for each concrete representation. For Isos, the typeclass used is the Profunctor class. By making both functions and `CIso` instances of it, we can rely on Haskell type inference to choose the appropriate representation (for the interested [here is an an implementation example](https://repl.it/@yelouafi/function-Lenses), look at the file Iso.hs).

Now, in TypeScript, I don't actually want to introduce Profunctors in the library for various reasons. But I can have both representation as part of the same interface.

```ts
interface Iso<S, T, A, B> {
  readonly $type?: "Iso" & "Lens" & "Traversal";
  $applyOptic: (<FB, FT>(F: Functor<B, T, FB, FT>, f: Fn<A, FB>, s: S) => FT);
  from: (s: S) => A;
  to: (b: B) => T;
}
```

Each Iso is a also a Lens (and by extension a Traversal), since the functional implementation is the same as the Lens one.

Now the trick is I can always construct the functional representation given the concrete representation

```ts
function iso<S, T, A, B>(from: (s: S) => A, to: (b: B) => T): Iso<S, T, A, B> {
  return {
    $applyOptic(F, f, s) {
      return F.map(to, f(from(s)));
    },
    from,
    to
  };
}
```

And I can inverse an Iso using the embedded pair of functions

```ts
function from<S, T, A, B>(anIso: Iso<S, T, A, B>): Iso<B, A, T, S> {
  return iso(anIso.to, anIso.from);
}
```

But there is one caveat, if I compose an Iso with another Iso it'll only give me the composed function `$applyOptic`, so the original `from` and `to` are gone. If I want to preserve the Isomorphism when composing 2 Isos, I'll have to modify the `compose` function to handle this special case. In fact, this what's done [in the actual implementation](https://github.com/yelouafi/focused/blob/master/src/operations.js#L63-L74).

Since now we have 3 optic types, normally we'd have to write 9 overloads for `compose` but as we already saw in the previous post, we need only 3 overloads (since every Iso is a Lens and a Traversal).

```ts
function compose<S, T, A, B, X, Y>(
  parent: Iso<S, T, A, B>,
  child: Iso<A, B, X, Y>
): Iso<S, T, X, Y>;
function compose<S, T, A, B, X, Y>(
  parent: Lens<S, T, A, B>,
  child: Lens<A, B, X, Y>
): Lens<S, T, X, Y>;
function compose<S, T, A, B, X, Y>(
  parent: Traversal<S, T, A, B>,
  child: Traversal<A, B, X, Y>
): Traversal<S, T, X, Y>;
```

We don't need to modify the definition of `over` since it takes the most general type (Traversal).

### Prisms

The definition of Prisms follows the same path. The Haskell definition is

```hs
type Prism s t a b = forall p f.(Choice p, Applicative f) => p a (f b) -> p s (f t)
```

It's the same as Isos except we use `Choice` in place of `Profunctor`. `Choice` is also a Profunctor but extends it with additional functions to deal with Sum types like Either (you can read [the full story here](https://artyom.me/lens-over-tea-5)).

The concrete representation for Prisms is

```hs
data CPrism s a = CPrism (s -> Either s a) (a -> s)
-- Polymorphic version
data CPrism s t a b = CPrism (s -> Either t a) (b -> t)
```

Again it's the same as Iso except that instead of `s -> a` in Isos, we have now a `s -> Either t a` (while an Iso always succeeds in extracting an `a` from `s`, a Prism can fail in which case it returns an alternative `t` that short-circuits the function `b -> t`).

Since we need to preserve Prisms over composition, we'll follow the similar trick we did with Isos.

```ts
type Either<A, B> = { type: "Left"; value: A } | { type: "Right"; value: B };

interface Prism<S, T, A, B> {
  readonly $type?: "Prism" & "Traversal";
  $applyOptic: (<FB, FT>(
    F: Applicative<B, T, FB, FT>,
    f: Fn<A, FB>,
    s: S
  ) => FT);
  match: (s: S) => Either<T, A>;
  build: (b: B) => T;
}
```

Notice the function takes an Applicative and not a Functor, we'll see why in a minute.

`prism` function is used to construct a functional representation from a concrete one

```ts
function prism<S, T, A, B>(
  match: (s: S) => Either<T, A>,
  build: (b: B) => T
): Prism<S, T, A, B> {
  return {
    $applyOptic(F, f, s) {
      const eta = match(s);
      if (eta.type === "Left") {
        // here!!
        return F.pure(eta.value);
      } else {
        return F.map(build, f(eta.value));
      }
    },
    match,
    build
  };
}
```

`F.pure(eta.value)` explains why we need an Applicative. In case the `match` fails in extracting a value from `S`, we get a `T` (wrapped in `Either`), since we need to return an `F<T>` from `T`, the `pure` function from the Applicative interface allows us to wrap plain values into the Applicative context (In fact we don't need the whole Applicative just the `pure` part, this restricted interface is sometimes called `Pointed`).

As for `compose` we need to add only one overload, if you consulted the implementation of `compose` linked in the previous section, you've already seen that there is also a special case analysis for composing 2 prisms.

```ts
function compose<S, T, A, B, X, Y>(
  parent: Prism<S, T, A, B>,
  child: Prism<A, B, X, Y>
): Iso<S, T, X, Y>;
```

So far, it seems we have typings for the 4 optics, Remaining:

- Add typing for accessor functions `view`, `preview` and co
- I'll have to figre Something for Getters
- Proxies

### Links

- [TypeScript playground](<https://www.typescriptlang.org/play/index.html#src=%2F%2F%20convenient%20shortcut%20for%20functions%20taking%201%20param%0D%0Atype%20Fn%3CA%2C%20B%3E%20%3D%20(x%3A%20A)%20%3D%3E%20B%3B%0D%0A%0D%0Atype%20Either%3CA%2C%20B%3E%20%3D%20%7B%20type%3A%20%22Left%22%3B%20value%3A%20A%20%7D%20%7C%20%7B%20type%3A%20%22Right%22%3B%20value%3A%20B%20%7D%3B%0D%0A%0D%0Ainterface%20Functor%3CA%2C%20B%2C%20FA%2C%20FB%3E%20%7B%0D%0A%20%20map(f%3A%20Fn%3CA%2C%20B%3E%2C%20x%3A%20FA)%3A%20FB%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Applicative%3CA%2C%20B%2C%20FA%2C%20FB%3E%20extends%20Functor%3CA%2C%20B%2C%20FA%2C%20FB%3E%20%7B%0D%0A%20%20pure%3A%20Fn%3CB%2C%20FB%3E%3B%0D%0A%20%20combine%3A%20(f%3A%20Fn%3CA%5B%5D%2C%20B%3E%2C%20fas%3A%20FA%5B%5D)%20%3D%3E%20FB%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Iso%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20readonly%20%24type%3F%3A%20%22Iso%22%20%26%20%22Lens%22%20%26%20%22Traversal%22%3B%0D%0A%20%20%24applyOptic%3A%20(%3CFB%2C%20FT%3E(F%3A%20Functor%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%20f%3A%20Fn%3CA%2C%20FB%3E%2C%20s%3A%20S)%20%3D%3E%20FT)%3B%0D%0A%20%20from%3A%20(s%3A%20S)%20%3D%3E%20A%3B%0D%0A%20%20to%3A%20(b%3A%20B)%20%3D%3E%20T%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Prism%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20readonly%20%24type%3F%3A%20%22Prism%22%20%26%20%22Traversal%22%3B%0D%0A%20%20%24applyOptic%3A%20(%3CFB%2C%20FT%3E(%0D%0A%20%20%20%20F%3A%20Applicative%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%0D%0A%20%20%20%20f%3A%20Fn%3CA%2C%20FB%3E%2C%0D%0A%20%20%20%20s%3A%20S%0D%0A%20%20)%20%3D%3E%20FT)%3B%0D%0A%20%20match%3A%20(s%3A%20S)%20%3D%3E%20Either%3CT%2C%20A%3E%3B%0D%0A%20%20build%3A%20(b%3A%20B)%20%3D%3E%20T%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20readonly%20%24type%3F%3A%20%22Lens%22%20%26%20%22Traversal%22%3B%0D%0A%20%20%24applyOptic%3A%20(%3CFB%2C%20FT%3E(F%3A%20Functor%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%20f%3A%20Fn%3CA%2C%20FB%3E%2C%20s%3A%20S)%20%3D%3E%20FT)%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Traversal%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20readonly%20%24type%3F%3A%20%22Traversal%22%3B%0D%0A%20%20%24applyOptic%3A%20(%3CFB%2C%20FT%3E(%0D%0A%20%20%20%20F%3A%20Applicative%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%0D%0A%20%20%20%20f%3A%20Fn%3CA%2C%20FB%3E%2C%0D%0A%20%20%20%20s%3A%20S%0D%0A%20%20)%20%3D%3E%20FT)%3B%0D%0A%7D%0D%0A%0D%0A%2F%2F%20Monomorphic%20version%0D%0Atype%20SimpleIso%3CS%2C%20A%3E%20%3D%20Iso%3CS%2C%20S%2C%20A%2C%20A%3E%3B%0D%0Atype%20SimplePrism%3CS%2C%20A%3E%20%3D%20Prism%3CS%2C%20S%2C%20A%2C%20A%3E%3B%0D%0Atype%20SimpleLens%3CS%2C%20A%3E%20%3D%20Lens%3CS%2C%20S%2C%20A%2C%20A%3E%3B%0D%0Atype%20SimpleTraversal%3CS%2C%20A%3E%20%3D%20Traversal%3CS%2C%20S%2C%20A%2C%20A%3E%3B%0D%0A%0D%0A%2F%2F%20This%20should%20work%20polymorhically%20for%20any%20Functor%0D%0Aconst%20Identity%20%3D%20%7B%0D%0A%20%20map(f%2C%20x)%20%7B%0D%0A%20%20%20%20return%20f(x)%3B%0D%0A%20%20%7D%2C%0D%0A%20%20pure%3A%20x%20%3D%3E%20x%2C%0D%0A%20%20combine(f%2C%20xs)%20%7B%0D%0A%20%20%20%20return%20f(xs)%3B%0D%0A%20%20%7D%0D%0A%7D%3B%0D%0A%0D%0Afunction%20compose%3CS%2C%20T%2C%20A%2C%20B%2C%20X%2C%20Y%3E(%0D%0A%20%20parent%3A%20Iso%3CS%2C%20T%2C%20A%2C%20B%3E%2C%0D%0A%20%20child%3A%20Iso%3CA%2C%20B%2C%20X%2C%20Y%3E%0D%0A)%3A%20Iso%3CS%2C%20T%2C%20X%2C%20Y%3E%3B%0D%0Afunction%20compose%3CS%2C%20T%2C%20A%2C%20B%2C%20X%2C%20Y%3E(%0D%0A%20%20parent%3A%20Prism%3CS%2C%20T%2C%20A%2C%20B%3E%2C%0D%0A%20%20child%3A%20Prism%3CA%2C%20B%2C%20X%2C%20Y%3E%0D%0A)%3A%20Prism%3CS%2C%20T%2C%20X%2C%20Y%3E%3B%0D%0A%0D%0Afunction%20compose%3CS%2C%20T%2C%20A%2C%20B%2C%20X%2C%20Y%3E(%0D%0A%20%20parent%3A%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%2C%0D%0A%20%20child%3A%20Lens%3CA%2C%20B%2C%20X%2C%20Y%3E%0D%0A)%3A%20Lens%3CS%2C%20T%2C%20X%2C%20Y%3E%3B%0D%0Afunction%20compose%3CS%2C%20T%2C%20A%2C%20B%2C%20X%2C%20Y%3E(%0D%0A%20%20parent%3A%20Traversal%3CS%2C%20T%2C%20A%2C%20B%3E%2C%0D%0A%20%20child%3A%20Traversal%3CA%2C%20B%2C%20X%2C%20Y%3E%0D%0A)%3A%20Traversal%3CS%2C%20T%2C%20X%2C%20Y%3E%3B%0D%0A%2F%2F%20Lens%20composition%0D%0Afunction%20compose(parent%2C%20child)%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic(F%2C%20f%2C%20s)%20%7B%0D%0A%20%20%20%20%20%20return%20parent.%24applyOptic(F%2C%20a%20%3D%3E%20child.%24applyOptic(F%2C%20f%2C%20a)%2C%20s)%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%20as%20any%3B%0D%0A%7D%0D%0A%0D%0Afunction%20lens%3CS%2C%20T%2C%20A%2C%20B%3E(%0D%0A%20%20getter%3A%20Fn%3CS%2C%20A%3E%2C%0D%0A%20%20setter%3A%20(b%3A%20B%2C%20s%3A%20S)%20%3D%3E%20T%0D%0A)%3A%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic%3CFB%2C%20FT%3E(F%3A%20Functor%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%20f%3A%20Fn%3CA%2C%20FB%3E%2C%20s%3A%20S)%3A%20FT%20%7B%0D%0A%20%20%20%20%20%20const%20a%20%3D%20getter(s)%3B%0D%0A%20%20%20%20%20%20const%20fb%20%3D%20f(a)%3B%0D%0A%20%20%20%20%20%20return%20F.map(b%20%3D%3E%20%7B%0D%0A%20%20%20%20%20%20%20%20return%20setter(b%2C%20s)%3B%0D%0A%20%20%20%20%20%20%7D%2C%20fb)%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20over%3CS%2C%20T%2C%20A%2C%20B%3E(l%3A%20Traversal%3CS%2C%20T%2C%20A%2C%20B%3E%2C%20f%3A%20Fn%3CA%2C%20B%3E%2C%20s%3A%20S)%3A%20T%20%7B%0D%0A%20%20return%20l.%24applyOptic%3CB%2C%20T%3E(Identity%2C%20f%2C%20s)%3B%0D%0A%7D%0D%0A%0D%0Afunction%20iso%3CS%2C%20T%2C%20A%2C%20B%3E(from%3A%20(s%3A%20S)%20%3D%3E%20A%2C%20to%3A%20(b%3A%20B)%20%3D%3E%20T)%3A%20Iso%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic(F%2C%20f%2C%20s)%20%7B%0D%0A%20%20%20%20%20%20return%20F.map(to%2C%20f(from(s)))%3B%0D%0A%20%20%20%20%7D%2C%0D%0A%20%20%20%20from%2C%0D%0A%20%20%20%20to%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20prism%3CS%2C%20T%2C%20A%2C%20B%3E(%0D%0A%20%20match%3A%20(s%3A%20S)%20%3D%3E%20Either%3CT%2C%20A%3E%2C%0D%0A%20%20build%3A%20(b%3A%20B)%20%3D%3E%20T%0D%0A)%3A%20Prism%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic(F%2C%20f%2C%20s)%20%7B%0D%0A%20%20%20%20%20%20const%20eta%20%3D%20match(s)%3B%0D%0A%20%20%20%20%20%20if%20(eta.type%20%3D%3D%3D%20%22Left%22)%20%7B%0D%0A%20%20%20%20%20%20%20%20return%20F.pure(eta.value)%3B%0D%0A%20%20%20%20%20%20%7D%20else%20%7B%0D%0A%20%20%20%20%20%20%20%20return%20F.map(build%2C%20f(eta.value))%3B%0D%0A%20%20%20%20%20%20%7D%0D%0A%20%20%20%20%7D%2C%0D%0A%20%20%20%20match%2C%0D%0A%20%20%20%20build%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20from%3CS%2C%20T%2C%20A%2C%20B%3E(anIso%3A%20Iso%3CS%2C%20T%2C%20A%2C%20B%3E)%3A%20Iso%3CB%2C%20A%2C%20T%2C%20S%3E%20%7B%0D%0A%20%20return%20iso(anIso.to%2C%20anIso.from)%3B%0D%0A%7D%0D%0A%0D%0Afunction%20prop%3CS%3E()%20%7B%0D%0A%20%20return%20%3CK%20extends%20keyof%20S%3E(k%3A%20K)%3A%20SimpleLens%3CS%2C%20S%5BK%5D%3E%20%3D%3E%20%7B%0D%0A%20%20%20%20return%20lens(s%20%3D%3E%20s%5Bk%5D%2C%20(a%2C%20s)%20%3D%3E%20Object.assign(%7B%7D%2C%20s%2C%20%7B%20%5Bk%5D%3A%20a%20%7D))%3B%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20each%3CS%3E()%3A%20Traversal%3CS%5B%5D%2C%20S%5B%5D%2C%20S%2C%20S%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic(F%2C%20f%2C%20xs)%20%7B%0D%0A%20%20%20%20%20%20return%20F.combine(ys%20%3D%3E%20ys%2C%20xs.map(f))%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Aconst%20idIso%3A%20SimpleIso%3Cnumber%2C%20number%3E%20%3D%20iso(%0D%0A%20%20s%20%3D%3E%20s%2C%0D%0A%20%20s%20%3D%3E%20s%0D%0A)%0D%0A%0D%0Aconst%20maybNum%3A%20SimplePrism%3Cstring%2C%20number%3E%20%3D%20prism(%0D%0A%20%20function%20match(s%3A%20string)%3A%20Either%3Cstring%2C%20number%3E%20%7B%0D%0A%20%20%20%20if%20(isNaN(%2Bs))%20%7B%0D%0A%20%20%20%20%20%20return%20%7B%20type%3A%20%22Left%22%2C%20value%3A%20s%20%7D%3B%0D%0A%20%20%20%20%7D%20else%20%7B%0D%0A%20%20%20%20%20%20return%20%7B%20type%3A%20%22Right%22%2C%20value%3A%20%2Bs%20%7D%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%2C%0D%0A%20%20n%20%3D%3E%20String(n)%0D%0A)%3B%0D%0A%0D%0Atype%20Address%20%3D%20%7B%0D%0A%20%20street%3A%20string%3B%0D%0A%7D%3B%0D%0A%0D%0A%0D%0A%2F%2F%20Iso%20%2B%20Iso%20%3D%20Iso%0D%0Aconst%20trivialIso%20%3D%20compose(idIso%2C%20from(idIso))%20%0D%0A%0D%0A%2F%2F%20Prism%20%2B%20Lens%20%3D%20Traversal%0D%0Aconst%20streetNum%20%3D%20compose(%0D%0A%20%20prop%3CAddress%3E()(%22street%22)%2C%0D%0A%20%20maybNum%0D%0A)%3B%0D%0A%0D%0A>)
