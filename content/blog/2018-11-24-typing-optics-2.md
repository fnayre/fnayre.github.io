---
layout: post
comments: true
title: "Typing Optics (2): Traversals"
date: 2018-11-24 19:20:27 +0100
categories: optics
---

[Last post](/2018-11-23-typing-optics) I wrote about my first tentatives to add typings to my [focused lens library](https://github.com/yelouafi/focused). I explained the main issue was the lack of Higher Kinded Types in TypeScript which makes it uneasy to port abstractions from functional languages like Haskell.

So with a hacky workaround, I ended up implementing basic type classes and Lenses, the main tradeoff being that the solution can only be used internally in the library, since we need to specify all type parameters at the call site. This is to allow the public API to be fully typed.

So current status, we have [working definitions](<https://www.typescriptlang.org/play/index.html#src=%2F%2F%20convenient%20shortcut%20for%20functions%20taking%201%20param%0D%0Atype%20Fn%3CA%2C%20B%3E%20%3D%20(x%3A%20A)%20%3D%3E%20B%3B%0D%0A%0D%0Ainterface%20Functor%3CA%2C%20B%2C%20FA%2C%20FB%3E%20%7B%0D%0A%20%20map(f%3A%20Fn%3CA%2C%20B%3E%2C%20x%3A%20FA)%3A%20FB%3B%0D%0A%7D%0D%0A%0D%0A%2F%2F%20I'm%20switching%20to%20an%20interface%20definition%20for%20better%20DX%0D%0Ainterface%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20%24applyOptic%3A%20(%3CFB%2C%20FT%3E(F%3A%20Functor%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%20f%3A%20Fn%3CA%2C%20FB%3E%2C%20s%3A%20S)%20%3D%3E%20FT)%3B%0D%0A%7D%0D%0A%0D%0A%2F%2F%20Monomorphic%20version%0D%0Atype%20SimpleLens%3CS%2C%20A%3E%20%3D%20Lens%3CS%2C%20S%2C%20A%2C%20A%3E%3B%0D%0A%0D%0A%2F%2F%20This%20should%20work%20polymorhically%20for%20any%20Functor%0D%0Aconst%20Identity%20%3D%20%7B%0D%0A%20%20map(f%2C%20x)%20%7B%0D%0A%20%20%20%20return%20f(x)%3B%0D%0A%20%20%7D%0D%0A%7D%3B%0D%0A%0D%0A%2F%2F%20Lens%20composition%0D%0Afunction%20compose%3CS%2C%20T%2C%20A%2C%20B%2C%20X%2C%20Y%3E(%0D%0A%20%20parent%3A%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%2C%0D%0A%20%20child%3A%20Lens%3CA%2C%20B%2C%20X%2C%20Y%3E%0D%0A)%3A%20Lens%3CS%2C%20T%2C%20X%2C%20Y%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic(F%2C%20f%2C%20s)%20%7B%0D%0A%20%20%20%20%20%20return%20parent.%24applyOptic(%0D%0A%20%20%20%20%20%20%20%20F%20as%20any%2C%0D%0A%20%20%20%20%20%20%20%20a%20%3D%3E%20child.%24applyOptic(F%20as%20any%2C%20f%2C%20a)%2C%0D%0A%20%20%20%20%20%20%20%20s%0D%0A%20%20%20%20%20%20)%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20lens%3CS%2C%20T%2C%20A%2C%20B%3E(%0D%0A%20%20getter%3A%20Fn%3CS%2C%20A%3E%2C%0D%0A%20%20setter%3A%20(b%3A%20B%2C%20s%3A%20S)%20%3D%3E%20T%0D%0A)%3A%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic%3CFB%2C%20FT%3E(F%3A%20Functor%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%20f%3A%20Fn%3CA%2C%20FB%3E%2C%20s%3A%20S)%3A%20FT%20%7B%0D%0A%20%20%20%20%20%20const%20a%20%3D%20getter(s)%3B%0D%0A%20%20%20%20%20%20const%20fb%20%3D%20f(a)%3B%0D%0A%20%20%20%20%20%20return%20F.map(b%20%3D%3E%20%7B%0D%0A%20%20%20%20%20%20%20%20return%20setter(b%2C%20s)%3B%0D%0A%20%20%20%20%20%20%7D%2C%20fb)%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20over%3CS%2C%20T%2C%20A%2C%20B%3E(l%3A%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%2C%20f%3A%20Fn%3CA%2C%20B%3E%2C%20s%3A%20S)%3A%20T%20%7B%0D%0A%20%20return%20l.%24applyOptic(Identity%20as%20Functor%3CB%2C%20T%2C%20B%2C%20T%3E%2C%20f%2C%20s)%3B%0D%0A%7D%0D%0A%0D%0Afunction%20prop%3CS%3E()%20%7B%0D%0A%20%20return%20%3CK%20extends%20keyof%20S%3E(k%3A%20K)%3A%20SimpleLens%3CS%2C%20S%5BK%5D%3E%20%3D%3E%20%7B%0D%0A%20%20%20%20return%20lens(s%20%3D%3E%20s%5Bk%5D%2C%20(a%2C%20s)%20%3D%3E%20Object.assign(%7B%7D%2C%20s%2C%20%7B%20%5Bk%5D%3A%20a%20%7D))%3B%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Atype%20Address%20%3D%20%7B%0D%0A%20%20street%3A%20string%3B%0D%0A%20%20num%3A%20number%3B%0D%0A%7D%3B%0D%0A%0D%0Atype%20Person%20%3D%20%7B%0D%0A%20%20name%3A%20string%3B%0D%0A%20%20address%3A%20Address%3B%0D%0A%20%20addresses%3A%20Address%5B%5D%3B%0D%0A%7D%3B%0D%0A%0D%0Aconst%20address%20%3D%20prop%3CPerson%3E()(%22address%22)%3B%0D%0Aconst%20addresses%20%3D%20prop%3CPerson%3E()(%22addresses%22)%3B%0D%0Aconst%20num%20%3D%20prop%3CAddress%3E()(%22num%22)%3B%0D%0A%0D%0Aconst%20l%20%3D%20compose(%0D%0A%20%20address%2C%0D%0A%20%20num%0D%0A)%3B%0D%0A>) for

- basic typeclasses (Functor for now)
- Lenses
- Lens Composition
- implementation of `over`

Next step, we'll add `Traversal`. It's the same definition as `Lens` but requires an `Applicative` instead of just a `Functor` (since a Traversal needs to operate on many values). So we need to add a definition for Applicatives as well

```ts
interface Applicative<A, B, FA, FB> extends Functor<A, B, FA, FB> {
  pure: Fn<A, FA>;
  combine: (f: Fn<A[], B>, fas: FA[]) => FB;
}
```

If you're familiar with the usual Applicative definition from Haskell, the definition of `combine` may be a little surprising, i,e, I 'should' define something like

```ts
apply: (F<A -> B>, F<A>) -> F<B>`
```

There are 2 reasons for the above choice:

1. `apply` definition makes more sense when used with languages supporting automatic currying: in Haskell, `<*>` (which is the operator alias for `apply`) can be used conveniently on a function `f` taking many arguments (`a, b, c..`): (e.g. `f <$> fa <*> fb <*> fc ..`). In typical JavaScript (and TypeScript) we don't use currying much often.
2. More important, all the interfaces are mainly to be used internally by `focused` to define the public API. The recurrent use case for using Applicatives with Traversals is to operate on the values embedded inside a monomorphic container (i.e. containing many values of the same type like `Array`, `Set` ...), so it makes more sense to adopt the `combine` definition rather than a polymorphic/curry-oriented version.

The definition of a Traversal is

```ts
interface Traversal<S, T, A, B> {
  $applyOptic: (<FB, FT>(
    F: Applicative<B, T, FB, FT>,
    f: Fn<A, FB>,
    s: S
  ) => FT);
}
```

The Applicative implementation for `Identity` is trivial

```ts
const Identity = {
  //...
  pure: x => x,
  combine(f, xs) {
    return f(xs);
  }
};
```

Next step, we need to adjust the type definition of `compose` (we don't have to touch the implementation, just instructs the compiler how to derive the right Optic).

So here begins our second challenge. In Haskell, we don't have to write anything special since the compiler can automatically infer the result type. Remember, in Haskell the type definitions for Lens and Traversal are

```hs
type Lens s t a b = forall f. Functor F => (a -> f b) -> s -> f t
type Traversal s t a b = forall f. Applicative F => (a -> f b) -> s -> f t
```

If for example we compose a Lens with a Traversal, the compiler infers that the `f` type parameter for the resulting function must satisfy both the `Functor` and `Applicative` constraints, since `Applicative` is more specific than `Functor`, the constraint can be simplified to `Applicative`, which yields the same type definition as `Traversal`.

Now with TypeScript, the first issue is that we can't use simple function composition because:

- Our optic functions has 3 paramaters (the typeclass, the function and the state)
- Even if we redefine our functions with the idiomatic/curried style, we'd have to solve the Higher Kinded Type issue again. And even if we take that road (e.g. using the URI solution) I doubt we'd succeed in making TypeScript unify the type parameter constraints.

Still, TypeScript offers an _adhoc_ solution: function overloading. We can define multiple signatures for each combination of 2 optics. Normally, since we have [for now] 2 optics (Lens & Traversal) we'd have to write 4 (2\*2) overloads. But in reality we 'should' only have 2 cases. Why? first let's write down the definitions

```ts
function compose<S, T, A, B, X, Y>(
  parent: Lens<S, T, A, B>,
  child: Lens<A, B, X, Y>
): Lens<S, T, X, Y>;
function compose<S, T, A, B, X, Y>(
  parent: Traversal<S, T, A, B>,
  child: Traversal<A, B, X, Y>
): Traversal<S, T, X, Y>;
// Lens composition
function compose(parent, child) {
  return {
    $applyOptic(F, f, s) {
      return parent.$applyOptic(F, a => child.$applyOptic(F, f, a), s);
    }
  };
}
```

Now, here is the why: because every Lens is also a Traversal (the inverse is not necessarily true). Remember that the 2 interfaces differ only on the constraint imposed on the typeclass (the 1st) parameter:

- Lens is (equivalent to) a function which takes a Functor
- Traversal is (equivalent to) a function which takes an Applicative

In other words, Lens's function is more permissive (can take more values) than Traversal's one. So it can be dropped on any context where a Traversal is expected. BTW, this is a general rule, it's because functions are said to be _Contravariant_ in their parameter types (you can replace a function with another taking more general argument => subtyping relation goes on the inverse direction of the enclosing function type). They are also _Covariant_ in their results (you can replace a function with another returning a more specific result => subtyping relation goes on the same direction). There is a nice phrase in [Wikipedia](<(<https://en.wikipedia.org/wiki/Covariance_and_contravariance_(computer_science)>)>) that summaises it

> be liberal in what you accept and conservative in what you produce

But there's still one (perhaps more) caveat. Contravariance isn't enabled by default in TypeScript. Because for [some reason](https://www.typescriptlang.org/docs/handbook/type-compatibility.html) TS folks decided to make function types _bivariant_ on their parameters (type compatibility works on both directions)

> When comparing the types of function parameters, assignment succeeds if either the source parameter is assignable to the target parameter, or vice versa. This is unsound because a caller might end up being given a function that takes a more specialized type, but invokes the function with a less specialized type. In practice, this sort of error is rare, and allowing this enables many common JavaScript patterns.

Of course, there is a `strictFunctionTypes` option in TS which enables Contravariance in function parameters. But I'm not particularly comfortable with enforcing this on the library user. So we'd have to resort to some other workaround. This time we'll simply add an optional field `$type` to each optic definition

```ts
interface Lens<S, T, A, B> {
  readonly $type?: "Lens" & "Traversal";
  // $applyOptic:  ...
}

interface Traversal<S, T, A, B> {
  readonly $type?: "Traversal";
  // $applyOptic: ...
}
```

It works, but to be honest, at the time of this writing, this is still kinda dog science for me. On one hand the fields are optional so we don't have to alter the existing definitions (esp. `compose`), on the other hand, the compiler seems to infer correctly that Lens is more specific than Traversal without Contravarance enabled because of the presence of fields in the type definition.

Only left (for today) is typing `over`. We'll simply take the most generic optic which is `Traversal`

```ts
function over<S, T, A, B>(l: Traversal<S, T, A, B>, f: Fn<A, B>, s: S): T {
  return l.$applyOptic<B, T>(Identity, f, s);
}
```

I know, we're getting more and more away from Haskell spirit but that's inevitable. As I said, the main goal of this is to provide a working type definition for the public API. The library user could then uses Optics and operations like `over` or `view` in a typesafe way. If it means sacrificing the 'internal elegance' of the model, I'm ok with it.

I believe it's enough for today. Next challenge will be integrating Isomorphisms and Prisms

## Links

- [TypeScript playground demo](<https://www.typescriptlang.org/play/index.html#src=%2F%2F%20convenient%20shortcut%20for%20functions%20taking%201%20param%0D%0Atype%20Fn%3CA%2C%20B%3E%20%3D%20(x%3A%20A)%20%3D%3E%20B%3B%0D%0A%0D%0Ainterface%20Functor%3CA%2C%20B%2C%20FA%2C%20FB%3E%20%7B%0D%0A%20%20map(f%3A%20Fn%3CA%2C%20B%3E%2C%20x%3A%20FA)%3A%20FB%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Applicative%3CA%2C%20B%2C%20FA%2C%20FB%3E%20extends%20Functor%3CA%2C%20B%2C%20FA%2C%20FB%3E%20%7B%0D%0A%20%20pure%3A%20Fn%3CA%2C%20FA%3E%3B%0D%0A%20%20combine%3A%20(f%3A%20Fn%3CA%5B%5D%2C%20B%3E%2C%20fas%3A%20FA%5B%5D)%20%3D%3E%20FB%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20readonly%20%24type%3F%3A%20%22Lens%22%20%26%20%22Traversal%22%3B%0D%0A%20%20%24applyOptic%3A%20(%3CFB%2C%20FT%3E(F%3A%20Functor%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%20f%3A%20Fn%3CA%2C%20FB%3E%2C%20s%3A%20S)%20%3D%3E%20FT)%3B%0D%0A%7D%0D%0A%0D%0Ainterface%20Traversal%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20readonly%20%24type%3F%3A%20%22Traversal%22%3B%0D%0A%20%20%24applyOptic%3A%20(%3CFB%2C%20FT%3E(%0D%0A%20%20%20%20F%3A%20Applicative%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%0D%0A%20%20%20%20f%3A%20Fn%3CA%2C%20FB%3E%2C%0D%0A%20%20%20%20s%3A%20S%0D%0A%20%20)%20%3D%3E%20FT)%3B%0D%0A%7D%0D%0A%0D%0A%2F%2F%20Monomorphic%20version%0D%0Atype%20SimpleLens%3CS%2C%20A%3E%20%3D%20Lens%3CS%2C%20S%2C%20A%2C%20A%3E%3B%0D%0A%0D%0A%2F%2F%20This%20should%20work%20polymorhically%20for%20any%20Functor%0D%0Aconst%20Identity%20%3D%20%7B%0D%0A%20%20map(f%2C%20x)%20%7B%0D%0A%20%20%20%20return%20f(x)%3B%0D%0A%20%20%7D%2C%0D%0A%20%20pure%3A%20x%20%3D%3E%20x%2C%0D%0A%20%20combine(f%2C%20xs)%20%7B%0D%0A%20%20%20%20return%20f(xs)%3B%0D%0A%20%20%7D%0D%0A%7D%3B%0D%0A%0D%0Afunction%20compose%3CS%2C%20T%2C%20A%2C%20B%2C%20X%2C%20Y%3E(%0D%0A%20%20parent%3A%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%2C%0D%0A%20%20child%3A%20Lens%3CA%2C%20B%2C%20X%2C%20Y%3E%0D%0A)%3A%20Lens%3CS%2C%20T%2C%20X%2C%20Y%3E%3B%0D%0Afunction%20compose%3CS%2C%20T%2C%20A%2C%20B%2C%20X%2C%20Y%3E(%0D%0A%20%20parent%3A%20Traversal%3CS%2C%20T%2C%20A%2C%20B%3E%2C%0D%0A%20%20child%3A%20Traversal%3CA%2C%20B%2C%20X%2C%20Y%3E%0D%0A)%3A%20Traversal%3CS%2C%20T%2C%20X%2C%20Y%3E%3B%0D%0A%2F%2F%20Lens%20composition%0D%0Afunction%20compose(parent%2C%20child)%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic(F%2C%20f%2C%20s)%20%7B%0D%0A%20%20%20%20%20%20return%20parent.%24applyOptic(F%2C%20a%20%3D%3E%20child.%24applyOptic(F%2C%20f%2C%20a)%2C%20s)%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%20as%20any%3B%0D%0A%7D%0D%0A%0D%0Afunction%20lens%3CS%2C%20T%2C%20A%2C%20B%3E(%0D%0A%20%20getter%3A%20Fn%3CS%2C%20A%3E%2C%0D%0A%20%20setter%3A%20(b%3A%20B%2C%20s%3A%20S)%20%3D%3E%20T%0D%0A)%3A%20Lens%3CS%2C%20T%2C%20A%2C%20B%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic%3CFB%2C%20FT%3E(F%3A%20Functor%3CB%2C%20T%2C%20FB%2C%20FT%3E%2C%20f%3A%20Fn%3CA%2C%20FB%3E%2C%20s%3A%20S)%3A%20FT%20%7B%0D%0A%20%20%20%20%20%20const%20a%20%3D%20getter(s)%3B%0D%0A%20%20%20%20%20%20const%20fb%20%3D%20f(a)%3B%0D%0A%20%20%20%20%20%20return%20F.map(b%20%3D%3E%20%7B%0D%0A%20%20%20%20%20%20%20%20return%20setter(b%2C%20s)%3B%0D%0A%20%20%20%20%20%20%7D%2C%20fb)%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20over%3CS%2C%20T%2C%20A%2C%20B%3E(l%3A%20Traversal%3CS%2C%20T%2C%20A%2C%20B%3E%2C%20f%3A%20Fn%3CA%2C%20B%3E%2C%20s%3A%20S)%3A%20T%20%7B%0D%0A%20%20return%20l.%24applyOptic%3CB%2C%20T%3E(Identity%2C%20f%2C%20s)%3B%0D%0A%7D%0D%0A%0D%0Afunction%20prop%3CS%3E()%20%7B%0D%0A%20%20return%20%3CK%20extends%20keyof%20S%3E(k%3A%20K)%3A%20SimpleLens%3CS%2C%20S%5BK%5D%3E%20%3D%3E%20%7B%0D%0A%20%20%20%20return%20lens(s%20%3D%3E%20s%5Bk%5D%2C%20(a%2C%20s)%20%3D%3E%20Object.assign(%7B%7D%2C%20s%2C%20%7B%20%5Bk%5D%3A%20a%20%7D))%3B%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Afunction%20each%3CS%3E()%3A%20Traversal%3CS%5B%5D%2C%20S%5B%5D%2C%20S%2C%20S%3E%20%7B%0D%0A%20%20return%20%7B%0D%0A%20%20%20%20%24applyOptic(F%2C%20f%2C%20xs)%20%7B%0D%0A%20%20%20%20%20%20return%20F.combine(ys%20%3D%3E%20ys%2C%20xs.map(f))%3B%0D%0A%20%20%20%20%7D%0D%0A%20%20%7D%3B%0D%0A%7D%0D%0A%0D%0Atype%20Address%20%3D%20%7B%0D%0A%20%20street%3A%20string%3B%0D%0A%20%20num%3A%20number%3B%0D%0A%7D%3B%0D%0A%0D%0Atype%20Person%20%3D%20%7B%0D%0A%20%20name%3A%20string%3B%0D%0A%20%20address%3A%20Address%3B%0D%0A%20%20addresses%3A%20Address%5B%5D%3B%0D%0A%7D%3B%0D%0A%0D%0Aconst%20address%20%3D%20prop%3CPerson%3E()(%22address%22)%3B%0D%0Aconst%20addresses%20%3D%20prop%3CPerson%3E()(%22addresses%22)%3B%0D%0Aconst%20num%20%3D%20prop%3CAddress%3E()(%22num%22)%3B%0D%0A%0D%0Aconst%20addressNum%20%3D%20compose(%0D%0A%20%20address%2C%0D%0A%20%20num%0D%0A)%3B%0D%0A%0D%0Aconst%20eachAddress%20%3D%20compose(%0D%0A%20%20addresses%2C%0D%0A%20%20each()%0D%0A)%3B%0D%0A%0D%0Aconst%20v%20%3D%20over(eachAddress%2C%20x%20%3D%3E%20x%2C%20%7B%7D%20as%20Person)%3B%0D%0A%0D%0Aconst%20v1%20%3D%20over(addressNum%2C%20x%20%3D%3E%20x%2C%20%7B%7D%20as%20Person)%3B%0D%0A>)
