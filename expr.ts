// The Algebraic Theory
// We're just specifying the operations, no equational laws
interface Monoid<A> {
  zero(): A
  add(left: A, right: A): A
}

// The free model
// constructs a tree from operations
type MTree<A> =
  | { tag: "pure"; value: A }
  | { tag: "zero" }
  | { tag: "add"; left: MTree<A>; right: MTree<A> }

function pure<A>(value: A): MTree<A> {
  return { tag: "pure", value }
}

function zero<A>(): MTree<A> {
  return { tag: "zero" }
}

function add<A>(left: MTree<A>, right: MTree<A>): MTree<A> {
  return { tag: "add", left, right }
}

const monoidEvalNum = fold({
  zero: () => 0,
  add(left: number, right: number): number {
    return left + right
  },
})

function fold<A>(model: Monoid<A>) {
  return function evaluate(tree: MTree<A>): A {
    if (tree.tag === "pure") return tree.value
    if (tree.tag === "zero") return model.zero()
    else return model.add(evaluate(tree.left), evaluate(tree.right))
  }
}

let expr = add(pure(10), add(pure(100), zero()))

console.log(expr)

console.log("result", monoidEvalNum(expr))

const random = operation("random")

function log(message) {
  return operation("log", [message])
}
