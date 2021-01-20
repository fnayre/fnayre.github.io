---
layout: post
comments: true
title: "A simple rule for using callbacks in React"
date: 2021-01-20 13:49:27 +0100
categories: react
---

> In this post I assume you know React and the Hooks API. I also assume a basic knowledge about render and commit phases in Concurrent mode.

Most of React hooks complaints seem to revolve around having to manually manage hooks dependencies. Personally, I don't find that problematic (The rules are pretty clear, and you can just follow the linter). I was, however, having difficulty wrapping my head around the `useCallback` hook. Yes, I know what it does and how it works, but I'm talking about having a simple mental model and how it fits into the greater picture inside a React application.

Well, dependency management plays a role in the following story but not the way it's often stated. I think the issue is not having to manage dependencies by ourselves, but the way reactivity in React plays with side effects.

My aim in this post is to answer the following questions

- Why does `useCallback` seem problematic?
- Is there a simple way to reason about callback usage in React ?

With class Components, using a callback seemed easy enough: just bind the function to the class instance and pass around the result. With the introduction of hooks, things suddenly appeared more difficult (or more subtle). The most common complaint you'll probably hear is about stable references.

With classes the callback typically follows the lifecycle of the class instance, you'll create and bind the function only once in the constructor or using field declarations. The reference you pass around doesn't change during this time. Also since those functions relied on `this.state` and `this.props`, they had access to the latest values which _seems_ to be a correct behavior.

With hooks, functions are typically created inside render functions in order to access props and state, which means we'll get a new reference on every render. In an ideal world, this doesn't hurt, the main benefit of _naked_ callbacks is that they give us the correct state/props values which is even more crucial in Concurrent mode. But in the real world this may be undesirable because it could trigger superfluous render cycles or unwanted `useEffect` executions.

The purpose of `useCallback` is to control the creation of a new reference inside render functions using the dependency management mechanism. Often in docs or tutorials, you'll find mentions of `useCallback(fn, deps)` being just an alias for `useMemo(() => fn, deps)` (which, as we'll see later, is not always the case from the point of view of this post). Like `useMemo`, `useCallback` is only an optimisation, it means the code should still be working without it.

There is an interesting issue in the React repo called [useCallback() invalidates too often in practice](https://github.com/facebook/react/issues/14099) which refers to why the default `useCallback` behavior is not always what we want. Some appear to be valid, like I don't want to rerender a component just because dependencies of an event handler _has changed_, the behavior of the handler is still the same (The counter argument is also valid, technically it's not _the same event handler_ if it closes over different values). As we'll see later, which point is correct depends essentially on what kind of value is the event handler.

Another interesting case concerns initiating a websocket connection only once upon mounting, then executing some socket handler regularly. We don't want to retrigger the connection process every time something changes but the handler should always see the last committed value.

The often proposed workaround is to use a mutable reference to store the function, then schedule an effect to update the values accessed by the function. A more [general workaround](https://github.com/facebook/react/issues/14099#issuecomment-440013892) proposed in the issue is to store the changing function itself:

```js
function useEventCallback(fn) {
  let ref = useRef();
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback(() => (0, ref.current)(), []);
}
```

This seems pretty good, so why not just adopt this as the default behavior for `useCallback`? we keep a stable reference while still having access to the latest value. But what's the meaning of _latest values_ here?

In Concurrent mode, there could be two different answers: either we mean the last values seen in a render function, or we mean the last values used when committing to the screen. `useEventCallback` has an affinity for committed values. But there are other use cases where I want to see the last rendered values instead (e.g. render callbacks).

So it may seem that the general rule is: use `useEventCallback` when doing side effects, and use the builtin `useCallback` when doing render work. Alas, it's not that simple. Imagine the following example

```js
function MyComponent(props) {
  const [state, setState] = useState(...)

  const logger = useEventCallback(() => {
    console.log(state)
  })

  useEffect(() => {
    const tid = setTimeout(logger, 1000)
    return () => clearTimeout(tid)
  }, [logger])

}
```

The code seems perfectly correct per the hooks rules, yet it won't get the desired result. Think it a moment ...

The problem is that `useEventCallback` returned a stable reference for `logger`, and although the returned function can see the last committed state (which is what we want because we're in a side effect), the effect will be executed only once since its single dependency doesn't change. What we want though is to execute the effect _as soon as_ `state` changes. We can add `state` as a dependency but the question is per what rule? `state` doesn't appear anywhere inside the effect code. Our chosen `useEventCallback` has broken the transitivity of hooks dependencies and the rules are no longer valid.

So does it mean invalidation is inevitable and we're doomed? I don't think so. I believe there is a way out.

The example above reveals another decision factor, it's not just about doing render vs side effects. Invalidation also plays a role in effect execution, sometimes it's desirable to invalidate, but in other cases we'd rather keep a stable reference and use mutation to access last committed values (like in DOM event handlers).

Let's recap

- The case for render callbacks is clear, `useCallback` is necessary because it gives us the minimum amount of invalidation required. We must rerender and we must access the last rendered values.

- The case for side effects is more subtle
    - In some cases invalidation is desirable because we want to schedule the effect execution as soon as possible.
    - In other cases invalidation is superfluous, because we're only interested in executing the same handler code but with the last committed values.

The question is whether there is a generic rule by which we can distinguish between the 2 last cases. This would give us a more refined set of rules to reason about callback usage in React.

Notice the similarity between render callbacks and the logger example, in both cases, we want React to **output** something into the external world as soon as the internal state of the application has changed.

There is also a similarity between the event DOM callbacks and the websocket example. In both cases, we've told the external world (the user or the network) that we're interested in receiving some kind of **input**. When the input arrives, we'll decide what to do next based on the last committed state of the application (Which is correct since commits are a subset of renders. For optimisation purposes, the right amount of invalidation in this case is precisely the commit cycles triggered by state changes, the rest are just indesirable glitches). 
In other words it all depends on the direction of the dataflow:

- With output effects, data flows from React into the external world. We want that output to happen as soon as something changes internally.

- With input effects, data flows from the external world into React. We want to react to some external event, and the decision should always be based on the latest output the world has seen from us, i.e. should always be based on the last committed state.

Which answers the 2nd question from the beginning of this post

- `useEventCallback` is more suited for callbacks waiting for some external input, then changing the state of the application.

- `useCallback` is more suited for callbacks that output something into the external world. In fact `useCallback` is semantically really an alias for `useMemo` since we're treating functions here the same as the values we output from JSX.

This also should explain why `useCallback` seems problematic, the same abstraction is used to handle input and output cases. But the 2 cases have incompatible semantics. It may also be a consequence of the fact that React doesn't have a first class support for inputs. For example, input callbacks like DOM event handlers are treated like regular data that must flow to the external world every time something changes.
Finally let's answer a previous question: Is it the same event handler or not if the code stays the same but the dependencies?

As I said, it depends on what kind of value you think the event handler is. If you think of a regular data value, like rendered JSX, then the answer is no. If you think of the handler as a special kind of value waiting for an input: a continuation, then it's the answer is yes.

But what if it's not just the dependencies that changes but the code itself. This would be similar to a stateful event handler, something similar to long running handlers used in redux-saga. Well, in this case, i think it's better to break things down using a mix of state, input and output code. In other words, we'll be using a state machine where the changing behavior is taken care of by the machine while event handler code would be essentially to feed the machine with external input. In fact, it may be even better to extend the reasoning to the whole component: a state machine with input, output and an internal state. In this sense, JSX is just another output.
