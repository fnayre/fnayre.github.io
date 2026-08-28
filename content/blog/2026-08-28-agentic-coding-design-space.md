---
title: "Agentic Coding and the Design Space You Don't See"
date: "2026-08-28T00:00:00+01:00"
description: "Agentic coding makes software production cheaper, but understanding the design space behind a large system remains the bottleneck."
---

One of the interesting things about agentic coding is that it changes where the effort of programming goes.

A lot of traditional programming is occupied by fairly mechanical work: remembering APIs, writing glue code, satisfying the type checker, moving values between representations, fixing mundane bugs, etc.

This work isn't necessarily where the difficult reasoning happens, but it consumes attention anyway.

If agents take care of more of it, there is potentially more room to think about things like modeling the problem, choosing abstractions, defining invariants, exploring alternative designs or reasoning about failure modes.

In that sense I don't think agentic coding necessarily makes programming less intellectually demanding. It may actually do the opposite.

If implementation becomes cheap, I can operate over a larger system, explore more alternatives and make more consequential decisions in the same amount of time. Instead of spending an hour implementing an abstraction, I can spend that hour asking whether it is the right abstraction in the first place.

There is however an important condition hidden in this optimistic picture: the human still has to do that part of the work.

And agents make it surprisingly easy not to.

## Delegating the path

Say I need some new subsystem.

I can ask the agent to implement a design I already have in mind. Or I can ask it to propose the design first. It can then choose the abstractions, decide how state should be represented, identify the edge cases, implement everything, fix the resulting bugs and perhaps have another agent review the result.

None of those steps is, on its own, unreasonable. In fact that's part of what makes agents useful.

But after enough of them, I may discover that what I've delegated isn't only the writing of the code. I've delegated much of the path that leads to the code.

The software can still be perfectly good. Tests pass, the architecture looks clean, and I can ask intelligent questions about what the agent is doing.

The problem is that I may no longer know which questions I should be asking.

## Building a compiler you don't understand

Consider a more extreme example.

Suppose I know little about compiler construction but decide to build a programming language with coding agents.

With sufficiently capable agents, I may actually get quite far.

The resulting repository may look impressive: parser, type checker, IR, optimizer, code generator, tests, clean modules and nice documentation.

But a compiler isn't simply a large implementation task. There is a whole design space behind that code: language semantics, type-system choices, intermediate representations, runtime representation, lowering strategies, optimizations, code generation and all the interactions between those choices.

The same problem shows up in any sufficiently deep system — a compiler is just a clean example, since its design space is well studied and easy to point at.

The agent has to take some path through that space.

If I don't understand the domain well enough, I may not simply be bad at evaluating the decisions it makes. I may not even notice that some of those decisions exist.

For example, I could see an intermediate representation and understand perfectly well what each Rust struct does, while having no idea why the compiler needs that representation, what alternatives could have been used, or what later choices are now constrained by it.

That's a more fundamental problem than code quality.

I can try to compensate using generic engineering practices: establish coding guidelines, ask for modular architecture, require tests, ask another agent to review the first one, have it enumerate tradeoffs, etc. All of these things are useful.

But they don't magically give me the missing model of compiler construction.

If I don't know the space, how do I know that an important alternative was omitted? How do I know that an apparently innocent representation choice makes a later optimization difficult? How do I know which architectural decision deserves ten minutes of attention and which one deserves two days?

At that point I'm supervising a search through a design space I can barely see.

And this isn't necessarily a problem of laziness. I can be extremely diligent, spend hours prompting, reviewing, testing and asking for architectural critiques, and still fail to supervise decisions whose significance I don't yet understand.

## The forcing function we lose

Before agents, there was an annoying but useful property of implementing something yourself: **the implementation forced you to encounter the problem.**

If I wanted to write the compiler, sooner or later I had to discover that I needed to represent scopes somehow. I had to figure out how values flowed between passes. I had to confront the fact that my first representation made some later step awkward.

This isn't necessarily an ideal way to learn. You can certainly write a lot of bad code without understanding the deeper theory.

But implementation creates friction, and that friction repeatedly exposes gaps in your mental model.

An agent can remove that forcing function. It can jump from "build me a compiler" to 20,000 lines of plausible implementation while I remain almost exactly as ignorant as when I started.

And at that point "I'll read it carefully afterward" isn't necessarily a realistic solution either.

Twenty thousand lines don't represent twenty thousand independent little decisions. They represent layers of decisions built on top of one another. Representation choices constrain later passes, abstractions depend on earlier abstractions, and assumptions get spread throughout the system.

Once enough of that has accumulated, reconstructing why the system has its current shape becomes a project of its own. Even an expert may need significant effort to trace it back.

So the problem isn't only whether I'm willing to read the generated code. It's also whether I've allowed the agent to produce more system than I can reasonably understand at once.

## Keeping understanding in the loop

This also changes the usual question around generated code.

People often ask some version of: *if the agent wrote the code and the tests pass, how much of it do I actually need to read?*

I don't think there is a fixed answer.

Suppose I'm already very familiar with both Rust and compiler construction. I might skim a generated compiler pass fairly quickly and still understand most of what matters. I already know the common representations, the tradeoffs and the surrounding design space, so I'm mostly checking whether the implementation matches a model I already have.

Now suppose I'm proficient in Rust but know little about compilers. I can read exactly the same code and understand every individual statement while missing most of its significance.

In that case reading has a different job. I'm not merely checking an implementation against a model I already possess. I'm trying to construct the model itself. That requires much slower reading.

Why does this pass exist? Why is this value represented this way? Who creates it? Who consumes it? Could this have been represented differently? What would happen if we removed this distinction? Why is lowering happening here rather than later?

At first I may have to trace things almost line by line. Eventually recurring concepts become visible. Once I understand why a certain representation exists, I start noticing where alternatives could have been chosen. Those alternatives lead to better questions, which expose more of the design space.

So careful reading doesn't magically solve the problem of not knowing which questions to ask. But it can be part of how I gradually become capable of asking them.

## Pacing the implementation

The catch is that this only works while the implementation is still arriving in pieces small enough for me to absorb.

The agent can produce software much faster than I can build the mental model required to understand it. If I let it keep going, there is no natural point where it will stop and tell me that my understanding has fallen behind.

So perhaps the useful unit of delegation isn't whatever the agent can implement in one go. It's whatever I can still reasonably understand in one go.

For an unfamiliar domain, this often means growing the system through relatively small vertical slices.

Take the compiler again. Instead of asking for "the compiler," I could start with a tiny language that parses and evaluates a couple of expressions.

At that point the whole path is still visible: source text comes in, a parser produces some representation, and an evaluator gives it meaning. I can understand the representation, question why it has that shape, and see what assumptions have already entered the design.

Then add variables. Now scopes and environments appear. I can stop there and understand those before moving on.

Then perhaps add a simple type system. Later introduce an intermediate representation. Then lower to something closer to the target. Eventually add code generation.

The exact order isn't the point. What matters is that each step introduces an amount of new structure I can still hold together with the model I already have.

The loop becomes something like: implement a manageable slice, read it, understand what new concepts and decisions appeared, ask questions while those decisions are still local, then extend the system.

Reading is therefore not simply a review step at the end. It becomes part of the development process itself.

And this is also where explanations from the agent become much more useful. "What alternatives are there to this IR representation?" is a tractable question when the IR has just been introduced and the surrounding system is still small. Asking the same question after fifteen compiler passes have already been built on top of it is very different.

## Choosing what to delegate

This is why I don't find the simple distinction between "manual coding" and "AI coding" very useful. There are many possible ways to work with an agent.

I can design the system and delegate implementation. I can ask the agent to produce several designs and compare them myself. I can let it implement a small vertical slice and then reconstruct the reasoning by reading the result. I can manually implement a small version of the problem first, then use the agent for the larger one. All of these leave different parts of the work to me.

Sometimes manually writing something is useful simply because it forces me through details I might otherwise skip. If I want to understand parsers deeply, implementing one myself may still be one of the fastest ways of discovering all the inconvenient questions hidden behind the word "parser."

Other times writing the code myself adds very little. If I already understand the design and the remaining work is mostly mechanical, there isn't much value in refusing the leverage.

The more useful question is therefore not: how much code should I let the agent write? It's closer to: Which parts of the understanding I'm  willing to delegate, and how quickly can I let the implementation grow before my own model stops keeping up?

That answer depends on the programmer, the language, the domain and the part of the system being built. A compiler expert can legitimately move much faster through compiler code than someone discovering the domain for the first time.

Agents have made software production dramatically cheaper. They haven't made understanding a large system dramatically cheaper.

The bottleneck has moved.
