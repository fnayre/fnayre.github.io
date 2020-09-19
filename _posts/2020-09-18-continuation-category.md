---
layout: post
comments: true
title: "The Category of continuations"
date: 2020-09-18 23:49:27 +0100
categories: continuations
---

Take a simple FP language without polymorphism, just monomorphic types, functions and products. It's well known that this language can be modeled as a [category](<https://en.wikipedia.org/wiki/Category_(mathematics)>) where objects are types and morphisms are functions. Now for every category, we can obtain a dual category "for free" by taking the same objects and flipping morphisms around (i.e. a morphism `a 🡒 b` in the original categroy becomes `b 🡒 a` in its dual). Composition in the dual category also runs backward.

I was always wondering: what's the dual of the above 'FP category' ? Is there an intuitive way to reason about it ?

In the dual category functions will be flipped around, obviously they'll no longer be good pure functions (If, in the original function, 2 different values from the source type were mapped to a unique value in the target type, then by flipping the arrow we'll be mapping a unique value to 2 distinct values). I don't know much what to think of the new arrows (possibly special types of relations). Is there a simple and familiar way to reason about the dual category ?

Some recent reading on continuations gave me an idea (it's a lot handwavy but this is the best I can do). In the so called FP category the `void` type (i.e. with no values) is the initial object : there's a unique function from it to every other type. Now, Here's a trick: in the dual category `void` becomes the final object.

The first thing we gonna need is to set our dual category in a more familiar setting. We can try to find a faithful representation of the dual category in terms of another category: it's a bit like when you're trying to understand what's been said in a foreign language, you can just translate it to a more familiar language.

In a our case we'll try to crack our mysterious dual catgeory by exploiting the special role of the terminal object `void`, namely, the fact that now there's a unique morphism from any object to it.

Each object in the dual category will be represented by its unique morphism to `void`, so for each type `a` we'll get a morphism `a -> void`. Note those morphisms are _functions-like_ : since `void` is uninhabited, we dont risk to map a value from `a` to 2 or more values in `void` (in fact, since `void` is empty, we can never _return_ from a continuation).

All morphisms `a -> b` in the dual category become of the form `(a 🡒 void) -> (b 🡒 void)` in our representation, by the very definition of a category, `a 🡒 b` compose with `b 🡒 void` to give the unique `a 🡒 void`.

![Composition in slice category](/assets/slice-cat.png)

To ensure that the dual category is fully and faithfully represented, we need also to check that composition is preserved; In our case this is immediate since we reuse the same morphisms of the dual category in our representation.

Now, observe that in a language with control operators (like Schem's `call/cc`), `a 🡒 void` looks quite like the type of a continuation consuming a type `a`: objects in the FP category (seen as value types) could thus be seen in the dual category as continuations!

What about the meaning of morphisms ? they look like

`(a 🡒 void) 🡒 (b 🡒 void)`

flip around the order of the 2 first parameters

`(b 🡒 ((a 🡒 void) 🡒 void))`

But `(a 🡒 void) 🡒 void)` is none but the notorious Continuation monad (`Cont void a`) and `b 🡒 Cont void a` is its corresponding kleisli arrow.

_Roughly speaking, a kleisli arrow for a monad m is the function `a 🡒 m b` which is a sort of special function from a to b but with some side effects represented by the monad m. Composition of this arrows is defined via the bind/chain/sequencing operation specific to the monad m._

In summary, in the dual category

- objects can be seen as continuations

- morphisms can be seen as continuation transformers, which are equivalent to kleisli arrows of the Continuation monad

- composition of morphisms is equivalent to kleisli composition (sequencing)

More concretely, a function `a 🡒 b` in the FP category becomes a continuation transformer `((b 🡒 void) 🡒 (a 🡒 void))` in the dual category. Which is equivalent to the kleisli arrow `a 🡒 Cont void b` (i.e. the CPS version of `a 🡒 b`).

Now you may alerady know that "Continuation is the mother of all monads" which means we can simulate any monad m within the Continuation mona. If you've doubts, you may convince yourself by consulting the following link

- [The essence of functional programming (section 3.3 Monads and CPS)](bit.ly/2RAB2bU)
- [The Mother of all Monads](bit.ly/3hCgBpm)
- [The reasonable effectiveness of the continuation monad](bit.ly/2GZUIUi)

A reasonable objection: the real `Cont r a` relies on specializing `r` in order simulate other monads. A plausible answer is that `void` is a subtype of every other type (think of the type `forall r.r` or the error that can bubble up from within any expression).

My intuition about continuations is that they represent "the complement of the story" for a program, which is its running process. Every evaluation step can be captured by a label (continuation) we can jump to later. And the fact that the Continuation monad can simulate any monad leads me to think that all side effects are about manipulating the control flow/environment of the running program (even algebraic effects & handlers are operationally about manipulating continuations).

Could we thus conclude that [a way of thinking of] the dual category is: it models the running envionment of a program (which is _statically_ modeled by the FP catgeory) where side effects take place ? Well, I can't confirm since my reasonment is informal, but there are many artifacts that lead me to think so.

Moreover, observe that any continuation can be embedded in the FP language as an ordinary function. We can't construct a function to `void` in the FP category, but we can always map `void` to a non empty type. This way, the running environment can be captured back inside the FP category via a CPS transform. This is essentially how the Continuation monad works.

I get this is a bit handwavy and lacks formality. It's based on my still immature understanding of Category Theory. But if that makes sense, I beat there's a better explanation using some higher order concepts, event better, there's a formal paper somewhere about it.

The idea originally came to me from Logic, [Constructive logic](https://en.wikipedia.org/wiki/Intuitionistic_logic) (where `not(not(a)) == a` doesn't hold) is known to model FP languages like the Simply Typed Lambda Calculus. In contrast, [Classical logic](https://en.wikipedia.org/wiki/Classical_logic) (where !!a = a holds) corresponds to a language with first class continuations (labels & jumps).

Computationally, the proposition `not(a)` correponds to the type `a 🡒 void` and `not(not(a)) == a` can be interpreted computationally as the ability to turn a type `a 🡒 (a 🡒 void)` into `a` via some control operator. We can then invoke the continuation `a 🡒 void` to provide a value of type `a` to some location in the program).

In his famous paper [A Formulae-as-Types Notion of Control](bit.ly/3kn5mmz), Timothy G. Griffin showed that embedding Classical into Constructive logic is computationally equivalent to a CPS translation of a program with labels & jumps into a language that explicitly represents continuations as functions. It seems to me (unless I messed up) that the above Category gymnastic describes the same idea: In a "classical language" you can acheive side effects by manipulating the environment of the running program and this environment is modeled by the dual FP category. But the envirnment can also be embedded back in the original category (pure FP language) via a CPS translation (which is equivalent to using monads in the FP language (?).

So in one hand we have the static description of a pure FP program as an algebraic expression, while on the dual side we have the dynamic/operational description of the program as a series of evaluation steps.

There's also an equivalent formulation with sets: the dual of the category of Sets & functions is the category of boolean algebras. Boolean algebras is a denotation of classical logic (which translates to a language with continuations).
