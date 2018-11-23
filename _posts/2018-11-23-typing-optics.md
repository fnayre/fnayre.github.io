---
layout: post
comments: true
title: "Typing Optics with TypeScript"
date: 2018-11-23 12:53:27 +0100
categories: optics
---

I remember my first attempts to learn Optics started long time ago, I stopped on basic things due to the lack of good resources at the time. Recently, [lens over tea series](https://artyom.me/lens-over-tea-1) by Artyom Kazak renewed my interest. I recommend it for anyone looking for a deep dive on the topic (Depending on your taste, you may find Artyom's style boring or amusing).

As part of my learning process, I usually try to port/adapt the ideas I learn from Haskell into JavaScript. The result is (yet another) JavaScript Optics library called [focused](https://github.com/yelouafi/focused) (there are many Lens libs in JS but most of them support just Lenses, other optics like Prisms or Traversals are omitted).

The library reuses the same underlying representation from the famous Haskell lens library (known as the Van Laarhoven representation). In this model, all Optics are normal functions (well until we get to the profunctor stuff) of the same form `(A -> F<B>) -> S -> F<T>` and only differ in the constraints imposed on the `F` Generic wrapper (Some more info on this [twitter thread](https://twitter.com/YassineElouafi2/status/1060282797032701954)).

One of the main todos on `focused` roadmap is to add Typings to the library. I'll be starting with Typescript but I think a potential solution could be also transposed to Flow (Since I'm relatively new to TypeScript, I may be missing something in the following).

So I started doing some experiments with TypeScript, and soon I stumbled upon a fairly common issue when you try to re-implement ideas from a language like Haskell: [the lack of Higher Kinded types](https://github.com/Microsoft/TypeScript/issues/1213). The Haskell lens library already uses some advanced features of the Haskell type system, but it's not even easy to have something 'basic' like type classes to work in TypeScript (this is not to imply TypeScript is inferior to Haskell, we can't even compare them because the paradigms are so different, it just illustrates my struggle).

A bit of googling lead me to some ingenious workarounds like [this one](https://github.com/gcanti/fp-ts). Unfortunately, this won't work in my case, the solution requires the values to be wrapped in objects (so we can have a `URI` property that identifies the current interface). `focused` uses static interfaces that work with plain JS types. For example, I don't want to wrap/unwrap accessed values in classes like `Identity<A>`. Ideally, functions should work directly on `A`. In Haskell, you can put values in a `newtype` which gives you the `URI` like feature but without the runtime overhead. I also found some attempts to implement a `newtype`-like thing with abstract types in Flow or intersection types in TypeScript, but this also didn't work so well on my case (I could've also misused something).

My current (unfinished) workaround is to give up the Generic type inference and just apply the type parameters directly on the call site. For example, let's take the definition of `Functor`

First, here is the Haskell definition

```hs
class Functor f where
  map: (a -> b) -> f a -> f b
```

in an hypothetical TypeScript like language with support for Higher Kinded Types, this would look like

```ts
interface Functor<F> {
  map: <A, B>(f: (a: A) => B, fa: F<A>) => F<B>;
}
```

But it won't work in the actual TypeScript because we can't _apply the Generic Type Parameter in a Generic way_ (pun is inevitable). So my workaround is to move up all type parameters in the interface definition

```ts
interface Functor<A, B, FA, FB> {
  map(f: Fn<A, B>, x: FA): FB;
}
```

Now, let's take a simplified definition of a Lens. In Haskell

```hs
type Lens s a = Functor f => (a -> f a) -> s -> f s
```

Which in our hypothetical TS would be

```ts
type Lens<S, A> = <F extends Functor>(f: (a: A) => F<A>) => ((s: S) => F<S>);
```

With our workaround we need to add type parameters for `F<A>` and `F<S>`. (omitting the type extends constraint) this gives us

```ts
type Lens<S, A> = <FA, FS>(F: Functor<A, S, FA, FS>, f: Fn<A, FA>, s: S) => FS;
```

Let's say we want to write `over` which allows us to update the value inside a Lens. In Haskell, a simplified type definition is

```hs
over ::(Lens s a) -> (a -> a) -> s -> s
```

The function takes a Lens, the function that will update the embedded value `a`, and the whole value `s`. It then returns a new whole value `s` with `a` updated.

The implementation of `over` in Haskell calls the provided Lens with a function which updates the `a` using `f`, wraps the updated value in the trivial `Identity` Functor, the Lens does its internal business and transforms `Identity a` to `Identity s`, and finally we unwrap the embedded `s` using `runIdentity`.

```hs
over l f s = runIdentity $ l (\a -> Identity (f a)) s
-- or equivalently
over l f = runIdentity . l (Identity . f)
```

Of course, Haskell isn't actually really wrapping/unwrapping values in `Identity` because `Identity` is defined using a`newtype` so the wrapping doesn't occur at runtime, it's just here so we can implement the Functor type class and other interfaces.

```hs
newtype Identity a = Identity { runIdentity :: a }

instance Functor Identity where
  map f (Identity x) = Identity (f x)
```

To implement something like this in (real) TS, we could write `Identity` as a static interface which works on plain (non wrapped) values

```ts
const Identity = {
  map(f, x) {
    return f(x);
  }
};
```

Then to implement `over` we typecast `Identity` using the actual type parameters

```ts
function over<S, A>(lens: Lens<S, A>, f: Fn<A, A>, s: S): S {
  return lens(Identity as Functor<A, S, A, S>, f, s);
}
```

From the perspective of a library user, this is transparent. He would just call `over(lens, fn, state)`, the TS compiler will automatically infer the `S` and `A` parameters from the actual arguments (or expected return value) and specializes our `Identity` as needed. In fact this is the main trade off of this approach, we're giving up automatic inference internally in order to have it supported in the public API.

So far, I can type Lens composition without problem. Proxy code also works (with some minor caveats). The next challenge is to make it work with other Optics, mainly we need composition to figure out the right Optic type resulting from compositing 2 or many other Optics.

## Links

[TypeScript playground demo](<https://www.typescriptlang.org/play/index.html#src=type%20Fn%3CA%2C%20B%3E%20%3D%20(x%3A%20A)%20%3D%3E%20B%0D%0A%0D%0Ainterface%20Monoid%3CA%3E%20%7B%0D%0A%20%20empty%3A%20()%20%3D%3E%20A%2C%0D%0A%20%20conat%3A%20(...xs%3A%20A%5B%5D)%20%3D%3E%20A%0D%0A%7D%0D%0A%0D%0Ainterface%20Functor%3CA%2C%20B%2C%20FA%2C%20FB%3E%20%7B%0D%0A%20%20map(%0D%0A%20%20%20%20f%3A%20Fn%3CA%2C%20B%3E%2C%0D%0A%20%20%20%20x%3A%20FA%0D%0A%20%20)%3A%20FB%0D%0A%7D%0D%0A%0D%0Aconst%20Identity%3D%20%7B%0D%0A%20%20%20%20map(f%2C%20x)%20%7B%0D%0A%20%20%20%20%20%20return%20f(x)%0D%0A%20%20%20%20%7D%0D%0A%7D%20%0D%0A%0D%0Afunction%20Const%3CA%2C%20B%3E(m%3F%3A%20Monoid%3CA%3E)%3A%20Functor%3CA%2C%20B%2C%20A%2C%20A%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20map(f%2C%20x)%20%7B%0D%0A%20%20%20%20%20%20return%20x%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%0D%0A%7D%0D%0A%0D%0Atype%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%20%3D%20%3CFB%2C%20FT%3E(%0D%0A%20%20F%3A%20Functor%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%0D%0A%20%20f%3A%20Fn%3CA%2C%20FB%3E%2C%0D%0A%20%20s%3A%20S%0D%0A)%20%3D%3E%20FT%0D%0A%0D%0Atype%20SimpleLens%3CS%2CA%3E%20%3D%20%3CFA%2C%20FS%3E(%0D%0A%20%20F%3A%20Functor%3CA%2C%20S%2C%20FA%2C%20FS%3E%2C%0D%0A%20%20f%3A%20Fn%3CA%2C%20FA%3E%2C%0D%0A%20%20s%3A%20S%0D%0A)%20%3D%3E%20FS%0D%0A%0D%0A%2F%2F%20we%20can%20make%20more%20versione%20which%20accept%203%2C%204%20...%20params%0D%0Afunction%20compose%3CS%2C%20T%2C%20A%2C%20B%2C%20X%2C%20Y%3E(%0D%0A%20%20parent%3A%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%2C%0D%0A%20%20child%3A%20Lens%3CA%2CB%2CX%2CY%3E%0D%0A)%3A%20Lens%3CS%2C%20T%2C%20X%2C%20Y%3E%20%7B%0D%0A%20%20return%20function%20composed%3CFY%2C%20FT%3E(%0D%0A%20%20%20%20F%3A%20Functor%3CY%2C%20T%2C%20FY%2C%20FT%3E%2C%0D%0A%20%20%20%20f%3A%20Fn%3CX%2C%20FY%3E%2C%0D%0A%20%20%20%20s%3A%20S%0D%0A%20%20)%3A%20FT%20%7B%0D%0A%20%20%20%20return%20parent%3CFY%2C%20FT%3E(%0D%0A%20%20%20%20%20%20F%20as%20any%2C%0D%0A%20%20%20%20%20%20a%20%3D%3E%20child(F%20as%20any%2C%20f%2C%20a)%2C%20s)%3B%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20lens%3CS%2C%20T%2CA%2CB%3E(%0D%0A%20%20getter%3A%20Fn%3CS%2C%20A%3E%2C%0D%0A%20%20setter%3A%20(b%3A%20B%2C%20s%3A%20S)%20%3D%3E%20T%0D%0A)%3A%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20return%20function%20gsLens%3CFB%2C%20FT%3E(%0D%0A%20%20%20%20F%3A%20Functor%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%0D%0A%20%20%20%20f%3A%20Fn%3CA%2C%20FB%3E%2C%0D%0A%20%20%20%20s%3A%20S%0D%0A%20%20)%3A%20FT%20%7B%0D%0A%20%20%20%20const%20a%20%3D%20getter(s)%0D%0A%20%20%20%20const%20fb%20%3D%20f(a)%0D%0A%20%20%20%20return%20F.map(b%20%3D%3E%20%7B%0D%0A%20%20%20%20%20%20return%20setter(b%2Cs)%0D%0A%20%20%20%20%7D%2C%20fb)%0D%0A%20%20%7D%0D%0A%7D%0D%0A%0D%0Aconst%20ConstVoid%20%3D%20Const()%0D%0A%0D%0Afunction%20view%3CS%2C%20A%3E(%0D%0A%20%20l%3A%20Lens%3CS%2C%20S%2C%20A%2C%20A%3E%2C%0D%0A%20%20s%3A%20S%0D%0A)%3A%20A%20%7B%0D%0A%20%20return%20l%3CA%2CA%3E(ConstVoid%20as%20Functor%3CA%2CS%2CA%2CA%3E%2C%20x%20%3D%3E%20x%2C%20s)%0D%0A%7D%0D%0A%0D%0Afunction%20over%3CS%2C%20T%2C%20A%2C%20B%3E(%0D%0A%20%20l%3A%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%2C%0D%0A%20%20f%3A%20Fn%3CA%2C%20B%3E%2C%0D%0A%20%20s%3A%20S%0D%0A)%3A%20T%20%7B%0D%0A%20%20return%20l%3CB%2C%20T%3E(%0D%0A%20%20%20%20Identity%20as%20Functor%3CB%2C%20T%2C%20B%2C%20T%3E%2C%0D%0A%20%20%20%20f%2C%0D%0A%20%20%20%20s%0D%0A%20%20)%0D%0A%7D%0D%0A%0D%0Afunction%20lensProp%3CS%2C%20K%20extends%20keyof%20S%3E(k%3A%20K)%3A%20SimpleLens%3CS%2C%20S%5BK%5D%3E%20%7B%0D%0A%20%20return%20lens(s%20%3D%3E%20s%5Bk%5D%2C%20(a%2C%20s)%20%3D%3E%20Object.assign(%7B%7D%2C%20s%2C%20%7B%20%5Bk%5D%3A%20a%20%7D))%3B%0D%0A%7D%0D%0A%0D%0Aexport%20function%20lensIndex%3CA%3E(i%3A%20number)%3A%20SimpleLens%3CA%5B%5D%2C%20A%3E%20%7B%0D%0A%20%20return%20lens(%0D%0A%20%20%20%20xs%20%3D%3E%20xs%5Bi%5D%2C%0D%0A%20%20%20%20(x%2C%20xs)%20%3D%3E%20xs.map((old%2C%20ci)%20%3D%3E%20(ci%20%3D%3D%3D%20i%20%3F%20x%20%3A%20old))%0D%0A%20%20)%3B%0D%0A%7D%0D%0A%0D%0Afunction%20id%3CA%3E(x%3A%20A)%20%7B%0D%0A%20%20return%20x%3B%0D%0A%7D%0D%0A%0D%0Aconst%20idLens%3A%20SimpleLens%3Cany%2C%20any%3E%20%3D%20lens(id%2C%20id)%3B%0D%0A%0D%0Aexport%20type%20LensProxy%3CP%2C%20S%3E%20%3D%20SimpleLens%3CP%2C%20S%3E%20%26%0D%0A%20%20%7B%20%5BK%20in%20keyof%20S%5D%3A%20LensProxy%3CP%2C%20S%5BK%5D%3E%20%7D%3B%0D%0A%0D%0Aexport%20function%20lensProxy%3CS%2C%20P%20%3D%20S%3E(%0D%0A%20%20parent%3A%20SimpleLens%3CP%2C%20S%3E%20%3D%20idLens%0D%0A)%3A%20LensProxy%3CP%2C%20S%3E%20%7B%0D%0A%20%20return%20new%20Proxy(parent%20as%20any%2C%20%7B%0D%0A%20%20%20%20get(target%3A%20any%2C%20key%3A%20any)%20%7B%0D%0A%20%20%20%20%20%20if%20(key%20in%20target)%20return%20target%5Bkey%5D%3B%0D%0A%20%20%20%20%20%20return%20lensProxy(%0D%0A%20%20%20%20%20%20%20%20compose%3Cany%2C%20any%2C%20any%2C%20any%2C%20any%2C%20any%3E(%0D%0A%20%20%20%20%20%20%20%20%20%20parent%20as%20any%2C%0D%0A%20%20%20%20%20%20%20%20%20%20Number(key)%20%3D%3D%3D%20%2Bkey%20%3F%20lensIndex(%2Bkey)%20%3A%20lensProp(key)%0D%0A%20%20%20%20%20%20%20%20)%0D%0A%20%20%20%20%20%20)%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D)%3B%0D%0A%7D%0D%0A%0D%0A%0D%0Atype%20X%3CF%3E%20%3D%20F%20extends%20%7B%7D%20%3F%20%22object%22%20%3A%20null%0D%0A%0D%0Atype%20fx%20%3D%20X%3CFn%3Cvoid%2C%20void%3E%3E%0D%0A%0D%0Atype%20Address%20%3D%20%7B%0D%0A%20%20street%3A%20string%2C%0D%0A%20%20num%3A%20boolean%0D%0A%7D%0D%0A%0D%0Atype%20Person%20%3D%20%7B%0D%0A%20%20name%3A%20string%2C%0D%0A%20%20address%3A%20Address%0D%0A%7D%0D%0A%0D%0Aconst%20_%20%3D%20lensProxy%3CPerson%3E()%0D%0A%0D%0A%0D%0Aconst%20l%20%3D%20_.address.num%0D%0A%0D%0A%2F%2F%20hover%20over%20the%20values%20to%20see%20their%20types%0D%0A%0D%0A%2F%2F%20error%0D%0Alet%20v1%3A%20string%20%3D%20view(l%2C%20%7B%7D)%0D%0Alet%20v2%20%3D%20view(l%2C%20%7B%7D)%0D%0A%0D%0Alet%20s1%20%3D%20over(l%2C%20(x%3A%20string)%20%3D%3E%20x%2C%20%7B%7D)%0D%0Alet%20s2%20%3D%20over(l%2C%20x%20%3D%3E%20!x%2C%20%7B%7D)>) which implements a simplified version of the idea (using only Lenses)

For the interested, here is also a [Haskell implementation](https://repl.it/@yelouafi/function-Lenses) I was playing with
