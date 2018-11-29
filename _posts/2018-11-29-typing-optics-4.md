---
layout: post
comments: true
title: "Typing Optics (4): Getters and Const"
date: 2018-11-29 21:20:27 +0100
categories: optics
---

---

title:
published: false
description:
tags:

---

This is the 4th post documenting my tentative to add typings to my [focused lens library](https://github.com/yelouafi/focused).

So far, I have type definitions for

- base typeclasses/interfaces (Functor and Applicative)
- Isos
- Lenses
- Prisms
- Traversals
- Lens & Traversal Composition
- `over` (and by extension `set`)

Next I'll be adding typing for accessor functions `view`, `preview`, ... requires typing Getters.

### Gettings/Getters

For context, `focused` defines four accessor functions.

- `view(optic, state)` is used to access a single focused value. (for now) The value must exist or it'll an Error.
- `preview(optic, state)` same as `view` but returns `null` is there is no value. If there are many focused values returns the first one.
- `toList(optic, state)` returns all focused values (which could be `0`)
- `has(optic, state)` returns a false if there are no value at the focus, returns true otherwise.

In Haskell, all the above functions take a `Getting` as first parameter. The (simplified) definition is

```hs
type Getting r s a = (a -> Const r a) -> s -> Const r s
```

Again [lens over tea](https://artyom.me/lens-over-tea-2) explains in detail the motivation behind the above representation.

In this post I'll be ..ahem.. focusing on the TypeScript implementation. For a short explanation, observe that the above definition is just a specialization of the other Optic definitions (for example replace `Getting r` with `Lens` and `Const r` with some arbitrary Functor `f` to obtain the Lens definition). We're specializing the definition to `Const` mainly to avoid updating a read only Optic.

So we need, somehow, to define the `Const` Functor (and Applicative) as well as `Getting`. And the representation has to be consistent with other Optics for the composition to still work and the compiler to infer the right types.

In Haskell, `Const` is defined as a compile-time wrapper

```hs
newtype Const r a = Const { getConst :: r }
```

In other words, `Const` holds a value of type `r` but from the perspective of the type system it is both an `r` and an `a`. In TypeScript we could achieve a similar thing by using intersection types. So I'll be using the following definition

```ts
type Const<R, A> = R & A;
```

Of course, the real value is `R`. `A` is just a _phantom type_.

Now for `Getting`, the trick (or the hack) is to give `Getting` a shape similar to other optics, but with additional constraints on the mapped types

```ts
interface Getting<R, S, A> {
  readonly $type?: "Getting";
  $applyOptic: <FA extends Const<R, A>, FS extends Const<R, S>>(
    F: Applictive<A, S, FA, FS>,
    f: Fn<A, FA>,
    s: S
  ) => FS;
}
```

I beleive the `... extends Const<R, X>` clauses are not effective with TypeScript defaulting to bivariance on function parameters. But the `$type?: Getting` ensures that we don't actually set or update Getters (which can be created using the `to` function). This requires of course that we add `Getting` to the type of all other optics which is in fact true.

```ts
interface Iso<S, T, A, B> {
  readonly $type?: "Getting" & "Iso" & "Lens" & "Traversal";
  // ...
}
// ... idem for all other optics
```

We need also to add an overload to `compose`, because composing a Getter with another Optic should always result on a Getter. Since `Getting` is now the most basic type (instead of `Traversal`) we need to add the overload at the bottom after all the others

```ts
// ... all other overloads
function compose<S, T, A, B, X, Y>(
  parent: Traversal<S, T, A, B>,
  child: Traversal<A, B, X, Y>
): Traversal<S, T, X, Y>;
function compose<S, T, A, B, X, Y>(
  parent: Getter<S, A>,
  child: Getter<A, X>
): Getter<S, X>;
```

TypeScript compiler will traverse the overloads from the top (most specific optics) to the bottom (most general optics) and will choose the most specific result for our composition.

For `Getter`s I just moved the `R` type parameter down to the optic function. My assumption is that now `Getter<S,A>` is a `Getting<R,S,A>` for all `R`s (which should be inferred by the compiler from the context)

```ts
interface Getter<S, A> {
  readonly $type?: "Getting";
  $applyOptic: <R, FA extends Const<R, A>, FS extends Const<R, S>>(
    F: Functor<A, S, FA, FS>,
    f: Fn<A, FA>,
    s: S
  ) => FS;
}
```

`to` converts a normal function to a `Getter` (so it can be composed with other optics).

```ts
function to<S, A>(sa: Fn<S, A>): Getter<S, A> {
  return {
    $applyOptic(F, f, s) {
      return f(sa(s)) as any;
    }
  };
}
```

For now I'm using sort of hack `as any` to typecast the result, but it should be safe (because we know the result of applying `f` is a `Const<R,A>` which could be safely converted to `Const<R,S>` since `A` and `S` are just phantom types).

### Accessor functions

We still need to implement the `Functor` and `Applicative` interfaces for `Const`. But first we need to define the `Monoid` interface (needed by `Const` to be an Applicative)

```ts
interface Monoid<A> {
  empty: () => A;
  concat: (xs: A[]) => A;
}
```

The following function implements the Const Functor and Applicative

```ts
function ConstM(M) {
  return {
    map(f, k) {
      return k;
    },
    pure: _ => M.empty(),
    combine(_, ks) {
      return M.concat(ks);
    }
  };
}
```

The definition of `map` is trivial, we'e just forwarding our constant value (the `R` in `Const<R,A>`). For the Applicative definition, we're relying on a given Monoid `M` to accumulate the `R`s. For example if we consider the `List` Monoid

```ts
const List = {
  empty: () => [],
  concat(xss) {
    return [].concat(...xss);
  }
};
```

Then I can create a Const Applicative that accumulates all the values into an array

```ts
const ConstList = Const<List>
```

And here is the corresponding accessor function (as always we're specifying the type parameters at the call site)

```ts
function toList<S, A>(l: Getting<A[], S, A>, s: S): A[] {
  return l.$applyOptic(
    ConstList as Applicative<A, S, Const<A[], A>, Const<A[], S>>,
    x => [x] as Const<A[], A>,
    s
  );
}
```

Using `toList`, for example, on a Traversal will `combine` all the values inside using the `ConstList` Applicative, which under the hoods uses the `List` Monoid to concatenate the traversed values.

The other functions `view`, `preview` and `has` all have a similar implementation, we use a special instance of the Monoid to provide a different behavior (cf link below for the full implementation).

> One caveat is that `view` doesn't actually work the same way as in Haskell. Since it can only get one value, if it's used on a Traversal or Prism it'll throw an Error (in Haskell the Monoid intance is automatically chooses by the compiler).

> Another last minute caveat is that optional `$type` in Optic interface doesn't seem to play nice with `strictNullChecks` enabled.

But for the rest I beleive we have working definitions for most of the public API. Next I'll have to add typings for

- The Proxy interface
- More awkward multiple composition (composing more than 2 optics)

### Links

- [TypeScript playground](<https://www.typescriptlang.org/play/index.html#src=%2F%2F%20convenient%20shortcut%20for%20functions%20taking%201%20param%0D%0Atype%20Fn%3CA%2C%20B%3E%20%3D%20(x%3A%20A)%20%3D%3E%20B%3B%0D%0A%0D%0Atype%20Either%3CA%2C%20B%3E%20%3D%20%7B%20type%3A%20%22Left%22%3B%20value%3A%20A%20%7D%20%7C%20%7B%20type%3A%20%22Right%22%3B%20value%3A%20B%20%7D%3B%0D%0A%0D%0Ainterface%20Monoid%3CA%3E%20%7B%0D%0A%20%20empty%3A%20()%20%3D%3E%20A%3B%0D%0A%20%20concat%3A%20(xs%3A%20A%5B%5D)%20%3D%3E%20A%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Functor%3CA%2C%20B%2C%20FA%2C%20FB%3E%20%7B%0D%0A%20%20map(f%3A%20Fn%3CA%2C%20B%3E%2C%20x%3A%20FA)%3A%20FB%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Applicative%3CA%2C%20B%2C%20FA%2C%20FB%3E%20extends%20Functor%3CA%2C%20B%2C%20FA%2C%20FB%3E%20%7B%0D%0A%20%20pure%3A%20Fn%3CB%2C%20FB%3E%3B%0D%0A%20%20combine%3A%20(f%3A%20Fn%3CA%5B%5D%2C%20B%3E%2C%20fas%3A%20FA%5B%5D)%20%3D%3E%20FB%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Getting%3CR%2C%20S%2C%20A%3E%20%7B%0D%0A%20%20readonly%20%24type%3F%3A%20%22Getting%22%3B%0D%0A%20%20%24applyOptic%3A%20%3CFA%20extends%20Const%3CR%2C%20A%3E%2C%20FS%20extends%20Const%3CR%2C%20S%3E%3E(%0D%0A%20%20%20%20F%3A%20Applicative%3CA%2C%20S%2C%20FA%2C%20FS%3E%2C%0D%0A%20%20%20%20f%3A%20Fn%3CA%2C%20FA%3E%2C%0D%0A%20%20%20%20s%3A%20S%0D%0A%20%20)%20%3D%3E%20FS%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Getter%3CS%2C%20A%3E%20%7B%0D%0A%20%20readonly%20%24type%3F%3A%20%22Getting%22%3B%0D%0A%20%20%24applyOptic%3A%20%3CR%2C%20FA%20extends%20Const%3CR%2C%20A%3E%2C%20FS%20extends%20Const%3CR%2C%20S%3E%3E(%0D%0A%20%20%20%20F%3A%20Functor%3CA%2C%20S%2C%20FA%2C%20FS%3E%2C%0D%0A%20%20%20%20f%3A%20Fn%3CA%2C%20FA%3E%2C%0D%0A%20%20%20%20s%3A%20S%0D%0A%20%20)%20%3D%3E%20FS%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Iso%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20readonly%20%24type%3F%3A%20%22Getting%22%20%26%20%22Iso%22%20%26%20%22Lens%22%20%26%20%22Traversal%22%3B%0D%0A%20%20%24applyOptic%3A%20(%3CFB%2C%20FT%3E(F%3A%20Functor%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%20f%3A%20Fn%3CA%2C%20FB%3E%2C%20s%3A%20S)%20%3D%3E%20FT)%3B%0D%0A%20%20from%3A%20(s%3A%20S)%20%3D%3E%20A%3B%0D%0A%20%20to%3A%20(b%3A%20B)%20%3D%3E%20T%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Prism%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20readonly%20%24type%3F%3A%20%22Getting%22%20%26%20%22Prism%22%20%26%20%22Traversal%22%3B%0D%0A%20%20%24applyOptic%3A%20(%3CFB%2C%20FT%3E(%0D%0A%20%20%20%20F%3A%20Applicative%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%0D%0A%20%20%20%20f%3A%20Fn%3CA%2C%20FB%3E%2C%0D%0A%20%20%20%20s%3A%20S%0D%0A%20%20)%20%3D%3E%20FT)%3B%0D%0A%20%20match%3A%20(s%3A%20S)%20%3D%3E%20Either%3CT%2C%20A%3E%3B%0D%0A%20%20build%3A%20(b%3A%20B)%20%3D%3E%20T%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20readonly%20%24type%3F%3A%20%22Getting%22%20%26%20%22Lens%22%20%26%20%22Traversal%22%3B%0D%0A%20%20%24applyOptic%3A%20(%3CFB%2C%20FT%3E(F%3A%20Functor%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%20f%3A%20Fn%3CA%2C%20FB%3E%2C%20s%3A%20S)%20%3D%3E%20FT)%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Traversal%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20readonly%20%24type%3F%3A%20%22Getting%22%20%26%20%22Traversal%22%3B%0D%0A%20%20%24applyOptic%3A%20(%3CFB%2C%20FT%3E(%0D%0A%20%20%20%20F%3A%20Applicative%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%0D%0A%20%20%20%20f%3A%20Fn%3CA%2C%20FB%3E%2C%0D%0A%20%20%20%20s%3A%20S%0D%0A%20%20)%20%3D%3E%20FT)%3B%0D%0A%7D%0D%0A%0D%0A%2F%2F%20Monomorphic%20version%0D%0Atype%20SimpleIso%3CS%2C%20A%3E%20%3D%20Iso%3CS%2C%20S%2C%20A%2C%20A%3E%3B%0D%0Atype%20SimplePrism%3CS%2C%20A%3E%20%3D%20Prism%3CS%2C%20S%2C%20A%2C%20A%3E%3B%0D%0Atype%20SimpleLens%3CS%2C%20A%3E%20%3D%20Lens%3CS%2C%20S%2C%20A%2C%20A%3E%3B%0D%0Atype%20SimpleTraversal%3CS%2C%20A%3E%20%3D%20Traversal%3CS%2C%20S%2C%20A%2C%20A%3E%3B%0D%0A%0D%0Atype%20Const%3CR%2C%20A%3E%20%3D%20R%20%26%20A%3B%0D%0A%0D%0Afunction%20ConstM(M)%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20map(f%2C%20k)%20%7B%0D%0A%20%20%20%20%20%20return%20k%3B%0D%0A%20%20%20%20%7D%2C%0D%0A%20%20%20%20pure%3A%20_%20%3D%3E%20M.empty()%2C%0D%0A%20%20%20%20combine(_%2C%20ks)%20%7B%0D%0A%20%20%20%20%20%20return%20M.concat(ks)%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Aconst%20Void%3A%20Monoid%3Cnever%3E%20%3D%20%7B%0D%0A%20%20empty()%20%7B%0D%0A%20%20%20%20throw%20new%20Error(%22Void.concat!%22)%3B%0D%0A%20%20%7D%2C%0D%0A%20%20concat(xs)%20%7B%0D%0A%20%20%20%20throw%20new%20Error(%22Void.concat!%22)%3B%0D%0A%20%20%7D%0D%0A%7D%3B%0D%0A%0D%0Aexport%20const%20First%20%3D%20%7B%0D%0A%20%20empty%3A%20()%20%3D%3E%20null%2C%0D%0A%20%20concat2%3A%20(x1%2C%20x2)%20%3D%3E%20(x1%20!%3D%3D%20null%20%3F%20x1%20%3A%20x2)%2C%0D%0A%20%20concat%3A%20xs%20%3D%3E%20xs.reduce(First.concat2%2C%20null)%0D%0A%7D%3B%0D%0A%0D%0Aexport%20const%20Any%20%3D%20%7B%0D%0A%20%20empty%3A%20()%20%3D%3E%20false%2C%0D%0A%20%20concat2%3A%20(x1%2C%20x2)%20%3D%3E%20x1%20%7C%7C%20x2%2C%0D%0A%20%20concat%3A%20xs%20%3D%3E%20xs.reduce(Any.concat2%2C%20false)%0D%0A%7D%3B%0D%0A%0D%0Aconst%20List%20%3D%20%7B%0D%0A%20%20empty%3A%20()%20%3D%3E%20%5B%5D%2C%0D%0A%20%20concat(xss)%20%7B%0D%0A%20%20%20%20return%20%5B%5D.concat(...xss)%3B%0D%0A%20%20%7D%0D%0A%7D%3B%0D%0A%0D%0Aconst%20ConstVoid%20%3D%20ConstM(Void)%3B%0D%0Aconst%20ConstList%20%3D%20ConstM(List)%3B%0D%0Aconst%20ConstFirst%20%3D%20ConstM(First)%3B%0D%0Aconst%20ConstAny%20%3D%20ConstM(Any)%3B%0D%0A%0D%0A%2F%2F%20This%20should%20work%20polymorhically%20for%20any%20Functor%0D%0Aconst%20Identity%20%3D%20%7B%0D%0A%20%20map(f%2C%20x)%20%7B%0D%0A%20%20%20%20return%20f(x)%3B%0D%0A%20%20%7D%2C%0D%0A%20%20pure%3A%20x%20%3D%3E%20x%2C%0D%0A%20%20combine(f%2C%20xs)%20%7B%0D%0A%20%20%20%20return%20f(xs)%3B%0D%0A%20%20%7D%0D%0A%7D%3B%0D%0A%0D%0Afunction%20compose%3CS%2C%20T%2C%20A%2C%20B%2C%20X%2C%20Y%3E(%0D%0A%20%20parent%3A%20Iso%3CS%2C%20T%2C%20A%2C%20B%3E%2C%0D%0A%20%20child%3A%20Iso%3CA%2C%20B%2C%20X%2C%20Y%3E%0D%0A)%3A%20Iso%3CS%2C%20T%2C%20X%2C%20Y%3E%3B%0D%0Afunction%20compose%3CS%2C%20T%2C%20A%2C%20B%2C%20X%2C%20Y%3E(%0D%0A%20%20parent%3A%20Prism%3CS%2C%20T%2C%20A%2C%20B%3E%2C%0D%0A%20%20child%3A%20Prism%3CA%2C%20B%2C%20X%2C%20Y%3E%0D%0A)%3A%20Prism%3CS%2C%20T%2C%20X%2C%20Y%3E%3B%0D%0A%0D%0Afunction%20compose%3CS%2C%20T%2C%20A%2C%20B%2C%20X%2C%20Y%3E(%0D%0A%20%20parent%3A%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%2C%0D%0A%20%20child%3A%20Lens%3CA%2C%20B%2C%20X%2C%20Y%3E%0D%0A)%3A%20Lens%3CS%2C%20T%2C%20X%2C%20Y%3E%3B%0D%0Afunction%20compose%3CS%2C%20T%2C%20A%2C%20B%2C%20X%2C%20Y%3E(%0D%0A%20%20parent%3A%20Traversal%3CS%2C%20T%2C%20A%2C%20B%3E%2C%0D%0A%20%20child%3A%20Traversal%3CA%2C%20B%2C%20X%2C%20Y%3E%0D%0A)%3A%20Traversal%3CS%2C%20T%2C%20X%2C%20Y%3E%3B%0D%0Afunction%20compose%3CS%2C%20T%2C%20A%2C%20B%2C%20X%2C%20Y%3E(%0D%0A%20%20parent%3A%20Getter%3CS%2C%20A%3E%2C%0D%0A%20%20child%3A%20Getter%3CA%2C%20X%3E%0D%0A)%3A%20Getter%3CS%2C%20X%3E%3B%0D%0Afunction%20compose(parent%2C%20child)%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic(F%2C%20f%2C%20s)%20%7B%0D%0A%20%20%20%20%20%20return%20parent.%24applyOptic(F%2C%20a%20%3D%3E%20child.%24applyOptic(F%2C%20f%2C%20a)%2C%20s)%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%20as%20any%3B%0D%0A%7D%0D%0A%0D%0Afunction%20lens%3CS%2C%20T%2C%20A%2C%20B%3E(%0D%0A%20%20getter%3A%20Fn%3CS%2C%20A%3E%2C%0D%0A%20%20setter%3A%20(b%3A%20B%2C%20s%3A%20S)%20%3D%3E%20T%0D%0A)%3A%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic%3CFB%2C%20FT%3E(F%3A%20Functor%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%20f%3A%20Fn%3CA%2C%20FB%3E%2C%20s%3A%20S)%3A%20FT%20%7B%0D%0A%20%20%20%20%20%20const%20a%20%3D%20getter(s)%3B%0D%0A%20%20%20%20%20%20const%20fb%20%3D%20f(a)%3B%0D%0A%20%20%20%20%20%20return%20F.map(b%20%3D%3E%20%7B%0D%0A%20%20%20%20%20%20%20%20return%20setter(b%2C%20s)%3B%0D%0A%20%20%20%20%20%20%7D%2C%20fb)%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20over%3CS%2C%20T%2C%20A%2C%20B%3E(l%3A%20Traversal%3CS%2C%20T%2C%20A%2C%20B%3E%2C%20f%3A%20Fn%3CA%2C%20B%3E%2C%20s%3A%20S)%3A%20T%20%7B%0D%0A%20%20return%20l.%24applyOptic%3CB%2C%20T%3E(Identity%2C%20f%2C%20s)%3B%0D%0A%7D%0D%0A%0D%0Afunction%20view%3CS%2C%20A%3E(l%3A%20Getting%3CA%2C%20S%2C%20A%3E%2C%20s%3A%20S)%3A%20A%20%7B%0D%0A%20%20return%20l.%24applyOptic(%0D%0A%20%20%20%20ConstVoid%20as%20Applicative%3CA%2C%20S%2C%20Const%3CA%2C%20A%3E%2C%20Const%3CA%2C%20S%3E%3E%2C%0D%0A%20%20%20%20x%20%3D%3E%20x%2C%0D%0A%20%20%20%20s%0D%0A%20%20)%3B%0D%0A%7D%0D%0A%0D%0Afunction%20preview%3CS%2C%20A%3E(l%3A%20Getting%3CA%20%7C%20null%2C%20S%2C%20A%3E%2C%20s%3A%20S)%3A%20A%20%7C%20null%20%7B%0D%0A%20%20return%20l.%24applyOptic(%0D%0A%20%20%20%20ConstFirst%20as%20Applicative%3CA%2C%20S%2C%20Const%3CA%20%7C%20null%2C%20A%3E%2C%20Const%3CA%20%7C%20null%2C%20S%3E%3E%2C%0D%0A%20%20%20%20x%20%3D%3E%20x%20as%20Const%3CA%20%7C%20null%2C%20A%3E%2C%0D%0A%20%20%20%20s%0D%0A%20%20)%3B%0D%0A%7D%0D%0A%0D%0Afunction%20has%3CS%2C%20A%3E(l%3A%20Getting%3Cboolean%2C%20S%2C%20A%3E%2C%20s%3A%20S)%3A%20boolean%20%7B%0D%0A%20%20return%20l.%24applyOptic(%0D%0A%20%20%20%20ConstAny%20as%20Applicative%3CA%2C%20S%2C%20Const%3Cboolean%2C%20A%3E%2C%20Const%3Cboolean%2C%20S%3E%3E%2C%0D%0A%20%20%20%20x%20%3D%3E%20x%20as%20Const%3Cboolean%2C%20A%3E%2C%0D%0A%20%20%20%20s%0D%0A%20%20)%3B%0D%0A%7D%0D%0A%0D%0Afunction%20toList%3CS%2C%20A%3E(l%3A%20Getting%3CA%5B%5D%2C%20S%2C%20A%3E%2C%20s%3A%20S)%3A%20A%5B%5D%20%7B%0D%0A%20%20return%20l.%24applyOptic(%0D%0A%20%20%20%20ConstVoid%20as%20Applicative%3CA%2C%20S%2C%20Const%3CA%5B%5D%2C%20A%3E%2C%20Const%3CA%5B%5D%2C%20S%3E%3E%2C%0D%0A%20%20%20%20x%20%3D%3E%20%5Bx%5D%20as%20Const%3CA%5B%5D%2C%20A%3E%2C%0D%0A%20%20%20%20s%0D%0A%20%20)%3B%0D%0A%7D%0D%0A%0D%0Afunction%20to%3CS%2C%20A%3E(sa%3A%20Fn%3CS%2C%20A%3E)%3A%20Getter%3CS%2C%20A%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic(F%2C%20f%2C%20s)%20%7B%0D%0A%20%20%20%20%20%20return%20f(sa(s))%20as%20any%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20iso%3CS%2C%20T%2C%20A%2C%20B%3E(from%3A%20(s%3A%20S)%20%3D%3E%20A%2C%20to%3A%20(b%3A%20B)%20%3D%3E%20T)%3A%20Iso%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic(F%2C%20f%2C%20s)%20%7B%0D%0A%20%20%20%20%20%20return%20F.map(to%2C%20f(from(s)))%3B%0D%0A%20%20%20%20%7D%2C%0D%0A%20%20%20%20from%2C%0D%0A%20%20%20%20to%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20prism%3CS%2C%20T%2C%20A%2C%20B%3E(%0D%0A%20%20match%3A%20(s%3A%20S)%20%3D%3E%20Either%3CT%2C%20A%3E%2C%0D%0A%20%20build%3A%20(b%3A%20B)%20%3D%3E%20T%0D%0A)%3A%20Prism%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic(F%2C%20f%2C%20s)%20%7B%0D%0A%20%20%20%20%20%20const%20eta%20%3D%20match(s)%3B%0D%0A%20%20%20%20%20%20if%20(eta.type%20%3D%3D%3D%20%22Left%22)%20%7B%0D%0A%20%20%20%20%20%20%20%20return%20F.pure(eta.value)%3B%0D%0A%20%20%20%20%20%20%7D%20else%20%7B%0D%0A%20%20%20%20%20%20%20%20return%20F.map(build%2C%20f(eta.value))%3B%0D%0A%20%20%20%20%20%20%7D%0D%0A%20%20%20%20%7D%2C%0D%0A%20%20%20%20match%2C%0D%0A%20%20%20%20build%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20from%3CS%2C%20T%2C%20A%2C%20B%3E(anIso%3A%20Iso%3CS%2C%20T%2C%20A%2C%20B%3E)%3A%20Iso%3CB%2C%20A%2C%20T%2C%20S%3E%20%7B%0D%0A%20%20return%20iso(anIso.to%2C%20anIso.from)%3B%0D%0A%7D%0D%0A%0D%0Afunction%20prop%3CS%3E()%20%7B%0D%0A%20%20return%20%3CK%20extends%20keyof%20S%3E(k%3A%20K)%3A%20SimpleLens%3CS%2C%20S%5BK%5D%3E%20%3D%3E%20%7B%0D%0A%20%20%20%20return%20lens(s%20%3D%3E%20s%5Bk%5D%2C%20(a%2C%20s)%20%3D%3E%20Object.assign(%7B%7D%2C%20s%2C%20%7B%20%5Bk%5D%3A%20a%20%7D))%3B%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20each%3CS%3E()%3A%20Traversal%3CS%5B%5D%2C%20S%5B%5D%2C%20S%2C%20S%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic(F%2C%20f%2C%20xs)%20%7B%0D%0A%20%20%20%20%20%20return%20F.combine(ys%20%3D%3E%20ys%2C%20xs.map(f))%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Aconst%20maybNum%3A%20SimplePrism%3Cstring%2C%20number%3E%20%3D%20prism(%0D%0A%20%20function%20match(s%3A%20string)%3A%20Either%3Cstring%2C%20number%3E%20%7B%0D%0A%20%20%20%20if%20(isNaN(%2Bs))%20%7B%0D%0A%20%20%20%20%20%20return%20%7B%20type%3A%20%22Left%22%2C%20value%3A%20s%20%7D%3B%0D%0A%20%20%20%20%7D%20else%20%7B%0D%0A%20%20%20%20%20%20return%20%7B%20type%3A%20%22Right%22%2C%20value%3A%20%2Bs%20%7D%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%2C%0D%0A%20%20n%20%3D%3E%20String(n)%0D%0A)%3B%0D%0A%0D%0Aconst%20str%3A%20SimpleIso%3Cnumber%2C%20number%3E%20%3D%20iso(s%20%3D%3E%20s%2C%20s%20%3D%3E%20s)%3B%0D%0A%0D%0Atype%20Address%20%3D%20%7B%0D%0A%20%20street%3A%20string%3B%0D%0A%20%20num%3A%20number%3B%0D%0A%7D%3B%0D%0A%0D%0Atype%20Person%20%3D%20%7B%0D%0A%20%20name%3A%20string%3B%0D%0A%20%20address%3A%20Address%3B%0D%0A%7D%3B%0D%0A%0D%0Aconst%20address%20%3D%20prop%3CPerson%3E()(%22address%22)%3B%0D%0Aconst%20num%20%3D%20prop%3CAddress%3E()(%22num%22)%3B%0D%0A%0D%0A%2F%2F%20Prism%20%2B%20Iso%20%3D%20Traversal%0D%0Aconst%20strnum%20%3D%20compose(%0D%0A%20%20maybNum%2C%0D%0A%20%20str%0D%0A)%3B%0D%0A%0D%0A%2F%2F%20Lens%20%2B%20Lens%20%3D%20Lens%0D%0Aconst%20addressNum%20%3D%20compose(%0D%0A%20%20address%2C%0D%0A%20%20num%0D%0A)%3B%0D%0A%0D%0Aconst%20toStr%20%3D%20to((n%3A%20number)%20%3D%3E%20String(n))%3B%0D%0A%0D%0A%2F%2F%20Lens%20%2B%20Getter%20%3D%20Getter%0D%0Aconst%20l%20%3D%20compose(%0D%0A%20%20addressNum%2C%0D%0A%20%20toStr%0D%0A)%3B%0D%0A%0D%0Aconst%20v1%20%3D%20toList(addressNum%2C%20%7B%7D%20as%20Person)%3B%0D%0A>)
